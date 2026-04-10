import { query } from '../db';
import { logger } from '../lib/logger';

export async function expireOldPolicies(): Promise<void> {
  const { rows } = await query<{ id: string; worker_id: string }>(
    `UPDATE policies
     SET status = 'expired'
     WHERE status = 'active'
       AND week_end < CURRENT_DATE
     RETURNING id, worker_id`
  );

  logger.info('PolicyExpiry', 'policies_expired', { count: rows.length });

  for (const policy of rows) {
    await updateHistoryMultiplier(policy.worker_id);
  }
}

async function updateHistoryMultiplier(workerId: string): Promise<void> {
  const { rows } = await query<{ cnt: string }>(
    `SELECT COUNT(*)::text as cnt
     FROM claims
     WHERE worker_id=$1
       AND created_at > NOW() - INTERVAL '90 days'
       AND status IN ('paid', 'approved')`,
    [workerId]
  );
  const claimCount = parseInt(rows[0].cnt, 10);

  let newMultiplier = 1.0;
  if (claimCount === 0) {
    newMultiplier = 0.85;
  } else if (claimCount <= 2) {
    newMultiplier = 0.9;
  } else if (claimCount <= 5) {
    newMultiplier = 1.0;
  } else if (claimCount <= 8) {
    newMultiplier = 1.1;
  } else {
    newMultiplier = 1.25;
  }

  await query(
    `UPDATE workers
     SET history_multiplier=$1
     WHERE id=$2`,
    [newMultiplier, workerId]
  );
}
