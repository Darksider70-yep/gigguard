
const { z } = require('zod');

const registerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters'),
    phone_number: z.string().trim().regex(/^(\+91|91)?[6-9]\d{9}$/, 'Invalid Indian phone number'),
    city: z.string().trim().min(2, 'City is required'),
    platform: z.enum(['zomato', 'swiggy']),
    zone: z.string().trim().min(2, 'Zone is required'),
    upi_vpa: z.string().trim().optional(),
    avg_daily_earning: z.coerce.number().min(0).optional(),
    preferred_language: z.enum(['en', 'hi', 'ta', 'te', 'kn', 'mr']).default('en'),
  }).passthrough(),
});

const testInputs = [
  '+919876543210',
  '919876543210',
  '9876543210',
  '+91 9876543210',
  '09876543210',
  '+91987654321', // 9 digits
  '+9198765432101', // 11 digits
];

testInputs.forEach(input => {
  try {
    registerSchema.parse({
      body: {
        name: 'Test User',
        phone_number: input,
        city: 'Mumbai',
        platform: 'zomato',
        zone: 'Mumbai West',
      }
    });
    console.log(`INPUT: "${input}" -> PASS`);
  } catch (err) {
    console.log(`INPUT: "${input}" -> FAIL: ${err.errors[0].message}`);
  }
});
