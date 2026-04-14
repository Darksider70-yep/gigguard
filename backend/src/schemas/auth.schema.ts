import { z } from 'zod';

const indianPhoneSchema = z.string()
  .trim()
  .transform((val) => {
    // Remove all non-digit characters except for a leading plus
    let cleaned = val.replace(/(?!^\+)\D/g, '');
    
    // Handle cases like 09876543210, 9109876543210, +9109876543210
    // by removing the extra '0' before the 10-digit mobile number.
    const match = cleaned.match(/^(.*)0([6-9]\d{9})$/);
    if (match) {
      cleaned = match[1] + match[2];
    }
    
    return cleaned;
  })
  .pipe(
    z.string().regex(/^(\+91|91)?[6-9]\d{9}$/, 'Invalid Indian phone number')
  );

export const registerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters'),
    phone_number: indianPhoneSchema,
    city: z.string().trim().min(2, 'City is required'),
    platform: z.enum(['zomato', 'swiggy']),
    zone: z.string().trim().min(2, 'Zone is required'),
    upi_vpa: z.string().trim().optional(),
    avg_daily_earning: z.coerce.number().min(0).optional(),
    preferred_language: z.enum(['en', 'hi', 'ta', 'te', 'kn', 'mr']).default('en'),
  }).passthrough(),
});

export const loginSchema = z.object({
  body: z.object({
    role: z.enum(['worker', 'insurer']),
    phone_number: indianPhoneSchema.optional(),
    secret: z.string().trim().optional(),
  }).passthrough().refine(data => {
    if (data.role === 'worker' && !data.phone_number) return false;
    if (data.role === 'insurer' && !data.secret) return false;
    return true;
  }, {
    message: 'Missing required credentials for the selected role',
  }),
});

export const verifyOtpSchema = z.object({
  body: z.object({
    phone_number: indianPhoneSchema,
    otp: z.string().length(6, 'OTP must be 6 digits'),
  }),
});

