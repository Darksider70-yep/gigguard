import express from 'express';
import { config } from './config';
import workersRouter from './routes/workers';
import policiesRouter from './routes/policies';
import claimsRouter from './routes/claims';
import payoutsRouter from './routes/payouts';
import insurerRouter from './routes/insurer';
import razorpayRouter from './routes/razorpay';
import triggersRouter from './routes/triggers';
import healthRouter from './routes/health';
import adminRouter from './routes/admin';
import { startTriggerMonitor } from './jobs/triggerMonitor';
import { startPolicyExpiryJob } from './jobs/policyExpiryJob';
import { startHexBackfillJob } from './jobs/hexBackfillJob';
import { claimCreationWorker } from './workers/claimCreation';
import { claimValidationWorker } from './workers/claimValidation';
import { payoutCreationWorker } from './workers/payoutCreation';
import { logger } from './lib/logger';

let backgroundStarted = false;

function startBackgroundProcesses(): void {
  if (backgroundStarted || process.env.NODE_ENV === 'test') {
    return;
  }

  void claimCreationWorker;
  void claimValidationWorker;
  void payoutCreationWorker;
  startTriggerMonitor();
  startPolicyExpiryJob();
  startHexBackfillJob();
  backgroundStarted = true;
}

export function createApp() {
  const app = express();

  // Security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    return next();
  });

  // CORS — configurable origin, not wildcard
  app.use((req, res, next) => {
    const origin = config.CORS_ORIGIN || 'http://localhost:3000';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Razorpay-Signature');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    return next();
  });

  app.use('/payouts', payoutsRouter);
  app.use(express.json({ limit: '2mb' }));

  app.use(healthRouter);

  app.use('/workers', workersRouter);
  app.use('/policies', policiesRouter);
  app.use('/claims', claimsRouter);
  app.use('/insurer', insurerRouter);
  app.use('/razorpay', razorpayRouter);
  app.use('/triggers', triggersRouter);
  app.use(adminRouter);

  // Legacy compatibility paths from Phase 1.
  app.use('/api/policies', policiesRouter);

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('API', 'request_failed', {
      method: req.method,
      path: req.originalUrl,
      error: err instanceof Error ? err.message : String(err),
    });
    if (res.headersSent) {
      return next(err);
    }
    return res.status(500).json({ message: 'Internal server error' });
  });

  app.use((_req, res) => {
    return res.status(404).json({ message: 'Route not found' });
  });

  startBackgroundProcesses();

  return app;
}

export default createApp;
