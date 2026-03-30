import cron from 'node-cron';
import { cellToLatLng, gridDisk, latLngToCell } from 'h3-js';
import { query } from '../db';
import { weatherService } from '../services/weatherService';
import { premiumService } from '../services/premiumService';
import { claimCreationQueue } from '../queues';

const TRIGGER_CONFIGS = [
  {
    type: 'heavy_rainfall',
    check: (conditions: any) =>
      conditions.rain_1h != null && conditions.rain_1h > 15 ? conditions.rain_1h : null,
  },
  {
    type: 'extreme_heat',
    check: (conditions: any) =>
      conditions.feels_like != null && conditions.feels_like > 44
        ? conditions.feels_like
        : conditions.temp != null && conditions.temp > 44
          ? conditions.temp
          : null,
  },
];

interface ActiveZone {
  home_hex_id: string;
  city: string;
}

export function startTriggerMonitor(): void {
  cron.schedule('*/30 * * * *', async () => {
    console.info('[TriggerMonitor] Poll cycle started');
    try {
      await runTriggerCycle();
    } catch (err) {
      console.error('[TriggerMonitor] Cycle failed:', err);
    }
  });
  console.info('[TriggerMonitor] Scheduled - every 30 minutes');
}

export async function runTriggerCycle(): Promise<void> {
  const { rows: activeZones } = await query<ActiveZone>(
    `SELECT DISTINCT w.home_hex_id::text, w.city
     FROM workers w
     JOIN policies p ON p.worker_id = w.id
     WHERE p.status = 'active'
       AND p.week_start = date_trunc('week', NOW())::date
       AND w.home_hex_id IS NOT NULL`
  );

  if (activeZones.length === 0) {
    console.info('[TriggerMonitor] No active policy zones found');
    return;
  }

  const weatherResults = await Promise.allSettled(
    activeZones.map((zone) => checkZoneTriggers(zone))
  );

  weatherResults.forEach((result) => {
    if (result.status === 'rejected') {
      console.error('[TriggerMonitor] Zone weather check failed:', result.reason);
    }
  });

  const zoneMapByCity = new Map<string, string[]>();
  for (const zone of activeZones) {
    const list = zoneMapByCity.get(zone.city) ?? [];
    if (!list.includes(zone.home_hex_id)) {
      list.push(zone.home_hex_id);
    }
    zoneMapByCity.set(zone.city, list);
  }

  for (const [city, zoneHexIds] of zoneMapByCity.entries()) {
    await checkAQITrigger(city, zoneHexIds).catch((err) => {
      console.error(`[TriggerMonitor] AQI check failed for ${city}:`, err);
    });
  }
}

async function checkZoneTriggers(zone: ActiveZone): Promise<void> {
  const [lat, lng] = cellToLatLng(BigInt(zone.home_hex_id).toString(16));
  const conditions = await weatherService.getCurrentConditions(lat, lng);

  for (const trigger of TRIGGER_CONFIGS) {
    const value = trigger.check(conditions);
    if (value === null) {
      continue;
    }

    await processTrigger({
      triggerType: trigger.type,
      city: zone.city,
      lat,
      lng,
      value,
      zoneHexId: zone.home_hex_id,
    });
  }
}

async function checkAQITrigger(city: string, zoneHexIds: string[]): Promise<void> {
  const aqi = await weatherService.getAQI(city);
  if (aqi === null || aqi <= 300) {
    return;
  }

  const results = await Promise.allSettled(
    zoneHexIds.map(async (zoneHexId) => {
      const [lat, lng] = cellToLatLng(BigInt(zoneHexId).toString(16));
      return processTrigger({
        triggerType: 'severe_aqi',
        city,
        lat,
        lng,
        value: aqi,
        zoneHexId,
      });
    })
  );

  results.forEach((result) => {
    if (result.status === 'rejected') {
      console.error(`[TriggerMonitor] AQI zone trigger failed for ${city}:`, result.reason);
    }
  });
}

async function processTrigger(params: {
  triggerType: string;
  city: string;
  lat: number;
  lng: number;
  value: number;
  zoneHexId?: string;
}): Promise<{
  eventId: string;
  workerIds: string[];
  ringHexes: string[];
  eventHex: string;
  zoneKey: string;
} | null> {
  const { triggerType, city, lat, lng, value, zoneHexId } = params;

  const eventHex = latLngToCell(lat, lng, 8);
  const zoneKey = zoneHexId ? BigInt(zoneHexId).toString() : BigInt(`0x${eventHex}`).toString();
  const ringHexes = gridDisk(eventHex, 1);

  const { rows: existing } = await query<{ id: string }>(
    `SELECT id
     FROM disruption_events
     WHERE city=$1
       AND zone=$2
       AND trigger_type=$3
       AND event_start > NOW() - INTERVAL '6 hours'
       AND event_end IS NULL
     LIMIT 1`,
    [city, zoneKey, triggerType]
  );
  if (existing.length > 0) {
    console.info(
      `[TriggerMonitor] Duplicate suppressed: ${triggerType} in ${city} zone ${zoneKey}`
    );
    return null;
  }

  const ringBigints = ringHexes.map((h) => BigInt(`0x${h}`));
  const { rows: affectedWorkers } = await query<{ id: string }>(
    `SELECT DISTINCT w.id
     FROM workers w
     JOIN policies p ON p.worker_id = w.id
     WHERE w.home_hex_id = ANY($1::bigint[])
       AND p.status = 'active'
       AND p.week_start = date_trunc('week', NOW())::date`,
    [ringBigints]
  );

  if (affectedWorkers.length === 0) {
    console.info(
      `[TriggerMonitor] ${triggerType} in ${city} zone ${zoneKey} - no affected workers`
    );
    return null;
  }

  const disruptionHours = premiumService.getDisruptionHours(triggerType);
  const threshold = premiumService.getThreshold(triggerType);
  const severity = premiumService.computeSeverity(triggerType, value);

  const { rows: events } = await query<{ id: string }>(
    `INSERT INTO disruption_events (
       trigger_type, city, zone, trigger_value, trigger_threshold,
       severity, disruption_hours, affected_hex_ids,
       affected_workers_count, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active')
     RETURNING id`,
    [
      triggerType,
      city,
      zoneKey,
      value,
      threshold,
      severity,
      disruptionHours,
      ringBigints,
      affectedWorkers.length,
    ]
  );

  const eventId = events[0].id;
  const workerIds = affectedWorkers.map((w) => w.id);

  console.info(
    `[TriggerMonitor] ${triggerType} in ${city} zone ${zoneKey} - ` +
      `${value} (threshold ${threshold}) - ` +
      `${workerIds.length} workers affected`
  );

  await claimCreationQueue.add(
    'create-claims',
    {
      disruption_event_id: eventId,
      trigger_type: triggerType,
      disruption_hours: disruptionHours,
      trigger_value: value,
      worker_ids: workerIds,
    },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    }
  );

  return { eventId, workerIds, ringHexes, eventHex, zoneKey };
}

// Backward-compatible simulation entrypoint used by /triggers/simulate.
export async function processTriggerEvent(input: {
  trigger_type: string;
  city: string;
  zone?: string;
  lat: number;
  lng: number;
  trigger_value?: number;
  disruption_hours?: number;
}): Promise<{
  event_id: string | null;
  event_hex: string;
  affected_hex_ids: string[];
  affected_worker_count: number;
  worker_ids: string[];
}> {
  const result = await processTrigger({
    triggerType: input.trigger_type,
    city: input.city,
    lat: input.lat,
    lng: input.lng,
    value: input.trigger_value ?? premiumService.getThreshold(input.trigger_type),
  });

  const eventHex = latLngToCell(input.lat, input.lng, 8);
  const ringHexes = gridDisk(eventHex, 1);

  return {
    event_id: result?.eventId ?? null,
    event_hex: eventHex,
    affected_hex_ids: ringHexes,
    affected_worker_count: result?.workerIds.length ?? 0,
    worker_ids: result?.workerIds ?? [],
  };
}
