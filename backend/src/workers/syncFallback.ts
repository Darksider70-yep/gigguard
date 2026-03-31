import { query } from '../db';
import { logger } from '../lib/logger';

interface SyncTriggerParams {
  disruption_event_id: string;
  trigger_type: string;
  disruption_hours: number;
  trigger_value: number;
  worker_ids: string[];
}

export async function processTriggerSync(params: SyncTriggerParams): Promise<void> {
  logger.warn('SyncFallback', 'redis_unavailable_processing_sync', {
    disruption_event_id: params.disruption_event_id,
    worker_count: params.worker_ids.length,
  });

  const { processClaimCreationJob } = await import('./claimCreation');
  const { processClaimValidationJob } = await import('./claimValidation');
  const { processPayoutCreationJob } = await import('./payoutCreation');

  for (const workerId of params.worker_ids) {
    try {
      await processClaimCreationJob({
        ...params,
        worker_ids: [workerId],
      });

      const { rows } = await query<{ id: string; status: string }>(
        `SELECT id, status
         FROM claims
         WHERE worker_id = $1
           AND disruption_event_id = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [workerId, params.disruption_event_id]
      );

      if (rows.length === 0) {
        continue;
      }

      const claimId = rows[0].id;
      await processClaimValidationJob({ claim_id: claimId });

      const { rows: postValidation } = await query<{ status: string }>(
        `SELECT status
         FROM claims
         WHERE id = $1
         LIMIT 1`,
        [claimId]
      );

      if (postValidation[0]?.status === 'approved') {
        await processPayoutCreationJob({ claim_id: claimId });
      }
    } catch (err) {
      logger.error('SyncFallback', 'worker_processing_failed', {
        worker_id: workerId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
