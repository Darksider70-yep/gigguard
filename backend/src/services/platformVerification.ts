import { query } from '../db';
import { logger } from '../lib/logger';

interface WorkerPresenceRow {
  updated_at: string | Date | null;
  verified_at?: string | Date | null;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Proxy for platform-online verification using last known worker activity.
 * If dedicated platform heartbeat data is unavailable, we use `workers.updated_at`.
 */
export async function checkPlatformOnlineStatus(
  workerId: string,
  withinMinutes: number,
  referenceTime?: string | Date
): Promise<boolean> {
  try {
    const { rows } = await query<WorkerPresenceRow>(
      `SELECT updated_at, verified_at
       FROM workers
       WHERE id = $1
       LIMIT 1`,
      [workerId]
    );

    if (rows.length === 0) {
      return false;
    }

    const anchor = toDate(referenceTime ?? new Date());
    if (!anchor) {
      return false;
    }

    const lastSeen = toDate(rows[0].updated_at) ?? toDate(rows[0].verified_at);
    if (!lastSeen) {
      return false;
    }

    const deltaMinutes = Math.abs(anchor.getTime() - lastSeen.getTime()) / 60000;
    return deltaMinutes <= withinMinutes;
  } catch (err) {
    logger.warn('PlatformVerification', 'status_check_failed', {
      worker_id: workerId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

