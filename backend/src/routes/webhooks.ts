import crypto from 'crypto';
import express, { Router } from 'express';
import { latLngToCell } from 'h3-js';
import { config } from '../config';
import { pool } from '../db';
import { logger } from '../lib/logger';
import { processPandemicTrigger } from '../triggers/monitor';
import {
  computeAffectedHexIds,
  HealthBoundaryGeoJSON,
} from '../triggers/pandemicHexOverlap';

export type HealthEmergencyEventType =
  | 'containment_zone_declared'
  | 'watch_issued'
  | 'advisory_lifted';

export interface HealthEmergencyPayload {
  event_type: HealthEmergencyEventType;
  source?: string;
  district: string;
  state: string;
  city: string;
  severity: 'watch' | 'adjacent' | 'containment';
  nationwide?: boolean;
  declared_at?: string;
  lifted_at?: string | null;
  boundary_geojson?: HealthBoundaryGeoJSON;
  metadata?: Record<string, unknown>;
}

interface HealthEmergencyProcessResult {
  status: string;
  status_code: number;
  payload: Record<string, unknown>;
}

const router = Router();

function safeTimingEqual(signature: string, expected: string): boolean {
  try {
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

function computePolygonCentroid(boundary: HealthBoundaryGeoJSON): { lat: number; lng: number } {
  const points =
    boundary.type === 'Polygon'
      ? boundary.coordinates[0] ?? []
      : boundary.coordinates[0]?.[0] ?? [];

  if (points.length === 0) {
    return { lat: 0, lng: 0 };
  }

  const sum = points.reduce(
    (acc, point) => {
      acc.lng += Number(point[0] ?? 0);
      acc.lat += Number(point[1] ?? 0);
      return acc;
    },
    { lat: 0, lng: 0 }
  );

  return {
    lat: sum.lat / points.length,
    lng: sum.lng / points.length,
  };
}

function normalizePayload(payload: HealthEmergencyPayload): HealthEmergencyPayload {
  return {
    ...payload,
    district: String(payload.district ?? '').trim(),
    state: String(payload.state ?? '').trim(),
    city: String(payload.city ?? '').trim().toLowerCase(),
    severity: payload.severity,
    source: String(payload.source ?? 'unknown').trim() || 'unknown',
    nationwide: Boolean(payload.nationwide ?? false),
    declared_at: payload.declared_at ?? new Date().toISOString(),
    lifted_at: payload.lifted_at ?? null,
    metadata: payload.metadata ?? {},
  };
}

function validatePayload(payload: HealthEmergencyPayload): string | null {
  if (!['containment_zone_declared', 'watch_issued', 'advisory_lifted'].includes(payload.event_type)) {
    return `Unknown event_type: ${payload.event_type}`;
  }
  if (!['watch', 'adjacent', 'containment'].includes(payload.severity)) {
    return `Unknown severity: ${payload.severity}`;
  }
  if (!payload.district || !payload.state || !payload.city) {
    return 'district, state and city are required';
  }
  if (payload.event_type !== 'advisory_lifted' && !payload.boundary_geojson) {
    return 'boundary_geojson required for non-lift events';
  }
  return null;
}

export async function processHealthEmergencyPayload(
  input: HealthEmergencyPayload
): Promise<HealthEmergencyProcessResult> {
  const payload = normalizePayload(input);
  const validationError = validatePayload(payload);
  if (validationError) {
    return {
      status: 'error',
      status_code: 400,
      payload: { error: validationError },
    };
  }

  if (payload.event_type === 'advisory_lifted') {
    await pool.query(
      `UPDATE health_advisories
       SET lifted_at = $1, updated_at = NOW()
       WHERE district = $2
         AND state = $3
         AND city = $4
         AND lifted_at IS NULL`,
      [payload.lifted_at ?? new Date().toISOString(), payload.district, payload.state, payload.city]
    );
    return {
      status: 'lifted',
      status_code: 200,
      payload: {
        status: 'lifted',
        district: payload.district,
        city: payload.city,
      },
    };
  }

  let affectedHexIds: bigint[];
  try {
    affectedHexIds = computeAffectedHexIds(payload.boundary_geojson!);
  } catch (err) {
    return {
      status: 'error',
      status_code: 400,
      payload: { error: `Invalid GeoJSON: ${err instanceof Error ? err.message : String(err)}` },
    };
  }

  if (affectedHexIds.length === 0) {
    const centroid = computePolygonCentroid(payload.boundary_geojson!);
    const centerHex = latLngToCell(centroid.lat, centroid.lng, 8);
    affectedHexIds = [BigInt(`0x${centerHex}`)];
  }

  const { rows: advisoryRows } = await pool.query<{ id: string }>(
    `INSERT INTO health_advisories (
       district, state, city, boundary_geojson, affected_hex_ids,
       severity, declared_at, lifted_at, source, nationwide, metadata
     ) VALUES (
       $1, $2, $3, $4::jsonb, $5::bigint[],
       $6, $7::timestamptz, $8::timestamptz, $9, $10, $11::jsonb
     )
     ON CONFLICT (district, state, city, declared_at) DO NOTHING
     RETURNING id::text`,
    [
      payload.district,
      payload.state,
      payload.city,
      JSON.stringify(payload.boundary_geojson),
      affectedHexIds.map((hex) => hex.toString()),
      payload.severity,
      payload.declared_at,
      payload.lifted_at,
      payload.source,
      Boolean(payload.nationwide),
      JSON.stringify(payload.metadata ?? {}),
    ]
  );

  const advisory = advisoryRows[0];
  if (!advisory) {
    return {
      status: 'duplicate_ignored',
      status_code: 200,
      payload: {
        status: 'duplicate_ignored',
        message: 'Advisory already recorded for this district and declared_at',
      },
    };
  }

  let affectedWorkersCount = 0;
  let payoutTriggered = false;

  if (payload.severity === 'containment' && !payload.nationwide) {
    const featureEnabled =
      (process.env.FEATURE_PANDEMIC_TRIGGER_ENABLED ?? String(config.FEATURE_PANDEMIC_TRIGGER_ENABLED))
        .toLowerCase() === 'true';
    if (!featureEnabled) {
      return {
        status: 'feature_disabled',
        status_code: 200,
        payload: {
          status: 'feature_disabled',
          advisory_id: advisory.id,
        },
      };
    }

    payoutTriggered = true;
    const affectedWorkerIds = await processPandemicTrigger(advisory.id);
    affectedWorkersCount = affectedWorkerIds.length;
  }

  return {
    status: 'success',
    status_code: 201,
    payload: {
      status: 'success',
      advisory_id: advisory.id,
      event_type: payload.event_type,
      district: payload.district,
      city: payload.city,
      severity: payload.severity,
      affected_hex_count: affectedHexIds.length,
      affected_workers_count: affectedWorkersCount,
      payout_triggered: payoutTriggered,
      message: payoutTriggered
        ? `Containment zone processed. ${affectedWorkersCount} workers queued for payout.`
        : `Advisory recorded. No payouts triggered (severity: ${payload.severity}).`,
    },
  };
}

router.post(
  '/health-emergency',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signatureHeader = req.headers['x-gigguard-signature'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

    if (!signature) {
      return res.status(401).json({ error: 'Missing X-GigGuard-Signature header' });
    }
    if (!config.HEALTH_WEBHOOK_SECRET) {
      return res.status(500).json({ error: 'HEALTH_WEBHOOK_SECRET is not configured' });
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
    const expectedSignature = crypto
      .createHmac('sha256', config.HEALTH_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    if (!safeTimingEqual(String(signature), expectedSignature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    let payload: HealthEmergencyPayload;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as HealthEmergencyPayload;
    } catch {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    const result = await processHealthEmergencyPayload(payload);
    if (result.status_code >= 500) {
      logger.error('Webhooks', 'health_emergency_failed', {
        result: result.status,
      });
    }
    return res.status(result.status_code).json(result.payload);
  }
);

export default router;
