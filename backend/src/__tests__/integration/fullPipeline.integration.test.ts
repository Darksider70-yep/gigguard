import { cellToLatLng } from 'h3-js';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { createApp } from '../../app';
import { query } from '../../db';
import { issueInsurerToken, issueWorkerToken } from '../../middleware/auth';
import { premiumService } from '../../services/premiumService';
import { processClaimCreationJob } from '../../workers/claimCreation';
import { processClaimValidationJob } from '../../workers/claimValidation';

const app = createApp();
const ML_BASE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Full Claim Pipeline', () => {
  let workerJWT = '';
  let insurerJWT = '';
  let workerId = '';
  let policyId = '';
  let workerCity = '';
  let workerZone = '';
  let workerLat = 0;
  let workerLng = 0;
  let latestEventId: string | null = null;
  let latestClaimId: string | null = null;
  let createdFixture = false;
  const cleanupEventIds: string[] = [];

  beforeAll(async () => {
    const fixtureWorkerId = randomUUID();
    const fixturePolicyId = randomUUID();
    const fixtureHex = BigInt('0x88608b5495fffff').toString();
    const { weekStart, weekEnd } = premiumService.getWeekBounds();
    const phoneSuffix = Date.now().toString().slice(-10);
    const phoneNumber = `+91${phoneSuffix}`;

    await query(
      `INSERT INTO workers (
         id, name, phone_number, platform, city, zone, avg_daily_earning,
         zone_multiplier, history_multiplier, upi_vpa, home_hex_id, created_at
       ) VALUES (
         $1, 'Integration Worker', $3, 'zomato', 'mumbai', 'Andheri West', 900,
         1.2, 1.0, 'integration@okaxis', $2, NOW()
       )`,
      [fixtureWorkerId, fixtureHex, phoneNumber]
    );

    await query(
      `INSERT INTO policies (
         id, worker_id, zone, coverage_amount, premium_paid, week_start, week_end, status
       ) VALUES ($1, $2, 'Andheri West', 400, 44, $3::date, $4::date, 'active')
      `,
      [fixturePolicyId, fixtureWorkerId, weekStart, weekEnd]
    );

    workerId = fixtureWorkerId;
    policyId = fixturePolicyId;
    workerCity = 'mumbai';
    workerZone = 'Andheri West';
    [workerLat, workerLng] = cellToLatLng(BigInt(fixtureHex).toString(16));
    createdFixture = true;

    workerJWT = issueWorkerToken(workerId);
    insurerJWT = issueInsurerToken('insurer-test');
  });

  afterAll(async () => {
    if (createdFixture) {
      if (cleanupEventIds.length > 0) {
        await query('DELETE FROM disruption_events WHERE id = ANY($1::uuid[])', [cleanupEventIds]);
      }
      await query('DELETE FROM payouts WHERE worker_id = $1', [workerId]);
      await query('DELETE FROM claims WHERE worker_id = $1', [workerId]);
      await query('DELETE FROM policies WHERE id = $1', [policyId]);
      await query('DELETE FROM workers WHERE id = $1', [workerId]);
    }
  });

  test('GET /policies/premium returns valid quote', async () => {
    const res = await request(app)
      .get('/policies/premium')
      .set('Authorization', `Bearer ${workerJWT}`)
      .expect(200);

    expect(res.body.premium).toBeGreaterThan(20);
    expect(res.body.premium).toBeLessThan(200);
    expect(res.body.formula_breakdown.base_rate).toBe(35);
    expect(res.body.coverage.heavy_rainfall).toBeGreaterThan(0);
    expect(res.body.recommended_arm).toBeGreaterThanOrEqual(0);
    expect(res.body.recommended_arm).toBeLessThanOrEqual(3);
  });

  test('GET /policies/active returns correct active policy', async () => {
    const res = await request(app)
      .get('/policies/active')
      .set('Authorization', `Bearer ${workerJWT}`)
      .expect(200);

    expect(res.body.has_active_policy).toBe(true);
    expect(res.body.policy.id).toBe(policyId);
  });

  test('POST /triggers/simulate creates disruption event with H3 ring metadata', async () => {
    const res = await request(app)
      .post('/triggers/simulate')
      .set('Authorization', `Bearer ${insurerJWT}`)
      .send({
        triggerType: 'heavy_rainfall',
        city: workerCity,
        zone: workerZone,
        value: 25.4,
        lat: workerLat,
        lng: workerLng,
      })
      .expect(200);

    expect(res.body).toHaveProperty('event_id');
    expect(res.body.affected_workers).toBeGreaterThanOrEqual(0);
    expect(res.body.hex_ring_size).toBe(7);

    latestEventId = res.body.event_id;
    if (latestEventId) {
      cleanupEventIds.push(latestEventId);
    }
    await sleep(1000);
  });

  test('Claim creation + validation pipeline works on real DB', async () => {
    if (!latestEventId) {
      const zoneKey = BigInt('0x88608b5495fffff').toString();
      const { rows } = await query<{ id: string }>(
        `INSERT INTO disruption_events (
           trigger_type, city, zone, latitude, longitude,
           trigger_value, trigger_threshold, severity,
           disruption_hours, affected_hex_ids, affected_worker_count, affected_workers_count, status
         ) VALUES (
           'heavy_rainfall', 'mumbai', $1, $2, $3,
           25.4, 15, 'severe',
           4, ARRAY[$4::bigint], 1, 1, 'active'
         )
         RETURNING id`,
        [zoneKey, workerLat, workerLng, zoneKey]
      );
      latestEventId = rows[0].id;
      cleanupEventIds.push(latestEventId);
    }

    const disruptionHours = premiumService.getDisruptionHours('heavy_rainfall');
    await processClaimCreationJob({
      disruption_event_id: latestEventId!,
      trigger_type: 'heavy_rainfall',
      disruption_hours: disruptionHours,
      trigger_value: 25.4,
      worker_ids: [workerId],
    });

    const { rows: claims } = await query<{
      id: string;
      status: string;
      payout_amount: string;
    }>(
      `SELECT id, status, payout_amount::text
       FROM claims
       WHERE worker_id = $1
         AND created_at::date = NOW()::date
         AND status != 'denied'
       ORDER BY created_at DESC
       LIMIT 1`,
      [workerId]
    );

    expect(claims.length).toBe(1);
    expect(Number(claims[0].payout_amount)).toBeGreaterThan(0);
    latestClaimId = claims[0].id;

    await processClaimValidationJob({ claim_id: latestClaimId });
    await sleep(500);

    const { rows: scored } = await query<{
      status: string;
      fraud_score: number | null;
      isolation_forest_score: number | null;
    }>(
      `SELECT status, fraud_score, isolation_forest_score
       FROM claims
       WHERE id = $1`,
      [latestClaimId]
    );

    expect(scored.length).toBe(1);
    if (scored[0].fraud_score !== null) {
      expect(Number(scored[0].fraud_score)).toBeGreaterThanOrEqual(0);
      expect(Number(scored[0].fraud_score)).toBeLessThanOrEqual(1);
    }
    expect(['under_review', 'approved', 'paid']).toContain(scored[0].status);
  });

  test('One-claim-per-day rule prevents duplicates', async () => {
    expect(latestEventId).toBeTruthy();

    await processClaimCreationJob({
      disruption_event_id: latestEventId!,
      trigger_type: 'heavy_rainfall',
      disruption_hours: premiumService.getDisruptionHours('heavy_rainfall'),
      trigger_value: 18.0,
      worker_ids: [workerId],
    });

    const { rows } = await query<{ cnt: string }>(
      `SELECT COUNT(*)::text as cnt
       FROM claims
       WHERE worker_id = $1
         AND created_at::date = NOW()::date
         AND status != 'denied'`,
      [workerId]
    );

    expect(parseInt(rows[0].cnt, 10)).toBe(1);
  });

  test('Payout uniqueness constraint prevents duplicate payouts', async () => {
    expect(latestClaimId).toBeTruthy();

    await query('DELETE FROM payouts WHERE claim_id = $1', [latestClaimId]);

    await expect(
      query(
        `INSERT INTO payouts (claim_id, worker_id, amount, upi_vpa, status)
         VALUES ($1, $2, 100, 'test@upi', 'processing')`,
        [latestClaimId, workerId]
      )
    ).resolves.toBeDefined();

    await expect(
      query(
        `INSERT INTO payouts (claim_id, worker_id, amount, upi_vpa, status)
         VALUES ($1, $2, 100, 'test@upi', 'processing')`,
        [latestClaimId, workerId]
      )
    ).rejects.toBeDefined();
  });
});

describe('ML Service Integration', () => {
  test('GET /health shows ML service connected', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body.ml_service).toBe('connected');
  });

  test('Premium calculation uses real ML service', async () => {
    const res = await fetch(`${ML_BASE_URL}/predict-premium`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id: 'test',
        zone_multiplier: 1.4,
        weather_multiplier: 1.2,
        history_multiplier: 0.85,
      }),
    });
    const data = await res.json();
    expect(data.premium).toBeCloseTo(35 * 1.4 * 1.2 * 0.85, 0);
    expect(data.formula_breakdown).toBeDefined();
  });

  test('Fraud scorer returns score in [0,1]', async () => {
    const res = await fetch(`${ML_BASE_URL}/score-fraud`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        claim_id: '00000000-0000-0000-0000-000000000001',
        worker_id: 'test',
        payout_amount: 320,
        claim_freq_30d: 1,
        hours_since_trigger: 0.5,
        zone_multiplier: 1.4,
        platform: 'zomato',
        account_age_days: 180,
      }),
    });
    const data = await res.json();
    expect(data.fraud_score).toBeGreaterThanOrEqual(0);
    expect(data.fraud_score).toBeLessThanOrEqual(1);
    expect([1, 2, 3]).toContain(data.tier);
  });

  test('Bandit recommends valid arm', async () => {
    const res = await fetch(`${ML_BASE_URL}/recommend-tier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id: 'test',
        context: {
          platform: 'zomato',
          city: 'mumbai',
          experience_tier: 'veteran',
          season: 'monsoon',
          zone_risk: 'high',
        },
      }),
    });
    const data = await res.json();
    expect(data.recommended_arm).toBeGreaterThanOrEqual(0);
    expect(data.recommended_arm).toBeLessThanOrEqual(3);
    expect(data.recommended_premium).toBeGreaterThan(0);
  });
});

describe('Insurer Dashboard Integration', () => {
  const insurerJWT = issueInsurerToken('insurer-dashboard-test');

  test('Dashboard returns seeded DB stats', async () => {
    const res = await request(app)
      .get('/insurer/dashboard')
      .set('Authorization', `Bearer ${insurerJWT}`)
      .expect(200);

    expect(res.body.stats.total_workers).toBeGreaterThanOrEqual(100);
    expect(res.body.stats.active_policies).toBeGreaterThan(0);
    expect(res.body.stats.loss_ratio).toBeGreaterThanOrEqual(0);
    expect(res.body.stats.loss_ratio).toBeLessThanOrEqual(1);
    expect(res.body.zone_risk_matrix.length).toBeGreaterThan(0);
  });

  test('Zone risk matrix includes Andheri West H3 pricing data', async () => {
    const res = await request(app)
      .get('/insurer/zone-risk-matrix')
      .set('Authorization', `Bearer ${insurerJWT}`)
      .expect(200);

    const highRisk = res.body.zones.filter((z: any) => z.risk_level === 'High');
    expect(highRisk.length).toBeGreaterThan(0);

    const andheri = res.body.zones.find((z: any) => z.zone === 'Andheri West');
    expect(andheri).toBeDefined();
    expect(andheri.risk_level).toBe('High');
  });
});
