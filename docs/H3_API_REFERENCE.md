// API Reference: H3 Geospatial Indexing for GigGuard
// 
// Quick reference for using H3-based trigger monitoring
// For detailed explanation, see docs/H3_IMPLEMENTATION_GUIDE.md

import { processH3Trigger, isLocationCovered, getHexRing } from './src/triggers/monitor';
import { latLngToCell, gridDisk } from 'h3-js';

// ============================================================================
// MAIN API: Process Trigger Events
// ============================================================================

/**
 * Process a weather/disruption trigger event and return affected workers.
 * 
 * Usage: Called whenever a weather trigger fires (rain, heat, flood, etc.)
 * 
 * @param event - Trigger event with location and metadata
 * @returns Array of worker IDs to process payouts for
 * 
 * @example
 * const event = {
 *   lat: 19.1136,
 *   lng: 72.8697,
 *   trigger_type: 'rain_heavy',
 *   city: 'Mumbai',
 *   metadata: { rainfall_mm: 15.5, timestamp: '2026-03-22T10:30:00Z' }
 * };
 * 
 * const affectedWorkerIds = await processH3Trigger(event);
 * // Returns: ['worker-id-1', 'worker-id-2', ...]
 * // Side effect: Creates disruption_event record in database
 */
async function processH3Trigger(event: {
  lat: number;
  lng: number;
  trigger_type: 'rain' | 'rain_heavy' | 'heat' | 'flood' | 'aqi' | 'curfew';
  city: string;
  metadata?: Record<string, any>;
}): Promise<string[]> {
  // Implementation in src/triggers/monitor.ts
}

// ============================================================================
// HELPER API: Check Location Coverage
// ============================================================================

/**
 * Check if a specific geographic location has active workers.
 * 
 * Usage: Validate that a trigger location is in a known delivery area
 * 
 * @param lat - Latitude
 * @param lng - Longitude  
 * @param city - City filter
 * @returns true if location has workers, false otherwise
 * 
 * @example
 * const hasCoverage = await isLocationCovered(19.1136, 72.8697, 'Mumbai');
 * if (!hasCoverage) {
 *   console.log('No workers in this area; trigger event ignored');
 * }
 */
async function isLocationCovered(lat: number, lng: number, city: string): Promise<boolean> {
  // Implementation in src/triggers/monitor.ts
}

// ============================================================================
// TESTING API: Get Hex Ring for Visualization
// ============================================================================

/**
 * Get all H3 hex IDs within a k-ring for visualization or testing.
 * 
 * Usage: Debug trigger events, visualize affected area
 * 
 * @param lat - Center latitude
 * @param lng - Center longitude
 * @param k - Ring radius (default: 1 = 7 hexagons covering ~2 km)
 * @returns Array of H3 cell IDs
 * 
 * @example
 * const hexRing = getHexRing(19.1136, 72.8697, 1);
 * console.log('7 affected hexagons:', hexRing);
 * // Output:
 * // [
 * //   8635651932160000000n,  // CENTER
 * //   8635651932161000000n,
 * //   8635651932162000000n,
 * //   ...
 * // ]
 * 
 * // Paste hex IDs into https://h3geo.resource.tools/ to visualize
 */
function getHexRing(lat: number, lng: number, k?: number): bigint[] {
  // Implementation in src/triggers/monitor.ts
}

// ============================================================================
// LOW-LEVEL H3 API: Direct h3-js Functions
// ============================================================================

/**
 * Convert a latitude/longitude to an H3 hexagon cell ID.
 * 
 * h3-js v4 function. Resolution 8 is hardcoded for GigGuard:
 * - Resolution 8 = ~0.74 km² per hexagon = ~860m diameter
 * - Provides good balance of precision and performance
 * 
 * @param lat - Latitude (-90 to 90)
 * @param lng - Longitude (-180 to 180)
 * @param resolution - H3 resolution (8 for GigGuard, cannot change)
 * @returns BigInt cell ID
 * 
 * @example
 * const hexId = latLngToCell(19.1136, 72.8697, 8);
 * console.log(hexId);  // 8635651932160000000n
 * 
 * // Note: Returns BigInt (with 'n' suffix in Node.js)
 */
import { latLngToCell } from 'h3-js';

/**
 * Get all H3 hexagons within k distance of a center hex.
 * 
 * For k=1, returns 7 hexagons (center + 6 neighbors).
 * This is the k-ring used by GigGuard trigger monitor.
 * 
 * @param centerHex - H3 cell ID from latLngToCell()
 * @param k - Ring radius (1 = neighbors, 2 = neighbors of neighbors, etc)
 * @returns Array of H3 cell IDs in the ring
 * 
 * @example
 * const centerHex = latLngToCell(19.1136, 72.8697, 8);
 * const ring = gridDisk(centerHex, 1);  // 7 hexagons
 * 
 * console.log('Center hex:', centerHex);
 * console.log('Ring (7 hexes):', ring);
 * // Output:
 * // [8635651932160000000n, 8635651932161000000n, ...]
 */
import { gridDisk } from 'h3-js';

// ============================================================================
// DATABASE QUERIES
// ============================================================================

/**
 * Find all workers affected by a trigger event.
 * 
 * This query uses the GIN index on workers.home_hex_id for fast lookups.
 * Time complexity: O(log n) with GIN index, O(n) without
 * 
 * @example
 * const ringHexIds = gridDisk(eventHex, 1);
 * const { rows } = await pool.query(
 *   'SELECT id FROM workers WHERE home_hex_id = ANY($1::bigint[])',
 *   [ringHexIds]
 * );
 * // Returns array of worker IDs in the ring
 */

// Query: Find workers in affected hexagons
await pool.query(
  'SELECT id, name, platform FROM workers WHERE home_hex_id = ANY($1::bigint[])',
  [ringHexIds]
);
// Sample result: [{id: 'uuid-1', name: 'Worker A', platform: 'zomato'}, ...]

/**
 * Find all disruption events that affected a specific hex.
 * 
 * This query uses the GIN index on disruption_events.affected_hex_ids.
 * 
 * @example
 * const { rows } = await pool.query(
 *   'SELECT id, trigger_type FROM disruption_events WHERE affected_hex_ids @> $1::bigint[]',
 *   [ARRAY[specificHexId]]
 * );
 */

// Query: Find events affecting a specific hex
await pool.query(
  'SELECT id, trigger_type, affected_hex_ids FROM disruption_events WHERE affected_hex_ids @> $1::bigint[]',
  [ARRAY[8635651932160000000]]
);
// Sample result: [{id: 'event-uuid', trigger_type: 'rain_heavy', affected_hex_ids: [hex1, hex2, ...]}]

// ============================================================================
// BACKFILL SCRIPT
// ============================================================================

/**
 * One-time migration: Geocode all workers with NULL home_hex_id.
 * 
 * Usage: npm run backfill:hex-ids
 * 
 * Process:
 * 1. Fetches all workers where home_hex_id IS NULL
 * 2. Geocodes zone (e.g., "Andheri West") to lat/lng using Google Maps API
 * 3. Converts lat/lng to H3 hexagon ID (resolution 8)
 * 4. Updates worker.home_hex_id in database
 * 5. Exports failures to failed_geocodes.csv
 * 6. Respects rate limit: 350ms delay between API calls
 * 
 * Idempotent: Safe to re-run. Only processes workers with NULL home_hex_id.
 * 
 * Output:
 * - Console: Progress and detailed results
 * - File: failed_geocodes.csv (if failures)
 * 
 * Requirements:
 * - GOOGLE_MAPS_API_KEY in .env
 * - NODE_ENV=development (for dotenv)
 * 
 * Example console output:
 * ```
 * Found 547 workers to backfill.
 * 
 * [1/547] (0.2%) Processing worker abc123...
 *   Address: "Andheri West, Mumbai, India"
 *   ✓ Success! H3 Hex ID: 8635651932160000000
 * 
 * Backfill Complete
 * ✓ Successfully backfilled: 547 workers
 * ✗ Failed: 2 workers (exported to failed_geocodes.csv)
 * ```
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

// H3 Resolution (FIXED - do not change)
const H3_RESOLUTION = 8;  // ~0.74 km² per hexagon

// K-ring size (FIXED - do not change without full re-backfill)
const K_RING_SIZE = 1;    // 7 hexagons total, covers ~2 km radius

// ============================================================================
// PERFORMANCE EXPECTATIONS
// ============================================================================

/*
Typical performance (100k workers, with GIN indexes):

1. Trigger event processing:
   - H3 hex computation:        <1 ms
   - Database query (GIN):       1-2 ms
   - Disruption event insert:    <1 ms
   - Total:                      <5 ms

2. Without GIN indexes (for comparison):
   - Same query:                 45-50 ms
   - Speedup:                    25-50x

3. Backfill script:
   - Google Maps API call:       ~100-300 ms (network dependent)
   - H3 hex conversion:          <1 ms
   - Database update:            <1 ms
   - Total per worker:           ~100-300 ms
   - Rate limit:                 350 ms between API calls (safe margin)
   - For 547 workers:            ~3-4 minutes
*/

// ============================================================================
// COMMON PATTERNS
// ============================================================================

// Pattern 1: Process a weather trigger from OpenWeatherMap
async function handleWeatherTrigger(weatherData: any) {
  const event = {
    lat: weatherData.lat,
    lng: weatherData.lon,
    trigger_type: weatherData.rainfall_mm > 10 ? 'rain_heavy' : 'rain',
    city: weatherData.city,
    metadata: {
      rainfall_mm: weatherData.rainfall_mm,
      temperature: weatherData.temp,
    }
  };
  const affectedWorkerIds = await processH3Trigger(event);
  // Pass to payout service
  return affectedWorkerIds;
}

// Pattern 2: Debug why workers weren't selected
async function debugTriggerEvent(lat: number, lng: number, city: string) {
  const hexId = latLngToCell(lat, lng, 8);
  const ringHexIds = gridDisk(hexId, 1);
  
  console.log(`Event hex: ${hexId}`);
  console.log(`Ring hexes (7):`, ringHexIds);
  
  const { rows } = await pool.query(
    'SELECT COUNT(*) FROM workers WHERE city = $1 AND home_hex_id = ANY($2::bigint[])',
    [city, ringHexIds]
  );
  console.log(`Workers in ring: ${rows[0].count}`);
}

// Pattern 3: Visualize affected area
async function visualizeAffectedArea(lat: number, lng: number) {
  const hexRing = getHexRing(lat, lng, 1);
  console.log('\nH3 Hexagons in affected area:');
  hexRing.forEach((hex, i) => {
    console.log(`  [${i+1}] ${hex}`);
  });
  console.log('\nPaste these hex IDs into: https://h3geo.resource.tools/');
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/*
Common errors and fixes:

1. "Cannot read property 'latLngToCell' of undefined"
   - Fix: Check h3-js version is 4.x
   - npm list h3-js
   - npm install h3-js@^4.1.0

2. "GOOGLE_MAPS_API_KEY not set"
   - Fix: Add to .env file
   - GOOGLE_MAPS_API_KEY=AIza...your_key...

3. "GIN index not being used" (shows Seq Scan in EXPLAIN)
   - Fix: Run VACUUM ANALYZE after backfill
   - psql -d gigguard -c "VACUUM ANALYZE workers;"

4. "Zero workers affected" (unexpected)
   - Check: Do workers have home_hex_id set?
   - SELECT COUNT(*) FROM workers WHERE home_hex_id IS NULL;
   - If > 0, run backfill script

5. "Backfill hangs on Google Maps API"
   - Fix: Kill script (Ctrl+C)
   - Retry: npm run backfill:hex-ids
   - It will resume from where it left off
*/

// ============================================================================
// END OF API REFERENCE
// ============================================================================
