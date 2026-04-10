import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

function getStringEnv(name: string, fallback = ''): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  return value.trim();
}

function getNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function getBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

const OPENWEATHERMAP_API_KEY =
  getStringEnv('OPENWEATHERMAP_API_KEY') || getStringEnv('OPENWEATHER_API_KEY');
const OPENWEATHERMAP_BASE_URL =
  getStringEnv('OPENWEATHERMAP_BASE_URL') ||
  getStringEnv('OPENWEATHER_BASE_URL', 'https://api.openweathermap.org/data/2.5');

const AQICN_API_KEY = getStringEnv('AQICN_API_KEY') || getStringEnv('AQI_API_KEY');
const AQICN_BASE_URL = getStringEnv('AQICN_BASE_URL', 'https://api.waqi.info/feed');

export const config = {
  DATABASE_URL: getStringEnv('DATABASE_URL', 'postgresql://gigguard:password@localhost:5432/gigguard'),
  REDIS_URL: getStringEnv('REDIS_URL', 'redis://localhost:6379'),

  ML_SERVICE_URL: getStringEnv('ML_SERVICE_URL', 'http://localhost:5001'),
  ML_SERVICE_TIMEOUT_MS: getNumberEnv('ML_SERVICE_TIMEOUT_MS', getNumberEnv('ML_TIMEOUT_MS', 500)),

  OPENWEATHERMAP_API_KEY,
  OPENWEATHERMAP_BASE_URL,

  AQICN_API_KEY,
  AQICN_BASE_URL,

  RAZORPAY_KEY_ID: getStringEnv('RAZORPAY_KEY_ID', 'rzp_test_xxx'),
  RAZORPAY_KEY_SECRET: getStringEnv('RAZORPAY_KEY_SECRET', ''),
  RAZORPAY_ACCOUNT_NUMBER: getStringEnv('RAZORPAY_ACCOUNT_NUMBER', ''),
  RAZORPAY_WEBHOOK_SECRET: getStringEnv('RAZORPAY_WEBHOOK_SECRET', ''),

  JWT_SECRET: getStringEnv('JWT_SECRET', 'dev_jwt_secret_change_me'),

  USE_MOCK_APIS: getBooleanEnv('USE_MOCK_APIS', true),
  USE_MOCK_PAYOUT: getBooleanEnv('USE_MOCK_PAYOUT', true),
  IS_DEMO_MODE: getBooleanEnv('IS_DEMO_MODE', false),

  PORT: getNumberEnv('PORT', 4000),
  NODE_ENV: getStringEnv('NODE_ENV', 'development'),

  INSURER_LOGIN_SECRET: getStringEnv('INSURER_LOGIN_SECRET', ''),

  CORS_ORIGIN: getStringEnv('CORS_ORIGIN', 'http://localhost:3000'),

  // Legacy aliases for backward compatibility.
  port: getNumberEnv('PORT', 4000),
  databaseUrl: getStringEnv('DATABASE_URL', 'postgresql://gigguard:password@localhost:5432/gigguard'),
  mlServiceUrl: getStringEnv('ML_SERVICE_URL', 'http://localhost:5001'),
  mlTimeoutMs: getNumberEnv('ML_SERVICE_TIMEOUT_MS', getNumberEnv('ML_TIMEOUT_MS', 500)),
  useMockApis: getBooleanEnv('USE_MOCK_APIS', true),
  useMockPayout: getBooleanEnv('USE_MOCK_PAYOUT', true),
  isDemoMode: getBooleanEnv('IS_DEMO_MODE', false),
  openWeatherApiKey: OPENWEATHERMAP_API_KEY,
  openWeatherBaseUrl: OPENWEATHERMAP_BASE_URL,
  jwtSecret: getStringEnv('JWT_SECRET', 'dev_jwt_secret_change_me'),
  razorpayKeyId: getStringEnv('RAZORPAY_KEY_ID', 'rzp_test_xxx'),
  razorpayKeySecret: getStringEnv('RAZORPAY_KEY_SECRET', ''),
  razorpayWebhookSecret: getStringEnv('RAZORPAY_WEBHOOK_SECRET', ''),
  razorpayAccountNumber: getStringEnv('RAZORPAY_ACCOUNT_NUMBER', ''),
  redisUrl: getStringEnv('REDIS_URL', 'redis://localhost:6379'),
  insurerLoginSecret: getStringEnv('INSURER_LOGIN_SECRET', ''),
} as const;

export type AppConfig = typeof config;
