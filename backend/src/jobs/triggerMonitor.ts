import { randomUUID } from 'crypto';
import { gridDisk, latLngToCell } from 'h3-js';
import { query } from '../db';
import { getCurrentWeekRange } from '../services/premiumService';
import { enqueueClaimCreationJob } from '../workers/claimCreation';

export interface TriggerEventInput {
  trigger_type: string;
  city: string;
  zone?: string;
  lat: number;
  lng: number;
  trigger_value?: number;
  disruption_hours?: number;
}

function h3ToBigIntStrings(hexes: string[]): string[] {
  return hexes.map((hex) => BigInt(`0x${hex}`).toString());
}

export async function processTriggerEvent(input: TriggerEventInput) {
  const eventHex = latLngToCell(input.lat, input.lng, 8);
  const ringHexes = gridDisk(eventHex, 1);
  const ringBigints = h3ToBigIntStrings(ringHexes);

  const { weekStart } = getCurrentWeekRange();

  const workersResult = await query(
    `SELECT DISTINCT w.id
     FROM workers w
     JOIN policies p ON p.worker_id = w.id
     WHERE w.home_hex_id = ANY($1::bigint[])
     AND p.status = 'active'
     AND p.week_start = $2::date`,
    [ringBigints, weekStart]
  );

  const workerIds = workersResult.rows.map((row: any) => String(row.id));

  const eventId = randomUUID();
  await query(
    `INSERT INTO disruption_events (
      id,
      trigger_type,
      city,
      zone,
      affected_hex_ids,
      trigger_value,
      disruption_hours,
      affected_worker_count,
      total_payout,
      status,
      event_start
    ) VALUES (
      $1,$2,$3,$4,$5::bigint[],$6,$7,$8,0,'active',NOW()
    )`,
    [
      eventId,
      input.trigger_type,
      input.city,
      input.zone || null,
      ringBigints,
      input.trigger_value || 0,
      input.disruption_hours || 4,
      workerIds.length,
    ]
  );

  await query(
    `UPDATE disruption_events
     SET affected_hex_ids = $1::bigint[], affected_worker_count = $2
     WHERE id = $3`,
    [ringBigints, workerIds.length, eventId]
  );

  if (workerIds.length > 0) {
    await enqueueClaimCreationJob({
      disruption_event_id: eventId,
      worker_ids: workerIds,
    });
  }

  return {
    event_id: eventId,
    event_hex: eventHex,
    affected_hex_ids: ringHexes,
    affected_worker_count: workerIds.length,
    worker_ids: workerIds,
  };
}

export function startTriggerMonitor(): void {
  const intervalMs = 30 * 60 * 1000;
  setInterval(() => {
    // Hook point for real trigger polling pipeline.
  }, intervalMs);
}
