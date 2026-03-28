// Day 5: Simulation test for the H3-based trigger monitor.
import { pool } from '../../backend/src/db';
import { processH3Trigger } from '../../backend/src/triggers/monitor';
import { latLngToCell, gridDisk, cellToLatLng } from 'h3-js';
import { v4 as uuidv4 } from 'uuid';

// --- Test Configuration ---
const H3_RESOLUTION = 8;
const K_RING_SIZE = 1;

// A real-world location for the simulation.
// Andheri West, Mumbai
const MOCK_EVENT_LOCATION = { lat: 19.1136, lng: 72.8697 };

// --- Test Setup and Teardown ---

beforeAll(async () => {
  // Clear any previous mock data to ensure a clean slate.
  await pool.query("DELETE FROM workers WHERE name LIKE 'Mock Worker %'");
  await pool.query("DELETE FROM disruption_events WHERE city = 'Test City'");
});

afterAll(async () => {
  // Clean up the mock data after the test runs.
  await pool.query("DELETE FROM workers WHERE name LIKE 'Mock Worker %'");
  await pool.query("DELETE FROM disruption_events WHERE city = 'Test City'");
  // Close the database connection pool.
  await pool.end();
});

// --- Test Suite ---

describe('H3 Trigger Monitor Simulation', () => {
  it('should select only workers within the k=1 ring of a trigger event', async () => {
    // --- 1. SETUP: Define the event area and create mock workers ---

    // Find the H3 hexagons for the test area.
    const eventHexId = latLngToCell(MOCK_EVENT_LOCATION.lat, MOCK_EVENT_LOCATION.lng, H3_RESOLUTION);
    const insideHexIds = gridDisk(eventHexId, K_RING_SIZE); // The 7-hex "hot zone"

    // To get "outside" hexes, we can get a larger ring and subtract the "inside" hexes.
    const largerRing = gridDisk(eventHexId, K_RING_SIZE + 2);
    const outsideHexIds = largerRing.filter(h => !insideHexIds.includes(h));

    console.log(`[Test] Event Center Hex: ${eventHexId}`);
    console.log(`[Test] "Inside" Hex Ring (Count: ${insideHexIds.length}): ${insideHexIds.join(', ')}`);
    console.log(`[Test] "Outside" Hexes (Sample): ${outsideHexIds.slice(0, 10).join(', ')}`);

    const workersToCreate = [];
    const expectedWorkerIds: string[] = [];

    // Create 10 workers *inside* the affected area.
    for (let i = 0; i < 10; i++) {
      const workerId = uuidv4();
      expectedWorkerIds.push(workerId);
      workersToCreate.push({
        id: workerId,
        name: `Mock Worker Inside ${i}`,
        city: 'Mumbai',
        zone: 'Andheri West', // old field
        platform: 'zomato',
        avg_daily_earning: 500,
        home_hex_id: insideHexIds[i % insideHexIds.length], // Distribute them within the ring
      });
    }

    // Create 10 workers *outside* the affected area.
    for (let i = 0; i < 10; i++) {
        workersToCreate.push({
            id: uuidv4(),
            name: `Mock Worker Outside ${i}`,
            city: 'Mumbai',
            zone: 'Bandra', // old field
            platform: 'swiggy',
            avg_daily_earning: 600,
            home_hex_id: outsideHexIds[i % outsideHexIds.length],
        });
    }

    // Insert all mock workers into the database.
    for (const worker of workersToCreate) {
        await pool.query(
            `INSERT INTO workers (id, name, city, zone, platform, avg_daily_earning, home_hex_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [worker.id, worker.name, worker.city, worker.zone, worker.platform, worker.avg_daily_earning, worker.home_hex_id]
        );
    }
    console.log(`[Test] Inserted ${workersToCreate.length} mock workers.`);


    // --- 2. ACT: Run the trigger monitor ---

    const affectedIds = await processH3Trigger({
      lat: MOCK_EVENT_LOCATION.lat,
      lng: MOCK_EVENT_LOCATION.lng,
      trigger_type: 'simulated_rain',
      city: 'Test City', // Use a distinct city for easy cleanup
    });


    // --- 3. ASSERT: Verify the results ---

    // The core assertion: we should get exactly the 10 "inside" workers back.
    expect(affectedIds).toHaveLength(expectedWorkerIds.length);

    // We also check that the set of IDs is identical, regardless of order.
    expect(new Set(affectedIds)).toEqual(new Set(expectedWorkerIds));

    // Verify that a disruption event was actually created in the database.
    const { rowCount } = await pool.query(
      "SELECT id FROM disruption_events WHERE trigger_type = 'simulated_rain' AND city = 'Test City'"
    );
    expect(rowCount).toBe(1);

    console.log('[Test] Assertion passed: Correct workers were selected.');
  });
});
