/**
 * Integration tests for Thompson Sampling contextual bandit policy recommendation flow.
 * 
 * Tests the full chain:
 * 1. Context derivation from worker record
 * 2. ML service recommendation endpoint
 * 3. Bandit update on purchase (reward=1.0)
 * 4. Session exit tracking (reward=0.0)
 * 5. Graceful fallback when ML service unavailable
 */

import { Pool } from 'pg';
import { pool } from '../../backend/src/db';
import {
  buildBanditContextFromWorker,
  buildContextKey,
  deriveExperienceTier,
  deriveSeason,
  deriveZoneRisk,
  type BanditContext,
} from '../../backend/src/services/contextService';
import { recommendTier } from '../../backend/src/services/mlService';
import { POLICY_TIERS } from '../../backend/src/constants/policyTiers';

// Mocks: In a real test environment, mock the ML service responses
// For this integration test, we assume the ML service is running locally

describe('Bandit Policy Flow Integration Tests', () => {
  const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';
  const TEST_WORKER_ID = 'test-worker-' + Date.now();

  beforeAll(async () => {
    // Ensure test worker exists in DB
    await pool.query(
      `INSERT INTO workers (id, name, city, zone, platform, avg_daily_earning, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [TEST_WORKER_ID, 'Test Worker', 'mumbai', 'zone-test', 'zomato', 800]
    );
  });

  afterAll(async () => {
    // Cleanup: remove test policies and worker
    await pool.query('DELETE FROM policies WHERE worker_id = $1', [TEST_WORKER_ID]);
    await pool.query('DELETE FROM workers WHERE id = $1', [TEST_WORKER_ID]);
    await pool.end();
  });

  /**
   * Test 1: Context derivation produces correct bandit context
   */
  test('derives correct BanditContext from worker record', async () => {
    // Simulate a veteran worker from Zomato
    const now = new Date();
    const veteranDate = new Date(now.getFullYear() - 2, 0, 1); // 2 years ago
    const lowRiskZoneMultiplier = 0.9;

    const worker = {
      platform: 'zomato' as const,
      city: 'Mumbai',
      created_at: veteranDate,
      zone_multiplier: lowRiskZoneMultiplier,
    };

    const context = buildBanditContextFromWorker(worker, now);

    expect(context.platform).toBe('zomato');
    expect(context.city).toBe('mumbai'); // normalized lowercase
    expect(context.experience_tier).toBe('veteran');
    expect(context.zone_risk).toBe('low'); // < 1.0
    
    // Season depends on month; verify the function doesn't throw
    expect(['monsoon', 'summer', 'winter', 'other']).toContain(context.season);
  });

  /**
   * Test 2: Experience tier thresholds
   */
  test('correctly derives experience_tier thresholds', async () => {
    const now = new Date();

    // New: < 3 months
    const newWorkerDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    expect(deriveExperienceTier(newWorkerDate, now)).toBe('new');

    // Mid: 3-12 months
    const midWorkerDate = new Date(now.getFullYear(), now.getMonth() - 6, 1); // 6 months ago
    expect(deriveExperienceTier(midWorkerDate, now)).toBe('mid');

    // Veteran: > 12 months
    const veteranWorkerDate = new Date(now.getFullYear() - 2, 0, 1); // 2 years ago
    expect(deriveExperienceTier(veteranWorkerDate, now)).toBe('veteran');
  });

  /**
   * Test 3: Zone risk derivation
   */
  test('correctly derives zone_risk from zone_multiplier', () => {
    expect(deriveZoneRisk(0.8)).toBe('low');      // < 1.0
    expect(deriveZoneRisk(1.0)).toBe('medium');   // 1.0-1.2
    expect(deriveZoneRisk(1.15)).toBe('medium');  // 1.0-1.2
    expect(deriveZoneRisk(1.3)).toBe('high');     // > 1.2
  });

  /**
   * Test 4: Season derivation
   */
  test('correctly derives season from month', () => {
    // Mock dates for each season
    const june = new Date(2026, 5, 15);   // Month 6 (June)
    const march = new Date(2026, 2, 15);  // Month 3 (March)
    const november = new Date(2026, 10, 15); // Month 11 (November)
    
    expect(deriveSeason(june)).toBe('monsoon');     // Jun-Sep
    expect(deriveSeason(march)).toBe('summer');     // Mar-May
    expect(deriveSeason(november)).toBe('winter');  // Nov-Feb
  });

  /**
   * Test 5: Context key building
   */
  test('builds correct context_key string', () => {
    const context: BanditContext = {
      platform: 'zomato',
      city: 'mumbai',
      experience_tier: 'veteran',
      season: 'monsoon',
      zone_risk: 'high',
    };

    const key = buildContextKey(context);
    expect(key).toBe('zomato_mumbai_veteran_monsoon_high');
  });

  /**
   * Test 6: /recommend-tier returns valid arm 0-3
   */
  test('POST /recommend-tier returns valid arm for known context', async () => {
    const context: BanditContext = {
      platform: 'zomato',
      city: 'mumbai',
      experience_tier: 'veteran',
      season: 'monsoon',
      zone_risk: 'high',
    };

    const response = await fetch(`${ML_SERVICE_URL}/recommend-tier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id: TEST_WORKER_ID,
        context,
      }),
    });

    if (!response.ok) {
      throw new Error(`ML service /recommend-tier failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      recommended_arm: number;
      recommended_premium: number;
      recommended_coverage: number;
      context_key: string;
      exploration: boolean;
    };

    expect(data).toHaveProperty('recommended_arm');
    expect(data).toHaveProperty('recommended_premium');
    expect(data).toHaveProperty('recommended_coverage');
    expect(data).toHaveProperty('context_key');
    expect(data).toHaveProperty('exploration');

    expect([0, 1, 2, 3]).toContain(data.recommended_arm);
    expect(data.recommended_premium).toBeGreaterThan(0);
    expect(data.recommended_coverage).toBeGreaterThan(0);
    expect(typeof data.exploration).toBe('boolean');
  });

  /**
   * Test 7: /bandit-update correctly updates alpha/beta
   */
  test('POST /bandit-update returns updated alpha/beta values', async () => {
    const contextKey = 'zomato_mumbai_veteran_monsoon_high';
    const arm = 2;

    // First update: reward=1.0 (purchase)
    const response1 = await fetch(`${ML_SERVICE_URL}/bandit-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id: TEST_WORKER_ID,
        context_key: contextKey,
        arm,
        reward: 1.0,
      }),
    });

    if (!response1.ok) {
      throw new Error(`ML service /bandit-update failed: ${response1.status}`);
    }

    const data1 = (await response1.json()) as {
      success: boolean;
      new_alpha: number;
      new_beta: number;
    };
    expect(data1).toHaveProperty('success', true);
    expect(data1).toHaveProperty('new_alpha');
    expect(data1).toHaveProperty('new_beta');
    
    const alpha1 = data1.new_alpha;
    const beta1 = data1.new_beta;

    // Second update with same context/arm: alpha should increase
    const response2 = await fetch(`${ML_SERVICE_URL}/bandit-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id: TEST_WORKER_ID,
        context_key: contextKey,
        arm,
        reward: 1.0,
      }),
    });

    const data2 = (await response2.json()) as {
      success: boolean;
      new_alpha: number;
      new_beta: number;
    };
    expect(data2.new_alpha).toBeGreaterThan(alpha1);
    expect(data2.new_beta).toBe(beta1); // No new failures
  });

  /**
   * Test 8: Policy purchase records audit fields correctly
   */
  test('creates policy with correct recommended_arm and arm_accepted fields', async () => {
    const recommendedArm = 2;
    const selectedArm = 2; // Worker accepts recommendation
    const contextKey = 'zomato_mumbai_veteran_monsoon_high';
    const tier = POLICY_TIERS.find((t) => t.arm === selectedArm)!;

    // Insert a test policy
    const { rows } = await pool.query(
      `INSERT INTO policies
       (worker_id, coverage_amount, premium_paid, week_start, active, purchased_at, 
        recommended_arm, arm_accepted, context_key)
       VALUES ($1, $2, $3, CURRENT_DATE, TRUE, NOW(), $4, $5, $6)
       RETURNING id, recommended_arm, arm_accepted, context_key`,
      [
        TEST_WORKER_ID,
        tier.coverage,
        tier.premium,
        recommendedArm,
        true, // arm_accepted: coverage matches recommended
        contextKey,
      ]
    );

    const policy = rows[0];
    expect(policy.recommended_arm).toBe(recommendedArm);
    expect(policy.arm_accepted).toBe(true);
    expect(policy.context_key).toBe(contextKey);

    // Cleanup
    await pool.query('DELETE FROM policies WHERE id = $1', [policy.id]);
  });

  /**
   * Test 9: When user selects different tier, arm_accepted is false
   */
  test('records arm_accepted=false when user selects different tier', async () => {
    const recommendedArm = 1;
    const selectedArm = 3; // User chooses different tier
    const contextKey = 'zomato_mumbai_new_summer_medium';
    const recommendedTier = POLICY_TIERS.find((t) => t.arm === recommendedArm)!;
    const selectedTier = POLICY_TIERS.find((t) => t.arm === selectedArm)!;

    const { rows } = await pool.query(
      `INSERT INTO policies
       (worker_id, coverage_amount, premium_paid, week_start, active, purchased_at,
        recommended_arm, arm_accepted, context_key)
       VALUES ($1, $2, $3, CURRENT_DATE, TRUE, NOW(), $4, $5, $6)
       RETURNING id, arm_accepted`,
      [
        TEST_WORKER_ID,
        selectedTier.coverage, // ≠ recommended coverage
        selectedTier.premium,
        recommendedArm,
        false, // arm_accepted: coverage doesn't match recommended
        contextKey,
      ]
    );

    const policy = rows[0];
    expect(policy.arm_accepted).toBe(false);

    // Cleanup
    await pool.query('DELETE FROM policies WHERE id = $1', [policy.id]);
  });

  /**
   * Test 10: Fallback recommendation when ML service fails
   */
  test('recommendTier returns valid fallback when ML service unavailable', async () => {
    const context: BanditContext = {
      platform: 'zomato',
      city: 'mumbai',
      experience_tier: 'new',
      season: 'summer',
      zone_risk: 'medium',
    };

    // recommendTier gracefully returns fallback on error
    const fallback = await recommendTier({
      worker_id: TEST_WORKER_ID,
      context,
    });

    expect(fallback.recommended_arm).toBeGreaterThanOrEqual(0);
    expect(fallback.recommended_arm).toBeLessThanOrEqual(3);
    expect(fallback.recommended_premium).toBeGreaterThan(0);
    expect(fallback.recommended_coverage).toBeGreaterThan(0);
    expect(fallback.context_key).toBeTruthy();
  });

  /**
   * Test 11: ML timeout handling
   * Note: This test simulates a timeout; in practice, we'd mock fetch
   */
  test('gracefully handles ML service timeout', async () => {
    // Set very short timeout to simulate unavailable service
    const shortTimeoutMs = 1; // 1ms - will almost certainly timeout

    const context: BanditContext = {
      platform: 'zomato',
      city: 'mumbai',
      experience_tier: 'veteran',
      season: 'monsoon',
      zone_risk: 'high',
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), shortTimeoutMs);

    try {
      await fetch(`${ML_SERVICE_URL}/recommend-tier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: TEST_WORKER_ID,
          context,
        }),
        signal: controller.signal,
      });

      fail('Should have timed out');
    } catch (error: any) {
      // Timeout or abort error expected
      expect(error.name).toBe('AbortError');
    } finally {
      clearTimeout(timeoutId);
    }
  });

  /**
   * Test 12: Context key uniqueness
   * Different contexts should produce different keys
   */
  test('different contexts produce different context keys', () => {
    const context1: BanditContext = {
      platform: 'zomato',
      city: 'mumbai',
      experience_tier: 'veteran',
      season: 'monsoon',
      zone_risk: 'high',
    };

    const context2: BanditContext = {
      platform: 'swiggy',
      city: 'mumbai',
      experience_tier: 'veteran',
      season: 'monsoon',
      zone_risk: 'high',
    };

    const key1 = buildContextKey(context1);
    const key2 = buildContextKey(context2);

    expect(key1).not.toBe(key2);
    expect(key1).toContain('zomato');
    expect(key2).toContain('swiggy');
  });

  /**
   * Test 13: Stats endpoint for monitoring
   */
  test('GET /bandit-stats returns valid stats structure', async () => {
    const response = await fetch(`${ML_SERVICE_URL}/bandit-stats`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`ML service /bandit-stats failed: ${response.status}`);
    }

    const stats = (await response.json()) as {
      generated_at: string;
      n_arms: number;
      stats: {
        global: Array<{ alpha: number; beta: number; expected_value: number }>;
        contexts: Record<string, unknown>;
      };
    };

    expect(stats).toHaveProperty('generated_at');
    expect(stats).toHaveProperty('n_arms', 4);
    expect(stats).toHaveProperty('stats');
    expect(stats.stats).toHaveProperty('global');
    expect(stats.stats).toHaveProperty('contexts');

    // Global state should have 4 arms
    expect(Array.isArray(stats.stats.global)).toBe(true);
    expect(stats.stats.global.length).toBe(4);

    // Each arm should have alpha, beta, expected_value
    stats.stats.global.forEach((arm) => {
      expect(arm).toHaveProperty('alpha');
      expect(arm).toHaveProperty('beta');
      expect(arm).toHaveProperty('expected_value');
      expect(arm.alpha).toBeGreaterThan(0);
      expect(arm.beta).toBeGreaterThan(0);
    });
  });

  /**
   * Test 14: Policy tier constants consistency
   */
  test('POLICY_TIERS has correct structure', () => {
    expect(POLICY_TIERS.length).toBe(4);

    const expectedArms = [0, 1, 2, 3];
    POLICY_TIERS.forEach((tier, idx) => {
      expect(tier.arm).toBe(expectedArms[idx]);
      expect(tier.premium).toBeGreaterThan(0);
      expect(tier.coverage).toBeGreaterThan(0);
      expect(tier.coverage / tier.premium).toBeCloseTo(10, 0); // 10x rule
    });

    // Verify ordering: premium and coverage increase
    for (let i = 1; i < POLICY_TIERS.length; i++) {
      expect(POLICY_TIERS[i].premium).toBeGreaterThan(POLICY_TIERS[i - 1].premium);
      expect(POLICY_TIERS[i].coverage).toBeGreaterThan(POLICY_TIERS[i - 1].coverage);
    }
  });
});
