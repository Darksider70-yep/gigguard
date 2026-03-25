import { Router } from 'express';
import { z } from 'zod';
import { authenticateWorker } from '../middleware/auth';
import { razorpayService } from '../services/razorpayService';

const router = Router();

router.post('/create-order', authenticateWorker, async (req, res) => {
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
  res.json(order);
});

export default router;
