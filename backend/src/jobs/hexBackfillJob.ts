import cron from 'node-cron';
import { Client } from '@googlemaps/google-maps-services-js';
import { latLngToCell } from 'h3-js';
import { query } from '../db';

const H3_RESOLUTION = 8;
const BATCH_SIZE = 50;

const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY?.trim() || '';

const mapsClient = new Client({});

interface WorkerBackfillRow {
  id: string;
  zone: string | null;
  city: string;
}

async function geocodeZone(zone: string, city: string): Promise<{ lat: number; lng: number } | null> {
  if (!mapsApiKey) {
    return null;
  }

  try {
    const response = await mapsClient.geocode({
      params: {
        address: `${zone}, ${city}, India`,
        key: mapsApiKey,
        region: 'in',
      },
    });

    if (response.data.status !== 'OK' || response.data.results.length === 0) {
      return null;
    }

    const location = response.data.results[0].geometry.location;
    return { lat: location.lat, lng: location.lng };
  } catch {
    return null;
  }
}

export async function backfillCentroidWorkers(): Promise<void> {
  if (!mapsApiKey) {
    console.warn('[HexBackfill] GOOGLE_MAPS_API_KEY missing. Skipping centroid worker backfill.');
    return;
  }

  const { rows } = await query<WorkerBackfillRow>(
    `SELECT id, zone, city
     FROM workers
     WHERE hex_is_centroid_fallback = TRUE
     ORDER BY created_at ASC
     LIMIT $1`,
    [BATCH_SIZE]
  );

  if (rows.length === 0) {
    return;
  }

  let updated = 0;
  for (const worker of rows) {
    if (!worker.zone) {
      continue;
    }

    try {
      const location = await geocodeZone(worker.zone, worker.city);
      if (!location) {
        continue;
      }

      const hexId = latLngToCell(location.lat, location.lng, H3_RESOLUTION);
      await query(
        `UPDATE workers
         SET home_hex_id = $1,
             hex_is_centroid_fallback = FALSE,
             updated_at = NOW()
         WHERE id = $2`,
        [BigInt(`0x${hexId}`).toString(), worker.id]
      );
      updated += 1;
    } catch (err) {
      console.warn(`[HexBackfill] Failed for worker ${worker.id}:`, err);
    }
  }

  console.info(`[HexBackfill] Backfilled ${updated}/${rows.length} centroid worker hex IDs`);
}

export function startHexBackfillJob(): void {
  cron.schedule('15 3 * * *', async () => {
    try {
      await backfillCentroidWorkers();
    } catch (err) {
      console.error('[HexBackfill] Scheduled run failed:', err);
    }
  });
  console.info('[HexBackfill] Scheduled - daily at 03:15');
}
