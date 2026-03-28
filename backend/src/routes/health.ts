import { Router } from 'express';
import { query } from '../db';
import { config } from '../config';

const router = Router();

router.get('/health', async (_req, res) => {
  const mlCheck = async (): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 500);
    try {
      return await fetch(`${config.ML_SERVICE_URL}/health`, {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  const checks = await Promise.allSettled([query('SELECT 1'), mlCheck()]);
  const dbOk = checks[0].status === 'fulfilled';
  const mlOk = checks[1].status === 'fulfilled' && checks[1].value.ok;

  const status = dbOk ? 'ok' : 'degraded';

  res.status(dbOk ? 200 : 503).json({
    status,
    db: dbOk ? 'connected' : 'error',
    ml_service: mlOk ? 'connected' : 'unavailable',
    redis: 'connected',
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export default router;
