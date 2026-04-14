import { Queue } from 'bullmq';
import { Router } from 'express';
import { config } from '../config';
import { withTransaction } from '../db';
import { logger } from '../lib/logger';
import { authenticateInsurer, issueInsurerToken } from '../middleware/auth';
import { redisConnection } from '../queues';

const router = Router();

function isDemoModeEnabled(): boolean {
  return process.env.IS_DEMO_MODE === 'true';
}

router.post('/auth/insurer-demo-token', async (_req, res) => {
  if (!isDemoModeEnabled()) {
    return res.status(404).json({ code: 'NOT_FOUND' });
  }

  const token = issueInsurerToken('insurer-demo');
  return res.json({ token });
});

router.post('/admin/demo-reset', authenticateInsurer, async (_req, res, next) => {
  if (!isDemoModeEnabled()) {
    return res.status(404).json({ code: 'NOT_FOUND' });
  }

  try {
    await withTransaction(async (client) => {
      await client.query('TRUNCATE payouts CASCADE');
      await client.query('TRUNCATE claims CASCADE');
      await client.query('TRUNCATE disruption_events CASCADE');
      await client.query('TRUNCATE rl_shadow_log CASCADE');
      await client.query(
        `WITH latest_week AS (
           SELECT MAX(week_start) AS week_start
           FROM policies
         ),
         current_week AS (
           SELECT
             date_trunc('week', NOW())::date AS week_start,
             (date_trunc('week', NOW())::date + INTERVAL '6 days')::date AS week_end
         )
         UPDATE policies p
         SET status = 'active',
             active = TRUE,
             week_start = cw.week_start,
             week_end = cw.week_end,
             updated_at = NOW()
         FROM latest_week lw
         CROSS JOIN current_week cw
         WHERE p.week_start = lw.week_start`
      );
    });

    const queueNames = ['claim-creation', 'claim-validation', 'payout-creation'];
    const queueErrors: Array<{ queue: string; error: string }> = [];

    if (!config.USE_IN_MEMORY_REDIS) {
      await Promise.all(
        queueNames.map(async (queueName) => {
          const q = new Queue(queueName, { connection: redisConnection });
          try {
            await q.obliterate({ force: true });
            await q.close();
          } catch (err) {
            queueErrors.push({
              queue: queueName,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        })
      );
    } else {
      console.log('[Admin] Skipping queue obliteration (Memory Mode active)');
    }

    logger.info('Admin', 'demo_reset', {
      truncated: ['payouts', 'claims', 'disruption_events', 'rl_shadow_log'],
      queues_cleared: queueNames.filter((q) => !queueErrors.some((e) => e.queue === q)),
      queue_errors: queueErrors,
    });

    return res.json({
      success: true,
      truncated: ['payouts', 'claims', 'disruption_events', 'rl_shadow_log'],
      queues_cleared: queueNames.filter((q) => !queueErrors.some((e) => e.queue === q)),
      queue_errors: queueErrors,
      policies_reactivated: true,
      message: 'Demo state reset. Workers and policies preserved. Ready for demo.',
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
