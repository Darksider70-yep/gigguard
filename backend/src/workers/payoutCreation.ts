import { Job, Worker } from 'bullmq';
import { query } from '../db';
import { razorpayService } from '../services/razorpayService';
import { redisConnection } from '../queues';
import { config } from '../config';
import { logger } from '../lib/logger';

export interface PayoutCreationJob {
  claim_id: string;
  payout_amount?: number;
}

type PayoutCreationResult =
  | { payout_id: string; amount: number }
  | { skipped: true; reason: 'duplicate'; existing_payout_id: string };

export async function processPayoutCreationJob(
  data: PayoutCreationJob
): Promise<PayoutCreationResult | void> {
  const { claim_id, payout_amount: overrideAmount } = data;

  const { rows } = await query<{
    payout_amount: string;
    worker_id: string;
    upi_vpa: string | null;
    worker_name: string;
  }>(
    `SELECT c.payout_amount, c.worker_id,
            w.upi_vpa, w.name as worker_name
     FROM claims c
     JOIN workers w ON w.id = c.worker_id
     WHERE c.id=$1 AND c.status='approved'`,
    [claim_id]
  );

  if (rows.length === 0) {
    logger.warn('PayoutCreation', 'claim_not_approved_or_missing', { claim_id });
    return;
  }

  const { payout_amount, worker_id, upi_vpa, worker_name } = rows[0];
  const finalAmount = overrideAmount ?? Math.round(Number(payout_amount));

  if (!upi_vpa) {
    logger.error('PayoutCreation', 'no_upi_vpa', {
      worker_id,
      claim_id,
    });
    return;
  }

  const { rows: existingPayoutRows } = await query<{ id: string; status: string }>(
    `SELECT id, status
     FROM payouts
     WHERE claim_id=$1
     ORDER BY created_at DESC
     LIMIT 1`,
    [claim_id]
  );

  let payoutId: string;
  if (existingPayoutRows.length > 0) {
    const existing = existingPayoutRows[0];
    if (existing.status === 'processing' || existing.status === 'paid') {
      logger.info('PayoutCreation', 'duplicate_skipped', {
        claim_id,
        existing_payout_id: existing.id,
        existing_status: existing.status,
      });
      return {
        skipped: true,
        reason: 'duplicate',
        existing_payout_id: existing.id,
      };
    }

    payoutId = existing.id;
    await query(
      `UPDATE payouts
       SET status='processing',
           amount=$2,
           upi_vpa=$3,
           created_at=NOW(),
           processed_at=NULL
       WHERE id=$1`,
      [payoutId, finalAmount, upi_vpa]
    );
  } else {
    try {
      const { rows: payoutRows } = await query<{ id: string }>(
        `INSERT INTO payouts (claim_id, worker_id, amount, upi_vpa, status)
         VALUES ($1,$2,$3,$4,'processing')
         RETURNING id`,
        [claim_id, worker_id, finalAmount, upi_vpa]
      );
      payoutId = payoutRows[0].id;
    } catch (err: any) {
      if (err?.code === '23505') {
        const { rows: raceRows } = await query<{ id: string; status: string }>(
          `SELECT id, status
           FROM payouts
           WHERE claim_id=$1
           ORDER BY created_at DESC
           LIMIT 1`,
          [claim_id]
        );
        if (raceRows.length > 0) {
          return {
            skipped: true,
            reason: 'duplicate',
            existing_payout_id: raceRows[0].id,
          };
        }
      }
      throw err;
    }
  }

  const result = await razorpayService.createPayout({
    amount: finalAmount,
    upi_vpa,
    worker_name,
    claim_id,
  });

  await query(
    `UPDATE payouts
     SET razorpay_payout_id=$1,
         status=$2::varchar,
         processed_at = CASE WHEN $2::varchar='paid' THEN NOW() ELSE NULL END
     WHERE id=$3`,
    [
      result.payout_id,
      result.status === 'processed' ? 'paid' : 'processing',
      payoutId,
    ]
  );

  logger.info('PayoutCreation', 'payout_initiated', {
    claim_id,
    worker_id,
    amount: finalAmount,
    upi_vpa,
    razorpay_payout_id: result.payout_id,
  });

  if (config.USE_MOCK_PAYOUT) {
    await query(
      `UPDATE claims
       SET status='paid', paid_at=NOW()
       WHERE id=$1`,
      [claim_id]
    );
    await query(
      `UPDATE disruption_events
       SET total_payout_amount = total_payout_amount + $1
       WHERE id = (SELECT disruption_event_id FROM claims WHERE id=$2)`,
      [finalAmount, claim_id]
    );
  }

  return { payout_id: result.payout_id, amount: finalAmount };
}

export const payoutCreationWorker =
  config.NODE_ENV === 'test'
    ? null
    : new Worker<PayoutCreationJob>(
        'payout-creation',
        async (job: Job<PayoutCreationJob>) => processPayoutCreationJob(job.data),
        {
          connection: redisConnection,
          concurrency: 5,
          removeOnComplete: false,
          removeOnFail: { count: 500 },
        } as any
      );
