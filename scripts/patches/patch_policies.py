import os

with open('backend/src/routes/policies.ts', 'r') as f:
    policies_ts = f.read()

import_crypto = "import * as crypto from 'crypto';"
if import_crypto not in policies_ts:
    policies_ts = import_crypto + '\n' + policies_ts

old_premium_calc = """  const premiumData = await mlService.predictPremium(
    worker.id,
    Number(worker.zone_multiplier),
    weatherMultiplier,
    Number(worker.history_multiplier)
  );"""

new_premium_calc = """  // Determine Hash
  const hashVal = parseInt(crypto.createHash('md5').update(worker.id).digest('hex').slice(0, 8), 16) % 100;

  // Get rollout config
  const { rows: configRows } = await query('SELECT * FROM rl_rollout_config WHERE id = 1');
  const rolloutConfig = configRows[0] || { rollout_percentage: 0, kill_switch_engaged: false };
  
  const inCohortB = hashVal < rolloutConfig.rollout_percentage && !rolloutConfig.kill_switch_engaged;
  const abCohort = inCohortB ? 'B' : 'A';
  const pricingSource = inCohortB ? 'rl' : 'formula';

  // Cache assignment
  await query(
    `INSERT INTO rl_ab_assignments (worker_id, cohort) VALUES ($1, $2) ON CONFLICT (worker_id) DO UPDATE SET cohort = EXCLUDED.cohort`,
    [worker.id, abCohort]
  );

  let premiumData = await mlService.predictPremium(
    worker.id,
    Number(worker.zone_multiplier),
    weatherMultiplier,
    Number(worker.history_multiplier)
  );

  if (inCohortB) {
    const rlData = await mlService.predictRLPremium(
      worker.id,
      Number(worker.zone_multiplier),
      weatherMultiplier,
      Number(worker.history_multiplier),
      worker.platform,
      parseFloat(String(worker.avg_daily_earning)) // Dummy proxy for account_age if not available
    );
    if (rlData.rl_premium !== null) {
      premiumData.premium = Math.round(rlData.rl_premium);
      premiumData.rl_premium = rlData.rl_premium;
    }
  }"""

if old_premium_calc in policies_ts:
    policies_ts = policies_ts.replace(old_premium_calc, new_premium_calc)
    print("Patched GET /premium")
else:
    print("WARNING GET /premium not found")

# Update returned payload to include ab_cohort and pricing_source
old_return = """    worker: {
      name: worker.name,"""

new_return = """    ab_cohort: abCohort,
    pricing_source: pricingSource,
    worker: {
      name: worker.name,"""

if old_return in policies_ts:
    policies_ts = policies_ts.replace(old_return, new_return)
    print("Patched returned payload")

# Update POST / 
old_insert = """      `INSERT INTO policies (
        worker_id, week_start, week_end, weekly_premium, premium_paid,
        coverage_amount, zone_multiplier, weather_multiplier,
        history_multiplier, recommended_arm, arm_accepted, context_key,
        razorpay_order_id, razorpay_payment_id
      ) VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *`,
      [
        worker.id,
        weekStart,
        weekEnd,
        body.premium_paid,
        body.coverage_amount,
        worker.zone_multiplier,
        1.0,
        worker.history_multiplier,
        body.recommended_arm ?? null,
        body.arm_accepted ?? null,
        body.context_key ?? null,
        body.razorpay_order_id,
        body.razorpay_payment_id,
      ]"""

new_insert = """      `INSERT INTO policies (
        worker_id, week_start, week_end, weekly_premium, premium_paid,
        coverage_amount, zone_multiplier, weather_multiplier,
        history_multiplier, recommended_arm, arm_accepted, context_key,
        razorpay_order_id, razorpay_payment_id, ab_cohort, pricing_source
      ) VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
                (SELECT cohort FROM rl_ab_assignments WHERE worker_id = $1 LIMIT 1),
                (CASE WHEN (SELECT cohort FROM rl_ab_assignments WHERE worker_id = $1 LIMIT 1) = 'B' THEN 'rl' ELSE 'formula' END))
      RETURNING *`,
      [
        worker.id,
        weekStart,
        weekEnd,
        body.premium_paid,
        body.coverage_amount,
        worker.zone_multiplier,
        1.0,
        worker.history_multiplier,
        body.recommended_arm ?? null,
        body.arm_accepted ?? null,
        body.context_key ?? null,
        body.razorpay_order_id,
        body.razorpay_payment_id,
      ]"""

if old_insert in policies_ts:
    policies_ts = policies_ts.replace(old_insert, new_insert)
    print("Patched POST /")
else:
    print("WARNING POST / insert not found")

with open('backend/src/routes/policies.ts', 'w') as f:
    f.write(policies_ts)
