import { JobsOptions, Queue } from 'bullmq';
import { config } from '../config';

const isTest = config.NODE_ENV === 'test';

const redisUrl = new URL(config.REDIS_URL);

export const redisConnection = isTest
  ? ({} as any)
  : ({
      host: redisUrl.hostname,
      port: Number(redisUrl.port || 6379),
      username: redisUrl.username || undefined,
      password: redisUrl.password || undefined,
      db: redisUrl.pathname ? Number(redisUrl.pathname.replace('/', '')) || 0 : 0,
      maxRetriesPerRequest: null,
    } as any);

function createQueue(name: string, defaultJobOptions: JobsOptions): Queue {
  if (isTest) {
    return {
      add: async () => ({ id: `test-${name}-job` } as any),
      close: async () => undefined,
    } as unknown as Queue;
  }

  return new Queue(name, {
    connection: redisConnection,
    defaultJobOptions,
  });
}

export const claimCreationQueue = createQueue('claim-creation', {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 500 },
});

export const claimValidationQueue = createQueue('claim-validation', {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 500 },
});

export const payoutQueue = createQueue('payout-creation', {
  attempts: 3,
  backoff: { type: 'exponential', delay: 10000 },
  removeOnComplete: false,
  removeOnFail: { count: 500 },
});

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([
    claimCreationQueue.close(),
    claimValidationQueue.close(),
    payoutQueue.close(),
  ]);
}
