import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest, requireWorker } from '../middleware/auth';
import { createOrder, getRazorpayPublicConfig } from '../services/razorpayService';

const router = Router();

router.post('/create-order', requireWorker, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'amount is required in paise' });
    }

    const receipt = `policy_${req.user!.id}_${randomUUID().slice(0, 8)}`;
    const order = await createOrder(Math.round(amount), receipt);

    return res.status(200).json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: getRazorpayPublicConfig().key_id,
    });
  } catch {
    return res.status(500).json({ message: 'Failed to create Razorpay order' });
  }
});

export default router;
