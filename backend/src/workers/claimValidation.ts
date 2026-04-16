import { Job, Worker } from 'bullmq';
import { query } from '../db';
import { mlService } from '../services/mlService';
import { payoutQueue, redisConnection } from '../queues';
import { config } from '../config';
import { logger } from '../lib/logger';
import { processPayoutCreationJob } from './payoutCreation';

export interface ClaimValidationJob {
  claim_id: string;
}

export async function processClaimValidationJob(data: ClaimValidationJob): Promise<void> {
  const { claim_id } = data;

  const { rows } = await query<{
    [key: string]: any;
    zone_multiplier: number;
    platform: string;
    worker_created_at: string;
    is_simulated: boolean;
  }>(
    `SELECT c.*, w.zone_multiplier, w.platform, w.created_at as worker_created_at, de.is_simulated
     FROM claims c
     JOIN workers w ON w.id = c.worker_id
     LEFT JOIN disruption_events de ON de.id = c.disruption_event_id
     WHERE c.id = $1`,
    [claim_id]
  );

  if (rows.length === 0) {
    logger.warn('ClaimValidation', 'claim_not_found', { claim_id });
    return;
  }

  const claim = rows[0];

  await query(
    `UPDATE claims
     SET status='validating'
     WHERE id=$1`,
    [claim_id]
  );

  const hoursSinceTrigger =
    (Date.now() - new Date(claim.created_at as string).getTime()) / 3600000;

  const { rows: freqRows } = await query<{ cnt: string }>(
    `SELECT COUNT(*)::text as cnt
     FROM claims
     WHERE worker_id=$1
       AND created_at > NOW() - INTERVAL '30 days'
       AND status != 'denied'`,
    [claim.worker_id]
  );
  const claimFreq30d = parseInt(freqRows[0].cnt, 10);

  const accountAgeDays = Math.floor(
    (Date.now() - new Date(claim.worker_created_at).getTime()) / 86400000
  );

  const fraudResult = await mlService.scoreFraud({
    claim_id,
    worker_id: claim.worker_id,
    payout_amount: Number(claim.payout_amount),
    claim_freq_30d: claimFreq30d,
    hours_since_trigger: hoursSinceTrigger,
    zone_multiplier: Number(claim.zone_multiplier),
    platform: claim.platform,
    account_age_days: accountAgeDays,
  });

  let bcsScore = 100;
  if (fraudResult.bcs_tier === 2 || fraudResult.tier === 2) bcsScore = 60;
  if (fraudResult.bcs_tier === 3 || fraudResult.tier === 3) bcsScore = 20;

  const rec = rows[0].is_simulated 
    ? 'approve' 
    : (fraudResult.recommendation || (fraudResult.tier === 3 ? 'deny' : 'approve'));

  await query(
    `UPDATE claims
     SET fraud_score=$1,
         isolation_forest_score=$2,
         gnn_fraud_score=$3,
         graph_flags=$4,
         bcs_score=$5
     WHERE id=$6`,
    [
      fraudResult.fraud_score,
      fraudResult.isolation_forest_score || fraudResult.fraud_score,
      fraudResult.gnn_score || fraudResult.gnn_fraud_score,
      fraudResult.graph_flags ? JSON.stringify(fraudResult.graph_flags) : null,
      bcsScore,
      claim_id,
    ]
  );

  logger.info('ClaimValidation', 'fraud_scored', {
    claim_id,
    fraud_score: fraudResult.fraud_score,
    tier: fraudResult.tier,
    flagged: fraudResult.flagged,
    scorer: fraudResult.scorer,
  });

  if (fraudResult.scorer === 'fallback_default') {
    logger.warn('ClaimValidation', 'ml_fallback', {
      claim_id,
      reason: 'timeout_or_unavailable',
    });
  }

  if (rec === 'deny') {
    await query(`UPDATE claims SET status='flagged' WHERE id=$1`, [claim_id]);
    logger.warn('ClaimValidation', 'flagged_denied', { claim_id, bcs_score: bcsScore });
    return;
  } else if (rec === 'review') {
    await query(`UPDATE claims SET status='under_review' WHERE id=$1`, [claim_id]);
    logger.warn('ClaimValidation', 'held_for_review', { claim_id, bcs_score: bcsScore });
    return;
  }

  // approve
  await query(`UPDATE claims SET status='approved' WHERE id=$1`, [claim_id]);

  logger.info('ClaimValidation', 'auto_approved', {
    claim_id,
    fraud_score: fraudResult.fraud_score,
  });

  try {
    await payoutQueue.add(
      'create-payout',
      { claim_id },
      { attempts: 3, backoff: { type: 'exponential', delay: 10000 } }
    );
  } catch (err) {
    logger.warn('ClaimValidation', 'payout_enqueue_failed_sync_fallback', {
      claim_id,
      error: err instanceof Error ? err.message : String(err),
    });
    await processPayoutCreationJob({ claim_id });
  }
}

export const claimValidationWorker =
  config.NODE_ENV === 'test' || config.USE_IN_MEMORY_REDIS
    ? null
    : new Worker<ClaimValidationJob>(
        'claim-validation',
        async (job: Job<ClaimValidationJob>) => processClaimValidationJob(job.data),
        {
          connection: redisConnection,
          concurrency: 10,
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 500 },
        } as any
      );
