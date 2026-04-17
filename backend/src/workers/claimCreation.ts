import { Job, Worker } from 'bullmq';
import { query, withTransaction } from '../db';
import { premiumService } from '../services/premiumService';
import { claimValidationQueue, redisConnection } from '../queues';
import { config } from '../config';
import { logger } from '../lib/logger';

export interface ClaimCreationJob {
  disruption_event_id: string;
  trigger_type: string;
  disruption_hours: number;
  trigger_value: number;
  worker_ids: string[];
  health_advisory_id?: string;
  claim_date?: string;
  is_simulated?: boolean;
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
    health_advisory_id,
    claim_date,
    is_simulated,
  } = data;

  let claimsCreated = 0;

  let totalPayoutAmount = 0;

  for (const workerId of worker_ids) {
    try {
      const upsertResult = await withTransaction(async (client) => {
        const { rows: policies } = await client.query(
          `SELECT p.id, w.avg_daily_earning
           FROM policies p
           JOIN workers w ON w.id = p.worker_id
           WHERE p.worker_id = $1
             AND CURRENT_DATE BETWEEN p.week_start AND p.week_end
             AND p.status = 'active'
           LIMIT 1`,
          [workerId]
        );

        if (policies.length === 0) {
          return {
            claimId: null,
            claimCreated: false,
            claimUpdated: false,
            payoutAmount: 0,
            disruptionHours: disruption_hours,
          };
        }
        const policy = policies[0];
        const payout = premiumService.calculateCoverageAmount(
          Number(policy.avg_daily_earning),
          trigger_type
        );

        const { rows: existing } = await client.query<{
          id: string;
          payout_amount: string;
          status: string;
        }>(
          `SELECT id, payout_amount::text, status
           FROM claims
           WHERE worker_id = $1
             AND created_at::date = NOW()::date
             AND status != 'denied'
           ORDER BY created_at DESC
           LIMIT 1
           FOR UPDATE`,
          [workerId]
        );

        if (existing.length > 0) {
          const existingClaim = existing[0];
          const existingPayout = Number(existingClaim.payout_amount);
          const shouldUpgrade = payout > existingPayout && existingClaim.status !== 'paid';

          if (!shouldUpgrade) {
            logger.warn('ClaimCreation', 'claim_suppressed_daily_limit', {
              worker_id: workerId,
              existing_claim_id: existingClaim.id,
              existing_status: existingClaim.status,
              existing_payout: existingPayout,
              new_event_target_payout: payout,
              reason: 'Worker already has a valid claim for today and new event is not a high-intensity upgrade.'
            });
            return {
              claimId: existingClaim.id,
              claimCreated: false,
              claimUpdated: false,
              payoutAmount: existingPayout,
              disruptionHours: disruption_hours,
            };
          }

          const { rows: payoutLocks } = await client.query<{ status: string }>(
            `SELECT status
             FROM payouts
             WHERE claim_id = $1
               AND status IN ('processing', 'paid')
             LIMIT 1`,
            [existingClaim.id]
          );
          if (payoutLocks.length > 0) {
            logger.warn('ClaimCreation', 'upgrade_blocked_payout_processing', {
              worker_id: workerId,
              payout_status: payoutLocks[0].status,
            });
            return {
              claimId: null,
              claimCreated: false,
              claimUpdated: false,
              payoutAmount: existingPayout,
              disruptionHours: disruption_hours,
            };
          }

          await client.query(
            `UPDATE claims
             SET disruption_event_id = $1,
                 trigger_type = $2,
                 trigger_value = $3,
                 trigger_threshold = $4,
                 disruption_hours = $5,
                 payout_amount = $6,
                 status = 'triggered',
                 paid_at = NULL,
                 fraud_score = NULL,
                 isolation_forest_score = NULL,
                 gnn_fraud_score = NULL,
                 graph_flags = '[]'::jsonb,
                 bcs_score = NULL,
                 notes = CASE
                   WHEN notes IS NULL OR notes = '' THEN $7
                   ELSE notes || ' | ' || $7
                 END
             WHERE id = $8`,
            [
              disruption_event_id,
              trigger_type,
              trigger_value,
              premiumService.getThreshold(trigger_type),
              disruption_hours,
              payout,
              `Upgraded payout due to higher trigger on ${new Date().toISOString()}`,
              existingClaim.id,
            ]
          );

          return {
            claimId: existingClaim.id,
            claimCreated: false,
            claimUpdated: true,
            payoutAmount: payout,
            disruptionHours: disruption_hours,
          };
        }

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

        return {
          claimId: claims[0].id as string,
          claimCreated: true,
          claimUpdated: false,
          payoutAmount: payout,
          disruptionHours: disruption_hours,
        };
      });

      if (upsertResult.claimCreated) {
        claimsCreated += 1;
      }

      if (upsertResult.claimCreated || upsertResult.claimUpdated) {
        totalPayoutAmount += upsertResult.payoutAmount;
      }

      if (
        trigger_type === 'pandemic_containment' &&
        health_advisory_id &&
        claim_date &&
        upsertResult.claimId
      ) {
        await query(
          `UPDATE pandemic_claim_dedup
           SET claim_id = $1
           WHERE worker_id = $2
             AND health_advisory_id = $3
             AND claim_date = $4::date`,
          [upsertResult.claimId, workerId, health_advisory_id, claim_date]
        ).catch((err) => {
          logger.warn('ClaimCreation', 'pandemic_dedup_update_failed', {
            worker_id: workerId,
            health_advisory_id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }

      if (upsertResult.claimId && (upsertResult.claimCreated || upsertResult.claimUpdated)) {
        logger.info('ClaimCreation', 'claim_created', {
          claim_id: upsertResult.claimId,
          worker_id: workerId,
          trigger_type,
          payout_amount: upsertResult.payoutAmount,
          disruption_hours: upsertResult.disruptionHours,
          upgraded: upsertResult.claimUpdated,
        });
        await claimValidationQueue.add(
          'validate-claim',
          { claim_id: upsertResult.claimId },
          { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
        );
      }
    } catch (err) {
      logger.error('ClaimCreation', 'claim_creation_failed', {
        worker_id: workerId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await query(
    `UPDATE disruption_events
     SET total_claims_triggered = total_claims_triggered + $1,
         total_payout_amount = total_payout_amount + $2
     WHERE id = $3`,
    [claimsCreated, totalPayoutAmount, disruption_event_id]
  );

  return { claims_created: claimsCreated };
}

export const claimCreationWorker =
  config.NODE_ENV === 'test' || config.USE_IN_MEMORY_REDIS
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
