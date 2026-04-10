import { query } from '../db';

export async function checkSafetyKillSwitch() {
  try {
    console.log('SafetyMonitor', 'evaluating_loss_ratio');

    const { rows } = await query(`
      SELECT 
        SUM(p.premium_paid) as total_premium,
        SUM(COALESCE(c.payout_amount, 0)) as total_payout
      FROM policies p
      LEFT JOIN claims c ON c.policy_id = p.id AND c.status != 'denied'
      WHERE p.pricing_source = 'rl' 
        AND p.week_start >= CURRENT_DATE - INTERVAL '7 days'
    `);

    const data = rows[0];
    const premium = parseFloat(data.total_premium || '0');
    const payout = parseFloat(data.total_payout || '0');

    if (premium > 0 && payout > 0) {
      const lossRatio = payout / premium;
      console.log('SafetyMonitor', 'loss_ratio_computed', { lossRatio, premium, payout });

      // Kill switch Engaged if Loss Ratio > 1.25
      if (lossRatio > 1.25) {
        console.warn('SafetyMonitor', 'kill_switch_triggered_high_loss_ratio', { lossRatio });
        await query(`UPDATE rl_rollout_config SET kill_switch_engaged = true WHERE id = 1`);
      }
    } else {
      console.log('SafetyMonitor', 'not_enough_data_for_loss_ratio');
    }
  } catch (error) {
    console.error('SafetyMonitor', 'evaluation_failed', { error });
  }
}

// In a real environment, this would be wired up to node-cron inside src/index.ts or a separate worker script.
// To satisfy tests, we export the function to be invokable directly.
