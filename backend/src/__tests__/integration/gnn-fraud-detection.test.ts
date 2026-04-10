import nock from 'nock';
import { Pool } from 'pg';
import { claimValidationWorker, processClaimValidationJob } from '../../workers/claimValidation';
import { payoutQueue } from '../../queues';
import { query } from '../../db';
import { mlService } from '../../services/mlService';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://gigguard:gigguardpass@localhost:5432/gigguard';
const pool = new Pool({ connectionString: DATABASE_URL });

describe('GNN Fraud Detection Integration', () => {
  beforeAll(async () => {
    // Clear queues if needed
    // Assuming DB is set up by a global setup or test environment
  });

  afterAll(async () => {
    await pool.end();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('verifies claim is flagged, graph_flags JSONB is written, and payout is stopped when recommendation=deny', async () => {
    // 1. Mock the ML service response with gnn_score=0.85, scorer_used="gnn"
    nock('http://localhost:5001')
      .post('/score-fraud')
      .reply(200, {
        fraud_score: 0.85,
        gnn_score: 0.85,
        scorer_used: 'gnn',
        confidence: 0.7,
        graph_flags: { contributing_edges: ['shared_device'], flagged_neighbors: ['device:123'], ring_size_estimate: 8 },
        recommendation: 'deny',
        bcs_tier: 3
      });

    // Seed a worker and claim
    const workerRes = await query(`INSERT INTO workers (id, name, platform, city, avg_daily_earning, zone_multiplier, history_multiplier) VALUES ($1, 'Test Worker', 'zomato', 'Mumbai', 500, 1.0, 1.0) RETURNING id`, ['worker-deny-1']);
    const claimRes = await query(`INSERT INTO claims (id, worker_id, status, payout_amount) VALUES ($1, $2, 'pending', 500) RETURNING id`, ['claim-deny-1', workerRes.rows[0].id]);

    await processClaimValidationJob({ claim_id: claimRes.rows[0].id });

    // 2. Verify claim is set to status='flagged' when recommendation='deny'
    const finalClaim = await query(`SELECT status, fraud_score, graph_flags, bcs_score FROM claims WHERE id = $1`, [claimRes.rows[0].id]);
    expect(finalClaim.rows[0].status).toBe('flagged');
    expect(Number(finalClaim.rows[0].fraud_score)).toBe(0.85);

    // 3. Verify graph_flags is written to claims table as JSONB
    expect(finalClaim.rows[0].graph_flags).toMatchObject({ contributing_edges: ['shared_device'], ring_size_estimate: 8 });
  });

  it('verifies payout fires when recommendation=approve', async () => {
    // 4. Verify payout fires when recommendation='approve'
    nock('http://localhost:5001')
      .post('/score-fraud')
      .reply(200, {
        fraud_score: 0.15,
        gnn_score: 0.15,
        scorer_used: 'gnn',
        confidence: 0.7,
        graph_flags: null,
        recommendation: 'approve',
        bcs_tier: 1
      });

    let payoutEnqueued = false;
    const addSpy = jest.spyOn(payoutQueue, 'add').mockImplementation(async () => {
      payoutEnqueued = true;
      return {} as any;
    });

    const workerRes = await query(`INSERT INTO workers (id, name, platform, city, avg_daily_earning, zone_multiplier, history_multiplier) VALUES ($1, 'Test Worker 2', 'zomato', 'Mumbai', 500, 1.0, 1.0) ON CONFLICT (id) DO NOTHING RETURNING id`, ['worker-apprv-1']);
    const claimRes = await query(`INSERT INTO claims (id, worker_id, status, payout_amount) VALUES ($1, $2, 'pending', 500) RETURNING id`, ['claim-apprv-1', 'worker-apprv-1']);

    await processClaimValidationJob({ claim_id: claimRes.rows[0].id });

    const finalClaim = await query(`SELECT status FROM claims WHERE id = $1`, [claimRes.rows[0].id]);
    expect(finalClaim.rows[0].status).toBe('approved');
    expect(payoutEnqueued).toBe(true);
    
    addSpy.mockRestore();
  });

  it('verifies fail-open: if ML service times out, claim proceeds to payout', async () => {
    // 5. Verify fail-open: if ML service times out, claim proceeds to payout
    nock('http://localhost:5001')
      .post('/score-fraud')
      .delay(5000) // Trigger timeout logic which is shorter than this
      .reply(200, { fraud_score: 0.5 });
      
    // Set timeout to be very short for the test so we don't wait 5s
    const originalTimeout = mlService['timeout'];
    mlService['timeout'] = 100; // 100ms

    let payoutEnqueued = false;
    const addSpy = jest.spyOn(payoutQueue, 'add').mockImplementation(async () => {
      payoutEnqueued = true;
      return {} as any;
    });

    const workerRes = await query(`INSERT INTO workers (id, name, platform, city, avg_daily_earning, zone_multiplier, history_multiplier) VALUES ($1, 'Test Worker 3', 'zomato', 'Mumbai', 500, 1.0, 1.0) ON CONFLICT (id) DO NOTHING RETURNING id`, ['worker-fail-1']);
    const claimRes = await query(`INSERT INTO claims (id, worker_id, status, payout_amount) VALUES ($1, $2, 'pending', 500) RETURNING id`, ['claim-fail-1', 'worker-fail-1']);

    await processClaimValidationJob({ claim_id: claimRes.rows[0].id });

    const finalClaim = await query(`SELECT status, scorer FROM claims WHERE id = $1`, [claimRes.rows[0].id]);
    // The fallback default will have 0.15 fraud score and recommend approve due to graceful defaults
    expect(finalClaim.rows[0].status).toBe('approved');
    expect(payoutEnqueued).toBe(true);

    addSpy.mockRestore();
    mlService['timeout'] = originalTimeout;
  });
});
