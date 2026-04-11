import express from 'express';
import * as dotenv from 'dotenv';
dotenv.config();

import { validateConfig } from './config';
validateConfig();

import { IPaymentDriver } from './drivers/interface';
import { DummyDriver } from './drivers/dummy/driver';
import { RazorpayDriver } from './drivers/razorpay/driver';

export const activeDriver: IPaymentDriver = process.env.PAYMENT_DRIVER === 'razorpay' 
  ? new RazorpayDriver() 
  : new DummyDriver();

import ordersRouter from './routes/orders';
import disbursementsRouter from './routes/disbursements';
import healthRouter from './routes/health';
import ledgerRouter from './routes/ledger';
import webhooksRouter from './routes/webhooks';
import { renderCheckoutUI } from './drivers/dummy/ui';
import { renderDashboardUI } from './drivers/dummy/dashboard';

const app = express();

// ── Request Logging ──────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const color = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
    console.log(
      `${color}${res.statusCode}\x1b[0m ${req.method} ${req.originalUrl} \x1b[90m${duration}ms\x1b[0m`
    );
  });
  next();
});

// ── CORS ─────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const origin = process.env.FRONTEND_URL || 'http://localhost:3000';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Service-Key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Security Headers ─────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.use(express.json({ limit: '1mb' }));

// ── API Routes ───────────────────────────────────────────────────────────
app.use('/orders', ordersRouter);
app.use('/disbursements', disbursementsRouter);
app.use('/ledger', ledgerRouter);
app.use('/webhooks', webhooksRouter);
app.use('/', healthRouter);

// ── Dummy-Mode UI Pages ──────────────────────────────────────────────────
app.get('/ui/checkout', (req, res) => {
  if (activeDriver.name === 'razorpay') return res.status(404).send('Not available in production mode');
  const html = renderCheckoutUI({
    order_id: req.query.order_id as string,
    amount_paise: Number(req.query.amount),
    worker_id: req.query.worker_id as string,
    callback_url: (process.env.FRONTEND_URL || 'http://localhost:3000') + '/buy-policy/callback'
  });
  res.type('html').send(html);
});

app.get('/ui/dashboard', (req, res) => {
  if (activeDriver.name === 'razorpay') return res.status(404).send('Not available in production mode');
  res.type('html').send(renderDashboardUI());
});

// ── Error Handling ───────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found', service: 'payment-service' });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[payment-service] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Server ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5002;
const server = app.listen(PORT, () => {
  console.log(`[payment-service] ✓ Listening on port ${PORT}`);
  console.log(`[payment-service]   Driver: ${activeDriver.name}`);
  if (activeDriver.name === 'dummy') {
    console.log(`[payment-service]   Dashboard: http://localhost:${PORT}/ui/dashboard`);
  }
});

// ── Graceful Shutdown ────────────────────────────────────────────────────
const shutdown = (signal: string) => {
  console.log(`\n[payment-service] Received ${signal}, shutting down…`);
  server.close(() => {
    console.log('[payment-service] Closed.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
