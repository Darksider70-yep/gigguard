import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    phone_number: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian phone number'),
    city: z.string().min(2, 'City is required'),
    platform: z.enum(['zomato', 'swiggy']),
    upi_vpa: z.string().optional(),
    avg_daily_earning: z.number().min(0).optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    role: z.enum(['worker', 'insurer']),
    phone_number: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian phone number').optional(),
    secret: z.string().optional(),
  }).refine(data => {
    if (data.role === 'worker' && !data.phone_number) return false;
    if (data.role === 'insurer' && !data.secret) return false;
    return true;
  }, {
    message: 'Missing required credentials for the selected role',
  }),
});

export const verifyOtpSchema = z.object({
  body: z.object({
    phone_number: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian phone number'),
    otp: z.string().length(6, 'OTP must be 6 digits'),
  }),
});
