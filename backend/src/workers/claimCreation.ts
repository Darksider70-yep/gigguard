import { randomUUID } from 'crypto';
import { query } from '../db';
import { calculateCoverage, getCurrentWeekRange } from '../services/premiumService';
import { enqueueClaimValidationJob } from './claimValidation';

interface ClaimCreationJobPayload {
  disruption_event_id: string;
  worker_ids: string[];
}

let claimCreationQueue: any;

function getClaimCreationQueue(): any {
  if (claimCreationQueue !== undefined) {
    return claimCreationQueue;
  }

  try {
    const { Queue } = require('bullmq');
    const IORedis = require('ioredis');
    const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');
    claimCreationQueue = new Queue('claim-creation', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: false,
      },
    });
  } catch {
    claimCreationQueue = null;
  }

  return claimCreationQueue;
}

export async function processClaimCreationJob(payload: ClaimCreationJobPayload): Promise<void> {
  const eventResult = await query(
    `SELECT id, trigger_type, disruption_hours
     FROM disruption_events
     WHERE id = $1
     LIMIT 1`,
    [payload.disruption_event_id]
  );

  const event = eventResult.rows[0] as any;
  if (!event) {
    throw new Error('Disruption event not found');
  }

  const { weekStart } = getCurrentWeekRange();
  const disruptionHours = Number(event.disruption_hours || 4);

  for (const workerId of payload.worker_ids) {
    const policyResult = await query(
      `SELECT id
       FROM policies
       WHERE worker_id = $1
       AND week_start = $2::date
       AND status = 'active'
       LIMIT 1`,
      [workerId, weekStart]
    );

    const policy = policyResult.rows[0] as any;
    if (!policy) {
      continue;
    }

    const existingClaim = await query(
      `SELECT 1
       FROM claims
       WHERE worker_id = $1
       AND created_at::date = NOW()::date
       AND status != 'denied'
       LIMIT 1`,
      [workerId]
    );

    if (existingClaim.rowCount && existingClaim.rowCount > 0) {
      continue;
    }

    const workerResult = await query(
      `SELECT avg_daily_earning
       FROM workers
       WHERE id = $1
       LIMIT 1`,
      [workerId]
    );

    const avgDailyEarning = Number((workerResult.rows[0] as any)?.avg_daily_earning || 0);
    const payoutAmount = calculateCoverage(avgDailyEarning, disruptionHours);

    const claimId = randomUUID();

    await query(
      `INSERT INTO claims (
        id,
        worker_id,
        policy_id,
        disruption_event_id,
        trigger_type,
        payout_amount,
        disruption_hours,
        status,
        created_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,'triggered',NOW()
      )`,
      [
        claimId,
        workerId,
        policy.id,
        payload.disruption_event_id,
        event.trigger_type,
        payoutAmount,
        disruptionHours,
      ]
    );

    await enqueueClaimValidationJob({ claim_id: claimId });
  }
}

export async function enqueueClaimCreationJob(payload: ClaimCreationJobPayload): Promise<void> {
  const queue = getClaimCreationQueue();
  if (!queue) {
    setImmediate(() => {
      processClaimCreationJob(payload).catch(() => undefined);
    });
    return;
  }

  await queue.add('claim-creation', payload);
}

export function startClaimCreationWorker(): void {
  try {
    const { Worker } = require('bullmq');
    const IORedis = require('ioredis');
    const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

    new Worker(
      'claim-creation',
      async (job: any) => {
        await processClaimCreationJob(job.data as ClaimCreationJobPayload);
      },
      { connection }
    );
  } catch {
    // BullMQ optional in local dev.
  }
}
