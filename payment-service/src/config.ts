export function validateConfig() {
  const driver = process.env.PAYMENT_DRIVER;
  if (!['dummy', 'razorpay'].includes(driver ?? '')) {
    throw new Error(`PAYMENT_DRIVER must be 'dummy' or 'razorpay', got: '${driver}'`);
  }
  if (!process.env.PAYMENT_SERVICE_KEY) {
    throw new Error('PAYMENT_SERVICE_KEY is required');
  }
  if (driver === 'razorpay') {
    const required = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_ACCOUNT_NUMBER'];
    for (const key of required) {
      if (!process.env[key]) throw new Error(`${key} required when PAYMENT_DRIVER=razorpay`);
    }
  }
  console.log(`[payment-service] Driver: ${driver}`);
}
