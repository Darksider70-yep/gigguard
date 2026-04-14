
const { z } = require('zod');

const indianPhoneSchema = z.string()
  .trim()
  .transform((val) => {
    // Remove all non-digit characters except for a leading plus
    let cleaned = val.replace(/(?!^\+)\D/g, '');
    
    // If it starts with 0 and has 11 digits (e.g. 09876543210), strip the 0
    if (cleaned.startsWith('0') && cleaned.length === 11) {
      cleaned = cleaned.substring(1);
    }
    
    return cleaned;
  })
  .pipe(
    z.string().regex(/^(\+91|91)?[6-9]\d{9}$/, 'Invalid Indian phone number')
  );

const testInputs = [
  '+919876543210',
  '919876543210',
  '9876543210',
  '+91 98765 43210',
  '+91-98765-43210',
  '09876543210',
  ' 98765 43210 ',
  '+9109876543210', // Should fail (0 after prefix)
  '1234567890',     // Should fail (not starting with 6-9)
];

testInputs.forEach(input => {
  const result = indianPhoneSchema.safeParse(input);
  if (result.success) {
    console.log(`INPUT: "${input}" -> PASS (Transformed: "${result.data}")`);
  } else {
    console.log(`INPUT: "${input}" -> FAIL: ${result.error.errors[0].message}`);
  }
});
