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
  },
}));

jest.mock('../../services/weatherService', () => ({
  weatherService: {
    getWeatherMultiplier: jest.fn(),
    getCurrentConditions: jest.fn(),
    getAQI: jest.fn(),
  },
}));

jest.mock('../../services/razorpayService', () => ({
  razorpayService: {
    verifyPaymentSignature: jest.fn(),
    verifyWebhookSignature: jest.fn(),
    createOrder: jest.fn(),
    createPayout: jest.fn(),
  },
}));

import { createApp } from '../../app';
import { issueWorkerToken } from '../../middleware/auth';
import { query, withTransaction } from '../../db';
import { mlService } from '../../services/mlService';
import { weatherService } from '../../services/weatherService';
import { razorpayService } from '../../services/razorpayService';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockWithTransaction = withTransaction as jest.MockedFunction<typeof withTransaction>;
const mockMlService = mlService as jest.Mocked<typeof mlService>;
const mockWeatherService = weatherService as jest.Mocked<typeof weatherService>;
const mockRazorpayService = razorpayService as jest.Mocked<typeof razorpayService>;

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
        raw_premium: 45.99,
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
    });
    mockRazorpayService.verifyPaymentSignature.mockReturnValue(true);
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
    expect(res.body.recommended_arm).toBe(2);
  });

  test('GET /policies/premium has_active_policy=true when policy exists this week', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [worker], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'policy-1' }], rowCount: 1 });

    const res = await request(app)
      .get('/policies/premium')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.has_active_policy).toBe(true);
  });

  test('GET /policies/premium has_active_policy=false for fresh worker', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [worker], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/policies/premium')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.has_active_policy).toBe(false);
  });

  test('GET /policies/premium uses weather_multiplier=1.20 when mock weather is enabled', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [worker], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/policies/premium')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(mockMlService.predictPremium).toHaveBeenCalledWith(
      worker.id,
      worker.zone_multiplier,
      1.2,
      worker.history_multiplier
    );
  });

  test('GET /policies/premium returns 200 even if ML service is down (safe defaults)', async () => {
    mockMlService.predictPremium.mockResolvedValue({
      premium: 40,
      formula_breakdown: {
        base_rate: 35,
        zone_multiplier: 1.15,
        weather_multiplier: 1.2,
        history_multiplier: 0.95,
        raw_premium: 39.9,
      },
      rl_premium: null,
      shadow_logged: false,
    });
    mockMlService.recommendTier.mockResolvedValue(null as any);
    mockQuery
      .mockResolvedValueOnce({ rows: [worker], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/policies/premium')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.premium).toBe(40);
  });

  test('POST /policies returns 401 without JWT', async () => {
    const res = await request(app).post('/policies').send({});
    expect(res.status).toBe(401);
  });

  test('POST /policies returns 400 with invalid Razorpay signature', async () => {
    mockRazorpayService.verifyPaymentSignature.mockReturnValue(false);
    mockQuery.mockResolvedValueOnce({ rows: [worker], rowCount: 1 });

    const res = await request(app)
      .post('/policies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        razorpay_payment_id: 'pay_1',
        razorpay_order_id: 'order_1',
        razorpay_signature: 'sig_1',
        premium_paid: 52,
        coverage_amount: 480,
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PAYMENT_SIGNATURE');
  });

  test('POST /policies returns 409 if policy already exists this week', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [worker], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-policy' }], rowCount: 1 });

    const res = await request(app)
      .post('/policies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        razorpay_payment_id: 'pay_1',
        razorpay_order_id: 'order_1',
        razorpay_signature: 'sig_1',
        premium_paid: 52,
        coverage_amount: 480,
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('POLICY_EXISTS');
  });

  test('POST /policies creates policy and returns policy_id on success', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [worker], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post('/policies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        razorpay_payment_id: 'pay_1',
        razorpay_order_id: 'order_1',
        razorpay_signature: 'sig_1',
        premium_paid: 52,
        coverage_amount: 480,
        recommended_arm: 2,
        context_key: 'ctx_1',
        arm_accepted: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.policy_id).toMatch(/^POL-\d{4}-W\d{1,2}-[A-Z0-9]{3}$/);
    expect(res.body.policy.id).toBe('policy-db-id');
  });

  test('POST /policies fires bandit update (fire-and-forget, not awaited)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [worker], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post('/policies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        razorpay_payment_id: 'pay_1',
        razorpay_order_id: 'order_1',
        razorpay_signature: 'sig_1',
        premium_paid: 52,
        coverage_amount: 480,
        recommended_arm: 2,
        context_key: 'ctx_1',
      });

    expect(res.status).toBe(201);
    expect(mockMlService.updateBandit).toHaveBeenCalledWith(worker.id, 'ctx_1', 2, 1.0);
  });

  test('POST /policies policy_id matches format POL-YYYY-WNN-XXX', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [worker], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post('/policies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        razorpay_payment_id: 'pay_1',
        razorpay_order_id: 'order_1',
        razorpay_signature: 'sig_1',
        premium_paid: 52,
        coverage_amount: 480,
      });

    expect(res.status).toBe(201);
    expect(res.body.policy_id).toMatch(/^POL-\d{4}-W\d{1,2}-[A-Z0-9]{3}$/);
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

  test('GET /policies/active returns active_claim when claim is active', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [worker], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'policy-1',
            week_start: '2026-03-23',
            week_end: '2026-03-29',
            premium_paid: '52',
            coverage_amount: '480',
            status: 'active',
            claim_id: 'claim-1',
            claim_status: 'triggered',
            payout_amount: '480',
            trigger_type: 'heavy_rainfall',
            trigger_value: '18.2',
            disruption_hours: '4',
          },
        ],
        rowCount: 1,
      });

    const res = await request(app)
      .get('/policies/active')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.active_claim).toBeDefined();
    expect(res.body.active_claim.id).toBe('claim-1');
  });

  test('GET /policies/active claim_status maps correctly (triggered|validating|approved|paid)', async () => {
    const statuses = ['triggered', 'validating', 'approved', 'paid'];
    for (const status of statuses) {
      mockQuery.mockReset();
      mockQuery
        .mockResolvedValueOnce({ rows: [worker], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'policy-1',
              week_start: '2026-03-23',
              week_end: '2026-03-29',
              premium_paid: '52',
              coverage_amount: '480',
              status: 'active',
              claim_id: 'claim-1',
              claim_status: status,
              payout_amount: '480',
              trigger_type: 'heavy_rainfall',
              trigger_value: '18.2',
              disruption_hours: '4',
            },
          ],
          rowCount: 1,
        });

      const res = await request(app)
        .get('/policies/active')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.active_claim.claim_status).toBe(status);
    }
  });
});
