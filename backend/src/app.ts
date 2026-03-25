import express from 'express';
import workersRouter from './routes/workers';
import policiesRouter from './routes/policies';
import claimsRouter from './routes/claims';
import payoutsRouter from './routes/payouts';
import insurerRouter from './routes/insurer';
import razorpayRouter from './routes/razorpay';
import triggersRouter from './routes/triggers';
import healthRouter from './routes/health';
import { startTriggerMonitor } from './jobs/triggerMonitor';
import { startPolicyExpiryJob } from './jobs/policyExpiryJob';
import { claimCreationWorker } from './workers/claimCreation';
import { claimValidationWorker } from './workers/claimValidation';
import { payoutCreationWorker } from './workers/payoutCreation';

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
  backgroundStarted = true;
}

export function createApp() {
  const app = express();

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Razorpay-Signature');
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

  // Legacy compatibility paths from Phase 1.
  app.use('/api/policies', policiesRouter);

  app.use((_req, res) => {
    return res.status(404).json({ message: 'Route not found' });
  });

  startBackgroundProcesses();

  return app;
}

export default createApp;
