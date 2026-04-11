jest.mock('../../db', () => {
  const query = jest.fn();
  return {
    query,
    withTransaction: jest.fn(),
    pool: { query },
  };
});

jest.mock('../../queues', () => ({
  claimCreationQueue: { add: jest.fn() },
  claimValidationQueue: { add: jest.fn() },
  payoutQueue: { add: jest.fn() },
  redisConnection: {},
}));

jest.mock('../../services/platformVerification', () => ({
  checkPlatformOnlineStatus: jest.fn(),
}));

import { pool } from '../../db';
import { claimCreationQueue } from '../../queues';
import { checkPlatformOnlineStatus } from '../../services/platformVerification';
import { processPandemicTrigger } from '../../triggers/monitor';

const mockPoolQuery = (pool as any).query as jest.Mock;
const mockClaimCreationAdd = (claimCreationQueue as any).add as jest.Mock;
const mockPlatformStatus = checkPlatformOnlineStatus as jest.MockedFunction<
  typeof checkPlatformOnlineStatus
>;

describe('processPandemicTrigger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlatformStatus.mockResolvedValue(true);
    mockClaimCreationAdd.mockResolvedValue({ id: 'job-1' });
  });

  test('queues eligible worker for payout pipeline', async () => {
    const hex = BigInt('617733123505323007');

    mockPoolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM health_advisories')) {
        return {
          rows: [{
            id: 'adv-1',
            district: 'Andheri West',
            state: 'Maharashtra',
            city: 'mumbai',
            boundary_geojson: null,
            affected_hex_ids: [hex.toString()],
            severity: 'containment',
            declared_at: '2026-04-12T08:00:00Z',
            source: 'test',
            nationwide: false,
          }],
          rowCount: 1,
        };
      }

      if (sql.includes('FROM workers w')) {
        return {
          rows: [{
            id: 'worker-1',
            avg_daily_earning: '800',
            home_hex_id: hex.toString(),
            zone_updated_at: '2026-04-01T00:00:00Z',
          }],
          rowCount: 1,
        };
      }

      if (sql.includes('INSERT INTO pandemic_claim_dedup')) {
        return { rows: [], rowCount: 1 };
      }

      if (sql.includes('INSERT INTO disruption_events')) {
        return { rows: [{ id: 'event-1' }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    });

    const affected = await processPandemicTrigger('adv-1');

    expect(affected).toEqual(['worker-1']);
    expect(mockClaimCreationAdd).toHaveBeenCalledWith(
      'create-claims',
      expect.objectContaining({
        disruption_event_id: 'event-1',
        trigger_type: 'pandemic_containment',
        worker_ids: ['worker-1'],
        health_advisory_id: 'adv-1',
      }),
      expect.any(Object)
    );
  });

  test('nationwide advisory is excluded immediately', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{
        id: 'adv-2',
        district: 'All India',
        state: 'India',
        city: 'mumbai',
        boundary_geojson: null,
        affected_hex_ids: [],
        severity: 'containment',
        declared_at: '2026-04-12T08:00:00Z',
        source: 'test',
        nationwide: true,
      }],
      rowCount: 1,
    });

    const affected = await processPandemicTrigger('adv-2');

    expect(affected).toEqual([]);
    expect(mockClaimCreationAdd).not.toHaveBeenCalled();
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
  });

  test('dedup insert conflict skips repeat payout enqueue', async () => {
    const hex = BigInt('617733123505323007');
    let dedupCalls = 0;

    mockPoolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM health_advisories')) {
        return {
          rows: [{
            id: 'adv-3',
            district: 'Andheri West',
            state: 'Maharashtra',
            city: 'mumbai',
            boundary_geojson: null,
            affected_hex_ids: [hex.toString()],
            severity: 'containment',
            declared_at: '2026-04-12T08:00:00Z',
            source: 'test',
            nationwide: false,
          }],
          rowCount: 1,
        };
      }

      if (sql.includes('FROM workers w')) {
        return {
          rows: [{
            id: 'worker-1',
            avg_daily_earning: '800',
            home_hex_id: hex.toString(),
            zone_updated_at: '2026-04-01T00:00:00Z',
          }],
          rowCount: 1,
        };
      }

      if (sql.includes('INSERT INTO pandemic_claim_dedup')) {
        dedupCalls += 1;
        return { rows: [], rowCount: dedupCalls === 1 ? 1 : 0 };
      }

      if (sql.includes('INSERT INTO disruption_events')) {
        return { rows: [{ id: `event-${dedupCalls}` }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    });

    const first = await processPandemicTrigger('adv-3');
    const second = await processPandemicTrigger('adv-3');

    expect(first).toEqual(['worker-1']);
    expect(second).toEqual([]);
    expect(mockClaimCreationAdd).toHaveBeenCalledTimes(1);
  });
});
