import { Router } from 'express';
import { serviceAuth } from '../middleware/serviceAuth';
import { pool } from '../db';
import { activeDriver } from '../index';
import { getBalance } from '../drivers/dummy/wallet';

const router = Router();

router.get('/', serviceAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM payment_ledger ORDER BY created_at DESC LIMIT 50');
  res.json(rows);
});

router.get('/balance', serviceAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT 
      SUM(CASE WHEN direction = 'credit' THEN amount_paise ELSE 0 END) as credits,
      SUM(CASE WHEN direction = 'debit' THEN amount_paise ELSE 0 END) as debits
    FROM payment_ledger
  `);
  const credits = Number(rows[0].credits || 0);
  const debits = Number(rows[0].debits || 0);
  
  const payload: any = { platform_balance: credits - debits };
  if (activeDriver.name === 'dummy') {
    payload.dummy_platform_wallet = await getBalance('PLATFORM');
  }
  res.json(payload);
});

export default router;
