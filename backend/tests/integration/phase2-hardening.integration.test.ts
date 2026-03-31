import crypto from 'crypto';
import nock from 'nock';
import request from 'supertest';
import { query, pool } from '../../src/db';
import { processPayoutCreationJob } from '../../src/workers/payoutCreation';
import { processClaimCreationJob } from '../../src/workers/claimCreation';
import { premiumService } from '../../src/services/premiumService';
import { issueWorkerToken } from '../../src/middleware/auth';

const TEST_TIMEOUT_MS = 60_000;

function uuid(): string {
  return crypto.randomUUID();
}

function phoneNumber(seed: number): string {
  return `+91${(Date.now() + seed).toString().slice(-10)}`;
}

describe('Phase 2 hardening integration checks', () => {
  jest.setTimeout(TEST_TIMEOUT_MS);

  afterAll(async () => {
    await pool.end();
    nock.cleanAll();
  });

  test('migration 009 is active in DB schema', async () => {
    const column = await query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name='workers'
         AND column_name='hex_is_centroid_fallback'`
    );
    expect(column.rowCount).toBe(1);

    const constraint = await query<{ conname: string }>(
      `SELECT conname
       FROM pg_constraint
       WHERE conname='payouts_claim_id_unique'`
    );
    expect(constraint.rowCount).toBe(1);
  });

  test('DB-level unique constraint blocks duplicate payouts by claim_id', async () => {
    const workerId = uuid();
    const claimId = uuid();
    const payoutA = uuid();
    const payoutB = uuid();

    try {
      await query(
        `INSERT INTO workers (id, name, city, platform, avg_daily_earning, phone_number, upi_vpa)
         VALUES ($1, 'Unique Guard Worker', 'mumbai', 'zomato', 900, $2, 'unique@okaxis')`,
        [workerId, phoneNumber(1)]
      );

      await query(
        `INSERT INTO claims (id, worker_id, status, payout_amount, trigger_type, trigger_value, trigger_threshold, disruption_hours)
         VALUES ($1, $2, 'approved', 300, 'heavy_rainfall', 20, 15, 4)`,
        [claimId, workerId]
      );

      await query(
        `INSERT INTO payouts (id, claim_id, worker_id, amount, upi_vpa, status)
         VALUES ($1, $2, $3, 300, 'unique@okaxis', 'processing')`,
        [payoutA, claimId, workerId]
      );

      await expect(
        query(
          `INSERT INTO payouts (id, claim_id, worker_id, amount, upi_vpa, status)
           VALUES ($1, $2, $3, 300, 'unique@okaxis', 'processing')`,
          [payoutB, claimId, workerId]
        )
      ).rejects.toMatchObject({ code: '23505' });
    } finally {
      await query(`DELETE FROM payouts WHERE id = ANY($1::uuid[])`, [[payoutA, payoutB]]);
      await query(`DELETE FROM claims WHERE id = $1`, [claimId]);
      await query(`DELETE FROM workers WHERE id = $1`, [workerId]);
    }
  });

  test('processPayoutCreationJob skips when payout is already processing', async () => {
    const workerId = uuid();
    const claimId = uuid();
    const existingPayoutId = uuid();

    try {
      await query(
        `INSERT INTO workers (id, name, city, platform, avg_daily_earning, phone_number, upi_vpa)
         VALUES ($1, 'Payout Guard Worker', 'mumbai', 'zomato', 1000, $2, 'guard@okaxis')`,
        [workerId, phoneNumber(2)]
      );

      await query(
        `INSERT INTO claims (id, worker_id, status, payout_amount, trigger_type, trigger_value, trigger_threshold, disruption_hours)
         VALUES ($1, $2, 'approved', 500, 'heavy_rainfall', 20, 15, 4)`,
        [claimId, workerId]
      );

      await query(
        `INSERT INTO payouts (id, claim_id, worker_id, amount, upi_vpa, status)
         VALUES ($1, $2, $3, 500, 'guard@okaxis', 'processing')`,
        [existingPayoutId, claimId, workerId]
      );

      const result = await processPayoutCreationJob({ claim_id: claimId });
      expect(result).toEqual({
        skipped: true,
        reason: 'duplicate',
        existing_payout_id: existingPayoutId,
      });

      const rows = await query<{ id: string }>(
        `SELECT id FROM payouts WHERE claim_id = $1`,
        [claimId]
      );
      expect(rows.rowCount).toBe(1);
    } finally {
      await query(`DELETE FROM payouts WHERE claim_id = $1`, [claimId]);
      await query(`DELETE FROM claims WHERE id = $1`, [claimId]);
      await query(`DELETE FROM workers WHERE id = $1`, [workerId]);
    }
  });

  test('claim upgrade is blocked when payout is already processing', async () => {
    const workerId = uuid();
    const policyId = uuid();
    const claimId = uuid();
    const payoutId = uuid();
    const disruptionEventId = uuid();
    const { weekStart, weekEnd } = premiumService.getWeekBounds();

    try {
      await query(
        `INSERT INTO workers (id, name, city, zone, platform, avg_daily_earning, phone_number, upi_vpa)
         VALUES ($1, 'Upgrade Lock Worker', 'mumbai', 'Andheri West', 'zomato', 1000, $2, 'upgrade@okaxis')`,
        [workerId, phoneNumber(3)]
      );

      await query(
        `INSERT INTO policies (id, worker_id, zone, coverage_amount, premium_paid, week_start, week_end, status)
         VALUES ($1, $2, 'Andheri West', 400, 40, $3::date, $4::date, 'active')`,
        [policyId, workerId, weekStart, weekEnd]
      );

      await query(
        `INSERT INTO claims (id, worker_id, policy_id, status, payout_amount, trigger_type, trigger_value, trigger_threshold, disruption_hours)
         VALUES ($1, $2, $3, 'approved', 50, 'heavy_rainfall', 20, 15, 4)`,
        [claimId, workerId, policyId]
      );

      await query(
        `INSERT INTO payouts (id, claim_id, worker_id, amount, upi_vpa, status)
         VALUES ($1, $2, $3, 50, 'upgrade@okaxis', 'processing')`,
        [payoutId, claimId, workerId]
      );

      const result = await processClaimCreationJob({
        disruption_event_id: disruptionEventId,
        trigger_type: 'flood_alert',
        disruption_hours: 8,
        trigger_value: 1,
        worker_ids: [workerId],
      });

      expect(result.claims_created).toBe(0);

      const claim = await query<{ status: string; payout_amount: string }>(
        `SELECT status, payout_amount::text
         FROM claims
         WHERE id = $1`,
        [claimId]
      );

      expect(claim.rows[0]?.status).toBe('approved');
      expect(claim.rows[0]?.payout_amount).toBe('50.00');
    } finally {
      await query(`DELETE FROM payouts WHERE id = $1`, [payoutId]);
      await query(`DELETE FROM claims WHERE id = $1`, [claimId]);
      await query(`DELETE FROM policies WHERE id = $1`, [policyId]);
      await query(`DELETE FROM workers WHERE id = $1`, [workerId]);
    }
  });

  test('hex backfill updates centroid workers when geocoding succeeds', async () => {
    const workerId = uuid();
    const oldMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';

    try {
      await query(
        `INSERT INTO workers (id, name, city, zone, platform, avg_daily_earning, phone_number, home_hex_id, hex_is_centroid_fallback)
         VALUES ($1, 'Backfill Worker', 'mumbai', 'Andheri West', 'zomato', 900, $2, 617700169958293503, TRUE)`,
        [workerId, phoneNumber(4)]
      );

      nock('https://maps.googleapis.com')
        .get('/maps/api/geocode/json')
        .query(true)
        .reply(200, {
          status: 'OK',
          results: [{ geometry: { location: { lat: 19.1136, lng: 72.8697 } } }],
        });

      jest.resetModules();
      const { backfillCentroidWorkers } = await import('../../src/jobs/hexBackfillJob');
      await backfillCentroidWorkers();

      const worker = await query<{ hex_is_centroid_fallback: boolean; home_hex_id: string }>(
        `SELECT hex_is_centroid_fallback, home_hex_id::text
         FROM workers
         WHERE id = $1`,
        [workerId]
      );

      expect(worker.rows[0]?.hex_is_centroid_fallback).toBe(false);
      expect(worker.rows[0]?.home_hex_id).toBeTruthy();
    } finally {
      process.env.GOOGLE_MAPS_API_KEY = oldMapsApiKey;
      nock.cleanAll();
      await query(`DELETE FROM workers WHERE id = $1`, [workerId]);
    }
  });

  test('bandit update route enforces JWT and still reaches ML service with auth', async () => {
    const workerId = uuid();

    try {
      await query(
        `INSERT INTO workers (id, name, city, zone, platform, avg_daily_earning, phone_number, upi_vpa)
         VALUES ($1, 'Bandit Route Worker', 'mumbai', 'Andheri West', 'zomato', 950, $2, 'bandit@okaxis')`,
        [workerId, phoneNumber(5)]
      );

      const { createApp } = await import('../../src/app');
      const app = createApp();
      const token = issueWorkerToken(workerId);

      const unauth = await request(app)
        .post('/policies/bandit-update')
        .send({ context_key: 'zomato_mumbai_mid_monsoon_medium', arm: 1, reward: 1 });

      expect(unauth.status).toBe(401);

      const auth = await request(app)
        .post('/policies/bandit-update')
        .set('Authorization', `Bearer ${token}`)
        .send({ context_key: 'zomato_mumbai_mid_monsoon_medium', arm: 1, reward: 1 });

      expect(auth.status).toBe(200);
      expect(typeof auth.body.success).toBe('boolean');
      expect(['updated', 'unavailable']).toContain(auth.body.ml_service);
    } finally {
      await query(`DELETE FROM workers WHERE id = $1`, [workerId]);
    }
  });
});

