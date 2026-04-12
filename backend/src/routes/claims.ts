import { Router } from 'express';
import { query } from '../db';
import { authenticateWorker } from '../middleware/auth';
import { asyncRoute } from '../middleware/errorHandler';

const router = Router();

router.get('/', authenticateWorker, asyncRoute(async (req, res) => {
  const workerId = req.user!.id;

  const { rows: claims } = await query<{
    id: string;
    trigger_type: string;
    trigger_value: string | null;
    payout_amount: string;
    disruption_hours: string;
    fraud_score: number | null;
    graph_flags: string[] | null;
    bcs_score: number | null;
    status: string;
    notes: string | null;
    created_at: string;
    paid_at: string | null;
    city: string | null;
    zone: string | null;
    razorpay_ref: string | null;
  }>(
    `SELECT
       c.id, c.trigger_type, c.trigger_value, c.payout_amount,
       c.disruption_hours, c.fraud_score, c.graph_flags, c.bcs_score,
       c.status, c.notes, c.created_at, c.paid_at,
       de.city, de.zone,
       pay.razorpay_payout_id as razorpay_ref
     FROM claims c
     LEFT JOIN disruption_events de ON de.id = c.disruption_event_id
     LEFT JOIN payouts pay ON pay.claim_id = c.id
     WHERE c.worker_id = $1
     ORDER BY c.created_at DESC`,
    [workerId]
  );

  const { rows: stats } = await query<{
    total_paid_out: string;
    claims_this_month: string;
    total_paid_count: string;
  }>(
    `SELECT
       COALESCE(SUM(payout_amount) FILTER (WHERE status = 'paid'), 0)::text as total_paid_out,
       COUNT(*) FILTER (
         WHERE created_at > NOW() - INTERVAL '30 days'
         AND status = 'paid'
       )::text as claims_this_month,
       COUNT(*) FILTER (WHERE status = 'paid')::text as total_paid_count
     FROM claims
     WHERE worker_id = $1`,
    [workerId]
  );

  const enrichedClaims = claims.map((claim) => {
    const base = {
      ...claim,
      payout_amount: Math.round(Number(claim.payout_amount)),
      fraud_score: claim.fraud_score != null ? Number(claim.fraud_score) : null,
      razorpay_ref: claim.razorpay_ref ?? null,
      under_review_reason: null as any,
    };

    if (claim.status === 'under_review' && claim.bcs_score != null) {
      const flags = Array.isArray(claim.graph_flags) ? claim.graph_flags : [];
      const humanFlags = flags.map(flagToHumanReadable);
      base.under_review_reason = {
        behavioral_coherence_score: claim.bcs_score,
        tier: claim.bcs_score < 34 ? 3 : 2,
        flag_reasons: humanFlags,
        reviewer_eta_hours: 4,
        goodwill_bonus: claim.bcs_score < 40 ? 20 : 0,
      };
    }

    return base;
  });

  res.json({
    stats: {
      total_paid_out: stats[0] ? Math.round(Number(stats[0].total_paid_out)) : 0,
      claims_this_month: stats[0] ? parseInt(stats[0].claims_this_month, 10) : 0,
      paid_streak: stats[0] ? parseInt(stats[0].total_paid_count, 10) : 0,
    },
    claims: enrichedClaims,
  });
}));

router.get('/:id', authenticateWorker, asyncRoute(async (req, res) => {
  const { rows } = await query<{
    [key: string]: any;
  }>(
    `SELECT c.*, de.city, de.zone, de.trigger_type as event_trigger,
            pay.razorpay_payout_id, pay.status as payout_status
     FROM claims c
     LEFT JOIN disruption_events de ON de.id = c.disruption_event_id
     LEFT JOIN payouts pay ON pay.claim_id = c.id
     WHERE c.id = $1 AND c.worker_id = $2`,
    [req.params.id, req.user!.id]
  );

  if (rows.length === 0) {
    return res.status(404).json({
      code: 'CLAIM_NOT_FOUND',
      message: 'Claim not found',
    });
  }

  const claim = rows[0];
  res.json({
    ...claim,
    payout_amount:
      claim.payout_amount != null ? Math.round(Number(claim.payout_amount)) : claim.payout_amount,
    trigger_value: claim.trigger_value != null ? Number(claim.trigger_value) : claim.trigger_value,
    trigger_threshold:
      claim.trigger_threshold != null ? Number(claim.trigger_threshold) : claim.trigger_threshold,
    disruption_hours:
      claim.disruption_hours != null ? Number(claim.disruption_hours) : claim.disruption_hours,
    fraud_score: claim.fraud_score != null ? Number(claim.fraud_score) : claim.fraud_score,
  });
}));

router.post('/:id/appeal', authenticateWorker, asyncRoute(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const workerId = req.user!.id;

  if (!reason || reason.length < 10) {
    return res.status(400).json({ message: 'Appeal reason must be at least 10 characters' });
  }

  const { rows } = await query(
    `SELECT id, status FROM claims WHERE id = $1 AND worker_id = $2`,
    [id, workerId]
  );

  if (rows.length === 0) {
    return res.status(404).json({ message: 'Claim not found' });
  }

  const claim = rows[0];
  if (claim.status !== 'denied' && claim.status !== 'under_review') {
    return res.status(400).json({ message: 'Only denied or under_review claims can be appealed' });
  }

  await query(
    `UPDATE claims 
     SET status = 'under_review', 
         notes = CONCAT(COALESCE(notes, ''), '\n', 'Worker Appeal at ', NOW(), ': ', $1),
         updated_at = NOW()
     WHERE id = $2`,
    [reason, id]
  );

  res.json({ success: true, message: 'Appeal submitted and claim is now under review' });
}));

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

export default router;
