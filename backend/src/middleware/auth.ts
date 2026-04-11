import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { query } from '../db';
import { config } from '../config';

export type AuthRole = 'worker' | 'insurer';

export interface AuthPayload {
  sub: string;
  role: AuthRole;
  exp: number;
  iat: number;
  preferred_language?: string;
}

export interface WorkerAuthContext {
  id: string;
  name: string;
  platform: string;
  city: string;
  zone: string | null;
  home_hex_id: string | null;
  avg_daily_earning: number;
  zone_multiplier: number;
  history_multiplier: number;
  created_at: string;
  experience_tier: string | null;
  upi_vpa: string | null;
  preferred_language: string;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: AuthRole;
  };
  worker?: WorkerAuthContext;
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: AuthRole;
      };
      worker?: WorkerAuthContext;
    }
  }
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signToken(payload: Omit<AuthPayload, 'iat' | 'exp'>, expiresInSeconds: number): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const issuedAt = Math.floor(Date.now() / 1000);
  const completePayload: AuthPayload = {
    ...payload,
    iat: issuedAt,
    exp: issuedAt + expiresInSeconds,
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(completePayload));
  const data = `${headerEncoded}.${payloadEncoded}`;
  const signature = crypto
    .createHmac('sha256', config.JWT_SECRET)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${data}.${signature}`;
}

function verifyToken(token: string): AuthPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }

  const [headerEncoded, payloadEncoded, providedSignature] = parts;
  const data = `${headerEncoded}.${payloadEncoded}`;
  const expectedSignature = crypto
    .createHmac('sha256', config.JWT_SECRET)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (expectedSignature !== providedSignature) {
    throw new Error('Invalid token signature');
  }

  const payload = JSON.parse(base64UrlDecode(payloadEncoded)) as AuthPayload;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    throw new Error('Token expired');
  }

  return payload;
}

function unauthorized(res: Response): Response {
  return res.status(401).json({ message: 'Unauthorized' });
}

function forbidden(res: Response): Response {
  return res.status(403).json({ message: 'Forbidden' });
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice('Bearer '.length);
}

async function loadWorker(workerId: string): Promise<WorkerAuthContext | null> {
  const { rows } = await query<{
    id: string;
    name: string;
    platform: string;
    city: string;
    zone: string | null;
    home_hex_id: string | null;
    avg_daily_earning: string;
    zone_multiplier: number;
    history_multiplier: number;
    created_at: string;
    experience_tier: string | null;
    upi_vpa: string | null;
    preferred_language: string;
  }>(
    `SELECT
       id,
       name,
       platform,
       city,
       zone,
       home_hex_id::text,
       avg_daily_earning::text,
       zone_multiplier,
       history_multiplier,
       created_at,
       experience_tier,
       upi_vpa,
       preferred_language
     FROM workers
     WHERE id = $1
     LIMIT 1`,
    [workerId]
  );

  if (rows.length === 0) {
    return null;
  }

  const worker = rows[0];
  return {
    id: worker.id,
    name: worker.name,
    platform: worker.platform,
    city: worker.city,
    zone: worker.zone,
    home_hex_id: worker.home_hex_id,
    avg_daily_earning: Number(worker.avg_daily_earning),
    zone_multiplier: Number(worker.zone_multiplier ?? 1),
    history_multiplier: Number(worker.history_multiplier ?? 1),
    created_at: worker.created_at,
    experience_tier: worker.experience_tier,
    upi_vpa: worker.upi_vpa,
    preferred_language: worker.preferred_language ?? 'en',
  };
}

export function decodeAuthToken(token: string): AuthPayload | null {
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Response | void {
  const token = getBearerToken(req);
  if (!token) {
    return unauthorized(res);
  }

  const payload = decodeAuthToken(token);
  if (!payload) {
    return unauthorized(res);
  }

  req.user = { id: payload.sub, role: payload.role };
  return next();
}

export async function authenticateWorker(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<Response | void> {
  const token = getBearerToken(req);
  if (!token) {
    console.log('[auth] 401: No Bearer token found in headers');
    return unauthorized(res);
  }

  const payload = decodeAuthToken(token);
  if (!payload) {
    console.log('[auth] 401: Token decoding failed (invalid signature or format)');
    return unauthorized(res);
  }

  if (payload.role !== 'worker') {
    console.log(`[auth] 403: Role mismatch. Expected worker, got ${payload.role}`);
    return forbidden(res);
  }

  const worker = await loadWorker(payload.sub);
  if (!worker) {
    console.log(`[auth] 401: Worker not found in database for ID: ${payload.sub}`);
    return unauthorized(res);
  }

  req.user = { id: payload.sub, role: payload.role };
  req.worker = worker;
  return next();
}

export function authenticateInsurer(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Response | void {
  const token = getBearerToken(req);
  if (!token) {
    return unauthorized(res);
  }

  const payload = decodeAuthToken(token);
  if (!payload) {
    return unauthorized(res);
  }

  if (payload.role !== 'insurer') {
    return forbidden(res);
  }

  req.user = { id: payload.sub, role: payload.role };
  return next();
}

export const requireWorker = authenticateWorker;
export const requireInsurer = authenticateInsurer;

export function issueWorkerToken(workerId: string, preferred_language: string = 'en'): string {
  return signToken({ sub: workerId, role: 'worker', preferred_language }, 7 * 24 * 60 * 60);
}

export function issueInsurerToken(insurerId: string): string {
  return signToken({ sub: insurerId, role: 'insurer' }, 24 * 60 * 60);
}
