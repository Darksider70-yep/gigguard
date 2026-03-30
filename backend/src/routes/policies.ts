import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db';
import { authenticateWorker } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { mlService } from '../services/mlService';
import { weatherService } from '../services/weatherService';
import { premiumService } from '../services/premiumService';
import { policyService } from '../services/policyService';
import { razorpayService } from '../services/razorpayService';

const router = Router();

router.get('/premium', authenticateWorker, async (req, res) => {
  const worker = req.worker!;

  let weatherMultiplier = 1.0;
  if (worker.home_hex_id) {
    const { lat, lng } = policyService.hexToLatLng(worker.home_hex_id);
    weatherMultiplier = await weatherService.getWeatherMultiplier(lat, lng);
  }

  const premiumData = await mlService.predictPremium(
    worker.id,
    Number(worker.zone_multiplier),
    weatherMultiplier,
    Number(worker.history_multiplier)
  );

  const context = {
    platform: worker.platform,
    city: worker.city,
    experience_tier: policyService.getExperienceTier(new Date(worker.created_at)),
    season: policyService.getSeason(),
    zone_risk: policyService.getZoneRisk(Number(worker.zone_multiplier)),
  };
  const banditRec = await mlService.recommendTier(worker.id, context);

  const { weekStart, weekEnd } = premiumService.getWeekBounds();
  const existing = await query<{ id: string }>(
    `SELECT id
     FROM policies
     WHERE worker_id = $1
       AND week_start = $2
       AND status = 'active'`,
    [worker.id, weekStart]
  );

  const coverages = premiumService.calculateAllCoverages(Number(worker.avg_daily_earning));

  res.json({
    worker: {
      name: worker.name,
      platform: worker.platform,
      zone: worker.zone,
      city: worker.city,
      avg_daily_earning: Number(worker.avg_daily_earning),
    },
    premium: Math.round(premiumData.premium),
    formula_breakdown: premiumData.formula_breakdown,
    rl_premium: premiumData.rl_premium ? Math.round(premiumData.rl_premium) : null,
    coverage: coverages,
    recommended_arm: banditRec?.recommended_arm ?? 1,
    recommended_premium: banditRec?.recommended_premium ?? 44,
    context_key: banditRec?.context_key ?? null,
    has_active_policy: existing.rowCount > 0,
    week_start: weekStart,
    week_end: weekEnd,
  });
});

const purchasePolicySchema = z.object({
  razorpay_payment_id: z.string(),
  razorpay_order_id: z.string(),
  razorpay_signature: z.string(),
  premium_paid: z.number(),
  coverage_amount: z.number(),
  recommended_arm: z.number().int().min(0).max(3).optional(),
  selected_arm: z.number().int().min(0).max(3).optional(),
  context_key: z.string().optional(),
  arm_accepted: z.boolean().optional(),
});

const banditUpdateSchema = z.object({
  context_key: z.string().min(1),
  arm: z.number().int().min(0).max(3),
  reward: z.union([z.literal(0), z.literal(1)]),
});

const sessionExitSchema = z.object({
  context_key: z.string().min(1),
  arm: z.number().int().min(0).max(3),
});

function normalizeContextCity(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, '_');
}

function contextMatchesWorker(contextKey: string, worker: { platform: string; city: string }): boolean {
  const expectedPrefix = `${worker.platform}_${normalizeContextCity(worker.city)}_`;
  return contextKey.startsWith(expectedPrefix);
}

router.post('/', authenticateWorker, validateBody(purchasePolicySchema), async (req, res) => {
  const worker = req.worker!;
  const body = req.body as z.infer<typeof purchasePolicySchema>;

  const valid = razorpayService.verifyPaymentSignature(
    body.razorpay_order_id,
    body.razorpay_payment_id,
    body.razorpay_signature
  );
  if (!valid) {
    return res.status(400).json({
      code: 'INVALID_PAYMENT_SIGNATURE',
      message: 'Payment verification failed',
    });
  }

  const { weekStart, weekEnd } = premiumService.getWeekBounds();

  const existing = await query<{ id: string }>(
    `SELECT id
     FROM policies
     WHERE worker_id = $1
       AND week_start = $2
       AND status = 'active'`,
    [worker.id, weekStart]
  );
  if (existing.rowCount > 0) {
    return res.status(409).json({
      code: 'POLICY_EXISTS',
      message: 'Active policy already exists for this week',
    });
  }

  const policy = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO policies (
        worker_id, zone, week_start, week_end, premium_paid,
        coverage_amount, status, recommended_arm, arm_accepted, context_key,
        razorpay_order_id, razorpay_payment_id
      ) VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8,$9,$10,$11)
      RETURNING *`,
      [
        worker.id,
        worker.zone,
        weekStart,
        weekEnd,
        body.premium_paid,
        body.coverage_amount,
        body.recommended_arm ?? null,
        body.arm_accepted ?? null,
        body.context_key ?? null,
        body.razorpay_order_id,
        body.razorpay_payment_id,
      ]
    );
    return result.rows[0];
  });

  const selectedArm = body.selected_arm ?? body.recommended_arm;
  if (body.context_key && selectedArm !== undefined) {
    void mlService.updateBandit(worker.id, body.context_key, selectedArm, 1.0);
  }

  res.status(201).json({
    policy_id: policyService.generatePolicyId(worker.name),
    policy: {
      id: policy.id,
      week_start: policy.week_start,
      week_end: policy.week_end,
      premium_paid: Math.round(Number(policy.premium_paid)),
      coverage_amount: Number(policy.coverage_amount),
      status: policy.status,
      razorpay_payment_id: policy.razorpay_payment_id,
    },
    message: "Policy active. We'll monitor your zone 24/7.",
  });
});

router.post('/bandit-update', authenticateWorker, validateBody(banditUpdateSchema), async (req, res) => {
  const worker = req.worker!;
  const body = req.body as z.infer<typeof banditUpdateSchema>;
  if (!contextMatchesWorker(body.context_key, worker)) {
    return res.status(400).json({
      code: 'CONTEXT_MISMATCH',
      message: 'context_key does not match authenticated worker',
    });
  }

  const success = await mlService.updateBandit(worker.id, body.context_key, body.arm, body.reward);

  return res.json({
    success,
    ml_service: success ? 'updated' : 'unavailable',
  });
});

router.post('/session-exit', authenticateWorker, validateBody(sessionExitSchema), async (req, res) => {
  const worker = req.worker!;
  const body = req.body as z.infer<typeof sessionExitSchema>;
  if (!contextMatchesWorker(body.context_key, worker)) {
    return res.status(204).send();
  }

  await mlService.updateBandit(worker.id, body.context_key, body.arm, 0.0);
  return res.status(204).send();
});

router.get('/active', authenticateWorker, async (req, res) => {
  const { weekStart } = premiumService.getWeekBounds();

  const { rows } = await query<{
    id: string;
    week_start: string;
    week_end: string;
    premium_paid: string;
    coverage_amount: string;
    status: string;
    claim_id: string | null;
    claim_status: string | null;
    payout_amount: string | null;
    trigger_type: string | null;
    trigger_value: string | null;
    disruption_hours: string | null;
  }>(
    `SELECT p.*,
            c.id as claim_id, c.status as claim_status,
            c.payout_amount, c.trigger_type, c.trigger_value,
            c.disruption_hours
     FROM policies p
     LEFT JOIN claims c ON c.policy_id = p.id
       AND c.status NOT IN ('denied')
     WHERE p.worker_id = $1
       AND p.week_start = $2
       AND p.status = 'active'
     ORDER BY c.created_at DESC
     LIMIT 1`,
    [req.worker!.id, weekStart]
  );

  if (rows.length === 0) {
    return res.json({ has_active_policy: false, policy: null });
  }

  const row = rows[0];
  res.json({
    has_active_policy: true,
    policy: {
      id: row.id,
      week_start: row.week_start,
      week_end: row.week_end,
      premium_paid: Math.round(Number(row.premium_paid)),
      coverage_amount: Number(row.coverage_amount),
      zone: req.worker!.zone,
      city: req.worker!.city,
      status: row.status,
    },
    active_claim: row.claim_id
      ? {
          id: row.claim_id,
          trigger_type: row.trigger_type,
          trigger_value: Number(row.trigger_value),
          claim_status: row.claim_status,
          payout_amount: Math.round(Number(row.payout_amount)),
        }
      : null,
  });
});

router.get('/history', authenticateWorker, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = 10;
  const offset = (page - 1) * limit;

  const { rows } = await query(
    `SELECT *
     FROM policies
     WHERE worker_id = $1
     ORDER BY purchased_at DESC
     LIMIT $2 OFFSET $3`,
    [req.worker!.id, limit, offset]
  );

  const { rows: countRows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text as count
     FROM policies
     WHERE worker_id = $1`,
    [req.worker!.id]
  );

  const normalizedPolicies = rows.map((row: any) => ({
    ...row,
    premium_paid: row.premium_paid != null ? Math.round(Number(row.premium_paid)) : row.premium_paid,
    coverage_amount:
      row.coverage_amount != null ? Math.round(Number(row.coverage_amount)) : row.coverage_amount,
  }));

  res.json({
    policies: normalizedPolicies,
    total: parseInt(countRows[0].count, 10),
    page,
  });
});

export default router;
