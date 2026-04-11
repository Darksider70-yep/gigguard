import request from 'supertest';

jest.mock('../../db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

jest.mock('../../services/mlService', () => ({
  mlService: {
    predictPremium: jest.fn(),
    recommendTier: jest.fn(),
    updateBandit: jest.fn(),
    scoreFraud: jest.fn(),
    getShadowComparison: jest.fn(),
    predictRLPremium: jest.fn(),
  },
}));

jest.mock('../../services/weatherService', () => ({
  weatherService: {
    getWeatherMultiplier: jest.fn(),
    getCurrentConditions: jest.fn(),
    getAQI: jest.fn(),
  },
}));

jest.mock('../../services/paymentClient', () => ({
  paymentClient: {
    verifyOrder: jest.fn(),
    createOrder: jest.fn(),
  },
}));

import { createApp } from '../../app';
import { issueWorkerToken } from '../../middleware/auth';
import { query, withTransaction } from '../../db';
import { mlService } from '../../services/mlService';
import { weatherService } from '../../services/weatherService';
import { paymentClient } from '../../services/paymentClient';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockWithTransaction = withTransaction as jest.MockedFunction<typeof withTransaction>;
const mockMlService = mlService as jest.Mocked<typeof mlService>;
const mockWeatherService = weatherService as jest.Mocked<typeof weatherService>;
const mockPaymentClient = paymentClient as jest.Mocked<typeof paymentClient>;

describe('Policies routes', () => {
  const app = createApp();
  const worker = {
    id: 'worker-1',
    name: 'Arjun Mehta',
    platform: 'zomato',
    city: 'Mumbai',
    zone: 'Andheri',
    home_hex_id: '617733123505323007',
    avg_daily_earning: '1200',
    zone_multiplier: 1.15,
    history_multiplier: 0.95,
    created_at: new Date('2025-01-01').toISOString(),
    experience_tier: 'mid',
    upi_vpa: 'arjun@okicici',
  };
  const token = issueWorkerToken(worker.id);

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockWithTransaction.mockImplementation(async (fn: any) => {
      const client = {
        query: jest.fn().mockResolvedValue({
          rows: [
            {
              id: 'policy-db-id',
              week_start: '2026-03-23',
              week_end: '2026-03-29',
              premium_paid: '52',
              coverage_amount: '480',
              status: 'active',
              razorpay_payment_id: 'pay_123',
            },
          ],
          rowCount: 1,
        }),
      };
      return fn(client);
    });
    mockWeatherService.getWeatherMultiplier.mockResolvedValue(1.2);
    mockMlService.predictPremium.mockResolvedValue({
      premium: 52,
      formula_breakdown: {
        base_rate: 35,
        zone_multiplier: 1.15,
        weather_multiplier: 1.2,
        history_multiplier: 0.95,
        health: 1.0,
        raw_premium: 45.99,
      },
      health_advisory: {
        active: false,
        severity: 'none',
        multiplier: 1.0,
      },
      rl_premium: 49,
      shadow_logged: true,
    });
    mockMlService.recommendTier.mockResolvedValue({
      recommended_arm: 2,
      recommended_premium: 65,
      recommended_coverage: 640,
      context_key: 'ctx_1',
      exploration: false,
    } as any);
    mockMlService.updateBandit.mockResolvedValue(true);
    mockPaymentClient.verifyOrder.mockResolvedValue({ success: true } as any);
  });

  test('GET /policies/premium returns 401 without JWT', async () => {
    const res = await request(app).get('/policies/premium');
    expect(res.status).toBe(401);
  });

  test('GET /policies/premium returns premium, formula_breakdown, coverage, recommended_arm', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [worker], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/policies/premium')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.premium).toBe(52);
    expect(res.body.formula_breakdown).toBeDefined();
    expect(res.body.coverage).toBeDefined();
  });

  test('POST /policies returns 400 with invalid payment signature', async () => {
    mockPaymentClient.verifyOrder.mockResolvedValue({ success: false } as any);
    mockQuery.mockResolvedValueOnce({ rows: [worker], rowCount: 1 });

    const res = await request(app)
      .post('/policies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        payment_order_id: 'p_order_1',
        razorpay_payment_id: 'pay_1',
        razorpay_order_id: 'order_1',
        razorpay_signature: 'sig_1',
        premium_paid: 52,
        coverage_amount: 480,
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PAYMENT_SIGNATURE');
  });

  test('GET /policies/active returns has_active_policy=false when none exists', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [worker], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/policies/active')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.has_active_policy).toBe(false);
  });
});
