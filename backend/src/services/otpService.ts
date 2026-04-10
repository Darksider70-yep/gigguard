import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../lib/logger';

export interface PendingOtpRecord {
  otp: string;
  worker_id: string;
  expires_at: string;
}

const OTP_TTL_SECONDS = 600;
const RESEND_WINDOW_SECONDS = 60 * 60;
const MAX_RESENDS_PER_HOUR = 3;

const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});

redis.on('error', (error) => {
  logger.warn('OTPService', 'redis_error', {
    error: error.message,
  });
});

function normalizePhoneDigits(phoneNumber: string): string {
  return phoneNumber.replace(/\D/g, '');
}

function otpKey(phoneNumber: string): string {
  return `otp:${normalizePhoneDigits(phoneNumber)}`;
}

function resendKey(phoneNumber: string): string {
  return `otp_resend:${normalizePhoneDigits(phoneNumber)}`;
}

async function getClient(): Promise<Redis> {
  if (redis.status === 'wait') {
    await redis.connect();
  }
  return redis;
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function nowPlusTtlIso(ttlSeconds: number): string {
  return new Date(Date.now() + ttlSeconds * 1000).toISOString();
}

export const otpService = {
  ttlSeconds: OTP_TTL_SECONDS,

  async issueOtp(phoneNumber: string, workerId: string): Promise<PendingOtpRecord> {
    const client = await getClient();
    const otp = generateOtp();
    const payload: PendingOtpRecord = {
      otp,
      worker_id: workerId,
      expires_at: nowPlusTtlIso(OTP_TTL_SECONDS),
    };

    await client.set(otpKey(phoneNumber), JSON.stringify(payload), 'EX', OTP_TTL_SECONDS);

    if (config.NODE_ENV !== 'production') {
      console.log(`[OTP] Phone: ${phoneNumber} | OTP: ${otp}`);
    }

    return payload;
  },

  async peekOtp(phoneNumber: string): Promise<PendingOtpRecord | null> {
    const client = await getClient();
    const raw = await client.get(otpKey(phoneNumber));
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as PendingOtpRecord;
    } catch {
      return null;
    }
  },

  async verifyOtp(phoneNumber: string, otp: string): Promise<{ valid: boolean; worker_id?: string }> {
    const client = await getClient();
    const pending = await this.peekOtp(phoneNumber);
    if (!pending) {
      return { valid: false };
    }

    if (pending.otp !== otp) {
      return { valid: false };
    }

    await client.del(otpKey(phoneNumber));
    return { valid: true, worker_id: pending.worker_id };
  },

  async canResend(phoneNumber: string): Promise<boolean> {
    const client = await getClient();
    const key = resendKey(phoneNumber);
    const next = await client.incr(key);
    if (next === 1) {
      await client.expire(key, RESEND_WINDOW_SECONDS);
    }

    return next <= MAX_RESENDS_PER_HOUR;
  },

  async clearOtp(phoneNumber: string): Promise<void> {
    const client = await getClient();
    await client.del(otpKey(phoneNumber));
  },
};
