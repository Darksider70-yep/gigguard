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
import { pool } from './db';

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
app.get('/ui/checkout', async (req, res) => {
  if (activeDriver.name === 'razorpay') return res.status(404).send('Not available in production mode');

  const order_id = req.query.order_id as string;
  const amount_paise = Number(req.query.amount) || 5200;
  const worker_id = req.query.worker_id as string || 'demo-worker';

  // Auto-ensure the order exists in the DB so verify won't fail
  try {
    const { rows } = await pool.query('SELECT id FROM payment_orders WHERE id = $1', [order_id]);
    if (!rows.length) {
      // Order doesn't exist yet — create it so the checkout flow works
      await activeDriver.createOrder({
        worker_id,
        amount_paise,
        coverage_tier: 1,
        coverage_amount: Math.round(amount_paise * 0.85),
        idempotency_key: `checkout_${order_id}`,
        metadata: { auto_created: true },
      });
      // The driver generates its own order_id, so we need to use the one it created.
      // Instead, let's insert directly with the provided order_id for consistency.
      const { rows: existing } = await pool.query('SELECT id FROM payment_orders WHERE id = $1', [order_id]);
      if (!existing.length) {
        // The driver created it with a different ID, so insert/upsert with the expected ID
        await pool.query(
          `INSERT INTO payment_orders
             (id, worker_id, amount_paise, coverage_tier, coverage_amount,
              status, driver_order_id, idempotency_key, metadata)
           VALUES ($1,$2,$3,$4,$5,'created',$6,$7,$8::jsonb)
           ON CONFLICT (id) DO NOTHING`,
          [order_id, worker_id, amount_paise, 1, Math.round(amount_paise * 0.85),
           'dummy_ord_' + order_id, `ui_checkout_${order_id}`,
           JSON.stringify({ auto_created_from_ui: true })]
        );
      }
    }
  } catch (err) {
    console.error('[checkout] auto-create order failed:', err);
  }

  const html = renderCheckoutUI({
    order_id,
    amount_paise,
    worker_id,
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
