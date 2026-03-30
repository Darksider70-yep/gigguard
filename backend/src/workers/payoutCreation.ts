import { Job, Worker } from 'bullmq';
import { query } from '../db';
import { razorpayService } from '../services/razorpayService';
import { redisConnection } from '../queues';
import { config } from '../config';

export interface PayoutCreationJob {
  claim_id: string;
  payout_amount?: number;
}

export async function processPayoutCreationJob(
  data: PayoutCreationJob
): Promise<{ payout_id: string; amount: number } | void> {
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
    console.warn(`Claim ${claim_id} not approved or not found`);
    return;
  }

  const { payout_amount, worker_id, upi_vpa, worker_name } = rows[0];
  const finalAmount = overrideAmount ?? Math.round(Number(payout_amount));

  if (!upi_vpa) {
    console.error(
      `Worker ${worker_id} has no UPI VPA - cannot payout claim ${claim_id}`
    );
    return;
  }

  const { rows: payoutRows } = await query<{ id: string }>(
    `INSERT INTO payouts (claim_id, worker_id, amount, upi_vpa, status)
     VALUES ($1,$2,$3,$4,'pending')
     RETURNING id`,
    [claim_id, worker_id, finalAmount, upi_vpa]
  );
  const payoutId = payoutRows[0].id;

  await query(
    `UPDATE payouts
     SET status='processing'
     WHERE id=$1`,
    [payoutId]
  );

  const result = await razorpayService.createPayout({
    amount: finalAmount,
    upi_vpa,
    worker_name,
    claim_id,
  });

  await query(
    `UPDATE payouts
     SET razorpay_payout_id=$1, status=$2,
         processed_at = CASE WHEN $2='paid' THEN NOW() ELSE NULL END
     WHERE id=$3`,
    [
      result.payout_id,
      result.status === 'processed' ? 'paid' : 'processing',
      payoutId,
    ]
  );

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
