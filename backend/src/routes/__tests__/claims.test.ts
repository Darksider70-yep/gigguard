import request from 'supertest';

jest.mock('../../db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

import { createApp } from '../../app';
import { issueWorkerToken } from '../../middleware/auth';
import { query } from '../../db';

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('Claims routes', () => {
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
  });

  test('GET /claims returns 401 without JWT', async () => {
    const res = await request(app).get('/claims');
    expect(res.status).toBe(401);
  });

  test('GET /claims returns stats (total_paid_out, claims_this_month, paid_streak)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [worker], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'claim-1',
            trigger_type: 'heavy_rainfall',
            trigger_value: '18.2',
            payout_amount: '500.2',
            disruption_hours: '4',
            fraud_score: 0.12,
            graph_flags: [],
            bcs_score: null,
            status: 'paid',
            notes: null,
            created_at: new Date().toISOString(),
            paid_at: new Date().toISOString(),
            city: 'Mumbai',
            zone: 'Andheri',
            razorpay_ref: 'pout_1',
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ total_paid_out: '1000', claims_this_month: '2', total_paid_count: '5' }],
        rowCount: 1,
      });

    const res = await request(app).get('/claims').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.stats).toEqual({
      total_paid_out: 1000,
      claims_this_month: 2,
      paid_streak: 5,
    });
  });

  test('GET /claims returns enriched claims with razorpay_ref', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [worker], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'claim-1',
            trigger_type: 'heavy_rainfall',
            trigger_value: '18.2',
            payout_amount: '500.2',
            disruption_hours: '4',
            fraud_score: 0.12,
            graph_flags: [],
            bcs_score: null,
            status: 'paid',
            notes: null,
            created_at: new Date().toISOString(),
            paid_at: new Date().toISOString(),
            city: 'Mumbai',
            zone: 'Andheri',
            razorpay_ref: 'pout_1',
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ total_paid_out: '500', claims_this_month: '1', total_paid_count: '1' }],
        rowCount: 1,
      });

    const res = await request(app).get('/claims').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.claims[0].razorpay_ref).toBe('pout_1');
  });

  test('GET /claims under_review claim includes under_review_reason with BCS score', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [worker], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'claim-2',
            trigger_type: 'heavy_rainfall',
            trigger_value: '18.2',
            payout_amount: '420',
            disruption_hours: '4',
            fraud_score: 0.72,
            graph_flags: ['cell_tower_mismatch'],
            bcs_score: 33,
            status: 'under_review',
            notes: null,
            created_at: new Date().toISOString(),
            paid_at: null,
            city: 'Mumbai',
            zone: 'Andheri',
            razorpay_ref: null,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ total_paid_out: '0', claims_this_month: '0', total_paid_count: '0' }],
        rowCount: 1,
      });

    const res = await request(app).get('/claims').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.claims[0].under_review_reason).toBeDefined();
    expect(res.body.claims[0].under_review_reason.behavioral_coherence_score).toBe(33);
  });

  test('GET /claims fraud_score converted to float correctly', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [worker], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'claim-1',
            trigger_type: 'heavy_rainfall',
            trigger_value: '18.2',
            payout_amount: '420',
            disruption_hours: '4',
            fraud_score: '0.45',
            graph_flags: [],
            bcs_score: null,
            status: 'approved',
            notes: null,
            created_at: new Date().toISOString(),
            paid_at: null,
            city: 'Mumbai',
            zone: 'Andheri',
            razorpay_ref: null,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ total_paid_out: '0', claims_this_month: '0', total_paid_count: '0' }],
        rowCount: 1,
      });

    const res = await request(app).get('/claims').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.claims[0].fraud_score).toBeCloseTo(0.45);
  });

  test('GET /claims payout_amount rounded to integer', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [worker], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'claim-1',
            trigger_type: 'heavy_rainfall',
            trigger_value: '18.2',
            payout_amount: '420.7',
            disruption_hours: '4',
            fraud_score: 0.1,
            graph_flags: [],
            bcs_score: null,
            status: 'paid',
            notes: null,
            created_at: new Date().toISOString(),
            paid_at: null,
            city: 'Mumbai',
            zone: 'Andheri',
            razorpay_ref: null,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ total_paid_out: '0', claims_this_month: '0', total_paid_count: '0' }],
        rowCount: 1,
      });

    const res = await request(app).get('/claims').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.claims[0].payout_amount).toBe(421);
  });

  test('GET /claims/:id returns 404 for unknown claim_id', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [worker], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/claims/unknown-claim')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('CLAIM_NOT_FOUND');
  });

  test('GET /claims/:id returns 404 for claim belonging to different worker', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [worker], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/claims/claim-of-another-worker')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  test('GET /claims/:id returns full claim data', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [worker], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'claim-1',
            worker_id: worker.id,
            status: 'paid',
            payout_amount: '500',
            trigger_type: 'heavy_rainfall',
            city: 'Mumbai',
            zone: 'Andheri',
            payout_status: 'paid',
          },
        ],
        rowCount: 1,
      });

    const res = await request(app).get('/claims/claim-1').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('claim-1');
    expect(res.body.status).toBe('paid');
  });
});
