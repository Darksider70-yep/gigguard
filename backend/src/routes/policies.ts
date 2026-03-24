import { randomUUID } from 'crypto';
import { Router, Request, Response } from 'express';
import { query } from '../db';
import { AuthenticatedRequest, decodeAuthToken, requireWorker } from '../middleware/auth';
import { banditUpdate, predictPremium, recommendTier } from '../services/mlService';
import { buildCoverageBreakdown, buildPolicyCode, deriveExperienceTier, deriveSeason, deriveZoneRisk, getCurrentWeekRange } from '../services/premiumService';
import { getRazorpayPublicConfig, verifyPaymentSignature } from '../services/razorpayService';

const router = Router();

const POLICY_TIERS = [
  { arm: 0, premium: 29, coverage: 290 },
  { arm: 1, premium: 44, coverage: 440 },
  { arm: 2, premium: 65, coverage: 640 },
  { arm: 3, premium: 89, coverage: 890 },
];

interface WorkerRow {
  id: string;
  name: string;
  platform: 'zomato' | 'swiggy';
  city: string;
  zone: string | null;
  home_hex_id: string | null;
  avg_daily_earning: string;
  zone_multiplier: number;
  history_multiplier: number;
  experience_tier: 'new' | 'mid' | 'veteran' | null;
  created_at: string;
}

interface PurchaseBody {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
  premium_paid: number;
  coverage_amount: number;
  recommended_arm: number;
  context_key: string;
  arm_accepted: boolean;
}

function getWorkerId(req: AuthenticatedRequest): string {
  if (!req.user?.id) {
    throw new Error('Missing worker auth context');
  }
  return req.user.id;
}

function resolveWorkerIdFromRequest(req: AuthenticatedRequest): string | null {
  if (req.user?.id) {
    return req.user.id;
  }

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const payload = decodeAuthToken(authHeader.slice('Bearer '.length));
    if (payload?.role === 'worker') {
      return payload.sub;
    }
  }

  if (typeof req.body?.token === 'string' && req.body.token) {
    const payload = decodeAuthToken(req.body.token);
    if (payload?.role === 'worker') {
      return payload.sub;
    }
  }

  return null;
}

async function getWorkerById(workerId: string): Promise<WorkerRow | null> {
  const result = await query<WorkerRow>(
    `SELECT
      id,
      name,
      platform,
      city,
      zone,
      home_hex_id::text,
      COALESCE(avg_daily_earning, 0)::text AS avg_daily_earning,
      COALESCE(zone_multiplier, 1.1)::float8 AS zone_multiplier,
      COALESCE(history_multiplier, 1.0)::float8 AS history_multiplier,
      experience_tier,
      created_at
    FROM workers
    WHERE id = $1
    LIMIT 1`,
    [workerId]
  );

  return result.rows[0] || null;
}

function getTierByArm(arm: number) {
  return POLICY_TIERS.find((tier) => tier.arm === arm);
}

async function createPolicyPurchase(worker: WorkerRow, body: PurchaseBody) {
  const { weekStart, weekEnd } = getCurrentWeekRange();

  const existing = await query(
    `SELECT id FROM policies WHERE worker_id = $1 AND week_start = $2::date AND status = 'active' LIMIT 1`,
    [worker.id, weekStart]
  );

  if (existing.rowCount && existing.rowCount > 0) {
    return { conflict: true as const };
  }

  const policyId = randomUUID();

  const insert = await query(
    `INSERT INTO policies (
      id,
      worker_id,
      coverage_amount,
      premium_paid,
      week_start,
      week_end,
      status,
      recommended_arm,
      arm_accepted,
      context_key,
      razorpay_order_id,
      razorpay_payment_id,
      purchased_at
    ) VALUES (
      $1,$2,$3,$4,$5::date,$6::date,'active',$7,$8,$9,$10,$11,NOW()
    )
    RETURNING id, week_start, week_end, premium_paid, coverage_amount, status, razorpay_payment_id`,
    [
      policyId,
      worker.id,
      body.coverage_amount,
      body.premium_paid,
      weekStart,
      weekEnd,
      body.recommended_arm,
      body.arm_accepted,
      body.context_key,
      body.razorpay_order_id,
      body.razorpay_payment_id,
    ]
  );

  void banditUpdate(worker.id, body.context_key, body.recommended_arm, 1.0);

  const policyCode = buildPolicyCode(worker.name, new Date());

  return {
    conflict: false as const,
    policyCode,
    policy: insert.rows[0],
  };
}

router.get('/premium', requireWorker, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workerId = getWorkerId(req);
    const worker = await getWorkerById(workerId);
    if (!worker) {
      return res.status(404).json({ message: 'Worker not found' });
    }

    const { getWeatherContext } = await import('../services/weatherService');
    const weather = await getWeatherContext(worker.home_hex_id || undefined);

    const premium = await predictPremium({
      worker_id: workerId,
      zone_multiplier: Number(worker.zone_multiplier || 1.1),
      weather_multiplier: Number(weather.weather_multiplier || 1.0),
      history_multiplier: Number(worker.history_multiplier || 1.0),
    });

    const createdAt = new Date(worker.created_at);
    const context = {
      platform: (worker.platform === 'swiggy' ? 'swiggy' : 'zomato') as 'zomato' | 'swiggy',
      city: worker.city.toLowerCase(),
      experience_tier: (worker.experience_tier || deriveExperienceTier(createdAt)) as 'new' | 'mid' | 'veteran',
      season: deriveSeason(),
      zone_risk: deriveZoneRisk(Number(worker.zone_multiplier || 1.1)),
    };

    const recommendation = await recommendTier({
      worker_id: workerId,
      context,
    });

    const { weekStart, weekEnd } = getCurrentWeekRange();
    const activePolicy = await query(
      `SELECT id FROM policies WHERE worker_id = $1 AND week_start = $2::date AND status = 'active' LIMIT 1`,
      [workerId, weekStart]
    );

    const avgDailyEarning = Math.round(Number(worker.avg_daily_earning || 0));

    return res.status(200).json({
      worker: {
        name: worker.name,
        platform: worker.platform,
        zone: worker.zone || 'Unknown',
        city: worker.city,
        avg_daily_earning: avgDailyEarning,
      },
      premium: Math.round(Number(premium.premium || 0)),
      formula_breakdown: premium.formula_breakdown,
      rl_premium: premium.rl_premium === null ? null : Math.round(Number(premium.rl_premium)),
      coverage: buildCoverageBreakdown(avgDailyEarning),
      recommended_arm: recommendation.recommended_arm,
      recommended_premium: recommendation.recommended_premium,
      context_key: recommendation.context_key,
      has_active_policy: Boolean(activePolicy.rowCount && activePolicy.rowCount > 0),
      week_start: weekStart,
      week_end: weekEnd,
      razorpay_key_id: getRazorpayPublicConfig().key_id,
    });
  } catch {
    return res.status(500).json({ message: 'Failed to get premium quote' });
  }
});

router.post('/', requireWorker, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workerId = getWorkerId(req);
    const worker = await getWorkerById(workerId);
    if (!worker) {
      return res.status(404).json({ message: 'Worker not found' });
    }

    const body = req.body as PurchaseBody;

    if (
      !body?.razorpay_order_id ||
      !body?.razorpay_payment_id ||
      !body?.razorpay_signature ||
      !body?.context_key ||
      body.recommended_arm === undefined
    ) {
      return res.status(400).json({ message: 'Missing required purchase payload' });
    }

    const validSignature = verifyPaymentSignature(
      body.razorpay_order_id,
      body.razorpay_payment_id,
      body.razorpay_signature
    );

    if (!validSignature) {
      return res.status(400).json({ message: 'Invalid Razorpay payment signature' });
    }

    const tier = getTierByArm(Number(body.recommended_arm));
    if (!tier) {
      return res.status(400).json({ message: 'Invalid recommended arm' });
    }

    const createResult = await createPolicyPurchase(worker, {
      razorpay_order_id: body.razorpay_order_id,
      razorpay_payment_id: body.razorpay_payment_id,
      razorpay_signature: body.razorpay_signature,
      premium_paid: Math.round(Number(body.premium_paid)),
      coverage_amount: Math.round(Number(body.coverage_amount)),
      recommended_arm: Number(body.recommended_arm),
      context_key: body.context_key,
      arm_accepted: Math.round(Number(body.coverage_amount)) === tier.coverage,
    });

    if (createResult.conflict) {
      return res.status(409).json({ message: 'Policy already active for this week' });
    }

    return res.status(201).json({
      policy_id: createResult.policyCode,
      policy: createResult.policy,
      message: "Policy active. We'll monitor your zone 24/7.",
    });
  } catch {
    return res.status(500).json({ message: 'Failed to purchase policy' });
  }
});

router.get('/active', requireWorker, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workerId = getWorkerId(req);
    const { weekStart } = getCurrentWeekRange();

    const policyResult = await query(
      `SELECT p.id, p.week_start, p.week_end, p.premium_paid, p.coverage_amount, p.status, w.zone, w.city
       FROM policies p
       JOIN workers w ON w.id = p.worker_id
       WHERE p.worker_id = $1
       AND p.week_start = $2::date
       AND p.status = 'active'
       ORDER BY p.purchased_at DESC
       LIMIT 1`,
      [workerId, weekStart]
    );

    if (!policyResult.rows[0]) {
      return res.status(200).json({ has_active_policy: false, policy: null, active_claim: null });
    }

    const policy = policyResult.rows[0] as any;

    const claimResult = await query(
      `SELECT c.id, c.status AS claim_status, c.payout_amount, c.trigger_type, de.trigger_value
       FROM claims c
       LEFT JOIN disruption_events de ON de.id = c.disruption_event_id
       WHERE c.policy_id = $1
       ORDER BY c.created_at DESC
       LIMIT 1`,
      [policy.id]
    );

    const claim = claimResult.rows[0] as any;

    return res.status(200).json({
      has_active_policy: true,
      policy: {
        id: policy.id,
        week_start: policy.week_start,
        week_end: policy.week_end,
        premium_paid: Math.round(Number(policy.premium_paid || 0)),
        coverage_amount: Math.round(Number(policy.coverage_amount || 0)),
        zone: policy.zone || 'Unknown',
        city: policy.city,
        status: policy.status,
      },
      active_claim: claim
        ? {
            id: claim.id,
            trigger_type: claim.trigger_type,
            trigger_value: claim.trigger_value ? Number(claim.trigger_value) : null,
            claim_status: claim.claim_status,
            payout_amount: Math.round(Number(claim.payout_amount || 0)),
          }
        : null,
    });
  } catch {
    return res.status(500).json({ message: 'Failed to fetch active policy' });
  }
});

router.get('/history', requireWorker, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workerId = getWorkerId(req);
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 10)));
    const offset = (page - 1) * limit;

    const [history, total] = await Promise.all([
      query(
        `SELECT id, week_start, week_end, status, premium_paid, coverage_amount, purchased_at
         FROM policies
         WHERE worker_id = $1
         ORDER BY purchased_at DESC
         LIMIT $2 OFFSET $3`,
        [workerId, limit, offset]
      ),
      query(`SELECT COUNT(*)::int AS total FROM policies WHERE worker_id = $1`, [workerId]),
    ]);

    return res.status(200).json({
      policies: history.rows,
      total: Number(total.rows[0]?.total || 0),
      page,
      limit,
    });
  } catch {
    return res.status(500).json({ message: 'Failed to fetch policy history' });
  }
});

// Legacy compatibility endpoints used by existing integration suites.
router.post('/recommend-tier', requireWorker, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workerId = getWorkerId(req);
    const worker = await getWorkerById(workerId);
    if (!worker) {
      return res.status(404).json({ message: 'Worker not found' });
    }

    const context = {
      platform: (worker.platform === 'swiggy' ? 'swiggy' : 'zomato') as 'zomato' | 'swiggy',
      city: worker.city.toLowerCase(),
      experience_tier: (worker.experience_tier || deriveExperienceTier(new Date(worker.created_at))) as 'new' | 'mid' | 'veteran',
      season: deriveSeason(),
      zone_risk: deriveZoneRisk(Number(worker.zone_multiplier || 1.1)),
    };

    const recommendation = await recommendTier({ worker_id: workerId, context });
    return res.status(200).json({ ...recommendation, tiers: POLICY_TIERS, source: 'ml' });
  } catch {
    return res.status(500).json({ message: 'Failed to recommend tier' });
  }
});

router.post('/bandit-update', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workerId = resolveWorkerIdFromRequest(req);
    if (!workerId) {
      return res.status(401).json({ success: false });
    }

    const contextKey = String(req.body.context_key || 'unknown_context');
    const arm = Number(req.body.arm);
    const reward = Number(req.body.reward);
    await banditUpdate(workerId, contextKey, arm, reward);
    return res.status(200).json({ success: true });
  } catch {
    return res.status(500).json({ success: false });
  }
});

router.post('/session-exit', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workerId = resolveWorkerIdFromRequest(req);
    if (!workerId) {
      return res.status(204).send();
    }

    const contextKey = String(req.body.context_key || 'unknown_context');
    const arm = Number(req.body.arm || 1);
    await banditUpdate(workerId, contextKey, arm, 0);
    return res.status(204).send();
  } catch {
    return res.status(204).send();
  }
});

router.post('/purchase', requireWorker, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workerId = getWorkerId(req);
    const worker = await getWorkerById(workerId);
    if (!worker) {
      return res.status(404).json({ message: 'Worker not found' });
    }

    const selectedArm = Number(req.body.selected_arm);
    const recommendedArm = Number(req.body.recommended_arm);
    const selectedTier = getTierByArm(selectedArm);
    const recommendedTier = getTierByArm(recommendedArm);
    if (!selectedTier || !recommendedTier) {
      return res.status(400).json({ message: 'Invalid arm selection' });
    }

    const purchase = await createPolicyPurchase(worker, {
      razorpay_order_id: String(req.body.razorpay_order_id || `order_demo_${Date.now()}`),
      razorpay_payment_id: String(req.body.razorpay_payment_id || `pay_demo_${Date.now()}`),
      razorpay_signature: String(req.body.razorpay_signature || 'demo_signature'),
      premium_paid: Math.round(Number(req.body.premium_paid || selectedTier.premium)),
      coverage_amount: Math.round(Number(req.body.coverage_amount || selectedTier.coverage)),
      recommended_arm: recommendedArm,
      context_key: String(req.body.context_key || 'legacy_context'),
      arm_accepted: Number(req.body.coverage_amount || selectedTier.coverage) === recommendedTier.coverage,
    });

    if (purchase.conflict) {
      return res.status(409).json({ message: 'Policy already active for this week' });
    }

    return res.status(201).json({
      success: true,
      policy: purchase.policy,
    });
  } catch {
    return res.status(500).json({ success: false });
  }
});

export default router;
