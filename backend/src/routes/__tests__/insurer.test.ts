import request from 'supertest';

jest.mock('../../db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

jest.mock('../../queues', () => ({
  payoutQueue: {
    add: jest.fn(),
  },
  claimCreationQueue: { add: jest.fn() },
  claimValidationQueue: { add: jest.fn() },
  redisConnection: {},
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

import { createApp } from '../../app';
import { issueInsurerToken, issueWorkerToken } from '../../middleware/auth';
import { query } from '../../db';
import { payoutQueue } from '../../queues';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockPayoutQueue = payoutQueue as jest.Mocked<typeof payoutQueue>;

describe('Insurer routes', () => {
  const app = createApp();
  const insurerToken = issueInsurerToken('insurer-1');
  const workerToken = issueWorkerToken('worker-1');

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  test('GET /insurer/dashboard returns 401 without insurer JWT', async () => {
    const res = await request(app).get('/insurer/dashboard');
    expect(res.status).toBe(401);
  });

  test('GET /insurer/dashboard returns 403 with worker JWT (wrong role)', async () => {
    const res = await request(app)
      .get('/insurer/dashboard')
      .set('Authorization', `Bearer ${workerToken}`);
    expect(res.status).toBe(403);
  });

  test('GET /insurer/dashboard returns all stats keys', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '100' }], rowCount: 1 }) // workers
      .mockResolvedValueOnce({ rows: [{ count: '50' }], rowCount: 1 }) // active policies
      .mockResolvedValueOnce({ rows: [{ total: '20000' }], rowCount: 1 }) // payouts
      .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 }) // flagged
      .mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 }) // events
      .mockResolvedValueOnce({ rows: [{ city: 'Mumbai', zone: 'Andheri' }], rowCount: 1 }) // zones
      .mockResolvedValueOnce({ rows: [{ total: '50000' }], rowCount: 1 }) // premiums
      .mockResolvedValueOnce({ rows: [{ cities: '4', zones: '9' }], rowCount: 1 }) // coverage rows
      .mockResolvedValueOnce({ rows: [{ avg: '52' }], rowCount: 1 }); // avg premium

    const res = await request(app)
      .get('/insurer/dashboard')
      .set('Authorization', `Bearer ${insurerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.stats).toHaveProperty('total_workers');
    expect(res.body.stats).toHaveProperty('active_policies');
    expect(res.body.stats).toHaveProperty('payouts_this_month');
    expect(res.body.stats).toHaveProperty('flagged_claims');
    expect(res.body.stats).toHaveProperty('loss_ratio');
    expect(res.body.stats).toHaveProperty('coverage_area');
    expect(res.body.stats).toHaveProperty('average_premium');
  });

  test('GET /insurer/dashboard loss_ratio between 0 and 1', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '100' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: '50' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ total: '12000' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'event-1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ city: 'Mumbai', zone: 'Andheri' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ total: '15000' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ cities: '4', zones: '9' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ avg: '52' }], rowCount: 1 });

    const res = await request(app)
      .get('/insurer/dashboard')
      .set('Authorization', `Bearer ${insurerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.stats.loss_ratio).toBeGreaterThanOrEqual(0);
    expect(res.body.stats.loss_ratio).toBeLessThanOrEqual(1);
  });

  test('POST /insurer/claims/:id/approve returns 404 for non-existent claim', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post('/insurer/claims/claim-404/approve')
      .set('Authorization', `Bearer ${insurerToken}`);

    expect(res.status).toBe(404);
  });

  test('POST /insurer/claims/:id/approve adds ₹20 goodwill bonus for bcs_score < 40', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'claim-1', bcs_score: 20, payout_amount: '500' }],
      rowCount: 1,
    });
    (mockPayoutQueue.add as jest.Mock).mockResolvedValue({ id: 'job-1' });

    const res = await request(app)
      .post('/insurer/claims/claim-1/approve')
      .set('Authorization', `Bearer ${insurerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.payout_amount).toBe(520);
  });

  test('POST /insurer/claims/:id/approve enqueues payout to BullMQ', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'claim-1', bcs_score: 55, payout_amount: '500' }],
      rowCount: 1,
    });
    (mockPayoutQueue.add as jest.Mock).mockResolvedValue({ id: 'job-1' });

    const res = await request(app)
      .post('/insurer/claims/claim-1/approve')
      .set('Authorization', `Bearer ${insurerToken}`);

    expect(res.status).toBe(200);
    expect(mockPayoutQueue.add).toHaveBeenCalledWith('create-payout', {
      claim_id: 'claim-1',
      payout_amount: 500,
    });
  });

  test('POST /insurer/claims/:id/deny updates claim status to denied', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .post('/insurer/claims/claim-1/deny')
      .set('Authorization', `Bearer ${insurerToken}`)
      .send({ reason: 'Manual fraud rejection' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockQuery).toHaveBeenCalled();
  });

  test('POST /insurer/claims/:id/deny does not create payout record', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .post('/insurer/claims/claim-1/deny')
      .set('Authorization', `Bearer ${insurerToken}`)
      .send({ reason: 'Fraud pattern detected' });

    expect(res.status).toBe(200);
    expect(mockPayoutQueue.add).not.toHaveBeenCalled();
  });
});
