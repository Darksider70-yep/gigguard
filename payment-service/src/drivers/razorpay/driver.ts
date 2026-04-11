import Razorpay from 'razorpay';
import crypto   from 'crypto';
import { nanoid } from 'nanoid';
import { IPaymentDriver, CreateOrderParams, CreateOrderResult,
         VerifyOrderParams, VerifyOrderResult,
         CreateDisbursementParams, CreateDisbursementResult } from '../interface';
import { pool } from '../../db';
import { writeLedger } from '../../ledger';

export class RazorpayDriver implements IPaymentDriver {
  readonly name = 'razorpay' as const;
  private rzp: Razorpay;

  constructor() {
    this.rzp = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });
  }

  async createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    const { rows: [existing] } = await pool.query(
      `SELECT * FROM payment_orders WHERE idempotency_key = $1`,
      [params.idempotency_key]
    );
    if (existing?.status === 'paid') {
      return {
        order_id:        existing.id,
        driver_order_id: existing.driver_order_id,
        amount_paise:    existing.amount_paise,
        status:          'created',
        checkout_data:   { key_id: process.env.RAZORPAY_KEY_ID, driver: 'razorpay',
                           razorpay_order_id: existing.driver_order_id },
      };
    }

    const rzpOrder = await this.rzp.orders.create({
      amount:   params.amount_paise,
      currency: 'INR',
      receipt:  params.idempotency_key,
      notes:    { worker_id: params.worker_id, coverage_tier: String(params.coverage_tier) },
    });

    const order_id = `ord_${nanoid(16)}`;
    await pool.query(
      `INSERT INTO payment_orders
         (id, worker_id, amount_paise, coverage_tier, coverage_amount,
          status, driver_order_id, idempotency_key, metadata)
       VALUES ($1,$2,$3,$4,$5,'created',$6,$7,$8::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [order_id, params.worker_id, params.amount_paise, params.coverage_tier,
       params.coverage_amount, rzpOrder.id, params.idempotency_key,
       JSON.stringify({ rzp_order: rzpOrder })]
    );

    return {
      order_id,
      driver_order_id: rzpOrder.id,
      amount_paise:    params.amount_paise,
      status:          'created',
      checkout_data: {
        driver:             'razorpay',
        key_id:             process.env.RAZORPAY_KEY_ID,
        razorpay_order_id:  rzpOrder.id,
      },
    };
  }

  async verifyOrder(params: VerifyOrderParams): Promise<VerifyOrderResult> {
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(`${params.driver_order_id}|${params.driver_payment_id}`)
      .digest('hex');

    if (!crypto.timingSafeEqual(
      Buffer.from(params.driver_signature, 'hex'),
      Buffer.from(expected, 'hex')
    )) {
      return { success: false, order_id: params.order_id,
               amount_paise: 0, error: 'Signature verification failed' };
    }

    const { rows: [order] } = await pool.query(
      `SELECT * FROM payment_orders WHERE id = $1`, [params.order_id]
    );
    if (!order) return { success: false, order_id: params.order_id,
                         amount_paise: 0, error: 'Order not found' };
    if (order.status === 'paid') {
      return { success: true, order_id: params.order_id, amount_paise: order.amount_paise };
    }

    await pool.query(
      `UPDATE payment_orders
       SET status='paid', driver_payment_id=$1, driver_signature=$2,
           paid_at=NOW(), updated_at=NOW()
       WHERE id=$3`,
      [params.driver_payment_id, params.driver_signature, params.order_id]
    );
    await writeLedger({
      entry_type:   'premium_collected',
      reference_id: params.order_id,
      worker_id:    order.worker_id,
      amount_paise: order.amount_paise,
      direction:    'credit',
      driver:       'razorpay',
      metadata:     { razorpay_payment_id: params.driver_payment_id },
    });

    return { success: true, order_id: params.order_id, amount_paise: order.amount_paise };
  }

  async createDisbursement(params: CreateDisbursementParams): Promise<CreateDisbursementResult> {
    const idempotency_key = `dis_${params.claim_id}`;

    const { rows: [existing] } = await pool.query(
      `SELECT * FROM payment_disbursements WHERE idempotency_key = $1`,
      [idempotency_key]
    );
    if (existing) {
      return { disbursement_id: existing.id, driver_transfer_id: existing.driver_transfer_id,
               status: existing.status };
    }

    const disbursement_id = `dis_${nanoid(16)}`;
    await pool.query(
      `INSERT INTO payment_disbursements
         (id, claim_id, worker_id, amount_paise, upi_address, status, idempotency_key, metadata)
       VALUES ($1,$2,$3,$4,$5,'processing',$6,$7::jsonb)`,
      [disbursement_id, params.claim_id, params.worker_id, params.amount_paise,
       params.upi_address, idempotency_key, JSON.stringify(params.metadata ?? {})]
    );

    const transfer = await fetch('https://api.razorpay.com/v1/payouts', {
      method:  'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(
          `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
        ).toString('base64'),
        'Content-Type':   'application/json',
        'Idempotency-Key': idempotency_key,
      },
      body: JSON.stringify({
        account_number: process.env.RAZORPAY_ACCOUNT_NUMBER,
        fund_account: {
          account_type: 'vpa',
          vpa:          { address: params.upi_address },
          contact: {
            name:    params.worker_id,
            type:    'employee',
            contact: params.worker_id,
          },
        },
        amount:    params.amount_paise,
        currency:  'INR',
        mode:      'UPI',
        purpose:   'payout',
        reference_id: params.claim_id,
        narration: `GigGuard payout for claim ${params.claim_id}`,
      }),
    }).then((r) => r.json());

    await pool.query(
      `UPDATE payment_disbursements SET driver_transfer_id=$1, updated_at=NOW() WHERE id=$2`,
      [transfer.id, disbursement_id]
    );

    return { disbursement_id, driver_transfer_id: transfer.id, status: 'processing' };
  }

  async reverseDisbursement(disbursement_id: string, reason: string): Promise<void> {
    await pool.query(
      `UPDATE payment_disbursements SET status='reversed', failure_reason=$1, updated_at=NOW()
       WHERE id=$2`, [reason, disbursement_id]
    );
  }

  async getDisbursementStatus(driver_transfer_id: string): Promise<string> {
    const res = await fetch(
      `https://api.razorpay.com/v1/payouts/${driver_transfer_id}`,
      { headers: { 'Authorization': 'Basic ' + Buffer.from(
          `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
        ).toString('base64') } }
    ).then((r) => r.json());
    return res.status;
  }
}
