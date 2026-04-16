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
import { logger } from '../lib/logger';
import { claimCreationQueue } from '../queues';
import { premiumService } from '../services/premiumService';
import { checkPlatformOnlineStatus } from '../services/platformVerification';
import {
  HealthBoundaryGeoJSON,
  isWorkerInContainmentZone,
} from './pandemicHexOverlap';

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

interface PandemicAdvisory {
  id: string;
  district: string;
  state: string;
  city: string;
  boundary_geojson: HealthBoundaryGeoJSON | null;
  affected_hex_ids: Array<string | number | bigint> | null;
  severity: 'watch' | 'adjacent' | 'containment';
  declared_at: string;
  source: string;
  nationwide: boolean;
}

interface PandemicEligibleWorker {
  id: string;
  avg_daily_earning: string;
  home_hex_id: string;
  zone_updated_at: string | null;
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

  logger.info('LegacyTriggerMonitor', 'processing', {
    trigger_type,
    city,
    lat,
    lng,
  });

  try {
    // --- Step 1: Convert event location to H3 hexagon ---
    // 
    // h3-js v4 function: latLngToCell(lat, lng, resolution)
    // Returns a BigInt representing the H3 cell ID for that coordinate
    // Resolution 8 provides a good balance of precision (~750m) and query performance
    //
    const eventHexId = latLngToCell(lat, lng, H3_RESOLUTION);
    logger.debug('LegacyTriggerMonitor', 'event_hex_computed', { event_hex_id: eventHexId });

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
    logger.debug('LegacyTriggerMonitor', 'ring_computed', {
      ring_size: K_RING_SIZE,
      hex_count: affectedHexIds.length,
    });

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

    logger.info('LegacyTriggerMonitor', 'workers_found', { count: affectedWorkers.length });

    if (affectedWorkers.length > 0) {
      logger.debug('LegacyTriggerMonitor', 'worker_sample', {
        worker_ids: affectedWorkers.map((w) => w.id.substring(0, 8)),
      });
    }

    const affectedWorkerIds = affectedWorkers.map(w => w.id);

    // --- Step 4: Handle edge case - no workers affected ---
    // 
    // If the trigger occurs in an unpopulated area, we log it but don't create
    // a disruption event. This keeps the database clean of zero-impact events.
    //
    if (affectedWorkerIds.length === 0) {
      logger.warn('LegacyTriggerMonitor', 'no_workers_in_affected_area', { city, trigger_type });
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

    const triggerValue = metadata?.rainfall_mm || metadata?.aqi_value || 1.0;
    const disruptionHours = premiumService.getDisruptionHours(trigger_type);

    try {
      const insertResult = await pool.query(
        `INSERT INTO disruption_events 
         (id, trigger_type, city, latitude, longitude, affected_hex_ids, affected_worker_count, total_payout, created_at, trigger_value, disruption_hours, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active')
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
          triggerValue,
          disruptionHours,
        ]
      );

      logger.info('LegacyTriggerMonitor', 'disruption_event_created', {
        disruption_event_id: insertResult.rows[0].id,
      });
    } catch (dbError) {
      logger.error('LegacyTriggerMonitor', 'disruption_event_create_failed', {
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
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
    logger.info('LegacyTriggerMonitor', 'dispatch_to_payout', {
      worker_count: affectedWorkerIds.length,
    });
    return affectedWorkerIds;

  } catch (error) {
    logger.error('LegacyTriggerMonitor', 'processing_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
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

function parseBigIntArray(values: PandemicAdvisory['affected_hex_ids']): bigint[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => {
      if (typeof value === 'bigint') {
        return value;
      }
      if (typeof value === 'number') {
        return BigInt(Math.trunc(value));
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
          return null;
        }
        if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
          return BigInt(trimmed);
        }
        if (/^[0-9]+$/.test(trimmed)) {
          return BigInt(trimmed);
        }
        return BigInt(`0x${trimmed}`);
      }
      return null;
    })
    .filter((value): value is bigint => value !== null);
}

function computeBoundaryCentroid(
  boundary: HealthBoundaryGeoJSON | null
): { lat: number; lng: number } {
  if (!boundary) {
    return { lat: 0, lng: 0 };
  }

  let points: number[][] = [];
  if (boundary.type === 'Polygon') {
    points = boundary.coordinates[0] ?? [];
  } else if (boundary.type === 'MultiPolygon') {
    points = boundary.coordinates[0]?.[0] ?? [];
  }

  if (points.length === 0) {
    return { lat: 0, lng: 0 };
  }

  const totals = points.reduce(
    (acc, point) => {
      acc.lng += Number(point[0] ?? 0);
      acc.lat += Number(point[1] ?? 0);
      return acc;
    },
    { lat: 0, lng: 0 }
  );

  return {
    lat: totals.lat / points.length,
    lng: totals.lng / points.length,
  };
}

/**
 * Process a district-level health advisory and enqueue claims for eligible workers.
 */
export async function processPandemicTrigger(advisoryId: string): Promise<string[]> {
  const { rows: advisories } = await pool.query<PandemicAdvisory>(
    `SELECT
       id::text,
       district,
       state,
       city,
       boundary_geojson,
       affected_hex_ids,
       severity,
       declared_at,
       source,
       nationwide
     FROM health_advisories
     WHERE id = $1
       AND lifted_at IS NULL
     LIMIT 1`,
    [advisoryId]
  );

  const advisory = advisories[0];
  if (!advisory) {
    throw new Error(`Advisory ${advisoryId} not found or already lifted`);
  }

  if (advisory.nationwide) {
    logger.warn('PandemicTrigger', 'nationwide_excluded', { advisory_id: advisoryId });
    return [];
  }

  const affectedHexIds = parseBigIntArray(advisory.affected_hex_ids);
  if (affectedHexIds.length === 0) {
    logger.warn('PandemicTrigger', 'advisory_without_hexes', { advisory_id: advisoryId });
    return [];
  }

  const { rows: workers } = await pool.query<PandemicEligibleWorker>(
    `SELECT DISTINCT
       w.id::text,
       w.avg_daily_earning::text,
       w.home_hex_id::text,
       w.zone_updated_at
     FROM workers w
     JOIN policies p ON p.worker_id = w.id
     WHERE w.home_hex_id = ANY($1::bigint[])
       AND p.status = 'active'
       AND p.week_start <= CURRENT_DATE
       AND p.week_end >= CURRENT_DATE
       AND (w.zone_updated_at IS NULL OR w.zone_updated_at < $2::timestamptz - INTERVAL '48 hours')
       AND LOWER(w.city) = LOWER($3)`,
    [affectedHexIds.map((hex) => hex.toString()), advisory.declared_at, advisory.city]
  );

  const verifiedWorkerIds: string[] = [];
  for (const worker of workers) {
    const workerHex = BigInt(worker.home_hex_id);
    if (!isWorkerInContainmentZone(workerHex, affectedHexIds)) {
      continue;
    }

    const wasOnline = await checkPlatformOnlineStatus(worker.id, 120, advisory.declared_at);
    if (wasOnline) {
      verifiedWorkerIds.push(worker.id);
    }
  }

  const claimDate = new Date(advisory.declared_at).toISOString().slice(0, 10);
  const newlyEligible: string[] = [];

  for (const workerId of verifiedWorkerIds) {
    const insert = await pool.query(
      `INSERT INTO pandemic_claim_dedup (worker_id, health_advisory_id, claim_date)
       VALUES ($1, $2, $3::date)
       ON CONFLICT (worker_id, health_advisory_id, claim_date) DO NOTHING`,
      [workerId, advisory.id, claimDate]
    );
    if ((insert.rowCount ?? 0) > 0) {
      newlyEligible.push(workerId);
    }
  }

  const centroid = computeBoundaryCentroid(advisory.boundary_geojson);
  const disruptionHours = premiumService.getDisruptionHours('pandemic_containment');
  const { rows: events } = await pool.query<{ id: string }>(
    `INSERT INTO disruption_events (
       trigger_type, city, zone, latitude, longitude,
       trigger_value, trigger_threshold, severity, disruption_hours,
       affected_hex_ids, affected_worker_count, affected_workers_count,
       total_payout, total_payout_amount, status, event_start
     ) VALUES (
       'pandemic_containment', $1, $2, $3, $4,
       1, 1, $5, $6,
       $7, $8, $8,
       0, 0, 'active', $9
     )
     RETURNING id`,
    [
      advisory.city,
      advisory.district,
      centroid.lat,
      centroid.lng,
      advisory.severity,
      disruptionHours,
      affectedHexIds.map((hex) => hex.toString()),
      newlyEligible.length,
      advisory.declared_at,
    ]
  );

  const eventId = events[0]?.id;
  if (eventId && newlyEligible.length > 0) {
    await claimCreationQueue.add(
      'create-claims',
      {
        disruption_event_id: eventId,
        trigger_type: 'pandemic_containment',
        disruption_hours: disruptionHours,
        trigger_value: 1,
        worker_ids: newlyEligible,
        health_advisory_id: advisory.id,
        claim_date: claimDate,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 500 },
      }
    );
  }

  logger.info('PandemicTrigger', 'processed', {
    advisory_id: advisory.id,
    city: advisory.city,
    district: advisory.district,
    workers_scanned: workers.length,
    workers_queued: newlyEligible.length,
  });

  return newlyEligible;
}
