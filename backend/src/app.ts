import express from 'express';
import cors from 'cors';
import { config } from './config';
import workersRouter from './routes/workers';
import policiesRouter from './routes/policies';
import claimsRouter from './routes/claims';
import insurerRouter from './routes/insurer';
import triggersRouter from './routes/triggers';
import healthRouter from './routes/health';
import adminRouter from './routes/admin';
import webhooksRouter from './routes/webhooks';
import { startTriggerMonitor } from './jobs/triggerMonitor';
import { startPolicyExpiryJob } from './jobs/policyExpiryJob';
import { startHexBackfillJob } from './jobs/hexBackfillJob';
import { claimCreationWorker } from './workers/claimCreation';
import { claimValidationWorker } from './workers/claimValidation';
import { payoutCreationWorker } from './workers/payoutCreation';
import { logger } from './lib/logger';
import { globalErrorHandler } from './middleware/errorHandler';

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

  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map(o => o.trim());

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }));

  // Webhooks need raw body for signature verification sometimes (though moved now)
  app.use('/webhooks', webhooksRouter);
  
  app.use(express.json({ limit: '2mb' }));

  app.use('/health', healthRouter);

  app.use('/workers', workersRouter);
  app.use('/policies', policiesRouter);
  app.use('/claims', claimsRouter);
  app.use('/insurer', insurerRouter);
  app.use('/triggers', triggersRouter);
  app.use(adminRouter);

  // Legacy compatibility paths from Phase 1.
  app.use('/api/policies', policiesRouter);

  app.use(globalErrorHandler);

  app.use((_req, res) => {
    return res.status(404).json({ message: 'Route not found' });
  });

  startBackgroundProcesses();

  return app;
}

export default createApp;
