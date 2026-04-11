import { Router } from 'express';
import { activeDriver } from '../index';
import { serviceAuth } from '../middleware/serviceAuth';
import { pool } from '../db';

const router = Router();

router.post('/', serviceAuth, async (req, res) => {
  try {
    const result = await activeDriver.createOrder(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', serviceAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM payment_orders WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.post('/:id/verify', serviceAuth, async (req, res) => {
  try {
    const result = await activeDriver.verifyOrder({
      order_id: req.params.id,
      ...req.body
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
