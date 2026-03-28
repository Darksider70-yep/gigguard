import { Job, Worker } from 'bullmq';
import { query, withTransaction } from '../db';
import { premiumService } from '../services/premiumService';
import { claimValidationQueue, redisConnection } from '../queues';
import { config } from '../config';

export interface ClaimCreationJob {
  disruption_event_id: string;
  trigger_type: string;
  disruption_hours: number;
  trigger_value: number;
  worker_ids: string[];
}

export async function processClaimCreationJob(
  data: ClaimCreationJob
): Promise<{ claims_created: number }> {
  const {
    disruption_event_id,
    trigger_type,
    disruption_hours,
    trigger_value,
    worker_ids,
  } = data;

  let claimsCreated = 0;

  for (const workerId of worker_ids) {
    try {
      const created = await withTransaction(async (client) => {
        const { weekStart } = premiumService.getWeekBounds();
        const { rows: policies } = await client.query(
          `SELECT p.id, w.avg_daily_earning
           FROM policies p
           JOIN workers w ON w.id = p.worker_id
           WHERE p.worker_id = $1
             AND p.week_start = $2
             AND p.status = 'active'
           LIMIT 1`,
          [workerId, weekStart]
        );

        if (policies.length === 0) {
          return false;
        }
        const policy = policies[0];

        const { rows: existing } = await client.query(
          `SELECT 1
           FROM claims
           WHERE worker_id = $1
             AND created_at::date = NOW()::date
             AND status != 'denied'
           LIMIT 1`,
          [workerId]
        );
        if (existing.length > 0) {
          return false;
        }

        const payout = premiumService.calculateCoverageAmount(
          Number(policy.avg_daily_earning),
          trigger_type
        );

        const { rows: claims } = await client.query(
          `INSERT INTO claims (
             worker_id, policy_id, disruption_event_id,
             trigger_type, trigger_value,
             trigger_threshold, disruption_hours, payout_amount,
             status
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'triggered')
           RETURNING id`,
          [
            workerId,
            policy.id,
            disruption_event_id,
            trigger_type,
            trigger_value,
            premiumService.getThreshold(trigger_type),
            disruption_hours,
            payout,
          ]
        );

        return claims[0].id as string;
      });

      if (created) {
        claimsCreated += 1;
        await claimValidationQueue.add(
          'validate-claim',
          { claim_id: created },
          { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
        );
      }
    } catch (err) {
      console.error(`Failed to create claim for worker ${workerId}:`, err);
    }
  }

  await query(
    `UPDATE disruption_events
     SET total_claims_triggered = total_claims_triggered + $1,
         affected_workers_count = $2
     WHERE id = $3`,
    [claimsCreated, worker_ids.length, disruption_event_id]
  );

  return { claims_created: claimsCreated };
}

export const claimCreationWorker =
  config.NODE_ENV === 'test'
    ? null
    : new Worker<ClaimCreationJob>(
        'claim-creation',
        async (job: Job<ClaimCreationJob>) => processClaimCreationJob(job.data),
        {
          connection: redisConnection,
          concurrency: 5,
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 500 },
        } as any
      );
