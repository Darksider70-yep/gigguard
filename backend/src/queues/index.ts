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

  if (config.USE_IN_MEMORY_REDIS) {
    console.log(`[Queue] Using Bypass Queue for '${name}' (Memory Mode)`);
    return {
      add: async (jobName: string, data: any) => {
        // Execute the worker logic immediately to bypass Redis
        console.log(`[Queue] Bypassing Redis: Executing '${name}/${jobName}' inline`);
        
        try {
          if (name === 'claim-creation') {
            const { processClaimCreationJob } = await import('../workers/claimCreation');
            await processClaimCreationJob(data);
          } else if (name === 'claim-validation') {
            const { processClaimValidationJob } = await import('../workers/claimValidation');
            await processClaimValidationJob(data);
          } else if (name === 'payout-creation') {
            const { processPayoutCreationJob } = await import('../workers/payoutCreation');
            await processPayoutCreationJob(data);
          }
        } catch (err) {
          console.error(`[Queue] Inline execution failed for '${name}':`, err);
        }

        return { id: `memory-${name}-${Date.now()}` } as any;
      },
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
