import { Router } from 'express';
import { query } from '../db';
import { mlService } from '../services/mlService';
import { paymentClient } from '../services/paymentClient';

const router = Router();

router.get('/', async (req, res) => {
  const health: any = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: { status: 'unknown' },
      ml_service: { status: 'unknown' },
      payment_service: { status: 'unknown' },
    }
  };

  // Check DB
  try {
    const start = Date.now();
    await query('SELECT 1');
    health.services.database = { status: 'live', latency: `${Date.now() - start}ms` };
  } catch (err) {
    health.services.database = { status: 'down', error: (err as Error).message };
    health.status = 'degraded';
  }

  // Check ML Service
  try {
    const start = Date.now();
    const res = await fetch(`${mlService['baseUrl']}/health`, { signal: AbortSignal.timeout(2000) });
    health.services.ml_service = { 
      status: res.ok ? 'live' : 'down', 
      latency: `${Date.now() - start}ms`,
      statusCode: res.status 
    };
    if (!res.ok) {
      health.status = 'degraded';
      health.services.ml_service.error = 'Service reported not OK';
      health.services.ml_service.body = await res.text().then(t => t.slice(0, 200)).catch(() => 'N/A');
    }
  } catch (err: any) {
    health.services.ml_service = { 
      status: 'down', 
      error: err.message, 
      code: err.code || err.cause?.code,
      cause: err.cause?.message || 'Unknown network error'
    };
    health.status = 'degraded';
  }

  // Check Payment Service
  try {
    const start = Date.now();
    const res = await fetch(`${process.env.PAYMENT_SERVICE_URL}/health`, { 
      headers: { 'X-Service-Key': process.env.PAYMENT_SERVICE_KEY || '' },
      signal: AbortSignal.timeout(5000)
    });
    health.services.payment_service = { 
      status: res.ok ? 'live' : 'down', 
      latency: `${Date.now() - start}ms`,
      statusCode: res.status
    };
    if (!res.ok) {
      health.status = 'degraded';
      health.services.payment_service.error = 'Service reported not OK';
      health.services.payment_service.body = await res.text().then(t => t.slice(0, 200)).catch(() => 'N/A');
    }
  } catch (err: any) {
    health.services.payment_service = { 
      status: 'down', 
      error: err.message, 
      code: err.code || err.cause?.code,
      cause: err.cause?.message || 'Unknown network error'
    };
    health.status = 'degraded';
  }

  const statusCode = health.status === 'down' ? 503 : 200;
  res.status(statusCode).json(health);
});

export default router;
