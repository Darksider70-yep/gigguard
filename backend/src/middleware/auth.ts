import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { config } from '../config';

export type AuthRole = 'worker' | 'insurer';

export interface AuthPayload {
  sub: string;
  role: AuthRole;
  exp: number;
  iat: number;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: AuthRole;
  };
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
    .createHmac('sha256', config.jwtSecret)
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
    .createHmac('sha256', config.jwtSecret)
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

export function decodeAuthToken(token: string): AuthPayload | null {
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

function unauthorized(res: Response): Response {
  return res.status(401).json({ message: 'Unauthorized' });
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Response | void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return unauthorized(res);
  }

  const token = authHeader.slice('Bearer '.length);
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch {
    return unauthorized(res);
  }
}

export function requireWorker(req: AuthenticatedRequest, res: Response, next: NextFunction): Response | void {
  const result = requireAuth(req, res, () => undefined);
  if (result) {
    return result;
  }

  if (!req.user || req.user.role !== 'worker') {
    return res.status(403).json({ message: 'Worker role required' });
  }

  return next();
}

export function requireInsurer(req: AuthenticatedRequest, res: Response, next: NextFunction): Response | void {
  const result = requireAuth(req, res, () => undefined);
  if (result) {
    return result;
  }

  if (!req.user || req.user.role !== 'insurer') {
    return res.status(403).json({ message: 'Insurer role required' });
  }

  return next();
}

export function issueWorkerToken(workerId: string): string {
  return signToken({ sub: workerId, role: 'worker' }, 7 * 24 * 60 * 60);
}

export function issueInsurerToken(insurerId: string): string {
  return signToken({ sub: insurerId, role: 'insurer' }, 24 * 60 * 60);
}
