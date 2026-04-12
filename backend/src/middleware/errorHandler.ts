import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

export interface AppError extends Error {
  status?: number;
  code?: string;
  details?: any;
}

/**
 * Standardized global error handler for GigGuard Backend.
 * Ensures consistent JSON responses for all failures.
 */
export function globalErrorHandler(
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  const code = err.code || 'INTERNAL_ERROR';

  // Log non-4xx errors as errors, 4xx as warnings
  if (status >= 500) {
    logger.error('ErrorHandler', message, {
      path: req.path,
      method: req.method,
      status,
      code,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  } else {
    logger.warn('ErrorHandler', message, {
      path: req.path,
      status,
      code,
    });
  }

  res.status(status).json({
    success: false,
    error: {
      message,
      code,
      details: err.details || undefined,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Higher-order function to wrap async route handlers and catch errors.
 * Replaces the need for try/catch in every route.
 */
export const asyncRoute = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
