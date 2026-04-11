import { Router } from 'express';
import { activeDriver } from '../index';
import { serviceAuth } from '../middleware/serviceAuth';
import { pool } from '../db';

const router = Router();

/**
 * POST /orders — create a new payment order
 */
router.post('/', serviceAuth, async (req, res) => {
  const { worker_id, amount_paise, coverage_tier, coverage_amount, idempotency_key, metadata } = req.body;

  // Validation
  if (!worker_id || typeof worker_id !== 'string') {
    return res.status(400).json({ error: 'worker_id is required (string)' });
  }
  if (!amount_paise || typeof amount_paise !== 'number' || amount_paise < 100) {
    return res.status(400).json({ error: 'amount_paise must be a positive integer >= 100' });
  }
  if (coverage_tier === undefined || typeof coverage_tier !== 'number') {
    return res.status(400).json({ error: 'coverage_tier is required (number)' });
  }
  if (!coverage_amount || typeof coverage_amount !== 'number') {
    return res.status(400).json({ error: 'coverage_amount is required (number)' });
  }
  if (!idempotency_key || typeof idempotency_key !== 'string') {
    return res.status(400).json({ error: 'idempotency_key is required (string)' });
  }

  try {
    const result = await activeDriver.createOrder({
      worker_id,
      amount_paise: Math.round(amount_paise),
      coverage_tier,
      coverage_amount: Math.round(coverage_amount),
      idempotency_key,
      metadata,
    });
    res.status(201).json(result);
  } catch (err: any) {
    console.error('[orders] createOrder failed:', err.message);
    res.status(500).json({ error: 'Failed to create order', details: err.message });
  }
});

/**
 * GET /orders — list recent orders (with pagination)
 */
router.get('/', serviceAuth, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const status = typeof req.query.status === 'string' ? req.query.status : null;

  try {
    let query = 'SELECT * FROM payment_orders';
    const params: any[] = [];
    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /orders/:id — get single order
 */
router.get('/:id', serviceAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM payment_orders WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /orders/:id/verify — verify a completed payment
 */
router.post('/:id/verify', serviceAuth, async (req, res) => {
  const { driver_payment_id, driver_order_id, driver_signature } = req.body;

  if (!driver_payment_id || !driver_order_id || !driver_signature) {
    return res.status(400).json({ error: 'driver_payment_id, driver_order_id, and driver_signature are required' });
  }

  try {
    const result = await activeDriver.verifyOrder({
      order_id: req.params.id,
      driver_payment_id,
      driver_order_id,
      driver_signature,
    });
    res.json(result);
  } catch (err: any) {
    console.error('[orders] verifyOrder failed:', err.message, err.stack);
    res.status(500).json({ error: err.message || 'Verification failed', success: false });
  }
});

export default router;
