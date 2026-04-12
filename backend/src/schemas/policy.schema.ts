import { z } from 'zod';

export const createOrderSchema = z.object({
  body: z.object({
    coverage_tier: z.number().int().min(1).max(3),
    coverage_amount: z.number().min(100),
    premium_paid: z.number().min(1),
  }),
});

export const purchasePolicySchema = z.object({
  body: z.object({
    razorpay_order_id: z.string().min(1),
    razorpay_payment_id: z.string().min(1),
    razorpay_signature: z.string().min(1),
    coverage_tier: z.number().int().min(1).max(3),
    coverage_amount: z.number().min(100),
    premium_paid: z.number().min(1),
  }),
});
