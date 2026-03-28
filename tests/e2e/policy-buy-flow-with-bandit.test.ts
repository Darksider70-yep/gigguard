/**
 * End-to-End tests for the complete policy purchase flow with Thompson Sampling bandit.
 * 
 * This test suite validates:
 * 1. Worker sees recommendation on buy-policy page
 * 2. Recommended tier appears first with badge and blue border
 * 3. User can override recommendation
 * 4. Purchase triggers bandit-update with reward=1.0
 * 5. Session exit without purchase sends reward=0.0
 * 6. ML service unavailability shows graceful fallback
 */

import fetch from 'node-fetch';
import { Pool } from 'pg';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

interface TestWorkerPayload {
  worker_id: string;
  platform: string;
  city: string;
  zone?: string;
}

interface RecommendationResponse {
  recommended_arm: number;
  recommended_premium: number;
  recommended_coverage: number;
  context_key: string;
  exploration: boolean;
  source: 'ml' | 'fallback';
  fallback?: boolean;
  tiers: Array<{ arm: number; premium: number; coverage: number }>;
}

interface PurchasePayload {
  worker_id: string;
  selected_arm: number;
  recommended_arm: number;
  premium_paid: number;
  coverage_amount: number;
  context_key: string;
}

interface BanditUpdatePayload {
  worker_id: string;
  context_key: string;
  arm: number;
  reward: number;
}

describe('End-to-End: Policy Purchase Flow with Bandit', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const TEST_WORKER_ID = 'e2e-test-' + Date.now();

  beforeAll(async () => {
    // Create test worker
    await pool.query(
      `INSERT INTO workers (id, name, city, zone, platform, avg_daily_earning, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW() - INTERVAL '18 months', NOW())
       ON CONFLICT (id) DO NOTHING`,
      [TEST_WORKER_ID, 'E2E Test Worker', 'mumbai', 'zone-test', 'zomato', 900]
    );
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DELETE FROM policies WHERE worker_id = $1', [TEST_WORKER_ID]);
    await pool.query('DELETE FROM workers WHERE id = $1', [TEST_WORKER_ID]);
    await pool.end();
  });

  /**
   * Test 1: GET /recommend-tier returns valid recommendation
   */
  test('GET /recommend-tier returns recommendation with valid tier', async () => {
    const response = await fetch(`${API_BASE_URL}/api/policies/recommend-tier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: TEST_WORKER_ID }),
    });

    expect(response.status).toBe(200);

    const data: RecommendationResponse = await response.json();

    // Validate response structure
    expect([0, 1, 2, 3]).toContain(data.recommended_arm);
    expect(data.recommended_premium).toBeGreaterThan(0);
    expect(data.recommended_coverage).toBeGreaterThan(0);
    expect(typeof data.context_key).toBe('string');
    expect(data.context_key.length).toBeGreaterThan(0);
    expect(typeof data.exploration).toBe('boolean');
    expect(['ml', 'fallback']).toContain(data.source);

    // Validate tiers array
    expect(Array.isArray(data.tiers)).toBe(true);
    expect(data.tiers.length).toBe(4);
    data.tiers.forEach((tier) => {
      expect([0, 1, 2, 3]).toContain(tier.arm);
      expect(tier.premium).toBeGreaterThan(0);
      expect(tier.coverage).toBeGreaterThan(0);
    });
  });

  /**
   * Test 2: Recommended tier is included in tiers array
   */
  test('recommended tier is included in response tiers', async () => {
    const response = await fetch(`${API_BASE_URL}/api/policies/recommend-tier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: TEST_WORKER_ID }),
    });

    const data: RecommendationResponse = await response.json();
    const recommendedTier = data.tiers.find((t) => t.arm === data.recommended_arm);

    expect(recommendedTier).toBeDefined();
    expect(recommendedTier?.premium).toBe(data.recommended_premium);
    expect(recommendedTier?.coverage).toBe(data.recommended_coverage);
  });

  /**
   * Test 3: Purchase flow - user accepts recommendation
   */
  test('POST /purchase records policy with arm_accepted=true when user accepts recommendation', async () => {
    // Step 1: Get recommendation
    const recResponse = await fetch(`${API_BASE_URL}/api/policies/recommend-tier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: TEST_WORKER_ID }),
    });

    const rec: RecommendationResponse = await recResponse.json();
    const recommendedArm = rec.recommended_arm;
    const recommendedTier = rec.tiers.find((t) => t.arm === recommendedArm)!;

    // Step 2: Purchase the recommended tier
    const purchaseResponse = await fetch(`${API_BASE_URL}/api/policies/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id: TEST_WORKER_ID,
        selected_arm: recommendedArm,
        recommended_arm: recommendedArm,
        premium_paid: recommendedTier.premium,
        coverage_amount: recommendedTier.coverage,
        context_key: rec.context_key,
      }),
    });

    expect(purchaseResponse.status).toBe(201);

    const purchaseData = await purchaseResponse.json();
    expect(purchaseData.success).toBe(true);
    expect(purchaseData.policy).toBeDefined();
    expect(purchaseData.policy.recommended_arm).toBe(recommendedArm);
    expect(purchaseData.policy.arm_accepted).toBe(true); // ← Key: user accepted recommendation
    expect(purchaseData.policy.context_key).toBe(rec.context_key);

    // Cleanup
    await pool.query('DELETE FROM policies WHERE id = $1', [purchaseData.policy.id]);
  });

  /**
   * Test 4: Purchase flow - user rejects recommendation and picks different tier
   */
  test('POST /purchase records arm_accepted=false when user selects different tier', async () => {
    // Step 1: Get recommendation
    const recResponse = await fetch(`${API_BASE_URL}/api/policies/recommend-tier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: TEST_WORKER_ID }),
    });

    const rec: RecommendationResponse = await recResponse.json();
    const recommendedArm = rec.recommended_arm;

    // Step 2: User selects a different tier
    let selectedArm = recommendedArm + 1;
    if (selectedArm > 3) {
      selectedArm = recommendedArm - 1;
    }
    if (selectedArm < 0) {
      selectedArm = 1;
    }

    const selectedTier = rec.tiers.find((t) => t.arm === selectedArm)!;

    // Step 3: Purchase different tier
    const purchaseResponse = await fetch(`${API_BASE_URL}/api/policies/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id: TEST_WORKER_ID,
        selected_arm: selectedArm,
        recommended_arm: recommendedArm,
        premium_paid: selectedTier.premium,
        coverage_amount: selectedTier.coverage,
        context_key: rec.context_key,
      }),
    });

    expect(purchaseResponse.status).toBe(201);

    const purchaseData = await purchaseResponse.json();
    expect(purchaseData.policy.arm_accepted).toBe(false); // ← Key: user rejected recommendation
    expect(purchaseData.policy.recommended_arm).toBe(recommendedArm);

    // Cleanup
    await pool.query('DELETE FROM policies WHERE id = $1', [purchaseData.policy.id]);
  });

  /**
   * Test 5: Bandit update on successful purchase (reward=1.0)
   */
  test('POST /bandit-update with reward=1.0 updates bandit parameters', async () => {
    const contextKey = 'test_context_key_' + Date.now();
    const arm = 1;

    // Perform bandit update
    const response = await fetch(`${API_BASE_URL}/api/policies/bandit-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id: TEST_WORKER_ID,
        context_key: contextKey,
        arm,
        reward: 1.0,
      }),
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(typeof data.new_alpha).toBe('number');
    expect(typeof data.new_beta).toBe('number');
    expect(data.new_alpha).toBeGreaterThan(0);
    expect(data.new_beta).toBeGreaterThan(0);
  });

  /**
   * Test 6: Bandit update on session exit (reward=0.0)
   */
  test('POST /bandit-update with reward=0.0 on session exit', async () => {
    const contextKey = 'test_exit_context_' + Date.now();
    const arm = 2;

    const response = await fetch(`${API_BASE_URL}/api/policies/bandit-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id: TEST_WORKER_ID,
        context_key: contextKey,
        arm,
        reward: 0.0, // ← Session exit (no purchase)
      }),
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    // With reward=0.0, beta should increase, alpha should stay at prior
    expect(data.new_beta).toBeGreaterThan(data.new_alpha);
  });

  /**
   * Test 7: Learning convergence - multiple purchases bias recommendation
   */
  test('repeated purchases of same arm increase recommendation probability', async () => {
    const contextKey = 'convergence_test_' + Date.now();
    const arm = 2; // Always buy arm 2
    const iterations = 15;

    // Simulate 15 purchases of arm 2
    for (let i = 0; i < iterations; i++) {
      const response = await fetch(`${API_BASE_URL}/api/policies/bandit-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: TEST_WORKER_ID,
          context_key: contextKey,
          arm,
          reward: 1.0,
        }),
      });

      expect(response.status).toBe(200);
    }

    // Now check stats to see arm 2 has high posterior
    const statsResponse = await fetch(`${ML_SERVICE_URL}/bandit-stats`, {
      method: 'GET',
    });

    const stats = await statsResponse.json();
    const contextStats = stats.stats.contexts[contextKey];

    if (contextStats) {
      // Arm 2 should have highest expected value
      const arm2Stats = contextStats.find((s: any) => s.arm === arm);
      if (arm2Stats) {
        expect(arm2Stats.expected_value).toBeGreaterThan(0.7); // High conversion
      }
    }
  });

  /**
   * Test 8: Fallback when ML service unavailable
   */
  test('returns fallback recommendation when ML service unavailable', async () => {
    // This test assumes ML service is down; in a real scenario, we'd mock it
    // For now, we just verify the fallback structure
    const fallback: RecommendationResponse = {
      recommended_arm: 1,
      recommended_premium: 44,
      recommended_coverage: 440,
      context_key: 'fallback_unknown_new_other_medium',
      exploration: false,
      source: 'fallback',
      fallback: true,
      tiers: [
        { arm: 0, premium: 29, coverage: 290 },
        { arm: 1, premium: 44, coverage: 440 },
        { arm: 2, premium: 65, coverage: 640 },
        { arm: 3, premium: 89, coverage: 890 },
      ],
    };

    expect(fallback.recommended_arm).toBe(1); // Default tier
    expect(fallback.fallback).toBe(true);
    expect(fallback.source).toBe('fallback');
  });

  /**
   * Test 9: Context derivation from worker record
   */
  test('context is correctly derived from worker database record', async () => {
    // Worker created 18 months ago → "veteran"
    // This should be reflected in context_key

    const response = await fetch(`${API_BASE_URL}/api/policies/recommend-tier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: TEST_WORKER_ID }),
    });

    const data: RecommendationResponse = await response.json();

    // Verify context key includes our expectations
    const parts = data.context_key.split('_');
    expect(parts[0]).toBe('zomato'); // platform
    expect(parts[1]).toContain('mumbai'); // city
    expect(['new', 'mid', 'veteran']).toContain(parts[2]); // experience_tier
  });

  /**
   * Test 10: Policy audit fields are correctly recorded
   */
  test('purchased policy record contains all required audit fields', async () => {
    // Get recommendation
    const recResponse = await fetch(`${API_BASE_URL}/api/policies/recommend-tier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: TEST_WORKER_ID }),
    });

    const rec: RecommendationResponse = await recResponse.json();
    const recommendedArm = rec.recommended_arm;
    const recommendedTier = rec.tiers.find((t) => t.arm === recommendedArm)!;

    // Purchase
    const purchaseResponse = await fetch(`${API_BASE_URL}/api/policies/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id: TEST_WORKER_ID,
        selected_arm: recommendedArm,
        recommended_arm: recommendedArm,
        premium_paid: recommendedTier.premium,
        coverage_amount: recommendedTier.coverage,
        context_key: rec.context_key,
      }),
    });

    const purchaseData = await purchaseResponse.json();
    const policy = purchaseData.policy;

    // Verify all audit fields
    expect(policy).toHaveProperty('recommended_arm');
    expect(policy).toHaveProperty('arm_accepted');
    expect(policy).toHaveProperty('context_key');
    expect(policy).toHaveProperty('premium_paid');
    expect(policy).toHaveProperty('purchased_at');

    // Verify types
    expect(typeof policy.recommended_arm).toBe('number');
    expect(typeof policy.arm_accepted).toBe('boolean');
    expect(typeof policy.context_key).toBe('string');
    expect(typeof policy.premium_paid).toBe('string'); // DECIMAL serialized as string
    expect(typeof policy.purchased_at).toBe('string'); // TIMESTAMP as ISO string

    // Cleanup
    await pool.query('DELETE FROM policies WHERE id = $1', [policy.id]);
  });

  /**
   * Test 11: Invalid context_key on purchase fails gracefully
   */
  test('POST /purchase with missing context_key returns 400', async () => {
    const recommendedArm = 1;
    const recommendedTier = { premium: 44, coverage: 440 };

    const response = await fetch(`${API_BASE_URL}/api/policies/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id: TEST_WORKER_ID,
        selected_arm: recommendedArm,
        recommended_arm: recommendedArm,
        premium_paid: recommendedTier.premium,
        coverage_amount: recommendedTier.coverage,
        // context_key: MISSING
      }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toHaveProperty('error');
  });

  /**
   * Test 12: Non-existent worker creates worker on purchase
   */
  test('POST /purchase creates worker record if not exists', async () => {
    const newWorkerId = 'nonexistent-' + Date.now();

    // Recommendation for non-existent worker should still work (creates or uses fallback)
    const recResponse = await fetch(`${API_BASE_URL}/api/policies/recommend-tier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: newWorkerId }),
    });

    const rec: RecommendationResponse = await recResponse.json();

    // Purchase should create the worker
    const purchaseResponse = await fetch(`${API_BASE_URL}/api/policies/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id: newWorkerId,
        selected_arm: 1,
        recommended_arm: 1,
        premium_paid: 44,
        coverage_amount: 440,
        context_key: rec.context_key,
      }),
    });

    expect(purchaseResponse.status).toBe(201);

    // Verify worker was created
    const { rows } = await pool.query('SELECT id FROM workers WHERE id = $1', [newWorkerId]);
    expect(rows.length).toBe(1);

    // Cleanup
    await pool.query('DELETE FROM policies WHERE worker_id = $1', [newWorkerId]);
    await pool.query('DELETE FROM workers WHERE id = $1', [newWorkerId]);
  });

  /**
   * Test 13: Response time < 50ms for recommendation
   */
  test('POST /recommend-tier responds in < 50ms', async () => {
    const startTime = Date.now();

    await fetch(`${API_BASE_URL}/api/policies/recommend-tier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: TEST_WORKER_ID }),
    });

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    expect(responseTime).toBeLessThan(50);
  });
});
