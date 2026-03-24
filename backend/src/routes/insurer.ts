import { randomUUID } from 'crypto';
import { Router, Request, Response } from 'express';
import { query } from '../db';
import { AuthenticatedRequest, requireInsurer } from '../middleware/auth';
import { getShadowComparison } from '../services/mlService';
import { enqueuePayoutCreationJob } from '../workers/payoutCreation';

const router = Router();

let shadowCache: { value: any; expiresAt: number } | null = null;

interface InsurerProfileRow {
  id: string;
  name: string;
  email: string | null;
  phone_number: string | null;
  role: string;
  created_at: string;
}

async function fetchInsurerProfile(insurerId?: string): Promise<InsurerProfileRow> {
  const fallback: InsurerProfileRow = {
    id: insurerId || 'insurer-admin',
    name: 'Daksh Gehlot',
    email: null,
    phone_number: null,
    role: 'admin',
    created_at: new Date().toISOString(),
  };

  try {
    const selectClause = `SELECT id::text, name, email, phone_number, role, created_at FROM insurer_profiles`;

    if (insurerId) {
      const byId = await query<InsurerProfileRow>(`${selectClause} WHERE id::text = $1 LIMIT 1`, [insurerId]);
      if (byId.rows[0]) {
        return byId.rows[0];
      }
    }

    const byName = await query<InsurerProfileRow>(`${selectClause} WHERE LOWER(name) = LOWER($1) LIMIT 1`, [
      'Daksh Gehlot',
    ]);
    if (byName.rows[0]) {
      return byName.rows[0];
    }

    const latest = await query<InsurerProfileRow>(
      `${selectClause} ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT 1`
    );
    if (latest.rows[0]) {
      return latest.rows[0];
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function triggerThreshold(triggerType: string): number {
  if (triggerType === 'heavy_rainfall') {
    return 15;
  }
  if (triggerType === 'extreme_heat') {
    return 44;
  }
  if (triggerType === 'severe_aqi') {
    return 300;
  }
  return 1;
}

async function fetchDisruptionEvents(status?: string, limit = 20) {
  const params: unknown[] = [];
  const where: string[] = [];

  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }

  params.push(limit);

  const result = await query(
    `SELECT id, trigger_type, city, zone, trigger_value, affected_worker_count, total_payout, status, event_start
     FROM disruption_events
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY event_start DESC
     LIMIT $${params.length}`,
    params
  );

  return result.rows.map((event: any) => ({
    id: event.id,
    trigger_type: event.trigger_type,
    city: event.city,
    zone: event.zone,
    trigger_value: event.trigger_value ? Number(event.trigger_value) : null,
    threshold: triggerThreshold(event.trigger_type),
    affected_worker_count: Number(event.affected_worker_count || 0),
    total_payout: Math.round(Number(event.total_payout || 0)),
    status: event.status,
    event_start: event.event_start,
  }));
}

async function fetchAlerts() {
  const result = await query(
    `SELECT
      c.id AS claim_id,
      w.name AS worker_name,
      de.trigger_type,
      w.city,
      w.zone,
      c.bcs_score,
      c.payout_amount,
      c.graph_flags,
      c.created_at
     FROM claims c
     JOIN workers w ON w.id = c.worker_id
     JOIN disruption_events de ON de.id = c.disruption_event_id
     WHERE c.status = 'under_review'
     ORDER BY c.created_at DESC`
  );

  return result.rows.map((alert: any) => ({
    claim_id: alert.claim_id,
    worker_name: alert.worker_name,
    trigger_type: alert.trigger_type,
    city: alert.city,
    zone: alert.zone,
    bcs_score: Number(alert.bcs_score || 34),
    bcs_tier: Number(alert.bcs_score || 34) > 65 ? 1 : Number(alert.bcs_score || 34) > 40 ? 2 : 3,
    payout_amount: Math.round(Number(alert.payout_amount || 0)),
    graph_flags: Array.isArray(alert.graph_flags) ? alert.graph_flags : [],
    created_at: alert.created_at,
  }));
}

async function fetchZoneRiskMatrix(limit?: number) {
  const params: unknown[] = [];
  const limitClause = limit ? `LIMIT $1` : '';
  if (limit) {
    params.push(limit);
  }

  const result = await query(
    `SELECT DISTINCT
       city,
       zone,
       COALESCE(zone_multiplier, 1.0)::float8 AS zone_multiplier,
       CASE
         WHEN COALESCE(zone_multiplier, 1.0) > 1.2 THEN 'High'
         WHEN COALESCE(zone_multiplier, 1.0) >= 1.0 THEN 'Medium'
         ELSE 'Low'
       END AS risk_level
     FROM workers
     WHERE home_hex_id IS NOT NULL
     ORDER BY zone_multiplier DESC
     ${limitClause}`,
    params
  );

  return result.rows.map((row: any) => ({
    zone: row.zone || 'Unknown',
    city: row.city,
    zone_multiplier: Number(row.zone_multiplier || 1),
    risk_level: row.risk_level,
  }));
}

router.get('/me', requireInsurer, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const insurer = await fetchInsurerProfile(req.user?.id);
    return res.status(200).json(insurer);
  } catch {
    return res.status(500).json({ message: 'Failed to fetch insurer profile' });
  }
});

router.get('/disruption-events', async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));

    // Public home ticker support: allow only active events with limit <= 1.
    if (!(req.headers.authorization && req.headers.authorization.startsWith('Bearer '))) {
      if (status !== 'active' || limit > 1) {
        return res.status(401).json({ message: 'Insurer auth required' });
      }
    } else {
      const gate = requireInsurer(req as AuthenticatedRequest, res, () => undefined);
      if (gate) {
        return gate;
      }
    }

    const events = await fetchDisruptionEvents(status, limit);
    return res.status(200).json({ events });
  } catch {
    return res.status(500).json({ message: 'Failed to fetch disruption events' });
  }
});

router.get('/anti-spoofing-alerts', requireInsurer, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const alerts = await fetchAlerts();
    return res.status(200).json({ alerts });
  } catch {
    return res.status(500).json({ message: 'Failed to fetch anti-spoofing alerts' });
  }
});

router.post('/claims/:id/approve', requireInsurer, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const claimId = req.params.id;

    const claimResult = await query(
      `SELECT id, worker_id, payout_amount, bcs_score, notes
       FROM claims
       WHERE id = $1
       LIMIT 1`,
      [claimId]
    );

    if (!claimResult.rows[0]) {
      return res.status(404).json({ message: 'Claim not found' });
    }

    const claim = claimResult.rows[0] as any;
    const baseAmount = Math.round(Number(claim.payout_amount || 0));
    const goodwill = Number(claim.bcs_score || 0) < 40 ? 20 : 0;
    const payoutAmount = baseAmount + goodwill;
    const note = goodwill > 0 ? `${claim.notes || ''} | Goodwill bonus: INR 20`.trim() : claim.notes;

    await query(`UPDATE claims SET status = 'approved', notes = $2 WHERE id = $1`, [claimId, note]);

    const payoutId = randomUUID();
    await query(
      `INSERT INTO payouts (id, claim_id, worker_id, amount, upi_vpa, status, created_at)
       SELECT $1, $2, c.worker_id, $3, w.upi_vpa, 'pending', NOW()
       FROM claims c
       JOIN workers w ON w.id = c.worker_id
       WHERE c.id = $2`,
      [payoutId, claimId, payoutAmount]
    );

    await enqueuePayoutCreationJob({ claim_id: claimId });

    return res.status(200).json({ success: true, payout_amount: payoutAmount });
  } catch {
    return res.status(500).json({ message: 'Failed to approve claim' });
  }
});

router.post('/claims/:id/deny', requireInsurer, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const claimId = req.params.id;
    const reason = String(req.body?.reason || 'Denied by insurer review');

    await query(`UPDATE claims SET status = 'denied', notes = $2 WHERE id = $1`, [claimId, reason]);

    return res.status(200).json({ success: true });
  } catch {
    return res.status(500).json({ message: 'Failed to deny claim' });
  }
});

router.get('/zone-risk-matrix', requireInsurer, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const zones = await fetchZoneRiskMatrix();
    return res.status(200).json({ zones });
  } catch {
    return res.status(500).json({ message: 'Failed to fetch zone risk matrix' });
  }
});

router.get('/dashboard', requireInsurer, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const [workersCount, activePolicies, payoutsMonth, flaggedClaims, avgPremium, coverageArea] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total_workers FROM workers`),
      query(`SELECT COUNT(*)::int AS active_policies FROM policies WHERE status = 'active'`),
      query(`SELECT COALESCE(SUM(payout_amount), 0)::float8 AS payouts_this_month FROM claims WHERE status = 'paid' AND created_at >= date_trunc('month', NOW())`),
      query(`SELECT COUNT(*)::int AS flagged_claims FROM claims WHERE status = 'under_review'`),
      query(`SELECT COALESCE(AVG(premium_paid), 0)::float8 AS average_premium FROM policies WHERE purchased_at >= date_trunc('month', NOW())`),
      query(`SELECT COUNT(DISTINCT city)::int AS cities, COUNT(DISTINCT zone)::int AS zones FROM workers`),
    ]);

    const premiumMonth = await query(`SELECT COALESCE(SUM(premium_paid), 0)::float8 AS premiums_this_month FROM policies WHERE purchased_at >= date_trunc('month', NOW())`);
    const paidMonth = Number((payoutsMonth.rows[0] as any)?.payouts_this_month || 0);
    const premiumSumMonth = Number((premiumMonth.rows[0] as any)?.premiums_this_month || 0);

    const [events, zoneRisk, alerts] = await Promise.all([
      fetchDisruptionEvents(undefined, 10),
      fetchZoneRiskMatrix(10),
      fetchAlerts(),
    ]);

    return res.status(200).json({
      stats: {
        total_workers: Number((workersCount.rows[0] as any)?.total_workers || 0),
        active_policies: Number((activePolicies.rows[0] as any)?.active_policies || 0),
        payouts_this_month: Math.round(paidMonth),
        flagged_claims: Number((flaggedClaims.rows[0] as any)?.flagged_claims || 0),
        loss_ratio: premiumSumMonth > 0 ? Number((paidMonth / premiumSumMonth).toFixed(2)) : 0,
        coverage_area: {
          cities: Number((coverageArea.rows[0] as any)?.cities || 0),
          zones: Number((coverageArea.rows[0] as any)?.zones || 0),
        },
        average_premium: Math.round(Number((avgPremium.rows[0] as any)?.average_premium || 0)),
      },
      disruption_events: events,
      zone_risk_matrix: zoneRisk,
      anti_spoofing_alerts: alerts,
    });
  } catch {
    return res.status(500).json({ message: 'Failed to fetch insurer dashboard' });
  }
});

router.get('/shadow-comparison', requireInsurer, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const now = Date.now();
    if (shadowCache && shadowCache.expiresAt > now) {
      return res.status(200).json(shadowCache.value);
    }

    const result = await getShadowComparison();
    shadowCache = {
      value: result,
      expiresAt: now + 5 * 60 * 1000,
    };

    return res.status(200).json(result);
  } catch {
    return res.status(500).json({ message: 'Failed to fetch shadow comparison' });
  }
});

export default router;
