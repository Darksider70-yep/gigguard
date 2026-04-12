import { config } from '../config';
import { logger } from '../lib/logger';
import { CircuitBreaker } from '../lib/circuitBreaker';

const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL ?? 'http://payment-service:5002';
const SERVICE_KEY = process.env.PAYMENT_SERVICE_KEY!;
const TIMEOUT = 5000; // 5 seconds

const breaker = new CircuitBreaker({
  name: 'PAYMENT_SERVICE',
  failureThreshold: 3,
  resetTimeoutMs: 60000, // 1 minute
});

export const paymentClient = {
  createOrder:        async (body: object) => post('/orders', body),
  getOrder:           async (id: string)   => get(`/orders/${id}`),
  verifyOrder:        async (id: string, body: object) => post(`/orders/${id}/verify`, body),
  createDisbursement: async (body: object) => post('/disbursements', body),
  getDisbursement:    async (id: string)   => get(`/disbursements/${id}`),
  retryDisbursement:  async (id: string)   => post(`/disbursements/${id}/retry`, {}),
  checkHealth: async () => {
    try {
      const res = await fetch(`${PAYMENT_SERVICE_URL}/health`, { 
        headers: { 'X-Service-Key': SERVICE_KEY }
      });
      return res.ok;
    } catch {
      return false;
    }
  }
};

async function post<T>(path: string, body: object): Promise<T> {
  return breaker.execute(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const res = await fetch(`${PAYMENT_SERVICE_URL}${path}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Service-Key': SERVICE_KEY },
        body:    JSON.stringify(body),
        signal:  controller.signal,
      });
      if (!res.ok) throw new Error(`Payment service error: ${res.status} ${await res.text()}`);
      return res.json();
    } finally {
      clearTimeout(timer);
    }
  }, null as any);
}

async function get<T>(path: string): Promise<T> {
  return breaker.execute(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const res = await fetch(`${PAYMENT_SERVICE_URL}${path}`, {
        headers: { 'X-Service-Key': SERVICE_KEY },
        signal:  controller.signal,
      });
      if (!res.ok) throw new Error(`Payment service error: ${res.status}`);
      return res.json();
    } finally {
      clearTimeout(timer);
    }
  }, null as any);
}
