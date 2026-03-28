import { Router } from 'express';
import { z } from 'zod';
import { authenticateWorker } from '../middleware/auth';
import { razorpayService } from '../services/razorpayService';

const router = Router();

router.post('/create-order', authenticateWorker, async (req, res) => {
  try {
    const schema = z.object({ amount: z.number().int().positive() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const { amount } = parsed.data;
    const order = await razorpayService.createOrder(amount);
    return res.json(order);
  } catch (err) {
    console.error('[Razorpay] create-order failed:', err);
    return res.status(502).json({
      code: 'RAZORPAY_ERROR',
      message: 'Unable to create order. Check Razorpay credentials/configuration.',
    });
  }
});

export default router;
