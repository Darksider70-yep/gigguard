import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { authenticateInsurer } from '../middleware/auth';
import { query } from '../db';
import { payoutQueue } from '../queues';
import { mlService } from '../services/mlService';

const router = Router();

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<void | Response>;

function asyncRoute(handler: AsyncRoute) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function flagToHumanReadable(flag: string): string {
  const map: Record<string, string> = {
    cell_tower_mismatch: 'Cell tower mismatch (location inconsistency)',
    platform_offline_at_event: 'Platform status: Offline at event time',
    shared_upi_with_workers: 'UPI address shared with multiple accounts',
    same_device_multiple_accounts: 'Device linked to multiple accounts',
    registration_burst: 'Account registered during mass registration event',
    high_claim_frequency: 'Unusually high claim frequency vs zone average',
  };
  return map[flag] ?? flag;
}

router.get('/dashboard', authenticateInsurer, asyncRoute(async (_req, res) => {
  const [workers, policies, payouts, flagged, events, zones] = await Promise.all([
    query<{ count: string }>('SELECT COUNT(*)::text as count FROM workers'),
    query<{ count: string }>("SELECT COUNT(*)::text as count FROM policies WHERE status='active'"),
    query<{ total: string }>(
      `SELECT COALESCE(SUM(amount),0)::text as total
       FROM payouts
       WHERE created_at > date_trunc('month', NOW())
         AND status='paid'`
    ),
    query<{ count: string }>("SELECT COUNT(*)::text as count FROM claims WHERE status='under_review'"),
    query(
      `SELECT trigger_type, city, zone, trigger_value,
              trigger_threshold as threshold,
              affected_workers_count as affected_worker_count,
              total_payout_amount as total_payout,
              status, event_start, id
       FROM disruption_events
       ORDER BY event_start DESC
       LIMIT 10`
    ),
    query(
      `SELECT DISTINCT city, zone, zone_multiplier,
         CASE
           WHEN zone_multiplier > 1.2 THEN 'High'
           WHEN zone_multiplier >= 1.0 THEN 'Medium'
           ELSE 'Low'
         END as risk_level
       FROM workers
       WHERE home_hex_id IS NOT NULL
       ORDER BY zone_multiplier DESC
       LIMIT 10`
    ),
  ]);

  const { rows: premiumRows } = await query<{ total: string }>(
    `SELECT COALESCE(SUM(premium_paid),0)::text as total
     FROM policies
     WHERE purchased_at > date_trunc('month', NOW())`
  );

  const totalPremiums = Number(premiumRows[0].total) || 1;
  const totalPayouts = Number((payouts.rows[0] as any).total) || 0;
  const rawLossRatio = totalPayouts / totalPremiums;
  const lossRatio = Math.min(Math.max(rawLossRatio, 0), 1);

  const { rows: coverageRows } = await query<{ cities: string; zones: string }>(
    `SELECT COUNT(DISTINCT city)::text as cities,
            COUNT(DISTINCT zone)::text as zones
     FROM workers
     WHERE home_hex_id IS NOT NULL`
  );

  const { rows: avgPremium } = await query<{ avg: string | null }>(
    `SELECT ROUND(AVG(premium_paid))::text as avg
     FROM policies
     WHERE status='active'`
  );

  const normalizedEvents = events.rows.map((event: any) => ({
    ...event,
    trigger_value: event.trigger_value != null ? Number(event.trigger_value) : event.trigger_value,
    threshold: event.threshold != null ? Number(event.threshold) : event.threshold,
    affected_worker_count:
      event.affected_worker_count != null
        ? Number(event.affected_worker_count)
        : event.affected_worker_count,
    total_payout:
      event.total_payout != null ? Math.round(Number(event.total_payout)) : event.total_payout,
  }));

  res.json({
    stats: {
      total_workers: parseInt((workers.rows[0] as any).count, 10),
      active_policies: parseInt((policies.rows[0] as any).count, 10),
      payouts_this_month: Math.round(totalPayouts),
      flagged_claims: parseInt((flagged.rows[0] as any).count, 10),
      loss_ratio: Number(lossRatio.toFixed(2)),
      coverage_area: {
        cities: parseInt(coverageRows[0].cities, 10),
        zones: parseInt(coverageRows[0].zones, 10),
      },
      average_premium: parseInt(avgPremium[0]?.avg ?? '52', 10),
    },
    disruption_events: normalizedEvents,
    zone_risk_matrix: zones.rows,
  });
}));

router.get('/disruption-events', authenticateInsurer, asyncRoute(async (req, res) => {
  const status = req.query.status as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);

  if (status) {
    const { rows } = await query(
      `SELECT id, trigger_type, city, zone, trigger_value,
              trigger_threshold as threshold,
              affected_workers_count as affected_worker_count,
              total_payout_amount as total_payout,
              status, event_start, disruption_hours
       FROM disruption_events
       WHERE status = $1
       ORDER BY event_start DESC
       LIMIT $2`,
      [status, limit]
    );
    return res.json({
      events: rows.map((event: any) => ({
        ...event,
        trigger_value:
          event.trigger_value != null ? Number(event.trigger_value) : event.trigger_value,
        threshold: event.threshold != null ? Number(event.threshold) : event.threshold,
        affected_worker_count:
          event.affected_worker_count != null
            ? Number(event.affected_worker_count)
            : event.affected_worker_count,
        total_payout:
          event.total_payout != null ? Math.round(Number(event.total_payout)) : event.total_payout,
      })),
    });
  }

  const { rows } = await query(
    `SELECT id, trigger_type, city, zone, trigger_value,
            trigger_threshold as threshold,
            affected_workers_count as affected_worker_count,
            total_payout_amount as total_payout,
            status, event_start, disruption_hours
     FROM disruption_events
     ORDER BY event_start DESC
     LIMIT $1`,
    [limit]
  );

  res.json({
    events: rows.map((event: any) => ({
      ...event,
      trigger_value: event.trigger_value != null ? Number(event.trigger_value) : event.trigger_value,
      threshold: event.threshold != null ? Number(event.threshold) : event.threshold,
      affected_worker_count:
        event.affected_worker_count != null
          ? Number(event.affected_worker_count)
          : event.affected_worker_count,
      total_payout:
        event.total_payout != null ? Math.round(Number(event.total_payout)) : event.total_payout,
    })),
  });
}));

router.get('/anti-spoofing-alerts', authenticateInsurer, asyncRoute(async (_req, res) => {
  const { rows } = await query<{
    claim_id: string;
    worker_name: string;
    city: string;
    zone: string;
    trigger_type: string;
    bcs_score: number;
    graph_flags: string[] | null;
    payout_amount: string;
    created_at: string;
  }>(
    `SELECT c.id as claim_id, w.name as worker_name,
            w.city, w.zone, c.trigger_type, c.bcs_score,
            c.graph_flags, c.payout_amount, c.created_at
     FROM claims c
     JOIN workers w ON w.id = c.worker_id
     WHERE c.status = 'under_review'
     ORDER BY c.created_at DESC`
  );

  const alerts = rows.map((r) => ({
    ...r,
    bcs_tier: r.bcs_score < 34 ? 3 : 2,
    payout_amount: Math.round(Number(r.payout_amount)),
    graph_flags: (r.graph_flags ?? []).map(flagToHumanReadable),
  }));

  res.json({ alerts });
}));

router.post('/claims/:id/approve', authenticateInsurer, asyncRoute(async (req, res) => {
  const claimId = req.params.id;

  const { rows } = await query<any>(
    `UPDATE claims
     SET status='approved', notes='Manually approved by insurer'
     WHERE id=$1 AND status='under_review'
     RETURNING *`,
    [claimId]
  );

  if (rows.length === 0) {
    return res.status(404).json({ code: 'CLAIM_NOT_FOUND_OR_NOT_REVIEWABLE' });
  }

  const claim = rows[0];
  const goodwillBonus = (claim.bcs_score ?? 100) < 40 ? 20 : 0;
  const finalAmount = Number(claim.payout_amount) + goodwillBonus;

  await payoutQueue.add('create-payout', {
    claim_id: claimId,
    payout_amount: finalAmount,
  });

  res.json({ success: true, payout_amount: finalAmount });
}));

router.post('/claims/:id/deny', authenticateInsurer, asyncRoute(async (req, res) => {
  const parsed = z.object({ reason: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Reason is required' });
  }
  const { reason } = parsed.data;

  await query(
    `UPDATE claims
     SET status='denied', notes=$1
     WHERE id=$2 AND status='under_review'`,
    [reason, req.params.id]
  );

  res.json({ success: true });
}));

router.get('/zone-risk-matrix', authenticateInsurer, asyncRoute(async (_req, res) => {
  const { rows } = await query(
    `SELECT DISTINCT city, zone, zone_multiplier,
       CASE
         WHEN zone_multiplier > 1.2 THEN 'High'
         WHEN zone_multiplier >= 1.0 THEN 'Medium'
         ELSE 'Low'
       END as risk_level
     FROM workers
     WHERE home_hex_id IS NOT NULL
     ORDER BY zone_multiplier DESC`
  );
  res.json({ zones: rows });
}));

let shadowCache: { data: any; ts: number } | null = null;
const SHADOW_CACHE_TTL = 5 * 60 * 1000;

router.get('/shadow-comparison', authenticateInsurer, asyncRoute(async (_req, res) => {
  if (shadowCache && Date.now() - shadowCache.ts < SHADOW_CACHE_TTL) {
    return res.json(shadowCache.data);
  }
  const data = await mlService.getShadowComparison();
  if (data) {
    shadowCache = { data, ts: Date.now() };
  }
  res.json(data ?? { error: 'ML service unavailable' });
}));

export default router;
