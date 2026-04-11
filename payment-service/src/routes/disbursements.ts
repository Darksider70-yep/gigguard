import { Router } from 'express';
import { activeDriver } from '../index';
import { serviceAuth } from '../middleware/serviceAuth';
import { pool } from '../db';

const router = Router();

/**
 * POST /disbursements — create a payout disbursement
 */
router.post('/', serviceAuth, async (req, res) => {
  const { claim_id, worker_id, amount_paise, upi_address, metadata } = req.body;

  if (!claim_id || typeof claim_id !== 'string') {
    return res.status(400).json({ error: 'claim_id is required (string)' });
  }
  if (!worker_id || typeof worker_id !== 'string') {
    return res.status(400).json({ error: 'worker_id is required (string)' });
  }
  if (!amount_paise || typeof amount_paise !== 'number' || amount_paise < 100) {
    return res.status(400).json({ error: 'amount_paise must be a positive integer >= 100' });
  }

  try {
    const result = await activeDriver.createDisbursement({
      claim_id,
      worker_id,
      amount_paise: Math.round(amount_paise),
      upi_address,
      metadata,
    });
    res.status(201).json(result);
  } catch (err: any) {
    console.error('[disbursements] createDisbursement failed:', err.message);
    res.status(500).json({ error: 'Failed to create disbursement', details: err.message });
  }
});

/**
 * GET /disbursements — list recent disbursements (with pagination)
 */
router.get('/', serviceAuth, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const status = typeof req.query.status === 'string' ? req.query.status : null;

  try {
    let query = 'SELECT * FROM payment_disbursements';
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
 * GET /disbursements/:id — get single disbursement
 */
router.get('/:id', serviceAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM payment_disbursements WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Disbursement not found' });
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /disbursements/:id/reverse — reverse a disbursement
 */
router.post('/:id/reverse', serviceAuth, async (req, res) => {
  const reason = req.body.reason || 'manual reversal';
  try {
    await activeDriver.reverseDisbursement(req.params.id, reason);
    res.json({ success: true, reason });
  } catch (err: any) {
    console.error('[disbursements] reverseDisbursement failed:', err.message);
    res.status(500).json({ error: 'Reversal failed', details: err.message });
  }
});

export default router;
