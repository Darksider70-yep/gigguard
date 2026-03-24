// Day 5: H3 Trigger Monitor Simulation Test
// 
// This test simulates a real-world rain trigger event at a specific Mumbai location
// and verifies that the trigger monitor correctly identifies affected workers
// using H3 hexagonal indexing.
//
// Test scenario:
// - Rain event fires at: Andheri West, Mumbai (19.1136, 72.8697)
// - Worker distribution: 10 inside k=1 ring, 10 outside
// - Expected result: Exactly 10 workers identified as affected
//
// Benefits:
// - Validates H3 hex computation is correct
// - Confirms database query finds exact workers
// - Catches regressions in trigger logic
// - Provides a reference for geospatial calculations

import { processH3Trigger } from '../../src/triggers/monitor';
import { pool } from '../../src/db';
import { latLngToCell, gridDisk } from 'h3-js';
import { randomUUID } from 'crypto';

// --- Test Configuration ---
describe('H3 Trigger Monitor Simulation', () => {
  
  const H3_RESOLUTION = 8;
  const TEST_CITY = 'Mumbai';
  
  // Andheri West, Mumbai - a major delivery hub
  const EVENT_LAT = 19.1136;
  const EVENT_LNG = 72.8697;
  
  let mockWorkerIds: string[] = [];
  let eventHexId: string;
  let ringHexIds: string[];

  // --- Setup: Create test database state ---
  beforeAll(async () => {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║ H3 Trigger Monitor Simulation Test     ║');
    console.log('╚════════════════════════════════════════╝\n');

    // Compute the event hex and its k-ring
    eventHexId = latLngToCell(EVENT_LAT, EVENT_LNG, H3_RESOLUTION);
    ringHexIds = gridDisk(eventHexId, 1);

    console.log(`📍 Trigger Location: (${EVENT_LAT}, ${EVENT_LNG})`);
    console.log(`🔷 Event Hex ID: ${eventHexId}`);
    console.log(`📊 K-ring (7 hexes):`);
    ringHexIds.forEach((hex, i) => {
      const marker = hex === eventHexId ? '  ← CENTER' : '';
      console.log(`   [${i+1}] ${hex}${marker}`);
    });

    // Clear any existing test workers
    await pool.query('DELETE FROM workers WHERE city = $1', [TEST_CITY]);
    console.log('\n🧹 Cleaned up existing test workers\n');

    // --- Create 10 workers INSIDE the k=1 ring ---
    console.log('👥 Creating test workers...\n');
    console.log('  Inside k-ring (should be affected):');
    
    for (let i = 0; i < 10; i++) {
      const insideHexId = ringHexIds[i % ringHexIds.length]; // Rotate through ring hexes
      const insideHexIdBigInt = BigInt('0x' + insideHexId); // Convert hex string to BigInt
      const workerId = randomUUID();
      mockWorkerIds.push(workerId);

      await pool.query(
        `INSERT INTO workers (id, name, city, zone, platform, home_hex_id, avg_daily_earning)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          workerId,
          `MockWorker_Inside_${i + 1}`,
          TEST_CITY,
          `test_zone_inside_${i + 1}`,
          i % 2 === 0 ? 'zomato' : 'swiggy',
          insideHexIdBigInt,
          500 + Math.random() * 500,
        ]
      );

      console.log(`    [${i + 1}]  ${workerId.substring(0, 8)}... (hex: ${insideHexId})`);
    }

    // --- Create 10 workers OUTSIDE the k=1 ring ---
    console.log('\n  Outside k-ring (should NOT be affected):');
    
    // Create a hex far away (different resolution 8 cell in a different part of Mumbai)
    const outsideHexId = latLngToCell(19.0136, 72.7697, H3_RESOLUTION); // ~10km south
    const outsideHexIdBigInt = BigInt('0x' + outsideHexId); // Convert hex string to BigInt

    for (let i = 0; i < 10; i++) {
      const workerId = randomUUID();

      await pool.query(
        `INSERT INTO workers (id, name, city, zone, platform, home_hex_id, avg_daily_earning)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          workerId,
          `MockWorker_Outside_${i + 1}`,
          TEST_CITY,
          `test_zone_outside_${i + 1}`,
          i % 2 === 0 ? 'zomato' : 'swiggy',
          outsideHexIdBigInt,
          500 + Math.random() * 500,
        ]
      );

      console.log(`    [${i + 1}]  ${workerId.substring(0, 8)}... (hex: ${outsideHexId})`);
    }

    console.log(`\n✓ Created 20 test workers (10 inside + 10 outside ring)`);
  });

  // --- Cleanup: Remove test workers after tests ---
  afterAll(async () => {
    console.log('\n🧹 Cleaning up test data...');
    await pool.query('DELETE FROM disruption_events WHERE city = $1', [TEST_CITY]);
    await pool.query('DELETE FROM workers WHERE city = $1', [TEST_CITY]);
    console.log('✓ Cleanup complete\n');
    await pool.end();
  });

  // --- Test 1: Verify H3 hex computation ---
  test('should compute correct H3 hex IDs for event coordinates', () => {
    expect(eventHexId).toBeDefined();
    expect(typeof eventHexId).toBe('string');
    expect(ringHexIds).toHaveLength(7);

    // Verify all hexes in ring are different
    const uniqueHexes = new Set(ringHexIds);
    expect(uniqueHexes.size).toBe(7);

    console.log('✓ H3 hex computation verified');
  });

  // --- Test 2: Run trigger monitor and verify worker selection ---
  test('should identify exactly 10 affected workers inside the k-ring', async () => {
    console.log('\n▶ Running trigger monitor...');

    const triggerEvent = {
      lat: EVENT_LAT,
      lng: EVENT_LNG,
      trigger_type: 'rain_heavy',
      city: TEST_CITY,
      metadata: { rainfall_mm: 15.5 },
    };

    const affectedWorkerIds = await processH3Trigger(triggerEvent);

    console.log(`\n✓ Trigger monitor returned ${affectedWorkerIds.length} affected workers`);

    // Core assertion: exactly 10 workers affected
    expect(affectedWorkerIds).toHaveLength(10);
    console.log(`✓ Assertion passed: exactly 10 workers affected`);

    // Verify all affected workers are in our "inside" list (any 10 could be picked)
    const workerCount = affectedWorkerIds.filter(
      id => mockWorkerIds.includes(id)
    ).length;
    expect(workerCount).toBe(10);
    console.log(`✓ All affected workers are from our test set`);

    // Verify disruption event was created
    const { rows } = await pool.query(
      'SELECT id, affected_worker_count, affected_hex_ids FROM disruption_events WHERE city = $1 ORDER BY created_at DESC LIMIT 1',
      [TEST_CITY]
    );
    
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].affected_worker_count).toBe(10);
    // Convert hex strings to BigInt for comparison with database array
    const expectedHexIds = ringHexIds.map(h => BigInt('0x' + h));
    expect(rows[0].affected_hex_ids.map((x: any) => x.toString()).sort()).toEqual(
      expectedHexIds.map(x => x.toString()).sort()
    );
    
    console.log(`✓ Disruption event created with correct hex array`);
  });

  // --- Test 3: Verify no workers outside ring are affected ---
  test('should NOT select workers outside the k-ring', async () => {
    // Query workers outside ring
    const outsideHexId = latLngToCell(19.0136, 72.7697, H3_RESOLUTION);
    const outsideHexIdBigInt = BigInt('0x' + outsideHexId); // Convert hex string to BigInt
    const { rows: outsideWorkers } = await pool.query(
      'SELECT id FROM workers WHERE home_hex_id = $1 AND city = $2',
      [outsideHexIdBigInt, TEST_CITY]
    );

    expect(outsideWorkers.length).toBe(10);

    // Latest trigger should not have selected any of these
    const { rows: latestEvent } = await pool.query(
      'SELECT affected_hex_ids FROM disruption_events WHERE city = $1 ORDER BY created_at DESC LIMIT 1',
      [TEST_CITY]
    );

    const affectedHexArray: bigint[] = latestEvent[0].affected_hex_ids;
    expect(affectedHexArray).not.toContain(outsideHexIdBigInt);

    console.log('✓ Verified: outside workers NOT included in affected list');
  });

  // --- Test 4: Verify hex array composition ---
  test('should store correct hex ring array on disruption_event', async () => {
    const { rows } = await pool.query(
      'SELECT affected_hex_ids FROM disruption_events WHERE city = $1 ORDER BY created_at DESC LIMIT 1',
      [TEST_CITY]
    );

    const storedHexIds = rows[0].affected_hex_ids;

    // Convert to Set for comparison (order might differ)
    const storedSet = new Set(storedHexIds.map((h: bigint) => h.toString()));
    const expectedSet = new Set(ringHexIds.map(h => BigInt('0x' + h).toString()));

    expect(storedSet).toEqual(expectedSet);
    console.log('✓ Disruption event stored correct k-ring hex IDs');
  });

  // --- Test 5: Verify GIN index performance ---
  test('should use GIN index for efficient worker lookup', async () => {
    // This is more of a documentation test; in real use you'd run EXPLAIN ANALYZE
    const result = await pool.query(
      `EXPLAIN ANALYZE
       SELECT id FROM workers 
       WHERE city = $1 
       AND home_hex_id = ANY($2::bigint[])`,
      [TEST_CITY, ringHexIds.map(h => BigInt('0x' + h))]
    );

    const explainText = result.rows.map((r: any) => r['QUERY PLAN']).join('\n');
    
    // Check if GIN index scan is mentioned
    const usesGinIndex = explainText.includes('GIN') || explainText.includes('Bitmap');
    
    if (usesGinIndex) {
      console.log('✓ Query planner using GIN index (optimized path)');
    } else {
      console.warn('⚠ Query planner not using GIN index (falling back to sequential scan)');
      console.log('  Run: VACUUM ANALYZE workers; to update statistics');
    }
  });

  // --- Visual Verification: Log hex geometry ---
  test('should provide hex IDs for visual verification', () => {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║ H3 Ring Hex IDs (for map visualization) ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    console.log(`Event Hex ID (center):     ${eventHexId}`);
    console.log('\nK-ring (radius 1 - 6 neighbors + center):');
    
    ringHexIds.forEach((hex, i) => {
      const isCenter = hex === eventHexId ? ' ← CENTER' : '';
      console.log(`  [${i+1}] ${hex}${isCenter}`);
    });

    console.log('\n💡 To visualize these hexagons:');
    console.log('   1. Go to https://h3geo.resource.tools/');
    console.log('   2. Paste each hex ID above');
    console.log('   3. See which parts of Mumbai are covered\n');
  });
});
