import crypto from 'crypto';
import Razorpay from 'razorpay';
import { config } from '../config';

let razorpayClient: Razorpay | null = null;

function getClient(): Razorpay {
  if (!config.razorpayKeyId || !config.razorpayKeySecret) {
    throw new Error('Razorpay credentials are not configured');
  }

  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: config.razorpayKeyId,
      key_secret: config.razorpayKeySecret,
    });
  }

  return razorpayClient;
}

export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  if (!config.razorpayKeySecret) {
    return false;
  }
  const payload = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac('sha256', config.razorpayKeySecret)
    .update(payload)
    .digest('hex');
  return expected === signature;
}

export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  if (!config.razorpayWebhookSecret || !signature) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', config.razorpayWebhookSecret)
    .update(rawBody)
    .digest('hex');

  return expected === signature;
}

export async function createOrder(amountPaise: number, receipt: string) {
  const client = getClient();
  return client.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt,
    payment_capture: true,
  } as any);
}

export interface CreatePayoutInput {
  amountPaise: number;
  upiVpa: string;
  referenceId: string;
}

export async function createPayout(input: CreatePayoutInput) {
  const client = getClient();

  if (!config.razorpayAccountNumber) {
    throw new Error('RAZORPAY_ACCOUNT_NUMBER is not configured');
  }

  return (client as any).payouts.create({
    account_number: config.razorpayAccountNumber,
    fund_account: {
      account_type: 'vpa',
      vpa: {
        address: input.upiVpa,
      },
      contact: {
        name: 'GigGuard Worker',
        email: 'worker@gigguard.local',
        contact: '9999999999',
        type: 'employee',
        reference_id: input.referenceId,
      },
    },
    amount: input.amountPaise,
    currency: 'INR',
    mode: 'UPI',
    purpose: 'payout',
    queue_if_low_balance: true,
    reference_id: input.referenceId,
    narration: 'GigGuard Claim Payout',
  } as any);
}

export function getRazorpayPublicConfig() {
  return {
    key_id: config.razorpayKeyId,
  };
}
