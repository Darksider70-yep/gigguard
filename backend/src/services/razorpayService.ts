import crypto from 'crypto';
import Razorpay from 'razorpay';
import { config } from '../config';

let client: Razorpay | null = null;

function getClient(): Razorpay {
  if (client) {
    return client;
  }

  if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay credentials are not configured');
  }

  client = new Razorpay({
    key_id: config.RAZORPAY_KEY_ID,
    key_secret: config.RAZORPAY_KEY_SECRET,
  });

  return client;
}

function safeCompare(a: string, b?: string | null): boolean {
  if (typeof b !== 'string') {
    return false;
  }

  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

class RazorpayService {
  async createOrder(amountInPaise: number): Promise<{
    order_id: string;
    amount: number;
    currency: string;
    key_id: string;
  }> {
    const order = await getClient().orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `pol_${Date.now()}`,
    });

    return {
      order_id: order.id,
      amount: order.amount as number,
      currency: order.currency,
      key_id: config.RAZORPAY_KEY_ID,
    };
  }

  verifyPaymentSignature(
    orderId: string,
    paymentId: string,
    signature?: string
  ): boolean {
    const body = `${orderId}|${paymentId}`;
    const expected = crypto
      .createHmac('sha256', config.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');
    return safeCompare(expected, signature);
  }

  verifyWebhookSignature(body: string, signature?: string): boolean {
    const expected = crypto
      .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');
    return safeCompare(expected, signature);
  }

  async createPayout(params: {
    amount: number;
    upi_vpa: string;
    worker_name: string;
    claim_id: string;
  }): Promise<{ payout_id: string; status: string }> {
    if (config.USE_MOCK_PAYOUT) {
      return {
        payout_id: `pay_mock_${Date.now()}`,
        status: 'processed',
      };
    }

    const fundAccount = await getClient().fundAccount.create({
      contact_id: params.claim_id,
      account_type: 'vpa',
      vpa: { address: params.upi_vpa },
    } as any);

    const payout = await (getClient() as any).payouts.create({
      account_number: config.RAZORPAY_ACCOUNT_NUMBER,
      fund_account_id: (fundAccount as any).id,
      amount: Math.round(params.amount * 100),
      currency: 'INR',
      mode: 'UPI',
      purpose: 'payout',
      queue_if_low_balance: true,
      reference_id: params.claim_id,
      narration: 'GigGuard Income Protection',
    });

    return {
      payout_id: (payout as any).id,
      status: (payout as any).status,
    };
  }
}

export const razorpayService = new RazorpayService();

// Backward-compatible exports.
export async function createOrder(amountInPaise: number): Promise<{
  id: string;
  amount: number;
  currency: string;
}> {
  const order = await razorpayService.createOrder(amountInPaise);
  return {
    id: order.order_id,
    amount: order.amount,
    currency: order.currency,
  };
}

export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  return razorpayService.verifyPaymentSignature(orderId, paymentId, signature);
}

export function verifyWebhookSignature(body: Buffer | string, signature: string): boolean {
  const payload = Buffer.isBuffer(body) ? body.toString('utf8') : body;
  return razorpayService.verifyWebhookSignature(payload, signature);
}

export function getRazorpayPublicConfig(): { key_id: string } {
  return { key_id: config.RAZORPAY_KEY_ID };
}

export async function createPayout(params: {
  amountPaise?: number;
  upiVpa?: string;
  referenceId?: string;
  amount?: number;
  upi_vpa?: string;
  worker_name?: string;
  claim_id?: string;
}): Promise<{ payout_id: string; status: string }> {
  const amount =
    params.amount ??
    (params.amountPaise !== undefined ? params.amountPaise / 100 : 0);

  return razorpayService.createPayout({
    amount,
    upi_vpa: params.upi_vpa ?? params.upiVpa ?? '',
    worker_name: params.worker_name ?? 'GigGuard Worker',
    claim_id: params.claim_id ?? params.referenceId ?? '',
  });
}
