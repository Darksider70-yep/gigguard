// Day 2: One-time backfill script to geocode text-based zones and store H3 IDs.
// This script geocodes worker zones to coordinates, then converts to H3 hexagon IDs.
// 
// Usage: npx ts-node scripts/backfill_hex_ids.ts
// 
// Prerequisites:
// - GOOGLE_MAPS_API_KEY must be set in .env
// - DATABASE_URL must be set in .env
// - Workers table must have home_hex_id column (created by migration 003)

import { Client } from '@googlemaps/google-maps-services-js';
import { latLngToCell } from 'h3-js';
import { pool } from '../src/db';
import { stringify } from 'csv-stringify/sync';
import * as fs from 'fs';

// --- Configuration ---
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
if (!GOOGLE_MAPS_API_KEY) {
  throw new Error("Missing GOOGLE_MAPS_API_KEY in environment variables. Set it in .env file.");
}

const H3_RESOLUTION = 8; // Resolution 8 = ~0.74 km² per hex
const FAILED_GEOCODES_CSV_PATH = './failed_geocodes.csv';

// Google Maps rate limit: 200 req/min = ~3.33 req/sec.
// 350ms delay between requests provides a safe margin.
const RATE_LIMIT_DELAY_MS = 350;

// --- Helper Types ---
interface Worker {
  id: string;
  zone: string;
  city: string;
}

interface FailedGeocode {
  worker_id: string;
  zone: string;
  city: string;
  error_reason: string;
}

interface GeoLocation {
  lat: number;
  lng: number;
}

// --- Helper Functions ---

/**
 * Delay execution for a given number of milliseconds.
 * Used to respect Google Maps API rate limits.
 */
const delay = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetches all workers who don't have a home_hex_id yet (backfill needed).
 */
async function getWorkersToBackfill(): Promise<Worker[]> {
  try {
    const { rows } = await pool.query<Worker>(
      'SELECT id, zone, city FROM workers WHERE home_hex_id IS NULL ORDER BY created_at'
    );
    return rows;
  } catch (error) {
    console.error("Failed to fetch workers from database:", error);
    throw error;
  }
}

/**
 * Geocodes an address string like "Andheri West, Mumbai, India" using Google Maps API.
 * 
 * @param client Google Maps API client
 * @param address Full address string to geocode
 * @returns { lat, lng } if successful, null if address not found or error occurred
 */
async function geocodeAddress(client: Client, address: string): Promise<GeoLocation | null> {
  try {
    const response = await client.geocode({
      params: {
        address: address,
        key: GOOGLE_MAPS_API_KEY!,
        // Bias results to India for better accuracy
        region: 'in',
      },
    });

    // Check if geocoding was successful
    if (response.data.status === 'OK' && response.data.results.length > 0) {
      const location = response.data.results[0].geometry.location;
      return {
        lat: location.lat,
        lng: location.lng,
      };
    } else if (response.data.status === 'ZERO_RESULTS') {
      console.warn(`  -> Geocoding returned ZERO_RESULTS for: "${address}"`);
      return null;
    } else {
      console.warn(`  -> Geocoding API returned status: ${response.data.status}`);
      return null;
    }
  } catch (error) {
    console.error(`  -> Geocoding API error for address "${address}":`, error);
    return null;
  }
}

/**
 * Updates a worker's home_hex_id in the database.
 * 
 * @param workerId The worker's UUID
 * @param hexId The H3 hex ID (BigInt from h3-js)
 */
async function updateWorkerHexId(workerId: string, hexId: bigint): Promise<void> {
  try {
    // Note: The 'pg' driver handles BigInt automatically when inserting into BIGINT columns
    const result = await pool.query(
      'UPDATE workers SET home_hex_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hexId, workerId]
    );
    
    if (result.rowCount === 0) {
      throw new Error(`Worker ${workerId} not found in database`);
    }
  } catch (error) {
    console.error(`  -> Database update failed for worker ${workerId}:`, error);
    throw error;
  }
}

/**
 * Converts latitude/longitude to H3 hexagon ID at resolution 8.
 * 
 * @param lat Latitude coordinate
 * @param lng Longitude coordinate
 * @returns H3 cell ID as BigInt (decimal form for PostgreSQL BIGINT)
 */
function convertToH3HexId(lat: number, lng: number): bigint {
  // h3-js v4 returns a hexadecimal string cell ID. Convert to decimal BigInt for DB writes.
  const hexId = latLngToCell(lat, lng, H3_RESOLUTION);
  return BigInt(`0x${hexId}`);
}

/**
 * Validates that coordinates are within reasonable bounds for India.
 * India lat range: 8°N to 35°N, lng range: 68°E to 97°E
 */
function isValidIndianCoordinate(lat: number, lng: number): boolean {
  return lat >= 8 && lat <= 35 && lng >= 68 && lng <= 97;
}

// --- Main Script Logic ---

async function main() {
  console.log("\n=====================================");
  console.log("  H3 Hex ID Backfill Script");
  console.log("=====================================\n");
  
  const googleMapsClient = new Client({});
  const failedGeocodes: FailedGeocode[] = [];
  let successCount = 0;
  let skipCount = 0;

  try {
    // Fetch all workers needing backfill
    const workers = await getWorkersToBackfill();
    console.log(`Found ${workers.length} workers to backfill.\n`);

    if (workers.length === 0) {
      console.log("No workers need backfill. Exiting.\n");
      await pool.end();
      return;
    }

    // Process each worker
    for (const [index, worker] of workers.entries()) {
      const progressPercent = ((index + 1) / workers.length * 100).toFixed(1);
      const address = `${worker.zone}, ${worker.city}, India`;
      
      console.log(`[${index + 1}/${workers.length}] (${progressPercent}%) Processing worker ${worker.id}`);
      console.log(`    Address: "${address}"`);

      // Geocode the address
      const location = await geocodeAddress(googleMapsClient, address);

      if (location) {
        // Validate the coordinate is within India
        if (!isValidIndianCoordinate(location.lat, location.lng)) {
          console.warn(`  -> SKIPPED: Geocoded location (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}) is outside India`);
          skipCount++;
          failedGeocodes.push({
            worker_id: worker.id,
            zone: worker.zone,
            city: worker.city,
            error_reason: 'Geocoded location outside India',
          });
        } else {
          // Convert to H3 hex ID
          try {
            const hexId = convertToH3HexId(location.lat, location.lng);
            await updateWorkerHexId(worker.id, hexId);
            console.log(`  ✓ Success! Geocoded to (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})`);
            console.log(`    H3 Hex ID: ${hexId}`);
            successCount++;
          } catch (error) {
            console.error(`  ✗ Failed to update database:`, error);
            failedGeocodes.push({
              worker_id: worker.id,
              zone: worker.zone,
              city: worker.city,
              error_reason: 'Database update failed',
            });
          }
        }
      } else {
        console.warn(`  ✗ FAILED to geocode address`);
        failedGeocodes.push({
          worker_id: worker.id,
          zone: worker.zone,
          city: worker.city,
          error_reason: 'Geocoding API returned no results',
        });
      }

      // Respect rate limit (except on last iteration)
      if (index < workers.length - 1) {
        await delay(RATE_LIMIT_DELAY_MS);
      }
    }

    // Summary
    console.log("\n=====================================");
    console.log("  Backfill Complete");
    console.log("=====================================");
    console.log(`✓ Successfully backfilled: ${successCount} workers`);
    console.log(`⊘ Skipped: ${skipCount} workers`);
    console.log(`✗ Failed: ${failedGeocodes.length} workers`);
    console.log(`Total processed: ${workers.length} workers\n`);

    // Export failures to CSV for manual review
    if (failedGeocodes.length > 0) {
      const csvOutput = stringify(failedGeocodes, { header: true });
      fs.writeFileSync(FAILED_GEOCODES_CSV_PATH, csvOutput);
      console.log(`Failed geocode attempts exported to: ${FAILED_GEOCODES_CSV_PATH}`);
      console.log("Review this file and manually update worker zones that couldn't be geocoded.\n");
    }

    // Post-backfill instruction
    if (successCount === workers.length) {
      console.log("✓ All workers successfully backfilled!\n");
      console.log("Next step: Execute this SQL to add NOT NULL constraint to home_hex_id:");
      console.log("  ALTER TABLE workers ALTER COLUMN home_hex_id SET NOT NULL;\n");
    }

  } catch (error) {
    console.error("Script encountered a fatal error:", error);
    process.exit(1);
  } finally {
    // Always close the database connection
    await pool.end();
    console.log("Database connection closed.\n");
  }
}

// Run the script
main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
