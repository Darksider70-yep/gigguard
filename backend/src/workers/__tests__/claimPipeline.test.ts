jest.mock('../../db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

jest.mock('../../queues', () => ({
  claimCreationQueue: { add: jest.fn() },
  claimValidationQueue: { add: jest.fn() },
  payoutQueue: { add: jest.fn() },
  redisConnection: {},
}));

jest.mock('../../services/mlService', () => ({
  mlService: {
    scoreFraud: jest.fn(),
    predictPremium: jest.fn(),
    recommendTier: jest.fn(),
    updateBandit: jest.fn(),
    getShadowComparison: jest.fn(),
  },
}));

jest.mock('../../services/razorpayService', () => ({
  razorpayService: {
    createPayout: jest.fn(),
    createOrder: jest.fn(),
    verifyPaymentSignature: jest.fn(),
    verifyWebhookSignature: jest.fn(),
  },
}));

import { query, withTransaction } from '../../db';
import { claimValidationQueue, payoutQueue } from '../../queues';
import { mlService } from '../../services/mlService';
import { razorpayService } from '../../services/razorpayService';
import { processClaimCreationJob } from '../claimCreation';
import { processClaimValidationJob } from '../claimValidation';
import { processPayoutCreationJob } from '../payoutCreation';
import { config } from '../../config';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockWithTransaction = withTransaction as jest.MockedFunction<typeof withTransaction>;
const mockClaimValidationQueue = claimValidationQueue as jest.Mocked<typeof claimValidationQueue>;
const mockPayoutQueue = payoutQueue as jest.Mocked<typeof payoutQueue>;
const mockMlService = mlService as jest.Mocked<typeof mlService>;
const mockRazorpayService = razorpayService as jest.Mocked<typeof razorpayService>;

describe('Claim pipeline workers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe('claimCreation worker', () => {
    test('skips worker with no active policy', async () => {
      mockWithTransaction.mockImplementation(async (fn: any) => {
        const client = {
          query: jest.fn().mockImplementation((sql: string) => {
            if (sql.includes('FROM policies')) {
              return Promise.resolve({ rows: [], rowCount: 0 });
            }
            return Promise.resolve({ rows: [], rowCount: 0 });
          }),
        };
        return fn(client);
      });

      const result = await processClaimCreationJob({
        disruption_event_id: 'event-1',
        trigger_type: 'heavy_rainfall',
        disruption_hours: 4,
        trigger_value: 18,
        worker_ids: ['worker-1'],
      });

      expect(result.claims_created).toBe(0);
      expect(mockClaimValidationQueue.add).not.toHaveBeenCalled();
    });

    test('enforces one-claim-per-day rule', async () => {
      mockWithTransaction.mockImplementation(async (fn: any) => {
        const client = {
          query: jest.fn().mockImplementation((sql: string) => {
            if (sql.includes('FROM policies')) {
              return Promise.resolve({
                rows: [{ id: 'policy-1', avg_daily_earning: '1000' }],
                rowCount: 1,
              });
            }
            if (sql.includes('FROM claims')) {
              return Promise.resolve({
                rows: [{ id: 'claim-1', payout_amount: '400', status: 'approved' }],
                rowCount: 1,
              });
            }
            return Promise.resolve({ rows: [], rowCount: 0 });
          }),
        };
        return fn(client);
      });

      const result = await processClaimCreationJob({
        disruption_event_id: 'event-1',
        trigger_type: 'heavy_rainfall',
        disruption_hours: 4,
        trigger_value: 18,
        worker_ids: ['worker-1'],
      });

      expect(result.claims_created).toBe(0);
      expect(mockClaimValidationQueue.add).not.toHaveBeenCalled();
    });

    test('blocks same-day upgrade when payout already processing', async () => {
      mockWithTransaction.mockImplementation(async (fn: any) => {
        const client = {
          query: jest.fn().mockImplementation((sql: string) => {
            if (sql.includes('FROM policies')) {
              return Promise.resolve({
                rows: [{ id: 'policy-1', avg_daily_earning: '1000' }],
                rowCount: 1,
              });
            }
            if (sql.includes('SELECT id, payout_amount::text, status') && sql.includes('FROM claims')) {
              return Promise.resolve({
                rows: [{ id: 'claim-1', payout_amount: '320', status: 'approved' }],
                rowCount: 1,
              });
            }
            if (sql.includes('FROM payouts') && sql.includes("status IN ('processing', 'paid')")) {
              return Promise.resolve({
                rows: [{ status: 'processing' }],
                rowCount: 1,
              });
            }
            return Promise.resolve({ rows: [], rowCount: 0 });
          }),
        };
        return fn(client);
      });

      const result = await processClaimCreationJob({
        disruption_event_id: 'event-1',
        trigger_type: 'flood_alert',
        disruption_hours: 8,
        trigger_value: 1,
        worker_ids: ['worker-1'],
      });

      expect(result.claims_created).toBe(0);
      expect(mockClaimValidationQueue.add).not.toHaveBeenCalled();
    });

    test('calculates payout_amount correctly per trigger type', async () => {
      let insertParams: any[] | null = null;
      mockWithTransaction.mockImplementation(async (fn: any) => {
        const client = {
          query: jest.fn().mockImplementation((sql: string, params: any[]) => {
            if (sql.includes('FROM policies')) {
              return Promise.resolve({
                rows: [{ id: 'policy-1', avg_daily_earning: '1000' }],
                rowCount: 1,
              });
            }
            if (sql.includes('FROM claims')) {
              return Promise.resolve({ rows: [], rowCount: 0 });
            }
            if (sql.includes('INSERT INTO claims')) {
              insertParams = params;
              return Promise.resolve({ rows: [{ id: 'claim-1' }], rowCount: 1 });
            }
            return Promise.resolve({ rows: [], rowCount: 0 });
          }),
        };
        return fn(client);
      });

      const result = await processClaimCreationJob({
        disruption_event_id: 'event-1',
        trigger_type: 'heavy_rainfall',
        disruption_hours: 4,
        trigger_value: 18,
        worker_ids: ['worker-1'],
      });

      expect(result.claims_created).toBe(1);
      expect(insertParams?.[7]).toBe(400);
    });

    test('inserts claim with status=\'triggered\'', async () => {
      const clientQuery = jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM policies')) {
          return Promise.resolve({
            rows: [{ id: 'policy-1', avg_daily_earning: '1000' }],
            rowCount: 1,
          });
        }
        if (sql.includes('FROM claims')) {
          return Promise.resolve({ rows: [], rowCount: 0 });
        }
        if (sql.includes('INSERT INTO claims')) {
          return Promise.resolve({ rows: [{ id: 'claim-1' }], rowCount: 1 });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });
      mockWithTransaction.mockImplementation(async (fn: any) => fn({ query: clientQuery }));

      await processClaimCreationJob({
        disruption_event_id: 'event-1',
        trigger_type: 'heavy_rainfall',
        disruption_hours: 4,
        trigger_value: 18,
        worker_ids: ['worker-1'],
      });

      const insertCall = clientQuery.mock.calls.find(([sql]) =>
        String(sql).includes('INSERT INTO claims')
      );
      expect(insertCall).toBeDefined();
      expect(String(insertCall?.[0])).toContain("'triggered'");
    });

    test('enqueues to claim-validation queue', async () => {
      mockWithTransaction.mockImplementation(async (fn: any) => {
        const client = {
          query: jest.fn().mockImplementation((sql: string) => {
            if (sql.includes('FROM policies')) {
              return Promise.resolve({
                rows: [{ id: 'policy-1', avg_daily_earning: '1000' }],
                rowCount: 1,
              });
            }
            if (sql.includes('FROM claims')) {
              return Promise.resolve({ rows: [], rowCount: 0 });
            }
            if (sql.includes('INSERT INTO claims')) {
              return Promise.resolve({ rows: [{ id: 'claim-1' }], rowCount: 1 });
            }
            return Promise.resolve({ rows: [], rowCount: 0 });
          }),
        };
        return fn(client);
      });

      await processClaimCreationJob({
        disruption_event_id: 'event-1',
        trigger_type: 'heavy_rainfall',
        disruption_hours: 4,
        trigger_value: 18,
        worker_ids: ['worker-1'],
      });

      expect(mockClaimValidationQueue.add).toHaveBeenCalledWith(
        'validate-claim',
        { claim_id: 'claim-1' },
        expect.any(Object)
      );
    });
  });

  describe('claimValidation worker', () => {
    test('calls ML service scoreFraud', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT c.*, w.zone_multiplier')) {
          return {
            rows: [
              {
                id: 'claim-1',
                worker_id: 'worker-1',
                payout_amount: '500',
                created_at: new Date().toISOString(),
                zone_multiplier: 1.1,
                platform: 'zomato',
                worker_created_at: new Date('2025-01-01').toISOString(),
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes('COUNT(*)::text as cnt')) {
          return { rows: [{ cnt: '1' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });
      mockMlService.scoreFraud.mockResolvedValue({
        fraud_score: 0.2,
        gnn_fraud_score: null,
        graph_flags: [],
        tier: 1,
        flagged: false,
        scorer: 'iforest',
      });
      (mockPayoutQueue.add as jest.Mock).mockResolvedValue({ id: 'job-1' });

      await processClaimValidationJob({ claim_id: 'claim-1' });
      expect(mockMlService.scoreFraud).toHaveBeenCalled();
    });

    test('tier 1 (< 0.30): sets status=\'approved\', enqueues payout', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT c.*, w.zone_multiplier')) {
          return {
            rows: [
              {
                id: 'claim-1',
                worker_id: 'worker-1',
                payout_amount: '500',
                created_at: new Date().toISOString(),
                zone_multiplier: 1.1,
                platform: 'zomato',
                worker_created_at: new Date('2025-01-01').toISOString(),
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes('COUNT(*)::text as cnt')) {
          return { rows: [{ cnt: '1' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });
      mockMlService.scoreFraud.mockResolvedValue({
        fraud_score: 0.29,
        gnn_fraud_score: null,
        graph_flags: [],
        tier: 1,
        flagged: false,
        scorer: 'iforest',
      });
      (mockPayoutQueue.add as jest.Mock).mockResolvedValue({ id: 'job-1' });

      await processClaimValidationJob({ claim_id: 'claim-1' });

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("SET status='approved'"), [
        'claim-1',
      ]);
      expect(mockPayoutQueue.add).toHaveBeenCalledWith(
        'create-payout',
        { claim_id: 'claim-1' },
        expect.any(Object)
      );
    });

    test('tier 3 (> 0.65): sets status=\'under_review\', no payout enqueued', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT c.*, w.zone_multiplier')) {
          return {
            rows: [
              {
                id: 'claim-1',
                worker_id: 'worker-1',
                payout_amount: '500',
                created_at: new Date().toISOString(),
                zone_multiplier: 1.1,
                platform: 'zomato',
                worker_created_at: new Date('2025-01-01').toISOString(),
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes('COUNT(*)::text as cnt')) {
          return { rows: [{ cnt: '1' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });
      mockMlService.scoreFraud.mockResolvedValue({
        fraud_score: 0.8,
        gnn_fraud_score: 0.6,
        graph_flags: ['cell_tower_mismatch'],
        tier: 3,
        flagged: true,
        scorer: 'gnn',
      });

      await processClaimValidationJob({ claim_id: 'claim-1' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET status='under_review'"),
        expect.any(Array)
      );
      expect(mockPayoutQueue.add).not.toHaveBeenCalled();
    });

    test('uses safe default (0.0) when ML service times out', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT c.*, w.zone_multiplier')) {
          return {
            rows: [
              {
                id: 'claim-1',
                worker_id: 'worker-1',
                payout_amount: '500',
                created_at: new Date().toISOString(),
                zone_multiplier: 1.1,
                platform: 'zomato',
                worker_created_at: new Date('2025-01-01').toISOString(),
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes('COUNT(*)::text as cnt')) {
          return { rows: [{ cnt: '1' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });
      mockMlService.scoreFraud.mockResolvedValue({
        fraud_score: 0.0,
        gnn_fraud_score: null,
        graph_flags: [],
        tier: 1,
        flagged: false,
        scorer: 'fallback_default',
      });
      (mockPayoutQueue.add as jest.Mock).mockResolvedValue({ id: 'job-1' });

      await processClaimValidationJob({ claim_id: 'claim-1' });

      const fraudUpdateCall = mockQuery.mock.calls.find(([sql]) =>
        String(sql).includes('SET fraud_score=$1')
      );
      expect(fraudUpdateCall?.[1]?.[0]).toBe(0);
    });
  });

  describe('payoutCreation worker', () => {
    beforeEach(() => {
      (config as any).USE_MOCK_PAYOUT = true;
      mockRazorpayService.createPayout.mockResolvedValue({
        payout_id: 'pay_mock_1',
        status: 'processed',
      });
    });

    test('creates payout row with status=\'processing\' when no existing payout', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM claims c') && sql.includes("c.status='approved'")) {
          return {
            rows: [
              {
                payout_amount: '500',
                worker_id: 'worker-1',
                upi_vpa: 'worker@okaxis',
                worker_name: 'Worker',
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM payouts') && sql.includes('WHERE claim_id=$1')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('INSERT INTO payouts')) {
          return { rows: [{ id: 'payout-1' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      await processPayoutCreationJob({ claim_id: 'claim-1' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO payouts (claim_id, worker_id, amount, upi_vpa, status)"),
        expect.any(Array)
      );
    });

    test('in mock mode: updates claim to \'paid\' immediately', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM claims c') && sql.includes("c.status='approved'")) {
          return {
            rows: [
              {
                payout_amount: '500',
                worker_id: 'worker-1',
                upi_vpa: 'worker@okaxis',
                worker_name: 'Worker',
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM payouts') && sql.includes('WHERE claim_id=$1')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes('INSERT INTO payouts')) {
          return { rows: [{ id: 'payout-1' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      await processPayoutCreationJob({ claim_id: 'claim-1' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE claims"),
        ['claim-1']
      );
    });

    test('skips if claim not in \'approved\' status', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM claims c') && sql.includes("c.status='approved'")) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      });

      await processPayoutCreationJob({ claim_id: 'claim-1' });

      expect(mockRazorpayService.createPayout).not.toHaveBeenCalled();
    });

    test('logs error and returns if worker has no upi_vpa', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM claims c') && sql.includes("c.status='approved'")) {
          return {
            rows: [
              {
                payout_amount: '500',
                worker_id: 'worker-1',
                upi_vpa: null,
                worker_name: 'Worker',
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      });

      await processPayoutCreationJob({ claim_id: 'claim-1' });

      expect(errorSpy).toHaveBeenCalled();
      expect(mockRazorpayService.createPayout).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    test('skips duplicate payout when existing payout is processing', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM claims c') && sql.includes("c.status='approved'")) {
          return {
            rows: [
              {
                payout_amount: '500',
                worker_id: 'worker-1',
                upi_vpa: 'worker@okaxis',
                worker_name: 'Worker',
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes('FROM payouts') && sql.includes('WHERE claim_id=$1')) {
          return { rows: [{ id: 'payout-existing', status: 'processing' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await processPayoutCreationJob({ claim_id: 'claim-1' });
      expect(result).toEqual({
        skipped: true,
        reason: 'duplicate',
        existing_payout_id: 'payout-existing',
      });
      expect(mockRazorpayService.createPayout).not.toHaveBeenCalled();
    });
  });
});
