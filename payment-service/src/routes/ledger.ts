import { Router } from 'express';
import { serviceAuth } from '../middleware/serviceAuth';
import { pool } from '../db';
import { activeDriver } from '../index';
import { getBalance } from '../drivers/dummy/wallet';

const router = Router();

/**
 * GET /ledger — recent ledger entries with pagination and filtering
 */
router.get('/', serviceAuth, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const worker_id = typeof req.query.worker_id === 'string' ? req.query.worker_id : null;
  const entry_type = typeof req.query.entry_type === 'string' ? req.query.entry_type : null;
  const direction = typeof req.query.direction === 'string' ? req.query.direction : null;

  try {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (worker_id) {
      conditions.push(`worker_id = $${paramIdx++}`);
      params.push(worker_id);
    }
    if (entry_type) {
      conditions.push(`entry_type = $${paramIdx++}`);
      params.push(entry_type);
    }
    if (direction && (direction === 'credit' || direction === 'debit')) {
      conditions.push(`direction = $${paramIdx++}`);
      params.push(direction);
    }

    let query = 'SELECT * FROM payment_ledger';
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ` ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /ledger/balance — aggregate platform balance from ledger
 */
router.get('/balance', serviceAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_paise ELSE 0 END), 0)::bigint as credits,
        COALESCE(SUM(CASE WHEN direction = 'debit'  THEN amount_paise ELSE 0 END), 0)::bigint as debits,
        COUNT(*)::int as total_entries
      FROM payment_ledger
    `);
    const credits = Number(rows[0].credits);
    const debits = Number(rows[0].debits);
    
    const payload: any = {
      platform_balance: credits - debits,
      total_credits: credits,
      total_debits: debits,
      total_entries: rows[0].total_entries,
    };
    if (activeDriver.name === 'dummy') {
      payload.dummy_platform_wallet = await getBalance('PLATFORM');
    }
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /ledger/stats — aggregate stats by entry type
 */
router.get('/stats', serviceAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        entry_type,
        direction,
        COUNT(*)::int as count,
        COALESCE(SUM(amount_paise), 0)::bigint as total_paise
      FROM payment_ledger
      GROUP BY entry_type, direction
      ORDER BY entry_type
    `);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
