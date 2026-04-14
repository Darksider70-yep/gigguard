import express from 'express';
import cors from 'cors';
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

import { creditWallet, getBalance } from './drivers/dummy/wallet';

// ── Dummy Wallet API ─────────────────────────────────────────────────────
app.get('/wallet/:worker_id', async (req, res) => {
  try {
    const balance_paise = await getBalance(req.params.worker_id);
    res.json({ balance_paise });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/wallet/:worker_id/topup', async (req, res) => {
  try {
    const amount_paise = Number(req.body.amount_paise) || 10000;
    await creditWallet(req.params.worker_id, amount_paise);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/ui/dashboard', (req, res) => {
  if (activeDriver.name === 'razorpay') return res.status(404).send('Not available in production mode');
  res.type('html').send(renderDashboardUI());
});

// ── Debugging ────────────────────────────────────────────────────────────
app.get('/debug/db', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT current_database(), now()');
    res.json({
      status: 'connected',
      details: rows[0],
      migrations_table: await pool.query('SELECT count(*) FROM _migrations_payment').then(r => r.rows[0].count).catch(e => e.message),
      wallet_table: await pool.query('SELECT count(*) FROM dummy_wallets').then(r => r.rows[0].count).catch(e => e.message)
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message, stack: err.stack });
  }
});

// ── Error Handling ───────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found', service: 'payment-service' });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[payment-service] Unhandled error:', err);
  // In production, return the actual error message temporarily for debugging
  res.status(500).json({ 
    error: 'Internal server error', 
    message: err.message,
    details: err.stack ? 'Stack trace logged to server console' : undefined
  });
});

import { runMigrations } from './migrator';

// ── Server ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5002;

(async () => {
  try {
    console.log(`[payment-service] Allowed Origins: ${allowedOrigins.join(', ')}`);
    await runMigrations();
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
  } catch (err: any) {
    console.error('[payment-service] Startup failed:', err.message);
    process.exit(1);
  }
})();
