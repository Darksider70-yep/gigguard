import crypto from 'crypto';
import request from 'supertest';
import { latLngToCell } from 'h3-js';

process.env.NODE_ENV = 'test';
process.env.HEALTH_WEBHOOK_SECRET = '0123456789abcdef0123456789abcdef';
process.env.FEATURE_PANDEMIC_TRIGGER_ENABLED = 'true';

jest.mock('../../src/db', () => {
  const query = jest.fn();
  return {
    query,
    withTransaction: jest.fn(),
    pool: { query },
  };
});

jest.mock('../../src/triggers/monitor', () => ({
  processPandemicTrigger: jest.fn(),
}));

import { createApp } from '../../src/app';
import { pool } from '../../src/db';
import { processPandemicTrigger } from '../../src/triggers/monitor';
import {
  computeAffectedHexIds,
  isWorkerInContainmentZone,
} from '../../src/triggers/pandemicHexOverlap';

const app = createApp();
const mockPoolQuery = (pool as any).query as jest.Mock;
const mockProcessPandemicTrigger = processPandemicTrigger as jest.MockedFunction<
  typeof processPandemicTrigger
>;

const ANDHERI_POLYGON = {
  type: 'Polygon' as const,
  coordinates: [[
    [72.83, 19.11],
    [72.84, 19.11],
    [72.84, 19.12],
    [72.83, 19.12],
    [72.83, 19.11],
  ]],
};

function signPayload(payload: object): string {
  return crypto
    .createHmac('sha256', process.env.HEALTH_WEBHOOK_SECRET!)
    .update(JSON.stringify(payload))
    .digest('hex');
}

describe('Pandemic Trigger - H3 polygon overlap', () => {
  test('computeAffectedHexIds returns non-empty output for valid polygon', () => {
    const ids = computeAffectedHexIds(ANDHERI_POLYGON);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThan(40);
  });

  test('isWorkerInContainmentZone identifies inside/outside workers', () => {
    const affected = computeAffectedHexIds(ANDHERI_POLYGON);
    const inside = BigInt(`0x${latLngToCell(19.115, 72.835, 8)}`);
    const outside = BigInt(`0x${latLngToCell(19.054, 72.826, 8)}`);

    expect(isWorkerInContainmentZone(inside, affected)).toBe(true);
    expect(isWorkerInContainmentZone(outside, affected)).toBe(false);
  });
});

describe('Pandemic Trigger - /webhooks/health-emergency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FEATURE_PANDEMIC_TRIGGER_ENABLED = 'true';
    mockProcessPandemicTrigger.mockResolvedValue(['worker-1', 'worker-2']);
  });

  const validPayload = {
    event_type: 'containment_zone_declared',
    source: 'mohfw_webhook',
    district: 'Andheri West',
    state: 'Maharashtra',
    city: 'mumbai',
    severity: 'containment',
    nationwide: false,
    declared_at: '2026-04-12T08:00:00Z',
    lifted_at: null,
    boundary_geojson: ANDHERI_POLYGON,
    metadata: { notification_number: 'TEST-001' },
  };

  test('valid webhook returns 201 and triggers payout processing', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'adv-1' }], rowCount: 1 });
    const sig = signPayload(validPayload);

    const res = await request(app)
      .post('/webhooks/health-emergency')
      .set('Content-Type', 'application/json')
      .set('X-GigGuard-Signature', sig)
      .send(JSON.stringify(validPayload));

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.payout_triggered).toBe(true);
    expect(mockProcessPandemicTrigger).toHaveBeenCalledWith('adv-1');
  });

  test('missing signature returns 401', async () => {
    const res = await request(app)
      .post('/webhooks/health-emergency')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(validPayload));

    expect(res.status).toBe(401);
  });

  test('invalid signature returns 401', async () => {
    const res = await request(app)
      .post('/webhooks/health-emergency')
      .set('Content-Type', 'application/json')
      .set('X-GigGuard-Signature', 'deadbeef')
      .send(JSON.stringify(validPayload));

    expect(res.status).toBe(401);
  });

  test('nationwide=true records advisory but does not trigger payouts', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'adv-2' }], rowCount: 1 });
    const payload = { ...validPayload, nationwide: true };
    const sig = signPayload(payload);

    const res = await request(app)
      .post('/webhooks/health-emergency')
      .set('Content-Type', 'application/json')
      .set('X-GigGuard-Signature', sig)
      .send(JSON.stringify(payload));

    expect(res.status).toBe(201);
    expect(res.body.payout_triggered).toBe(false);
    expect(res.body.affected_workers_count).toBe(0);
    expect(mockProcessPandemicTrigger).not.toHaveBeenCalled();
  });

  test('duplicate webhook returns 200 duplicate_ignored', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const sig = signPayload(validPayload);

    const res = await request(app)
      .post('/webhooks/health-emergency')
      .set('Content-Type', 'application/json')
      .set('X-GigGuard-Signature', sig)
      .send(JSON.stringify(validPayload));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('duplicate_ignored');
  });

  test('advisory_lifted updates advisory and returns 200', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const payload = {
      event_type: 'advisory_lifted',
      source: 'mohfw_webhook',
      district: 'Andheri West',
      state: 'Maharashtra',
      city: 'mumbai',
      severity: 'containment',
      lifted_at: '2026-04-14T18:00:00Z',
    };
    const sig = signPayload(payload);

    const res = await request(app)
      .post('/webhooks/health-emergency')
      .set('Content-Type', 'application/json')
      .set('X-GigGuard-Signature', sig)
      .send(JSON.stringify(payload));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('lifted');
  });

  test('watch severity stores advisory without payout', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'adv-3' }], rowCount: 1 });
    const payload = {
      ...validPayload,
      severity: 'watch',
      event_type: 'watch_issued',
      declared_at: '2026-04-13T08:00:00Z',
    };
    const sig = signPayload(payload);

    const res = await request(app)
      .post('/webhooks/health-emergency')
      .set('Content-Type', 'application/json')
      .set('X-GigGuard-Signature', sig)
      .send(JSON.stringify(payload));

    expect(res.status).toBe(201);
    expect(res.body.payout_triggered).toBe(false);
    expect(mockProcessPandemicTrigger).not.toHaveBeenCalled();
  });

  test('feature flag disabled short-circuits payout processing', async () => {
    process.env.FEATURE_PANDEMIC_TRIGGER_ENABLED = 'false';
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'adv-4' }], rowCount: 1 });
    const sig = signPayload(validPayload);

    const res = await request(app)
      .post('/webhooks/health-emergency')
      .set('Content-Type', 'application/json')
      .set('X-GigGuard-Signature', sig)
      .send(JSON.stringify(validPayload));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('feature_disabled');
    expect(mockProcessPandemicTrigger).not.toHaveBeenCalled();
  });
});
