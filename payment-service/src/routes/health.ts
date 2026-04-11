import { Router } from 'express';
import { activeDriver } from '../index';
import { serviceAuth } from '../middleware/serviceAuth';
import { getBalance, creditWallet } from '../drivers/dummy/wallet';
import { pool } from '../db';

const router = Router();

/**
 * GET /health — public, no auth required
 * Used by Docker healthcheck and monitoring
 */
router.get('/health', async (req, res) => {
  let dbOk = false;
  try {
    await pool.query('SELECT 1');
    dbOk = true;
  } catch {}

  const memUsage = process.memoryUsage();

  res.json({
    status: dbOk ? 'ok' : 'degraded',
    driver: activeDriver.name,
    uptime_seconds: Math.round(process.uptime()),
    db_connected: dbOk,
    memory: {
      rss_mb:  Math.round(memUsage.rss / 1024 / 1024),
      heap_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /metrics — aggregate stats for monitoring
 */
router.get('/metrics', serviceAuth, async (req, res) => {
  try {
    const [orders, disbursements] = await Promise.all([
      pool.query(`
        SELECT 
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status='paid')::int as paid,
          COUNT(*) FILTER (WHERE status='created')::int as pending,
          COALESCE(SUM(amount_paise) FILTER (WHERE status='paid'), 0)::bigint as total_collected_paise
        FROM payment_orders
      `),
      pool.query(`
        SELECT 
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status='paid')::int as paid,
          COUNT(*) FILTER (WHERE status='processing')::int as processing,
          COUNT(*) FILTER (WHERE status='failed')::int as failed,
          COALESCE(SUM(amount_paise) FILTER (WHERE status='paid'), 0)::bigint as total_disbursed_paise
        FROM payment_disbursements
      `),
    ]);

    res.json({
      orders: orders.rows[0],
      disbursements: disbursements.rows[0],
      driver: activeDriver.name,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /wallet/:worker_id — dummy mode only
 */
router.get('/wallet/:worker_id', serviceAuth, async (req, res) => {
  if (activeDriver.name === 'razorpay') return res.status(404).json({ error: 'Dummy mode only' });
  try {
    const balance = await getBalance(req.params.worker_id);
    res.json({ worker_id: req.params.worker_id, balance_paise: balance });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /wallet/:worker_id/topup — dummy mode only
 */
router.post('/wallet/:worker_id/topup', serviceAuth, async (req, res) => {
  if (activeDriver.name === 'razorpay') return res.status(404).json({ error: 'Dummy mode only' });
  const amount = Number(req.body.amount_paise) || 50000;
  if (amount <= 0 || amount > 10000000) {
    return res.status(400).json({ error: 'amount_paise must be between 1 and 10000000' });
  }
  try {
    await creditWallet(req.params.worker_id, amount);
    const balance = await getBalance(req.params.worker_id);
    res.json({ success: true, new_balance_paise: balance });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
