import express, { Router, Response } from 'express';
import { query } from '../db';
import { verifyWebhookSignature } from '../services/razorpayService';

const router = Router();

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res: Response) => {
  try {
    const signature = req.header('x-razorpay-signature') || '';
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');

    if (!verifyWebhookSignature(rawBody, signature)) {
      return res.status(401).json({ message: 'Invalid webhook signature' });
    }

    const payload = JSON.parse(rawBody.toString('utf8')) as any;
    const eventType = payload.event as string;
    const payoutEntity = payload.payload?.payout?.entity || {};
    const payoutId = String(payoutEntity.id || '');

    if (!payoutId) {
      return res.status(400).json({ message: 'Missing payout id' });
    }

    const payoutRecord = await query(
      `SELECT id, claim_id FROM payouts WHERE razorpay_payout_id = $1 LIMIT 1`,
      [payoutId]
    );

    if (!payoutRecord.rows[0]) {
      return res.status(200).json({ received: true });
    }

    const payout = payoutRecord.rows[0] as any;

    if (eventType === 'payout.processed') {
      await query(`UPDATE payouts SET status = 'processed', processed_at = NOW() WHERE id = $1`, [payout.id]);
      await query(`UPDATE claims SET status = 'paid', paid_at = NOW() WHERE id = $1`, [payout.claim_id]);
    } else if (eventType === 'payout.failed') {
      await query(`UPDATE payouts SET status = 'failed', processed_at = NOW() WHERE id = $1`, [payout.id]);
    }

    return res.status(200).json({ received: true });
  } catch {
    return res.status(500).json({ message: 'Webhook processing failed' });
  }
});

export default router;
