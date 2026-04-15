import cron from 'node-cron';
import { cellToLatLng, gridDisk, latLngToCell } from 'h3-js';
import { query } from '../db';
import { logger } from '../lib/logger';
import { claimCreationQueue } from '../queues';
import { premiumService } from '../services/premiumService';
import { weatherBudget, weatherService } from '../services/weatherService';
import { processTriggerSync } from '../workers/syncFallback';

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

const CITY_CLUSTER_SEEDS: Record<string, Array<{ id: string; lat: number; lng: number }>> = {
  mumbai: [
    { id: 'coastal', lat: 18.95, lng: 72.83 },
    { id: 'inland', lat: 19.16, lng: 72.93 },
  ],
  delhi: [
    { id: 'central', lat: 28.61, lng: 77.21 },
    { id: 'outer', lat: 28.71, lng: 77.29 },
  ],
  chennai: [
    { id: 'coastal', lat: 13.05, lng: 80.28 },
    { id: 'inland', lat: 13.12, lng: 80.2 },
  ],
  bangalore: [{ id: 'city', lat: 12.97, lng: 77.59 }],
  hyderabad: [{ id: 'city', lat: 17.39, lng: 78.49 }],
};

interface ActiveZone {
  home_hex_id: string;
  city: string;
}

interface ZonePoint extends ActiveZone {
  lat: number;
  lng: number;
}

interface ZoneCluster {
  city: string;
  cluster_id: string;
  lat: number;
  lng: number;
  zones: ZonePoint[];
}

function normalizeCity(city: string): string {
  return city.trim().toLowerCase();
}

function distanceSquared(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return dLat * dLat + dLng * dLng;
}

function buildClusters(zones: ZonePoint[]): ZoneCluster[] {
  const byCity = new Map<string, ZonePoint[]>();
  for (const zone of zones) {
    const city = normalizeCity(zone.city);
    const list = byCity.get(city) ?? [];
    list.push(zone);
    byCity.set(city, list);
  }

  const clusters: ZoneCluster[] = [];

  for (const [city, cityZones] of byCity.entries()) {
    const seeds = CITY_CLUSTER_SEEDS[city];

    if (!seeds || seeds.length === 0) {
      clusters.push({
        city,
        cluster_id: 'default',
        lat: cityZones[0].lat,
        lng: cityZones[0].lng,
        zones: cityZones,
      });
      continue;
    }

    const assigned = new Map<string, ZonePoint[]>();
    for (const seed of seeds) {
      assigned.set(seed.id, []);
    }

    for (const zone of cityZones) {
      let nearest = seeds[0];
      let nearestDistance = distanceSquared(zone, seeds[0]);
      for (let i = 1; i < seeds.length; i += 1) {
        const candidate = seeds[i];
        const candidateDistance = distanceSquared(zone, candidate);
        if (candidateDistance < nearestDistance) {
          nearest = candidate;
          nearestDistance = candidateDistance;
        }
      }
      assigned.get(nearest.id)!.push(zone);
    }

    for (const seed of seeds) {
      const clusterZones = assigned.get(seed.id) ?? [];
      if (clusterZones.length === 0) {
        continue;
      }
      clusters.push({
        city,
        cluster_id: seed.id,
        lat: seed.lat,
        lng: seed.lng,
        zones: clusterZones,
      });
    }
  }

  return clusters;
}

export function startTriggerMonitor(): void {
  cron.schedule('*/30 * * * *', async () => {
    try {
      await runTriggerCycle();
    } catch (err) {
      logger.error('TriggerMonitor', 'cycle_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  logger.info('TriggerMonitor', 'scheduled', { cron: '*/30 * * * *' });
}

async function getWeatherForZoneCluster(cluster: ZoneCluster): Promise<any | null> {
  if (!weatherBudget.canMakeOWMCall()) {
    const budget = weatherBudget.getStatus();
    logger.warn('TriggerMonitor', 'owm_budget_exhausted_skip', {
      city: cluster.city,
      cluster_id: cluster.cluster_id,
      owm_calls_today: budget.owm_calls_today,
      limit: budget.owm_daily_limit,
    });
    return null;
  }

  return weatherService.getCurrentConditions(cluster.lat, cluster.lng);
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
    logger.info('TriggerMonitor', 'no_active_policy_zones');
    return;
  }

  const zonePoints: ZonePoint[] = activeZones.map((zone) => {
    const [lat, lng] = cellToLatLng(BigInt(zone.home_hex_id).toString(16));
    return {
      ...zone,
      lat,
      lng,
    };
  });

  const clusters = buildClusters(zonePoints);
  logger.info('TriggerMonitor', 'cycle_started', {
    zones_checked: activeZones.length,
    clusters_checked: clusters.length,
  });

  const budgetStatus = weatherBudget.getStatus();
  if (budgetStatus.owm_pct_used >= 80) {
    logger.warn('TriggerMonitor', 'api_budget_low', {
      owm_calls_today: budgetStatus.owm_calls_today,
      limit: budgetStatus.owm_daily_limit,
    });
  }

  for (const cluster of clusters) {
    let conditions: any | null = null;
    try {
      conditions = await getWeatherForZoneCluster(cluster);
    } catch (err) {
      logger.error('TriggerMonitor', 'cluster_weather_fetch_failed', {
        city: cluster.city,
        cluster_id: cluster.cluster_id,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    if (!conditions) {
      continue;
    }

    for (const zone of cluster.zones) {
      for (const trigger of TRIGGER_CONFIGS) {
        const value = trigger.check(conditions);
        if (value === null) {
          continue;
        }
        await processTrigger({
          triggerType: trigger.type,
          city: normalizeCity(zone.city),
          lat: zone.lat,
          lng: zone.lng,
          value,
          zoneHexId: zone.home_hex_id,
        });
      }
    }
  }

  const zoneMapByCity = new Map<string, string[]>();
  for (const zone of activeZones) {
    const city = normalizeCity(zone.city);
    const list = zoneMapByCity.get(city) ?? [];
    if (!list.includes(zone.home_hex_id)) {
      list.push(zone.home_hex_id);
    }
    zoneMapByCity.set(city, list);
  }

  for (const [city, zoneHexIds] of zoneMapByCity.entries()) {
    await checkAQITrigger(city, zoneHexIds).catch((err) => {
      logger.error('TriggerMonitor', 'aqi_check_failed', {
        city,
        error: err instanceof Error ? err.message : String(err),
      });
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
      logger.error('TriggerMonitor', 'aqi_zone_trigger_failed', {
        city,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
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

  // Improved suppression: Check for same city/zone/type AND ensure the event is fairly recent (within 1 hour for manual overrides)
  const { rows: existing } = await query<{ id: string }>(
    `SELECT id
     FROM disruption_events
     WHERE city=$1
       AND (zone=$2 OR (latitude=$3 AND longitude=$4))
       AND trigger_type=$5
       AND status='active'
       AND event_start > NOW() - INTERVAL '1 hour'
     LIMIT 1`,
    [city, zoneKey, lat, lng, triggerType]
  );
  if (existing.length > 0) {
    logger.warn('TriggerMonitor', 'duplicate_suppressed', {
      trigger_type: triggerType,
      city,
      zone: zoneKey,
    });
    return null;
  }

  const ringBigints = ringHexes.map((h) => BigInt(`0x${h}`));
  const { rows: affectedWorkers } = await query<{ id: string; hex_is_centroid_fallback: boolean }>(
    `SELECT DISTINCT w.id, COALESCE(w.hex_is_centroid_fallback, FALSE) AS hex_is_centroid_fallback
     FROM workers w
     JOIN policies p ON p.worker_id = w.id
     WHERE w.home_hex_id = ANY($1::bigint[])
       AND p.status = 'active'
       AND p.week_start = date_trunc('week', NOW())::date`,
    [ringBigints]
  );

  if (affectedWorkers.length === 0) {
    return null;
  }

  const disruptionHours = premiumService.getDisruptionHours(triggerType);
  const threshold = premiumService.getThreshold(triggerType);
  const severity = premiumService.computeSeverity(triggerType, value);

  const centroidWorkers = affectedWorkers.filter((worker) => worker.hex_is_centroid_fallback);
  if (centroidWorkers.length > 0) {
    logger.warn('TriggerMonitor', 'centroid_workers_in_trigger_ring', {
      trigger_type: triggerType,
      city,
      zone: zoneKey,
      centroid_worker_count: centroidWorkers.length,
    });
  }

  const { rows: events } = await query<{ id: string }>(
    `INSERT INTO disruption_events (
       trigger_type, city, zone, latitude, longitude, trigger_value, trigger_threshold,
       severity, disruption_hours, affected_hex_ids,
       affected_worker_count, affected_workers_count, total_payout, total_payout_amount, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,0,'active')
     RETURNING id`,
    [
      triggerType,
      city,
      zoneKey,
      lat,
      lng,
      value,
      threshold,
      severity,
      disruptionHours,
      ringBigints,
      affectedWorkers.length,
      affectedWorkers.length,
    ]
  );

  const eventId = events[0].id;
  const workerIds = affectedWorkers.map((w) => w.id);

  logger.info('TriggerMonitor', 'trigger_fired', {
    trigger_type: triggerType,
    city,
    zone: zoneKey,
    value,
    threshold,
    affected_workers: workerIds.length,
    event_hex: eventHex,
    ring_hexes: ringHexes.length,
  });

  const jobData = {
    disruption_event_id: eventId,
    trigger_type: triggerType,
    disruption_hours: disruptionHours,
    trigger_value: value,
    worker_ids: workerIds,
  };

  try {
    await claimCreationQueue.add('create-claims', jobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    });
  } catch (redisErr) {
    logger.error('TriggerMonitor', 'claim_enqueue_failed_sync_fallback', {
      error: redisErr instanceof Error ? redisErr.message : String(redisErr),
      event_id: eventId,
      worker_count: workerIds.length,
    });
    await processTriggerSync(jobData);
  }

  return { eventId, workerIds, ringHexes, eventHex, zoneKey };
}

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
    city: normalizeCity(input.city),
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
