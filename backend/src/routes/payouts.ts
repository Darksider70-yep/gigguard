import express, { Router } from 'express';
import { query, withTransaction } from '../db';
import { razorpayService } from '../services/razorpayService';

const router = Router();

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-razorpay-signature'] as string;
  const rawBody = req.body.toString();

  const valid = razorpayService.verifyWebhookSignature(rawBody, signature);
  if (!valid) {
    console.warn('Invalid Razorpay webhook signature received');
    return res.status(401).json({ code: 'INVALID_SIGNATURE' });
  }

  const event = JSON.parse(rawBody);
  const eventType = event.event;
  const payoutId = event.payload?.payout?.entity?.id;

  if (!payoutId) {
    return res.json({ received: true });
  }

  if (eventType === 'payout.processed') {
    await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE payouts
         SET status = 'paid', completed_at = NOW()
         WHERE razorpay_payout_id = $1
         RETURNING claim_id`,
        [payoutId]
      );
      if (rows.length === 0) {
        return;
      }

      const claimId = rows[0].claim_id;

      await client.query(
        `UPDATE claims
         SET status = 'paid', paid_at = NOW()
         WHERE id = $1`,
        [claimId]
      );

      await client.query(
        `UPDATE policies
         SET status = 'claimed'
         WHERE id = (SELECT policy_id FROM claims WHERE id = $1)`,
        [claimId]
      );
    });
  }

  if (eventType === 'payout.failed') {
    await query(
      `UPDATE payouts
       SET status = 'failed'
       WHERE razorpay_payout_id = $1`,
      [payoutId]
    );
  }

  res.json({ received: true });
});

export default router;
