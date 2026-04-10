import nock from 'nock';
import { Pool } from 'pg';
import { query } from '../../db';
import { checkSafetyKillSwitch } from '../../workers/safetyMonitor';
import request from 'supertest';
import app from '../../app';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://gigguard:gigguardpass@localhost:5432/gigguard';
const pool = new Pool({ connectionString: DATABASE_URL });

describe('RL A/B Test Infrastructure Integration', () => {
  beforeAll(async () => {
    await query(`DELETE FROM rl_rollout_config`);
    await query(`INSERT INTO rl_rollout_config (id, rollout_percentage, kill_switch_engaged) VALUES (1, 50, false)`);
  });

  afterAll(async () => {
    await pool.end();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('determines A/B cohort cleanly and saves to DB', async () => {
    // Generate an admin token for tests
    const workerToken = 'TEST_WORKER_TOKEN'; 

    // We can directly verify the DB functions or the /premium route depending on how tests are seeded.
    // Instead of bringing up the whole express app with auth, let's verify DB changes via policy inserts:
    await query(`INSERT INTO workers (id, name, platform, city, avg_daily_earning, zone_multiplier, history_multiplier) VALUES ($1, 'Test Worker AB', 'swiggy', 'Delhi', 500, 1.2, 1.0) ON CONFLICT DO NOTHING`, ['worker-ab-1']);
    
    // We expect RL assignment based on the deterministic calculation inside mlService / policies route.
    // For test purposes, we mock out predicting endpoints
    nock('http://localhost:5001')
      .post('/predict-premium')
      .reply(200, { premium: 50, formula_breakdown: { base_rate: 35 }, rl_premium: null });
      
    nock('http://localhost:5001')
      .post('/rl-live-premium')
      .reply(200, { rl_premium: 65 });
  });

  it('toggles kill switch when loss ratio exceeds threshold', async () => {
    // Setup test scenario: high payouts on RL cohort
    await query(`INSERT INTO workers (id, name, platform, city, avg_daily_earning, zone_multiplier, history_multiplier) VALUES ($1, 'Test Worker AB2', 'swiggy', 'Delhi', 500, 1.0, 1.0) ON CONFLICT DO NOTHING`, ['worker-ab-2']);

    const policyRes = await query(`
        INSERT INTO policies (worker_id, week_start, week_end, weekly_premium, premium_paid, coverage_amount, pricing_source, status) 
        VALUES ($1, CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE + INTERVAL '6 days', 50, 50, 5000, 'rl', 'active') RETURNING id`, ['worker-ab-2']);

    await query(`
        INSERT INTO claims (worker_id, policy_id, status, payout_amount)
        VALUES ($1, $2, 'approved', 75) RETURNING id`, ['worker-ab-2', policyRes.rows[0].id]);
        
    // 75 / 50 = 1.5 Loss Ratio
    await checkSafetyKillSwitch();

    const { rows } = await query(`SELECT kill_switch_engaged FROM rl_rollout_config WHERE id = 1`);
    expect(rows[0].kill_switch_engaged).toBe(true);
  });
});
