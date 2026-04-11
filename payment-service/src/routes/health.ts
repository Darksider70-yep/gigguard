import { Router } from 'express';
import { activeDriver } from '../index';
import { serviceAuth } from '../middleware/serviceAuth';
import { getBalance, creditWallet } from '../drivers/dummy/wallet';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', driver: activeDriver.name, uptime_seconds: process.uptime() });
});

router.get('/wallet/:worker_id', serviceAuth, async (req, res) => {
  if (activeDriver.name === 'razorpay') return res.status(404).json({ error: 'Dummy only' });
  const balance = await getBalance(req.params.worker_id);
  res.json({ worker_id: req.params.worker_id, balance_paise: balance });
});

router.post('/wallet/:worker_id/topup', serviceAuth, async (req, res) => {
  if (activeDriver.name === 'razorpay') return res.status(404).json({ error: 'Dummy only' });
  await creditWallet(req.params.worker_id, req.body.amount_paise || 50000);
  res.json({ success: true });
});

export default router;
