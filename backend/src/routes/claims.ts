import { Router, Response } from 'express';
import { query } from '../db';
import { AuthenticatedRequest, requireWorker } from '../middleware/auth';

const router = Router();

function buildUnderReviewReason(claim: any) {
  if (claim.status !== 'under_review') {
    return null;
  }

  const graphFlags = Array.isArray(claim.graph_flags) ? claim.graph_flags : [];
  const humanReadableFlags = graphFlags.map((flag: string) => {
    if (flag === 'cell_tower_mismatch') {
      return 'Cell tower mismatch (Andheri vs Bandra)';
    }
    if (flag === 'platform_offline_at_event') {
      return 'Platform status: Offline at event time';
    }
    return String(flag);
  });

  return {
    behavioral_coherence_score: Number(claim.bcs_score || 34),
    tier: 3,
    flag_reasons: humanReadableFlags,
    reviewer_eta_hours: 4,
    goodwill_bonus: 20,
  };
}

router.get('/', requireWorker, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workerId = req.user!.id;
    const limitParam = Number(req.query.limit || 0);

    const claimsResult = await query(
      `SELECT
         c.id,
         c.trigger_type,
         c.payout_amount,
         c.disruption_hours,
         c.status,
         c.created_at,
         c.paid_at,
         c.fraud_score,
         c.graph_flags,
         c.bcs_score,
         de.trigger_value,
         de.city,
         de.zone,
         de.disruption_hours AS event_disruption_hours,
         pay.razorpay_payout_id AS razorpay_ref
       FROM claims c
       JOIN disruption_events de ON de.id = c.disruption_event_id
       LEFT JOIN payouts pay ON pay.claim_id = c.id
       WHERE c.worker_id = $1
       ORDER BY c.created_at DESC
       ${limitParam > 0 ? 'LIMIT $2' : ''}`,
      limitParam > 0 ? [workerId, limitParam] : [workerId]
    );

    const statsResult = await query(
      `SELECT
         COALESCE(SUM(payout_amount) FILTER (WHERE status = 'paid'), 0)::float8 AS total_paid_out,
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days' AND status = 'paid')::int AS claims_this_month,
         COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_streak
       FROM claims
       WHERE worker_id = $1`,
      [workerId]
    );

    const statsRow = statsResult.rows[0] as any;

    const claims = claimsResult.rows.map((claim: any) => ({
      id: claim.id,
      trigger_type: claim.trigger_type,
      trigger_value: claim.trigger_value ? Number(claim.trigger_value) : null,
      city: claim.city,
      zone: claim.zone,
      payout_amount: Math.round(Number(claim.payout_amount || 0)),
      disruption_hours: Number(claim.disruption_hours || claim.event_disruption_hours || 0),
      status: claim.status,
      created_at: claim.created_at,
      paid_at: claim.paid_at,
      razorpay_ref: claim.razorpay_ref,
      fraud_score: Number(claim.fraud_score || 0),
      graph_flags: Array.isArray(claim.graph_flags) ? claim.graph_flags : [],
      bcs_score: claim.bcs_score ? Number(claim.bcs_score) : null,
      under_review_reason: buildUnderReviewReason(claim),
    }));

    return res.status(200).json({
      stats: {
        total_paid_out: Math.round(Number(statsRow?.total_paid_out || 0)),
        claims_this_month: Number(statsRow?.claims_this_month || 0),
        paid_streak: Number(statsRow?.paid_streak || 0),
      },
      claims,
    });
  } catch {
    return res.status(500).json({ message: 'Failed to fetch claims' });
  }
});

router.get('/:id', requireWorker, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workerId = req.user!.id;
    const claimId = req.params.id;

    const result = await query(
      `SELECT
         c.*,
         de.trigger_value,
         de.city,
         de.zone,
         de.disruption_hours AS event_disruption_hours,
         pay.razorpay_payout_id AS razorpay_ref
       FROM claims c
       JOIN disruption_events de ON de.id = c.disruption_event_id
       LEFT JOIN payouts pay ON pay.claim_id = c.id
       WHERE c.id = $1 AND c.worker_id = $2
       LIMIT 1`,
      [claimId, workerId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Claim not found' });
    }

    const claim = result.rows[0] as any;

    return res.status(200).json({
      id: claim.id,
      trigger_type: claim.trigger_type,
      trigger_value: claim.trigger_value ? Number(claim.trigger_value) : null,
      city: claim.city,
      zone: claim.zone,
      payout_amount: Math.round(Number(claim.payout_amount || 0)),
      disruption_hours: Number(claim.disruption_hours || claim.event_disruption_hours || 0),
      status: claim.status,
      created_at: claim.created_at,
      paid_at: claim.paid_at,
      razorpay_ref: claim.razorpay_ref,
      fraud_score: Number(claim.fraud_score || 0),
      graph_flags: Array.isArray(claim.graph_flags) ? claim.graph_flags : [],
      bcs_score: claim.bcs_score ? Number(claim.bcs_score) : null,
      notes: claim.notes,
      under_review_reason: buildUnderReviewReason(claim),
    });
  } catch {
    return res.status(500).json({ message: 'Failed to fetch claim' });
  }
});

export default router;
