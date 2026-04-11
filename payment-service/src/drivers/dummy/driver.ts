import { nanoid } from 'nanoid';
import { IPaymentDriver, CreateOrderParams, CreateOrderResult,
         VerifyOrderParams, VerifyOrderResult,
         CreateDisbursementParams, CreateDisbursementResult } from '../interface';
import { creditWallet, debitWallet, getBalance } from './wallet';
import { pool } from '../../db';
import { writeLedger } from '../../ledger';

export class DummyDriver implements IPaymentDriver {
  readonly name = 'dummy' as const;

  // ── Collections ──────────────────────────────────────────────────────────

  async createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    const order_id = `ord_${nanoid(16)}`;
    const driver_order_id = `dummy_ord_${nanoid(12)}`;

    await pool.query(
      `INSERT INTO payment_orders
         (id, worker_id, amount_paise, coverage_tier, coverage_amount,
          status, driver_order_id, idempotency_key, metadata)
       VALUES ($1,$2,$3,$4,$5,'created',$6,$7,$8::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [order_id, params.worker_id, params.amount_paise, params.coverage_tier,
       params.coverage_amount, driver_order_id, params.idempotency_key,
       JSON.stringify(params.metadata ?? {})]
    );

    // Provide the checkout_url where the frontend redirects to or opens an iframe.
    const checkout_url =
      `http://localhost:5002/ui/checkout?order_id=${order_id}` +
      `&amount=${params.amount_paise}&worker_id=${params.worker_id}`;

    return {
      order_id,
      driver_order_id,
      amount_paise: params.amount_paise,
      status: 'created',
      checkout_data: {
        checkout_url,
        driver: 'dummy',
      },
    };
  }

  async verifyOrder(params: VerifyOrderParams): Promise<VerifyOrderResult> {
    if (!params.driver_payment_id.startsWith('dummy_pay_')) {
      return { success: false, order_id: params.order_id,
               amount_paise: 0, error: 'Invalid dummy payment_id' };
    }

    const { rows: [order] } = await pool.query(
      `SELECT * FROM payment_orders WHERE id = $1`, [params.order_id]
    );
    if (!order) return { success: false, order_id: params.order_id,
                         amount_paise: 0, error: 'Order not found' };
    if (order.status === 'paid') {
      return { success: true, order_id: params.order_id,
               amount_paise: order.amount_paise };  // idempotent
    }

    // Try wallet operations, but don't fail verification if they error
    try {
      await debitWallet(order.worker_id, order.amount_paise);
      await creditWallet('PLATFORM', order.amount_paise);
    } catch (walletErr: any) {
      console.warn('[dummy] Wallet operation failed (non-fatal):', walletErr.message);
    }

    // Mark order as paid
    await pool.query(
      `UPDATE payment_orders
       SET status='paid', driver_payment_id=$1, driver_signature=$2,
           paid_at=NOW(), updated_at=NOW()
       WHERE id=$3`,
      [params.driver_payment_id, params.driver_signature, params.order_id]
    );

    // Write ledger entry — non-fatal if it fails
    try {
      await writeLedger({
        entry_type:   'premium_collected',
        reference_id: params.order_id,
        worker_id:    order.worker_id,
        amount_paise: order.amount_paise,
        direction:    'credit',
        driver:       'dummy',
      });
    } catch (ledgerErr: any) {
      console.warn('[dummy] Ledger write failed (non-fatal):', ledgerErr.message);
    }

    return { success: true, order_id: params.order_id,
             amount_paise: order.amount_paise };
  }

  // ── Disbursements ─────────────────────────────────────────────────────────

  async createDisbursement(params: CreateDisbursementParams): Promise<CreateDisbursementResult> {
    const disbursement_id  = `dis_${nanoid(16)}`;
    const driver_transfer_id = `dummy_tr_${nanoid(12)}`;
    const idempotency_key  = `dis_${params.claim_id}`;

    const { rows: [existing] } = await pool.query(
      `SELECT id, status, driver_transfer_id FROM payment_disbursements
       WHERE idempotency_key = $1`, [idempotency_key]
    );
    if (existing) {
      return {
        disbursement_id:    existing.id,
        driver_transfer_id: existing.driver_transfer_id,
        status:             existing.status,
      };
    }

    // Wallet ops — non-fatal
    try {
      await debitWallet('PLATFORM', params.amount_paise);
      await creditWallet(params.worker_id, params.amount_paise);
    } catch (walletErr: any) {
      console.warn('[dummy] Wallet operation failed (non-fatal):', walletErr.message);
    }

    await pool.query(
      `INSERT INTO payment_disbursements
         (id, claim_id, worker_id, amount_paise, upi_address,
          status, driver_transfer_id, idempotency_key, paid_at, metadata)
       VALUES ($1,$2,$3,$4,$5,'paid',$6,$7,NOW(),$8::jsonb)`,
      [disbursement_id, params.claim_id, params.worker_id, params.amount_paise,
       params.upi_address ?? 'dummy@upi', driver_transfer_id,
       idempotency_key, JSON.stringify(params.metadata ?? {})]
    );

    try {
      await writeLedger({
        entry_type:   'payout_disbursed',
        reference_id: disbursement_id,
        worker_id:    params.worker_id,
        amount_paise: params.amount_paise,
        direction:    'debit',
        driver:       'dummy',
      });
    } catch (ledgerErr: any) {
      console.warn('[dummy] Ledger write failed (non-fatal):', ledgerErr.message);
    }

    return { disbursement_id, driver_transfer_id, status: 'paid' };
  }

  async reverseDisbursement(disbursement_id: string, reason: string): Promise<void> {
    const { rows: [d] } = await pool.query(
      `SELECT * FROM payment_disbursements WHERE id = $1`, [disbursement_id]
    );
    if (!d || d.status !== 'paid') return;

    try {
      await debitWallet(d.worker_id, d.amount_paise);
      await creditWallet('PLATFORM', d.amount_paise);
    } catch (walletErr: any) {
      console.warn('[dummy] Wallet reversal failed (non-fatal):', walletErr.message);
    }

    await pool.query(
      `UPDATE payment_disbursements SET status='reversed', updated_at=NOW(),
       failure_reason=$1 WHERE id=$2`,
      [reason, disbursement_id]
    );

    try {
      await writeLedger({
        entry_type:   'reversal',
        reference_id: disbursement_id,
        worker_id:    d.worker_id,
        amount_paise: d.amount_paise,
        direction:    'credit',
        driver:       'dummy',
        metadata:     { reason },
      });
    } catch (ledgerErr: any) {
      console.warn('[dummy] Ledger write failed (non-fatal):', ledgerErr.message);
    }
  }
}
