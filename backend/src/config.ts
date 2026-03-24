import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

function getEnv(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (value !== undefined && value !== '') {
    return value;
  }
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  throw new Error(`Missing required environment variable: ${name}`);
}

function getNumberEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) {
    return defaultValue;
  }
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number`);
  }
  return parsed;
}

function getBooleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return defaultValue;
  }
  return raw.toLowerCase() === 'true';
}

export const config = {
  port: getNumberEnv('PORT', 4000),
  databaseUrl: getEnv('DATABASE_URL'),
  mlServiceUrl: getEnv('ML_SERVICE_URL', 'http://localhost:5001'),
  mlTimeoutMs: getNumberEnv('ML_TIMEOUT_MS', 500),
  useMockApis: getBooleanEnv('USE_MOCK_APIS', false),
  openWeatherApiKey: process.env.OPENWEATHER_API_KEY || '',
  openWeatherBaseUrl: getEnv('OPENWEATHER_BASE_URL', 'https://api.openweathermap.org'),
  jwtSecret: getEnv('JWT_SECRET', process.env.RAZORPAY_KEY_SECRET),
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  razorpayAccountNumber: process.env.RAZORPAY_ACCOUNT_NUMBER || '',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  insurerLoginSecret: process.env.INSURER_LOGIN_SECRET || '',
};

export type AppConfig = typeof config;
