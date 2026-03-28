// Day 3: Rewritten trigger monitor using H3 hexagonal geospatial indexing.
// This is the core logic for identifying affected workers when a trigger event fires.
// 
// How it works:
// 1. Receives a trigger event with lat/lng (e.g., from OpenWeatherMap)
// 2. Converts lat/lng to H3 hexagon ID at resolution 8
// 3. Gets the k=1 ring (center + 6 neighbors = 7 hexagons total)
// 4. Queries all workers whose home_hex_id is in the ring
// 5. Creates a disruption_event record and returns affected worker IDs for payout

import { pool } from '../db';
import { latLngToCell, gridDisk } from 'h3-js';
import { randomUUID } from 'crypto';

// --- Type Definitions ---

interface Worker {
  id: string;
  name: string;
  city: string;
  platform: 'zomato' | 'swiggy';
  home_hex_id: bigint;
  active_hex_id?: bigint | null;
}

interface DisruptionEvent {
  id: string;
  trigger_type: string;
  city: string;
  latitude: number;
  longitude: number;
  affected_hex_ids: bigint[];
  affected_worker_count: number;
  total_payout: number;
  created_at: Date;
}

interface TriggerEvent {
  lat: number;
  lng: number;
  trigger_type: string;
  city: string;
  metadata?: Record<string, any>; // e.g., rainfall_mm, aqi_value
}

// --- Constants ---
const H3_RESOLUTION = 8; // Resolution 8 = ~0.74 km² per hexagon
const K_RING_SIZE = 1;   // k=1 ring covers ~2 km radius (7 hexagons total)

// --- Main Trigger Processing Function ---

/**
 * Processes a trigger event (weather, environmental disruption) to find affected workers
 * and record the disruption event in the database.
 * 
 * The H3 hexagonal indexing approach ensures:
 * - Precise geographic targeting (only workers in affected area pay out)
 * - Reduced basis risk compared to text-based zones
 * - Scalable queries with indexed database lookups
 * 
 * @param event - Trigger event with location and type
 * @returns List of affected worker IDs (used for payout processing)
 */
export async function processH3Trigger(event: TriggerEvent): Promise<string[]> {
  const { lat, lng, trigger_type, city, metadata } = event;

  console.info(`\n[TRIGGER] Processing ${trigger_type} event in ${city}`);
  console.info(`  Location: (${lat.toFixed(6)}, ${lng.toFixed(6)})`);

  try {
    // --- Step 1: Convert event location to H3 hexagon ---
    // 
    // h3-js v4 function: latLngToCell(lat, lng, resolution)
    // Returns a BigInt representing the H3 cell ID for that coordinate
    // Resolution 8 provides a good balance of precision (~750m) and query performance
    //
    const eventHexId = latLngToCell(lat, lng, H3_RESOLUTION);
    console.info(`  Event Hex ID: ${eventHexId}`);

    // --- Step 2: Get the k-ring around the event hex ---
    // 
    // gridDisk(hex, k) returns all hexagons within distance k from the center hex
    // For k=1: returns an array of 7 hexagons (center + 6 neighbors)
    // This covers a ~2 km radius, appropriate for weather-based triggers
    //
    // Why k=1 and not other rings?
    // - k=0 (just center) is too small for weather events that span multiple zones
    // - k=1 provides ~2 km coverage matching typical weather radar cells
    // - k=2 (19 hexagons) might be too broad for local disruptions
    //
    const affectedHexStrings = gridDisk(eventHexId, K_RING_SIZE);
    // Convert h3-js hex strings to BigInt for database storage
    // h3-js returns hexadecimal strings, so we parse with radix 16
    const affectedHexIds = affectedHexStrings.map(h => BigInt('0x' + h));
    console.info(`  Affected hex ring (k=${K_RING_SIZE}): ${affectedHexIds.length} hexagons`);
    console.info(`  Hex IDs: ${affectedHexIds.join(', ')}`);

    // --- Step 3: Query workers in the affected hexagons ---
    // 
    // This query uses the GIN index on workers(home_hex_id) for fast lookups
    // = ANY() operator checks if a single value exists in an array
    // Performance: O(log n) with GIN index vs O(n) without
    //
    const { rows: affectedWorkers } = await pool.query<Worker>(
      `SELECT id, name, city, platform, home_hex_id, active_hex_id 
       FROM workers 
       WHERE home_hex_id = ANY($1::bigint[])
       ORDER BY id`,
      [affectedHexIds]
    );

    console.info(`  Found ${affectedWorkers.length} workers in affected area`);

    if (affectedWorkers.length > 0) {
      console.info(`  Worker IDs: ${affectedWorkers.map(w => w.id.substring(0, 8)).join(', ')}...`);
    }

    const affectedWorkerIds = affectedWorkers.map(w => w.id);

    // --- Step 4: Handle edge case - no workers affected ---
    // 
    // If the trigger occurs in an unpopulated area, we log it but don't create
    // a disruption event. This keeps the database clean of zero-impact events.
    //
    if (affectedWorkerIds.length === 0) {
      console.info(`  ⚠ No workers in affected area. Skipping disruption event creation.\n`);
      return [];
    }

    // --- Step 5: Create disruption_event record ---
    // 
    // This record serves multiple purposes:
    // 1. Auditing: Historical record of all trigger events
    // 2. Analytics: Analyze which triggers fire most, how many workers affected
    // 3. Debugging: Verify trigger logic and geospatial calculations
    // 4. Compliance: Required for insurance claim investigations
    //
    // We store the ENTIRE affected_hex_ids array for full auditability
    //
    const disruptionEventId = randomUUID();
    const disruptionEvent: DisruptionEvent = {
      id: disruptionEventId,
      trigger_type,
      city,
      latitude: lat,
      longitude: lng,
      affected_hex_ids: affectedHexIds,
      affected_worker_count: affectedWorkerIds.length,
      total_payout: 0, // Will be calculated by payout service
      created_at: new Date(),
    };

    try {
      const insertResult = await pool.query(
        `INSERT INTO disruption_events 
         (id, trigger_type, city, latitude, longitude, affected_hex_ids, affected_worker_count, total_payout, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          disruptionEvent.id,
          disruptionEvent.trigger_type,
          disruptionEvent.city,
          disruptionEvent.latitude,
          disruptionEvent.longitude,
          disruptionEvent.affected_hex_ids,
          disruptionEvent.affected_worker_count,
          disruptionEvent.total_payout,
          disruptionEvent.created_at,
        ]
      );

      console.info(`  Created disruption_event: ${insertResult.rows[0].id}`);
    } catch (dbError) {
      console.error(`  Error creating disruption_event:`, dbError);
      // Re-throw to signal upstream that something went wrong
      throw dbError;
    }

    // --- Step 6: Return affected worker IDs for payout processing ---
    //
    // The payout service will:
    // 1. Fetch these workers
    // 2. Look up their policies for the current week
    // 3. Calculate individual payouts
    // 4. Initiate payments via Razorpay
    // 5. Update claim records with payment status
    //
    console.info(`  Passing ${affectedWorkerIds.length} worker IDs to payout service\n`);
    return affectedWorkerIds;

  } catch (error) {
    console.error(`  ✗ Error processing trigger:`, error);
    throw error;
  }
}

/**
 * Checks if a specific location (lat/lng) is covered by an active delivery zone.
 * Used for real-time validation of worker locations during delivery.
 * 
 * Alternative use case: Validate a trigger event is in a known delivery region
 * before processing it.
 * 
 * @param lat Latitude
 * @param lng Longitude
 * @param city City filter
 * @returns true if location has active workers, false otherwise
 */
export async function isLocationCovered(
  lat: number,
  lng: number,
  city: string
): Promise<boolean> {
  const hexId = latLngToCell(lat, lng, H3_RESOLUTION);
  const ringHexStrings = gridDisk(hexId, 1); // Check center + neighbors
  // Convert h3-js hex strings to BigInt for database query
  // h3-js returns hexadecimal strings, so we parse with radix 16
  const ringHexIds = ringHexStrings.map(h => BigInt('0x' + h));

  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM workers 
     WHERE city = $1 AND home_hex_id = ANY($2::bigint[])`,
    [city, ringHexIds]
  );

  return parseInt(rows[0].count, 10) > 0;
}

/**
 * Simulations helper: Get all hex IDs within a k-ring for visualization/testing.
 * 
 * @param lat Center latitude
 * @param lng Center longitude
 * @param k Ring size
 * @returns Array of hex IDs as strings
 */
export function getHexRing(lat: number, lng: number, k: number = 1): string[] {
  const centerHex = latLngToCell(lat, lng, H3_RESOLUTION);
  return gridDisk(centerHex, k);
}
