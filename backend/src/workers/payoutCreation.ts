import { randomUUID } from 'crypto';
import { query } from '../db';
import { createPayout } from '../services/razorpayService';

interface PayoutCreationJobPayload {
  claim_id: string;
}

let payoutQueue: any;

function getPayoutQueue(): any {
  if (payoutQueue !== undefined) {
    return payoutQueue;
  }

  try {
    const { Queue } = require('bullmq');
    const IORedis = require('ioredis');
    const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');
    payoutQueue = new Queue('payout-creation', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: false,
      },
    });
  } catch {
    payoutQueue = null;
  }

  return payoutQueue;
}

export async function processPayoutCreationJob(payload: PayoutCreationJobPayload): Promise<void> {
  const result = await query(
    `SELECT
       c.id AS claim_id,
       c.worker_id,
       c.payout_amount,
       w.upi_vpa
     FROM claims c
     JOIN workers w ON w.id = c.worker_id
     WHERE c.id = $1
     LIMIT 1`,
    [payload.claim_id]
  );

  const row = result.rows[0] as any;
  if (!row) {
    throw new Error('Claim not found for payout creation');
  }

  const payoutAmount = Math.round(Number(row.payout_amount || 0));
  const payoutId = randomUUID();

  await query(
    `INSERT INTO payouts (id, claim_id, worker_id, amount, upi_vpa, status, created_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
     ON CONFLICT (id) DO NOTHING`,
    [payoutId, row.claim_id, row.worker_id, payoutAmount, row.upi_vpa]
  );

  try {
    const payout = await createPayout({
      amountPaise: payoutAmount * 100,
      upiVpa: row.upi_vpa,
      referenceId: row.claim_id,
    });

    await query(
      `UPDATE payouts
       SET razorpay_payout_id = $2,
           razorpay_fund_account_id = $3,
           status = 'processed',
           processed_at = NOW()
       WHERE id = $1`,
      [payoutId, payout.id, payout.fund_account_id || null]
    );

    await query(`UPDATE claims SET status = 'paid', paid_at = NOW() WHERE id = $1`, [row.claim_id]);
  } catch (error) {
    await query(`UPDATE payouts SET status = 'failed', processed_at = NOW() WHERE id = $1`, [payoutId]);
    throw error;
  }
}

export async function enqueuePayoutCreationJob(payload: PayoutCreationJobPayload): Promise<void> {
  const queue = getPayoutQueue();
  if (!queue) {
    setImmediate(() => {
      processPayoutCreationJob(payload).catch(() => undefined);
    });
    return;
  }

  await queue.add('payout-creation', payload);
}

export function startPayoutCreationWorker(): void {
  try {
    const { Worker } = require('bullmq');
    const IORedis = require('ioredis');
    const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

    new Worker(
      'payout-creation',
      async (job: any) => {
        await processPayoutCreationJob(job.data as PayoutCreationJobPayload);
      },
      { connection }
    );
  } catch {
    // BullMQ is optional in local dev.
  }
}
