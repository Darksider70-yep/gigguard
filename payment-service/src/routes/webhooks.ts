import { Router } from 'express';
import { activeDriver } from '../index';
import { serviceAuth } from '../middleware/serviceAuth';

const router = Router();

router.post('/razorpay', async (req, res) => {
  if (activeDriver.name !== 'razorpay') return res.status(404).send();
  
  // Minimal pseudo handler to acknowledge razorpay webhooks as per prompt constraints
  // In a full implementation, we'd verify 'x-razorpay-signature' and route events
  // payout.processed -> mark disbursement 'paid'
  res.status(200).send();
});

export default router;
