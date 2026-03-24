import { query } from '../db';
import { scoreFraud } from '../services/mlService';
import { enqueuePayoutCreationJob } from './payoutCreation';

interface ClaimValidationJobPayload {
  claim_id: string;
}

let validationQueue: any;

function getValidationQueue(): any {
  if (validationQueue !== undefined) {
    return validationQueue;
  }

  try {
    const { Queue } = require('bullmq');
    const IORedis = require('ioredis');
    const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');
    validationQueue = new Queue('claim-validation', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: false,
      },
    });
  } catch {
    validationQueue = null;
  }

  return validationQueue;
}

export async function processClaimValidationJob(payload: ClaimValidationJobPayload): Promise<void> {
  const claimId = payload.claim_id;

  await query(`UPDATE claims SET status = 'validating' WHERE id = $1`, [claimId]);

  const claimResult = await query(
    `SELECT
      c.id,
      c.worker_id,
      c.payout_amount,
      c.created_at,
      c.disruption_event_id,
      c.disruption_hours,
      w.zone_multiplier,
      w.platform,
      w.created_at AS worker_created_at
     FROM claims c
     JOIN workers w ON w.id = c.worker_id
     WHERE c.id = $1
     LIMIT 1`,
    [claimId]
  );

  const claim = claimResult.rows[0] as any;
  if (!claim) {
    throw new Error('Claim not found for validation');
  }

  const freqResult = await query(
    `SELECT COUNT(*)::int AS claim_freq_30d
     FROM claims
     WHERE worker_id = $1
     AND created_at > NOW() - INTERVAL '30 days'`,
    [claim.worker_id]
  );

  const claimFreq30d = Number((freqResult.rows[0] as any)?.claim_freq_30d || 0);
  const hoursSinceTrigger = Math.max(0, (Date.now() - new Date(claim.created_at).getTime()) / 3_600_000);
  const accountAgeDays = Math.max(1, (Date.now() - new Date(claim.worker_created_at).getTime()) / 86_400_000);

  const fraud = await scoreFraud({
    claim_id: claim.id,
    worker_id: claim.worker_id,
    payout_amount: Number(claim.payout_amount || 0),
    claim_freq_30d: claimFreq30d,
    hours_since_trigger: hoursSinceTrigger,
    zone_multiplier: Number(claim.zone_multiplier || 1.1),
    platform: claim.platform,
    account_age_days: accountAgeDays,
  });

  await query(
    `UPDATE claims
     SET fraud_score = $2,
         isolation_forest_score = $3,
         gnn_fraud_score = $4,
         graph_flags = $5::jsonb
     WHERE id = $1`,
    [claimId, fraud.fraud_score, fraud.fraud_score, fraud.gnn_fraud_score, JSON.stringify(fraud.graph_flags || [])]
  );

  const score = Number(fraud.fraud_score || 0);

  if (score > 0.65) {
    await query(
      `UPDATE claims
       SET status = 'under_review', bcs_score = 34
       WHERE id = $1`,
      [claimId]
    );
    return;
  }

  if (score >= 0.3 && score <= 0.65) {
    await query(
      `UPDATE claims
       SET notes = COALESCE(notes, '') || ' | Provisional approval with async verification'
       WHERE id = $1`,
      [claimId]
    );
  }

  await query(`UPDATE claims SET status = 'approved' WHERE id = $1`, [claimId]);
  await enqueuePayoutCreationJob({ claim_id: claimId });
}

export async function enqueueClaimValidationJob(payload: ClaimValidationJobPayload): Promise<void> {
  const queue = getValidationQueue();
  if (!queue) {
    setImmediate(() => {
      processClaimValidationJob(payload).catch(() => undefined);
    });
    return;
  }

  await queue.add('claim-validation', payload);
}

export function startClaimValidationWorker(): void {
  try {
    const { Worker } = require('bullmq');
    const IORedis = require('ioredis');
    const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

    new Worker(
      'claim-validation',
      async (job: any) => {
        await processClaimValidationJob(job.data as ClaimValidationJobPayload);
      },
      { connection }
    );
  } catch {
    // BullMQ optional in local dev.
  }
}
