import { Router, Response } from 'express';
import { AuthenticatedRequest, requireInsurer } from '../middleware/auth';
import { processTriggerEvent } from '../jobs/triggerMonitor';
import { query } from '../db';
import { premiumService } from '../services/premiumService';
import { logger } from '../lib/logger';
import { processHealthEmergencyPayload } from './webhooks';
import { config } from '../config';
import { processTriggerSync } from '../workers/syncFallback';

const router = Router();

const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  mumbai: { lat: 19.1136, lng: 72.8697 },
  delhi: { lat: 28.6139, lng: 77.209 },
  chennai: { lat: 13.0827, lng: 80.2707 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  hyderabad: { lat: 17.385, lng: 78.4867 },
};

router.get('/live-events', async (req, res: Response) => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '1'), 10) || 1, 1), 50);

    const sqlWithStatus = `SELECT id, trigger_type, city, zone, trigger_value,
                                  trigger_threshold as threshold,
                                  affected_workers_count as affected_worker_count,
                                  total_payout_amount as total_payout,
                                  status, event_start
                           FROM disruption_events
                           WHERE status = $1
                           ORDER BY event_start DESC
                           LIMIT $2`;

    const sqlWithoutStatus = `SELECT id, trigger_type, city, zone, trigger_value,
                                     trigger_threshold as threshold,
                                     affected_workers_count as affected_worker_count,
                                     total_payout_amount as total_payout,
                                     status, event_start
                              FROM disruption_events
                              ORDER BY event_start DESC
                              LIMIT $1`;

    const rows = status
      ? (await query(sqlWithStatus, [status, limit])).rows
      : (await query(sqlWithoutStatus, [limit])).rows;

    return res.status(200).json({
      events: rows.map((event: any) => ({
        ...event,
        trigger_value: event.trigger_value != null ? Number(event.trigger_value) : event.trigger_value,
        threshold: event.threshold != null ? Number(event.threshold) : event.threshold,
        affected_worker_count:
          event.affected_worker_count != null
            ? Number(event.affected_worker_count)
            : event.affected_worker_count,
        total_payout: event.total_payout != null ? Math.round(Number(event.total_payout)) : event.total_payout,
      })),
    });
  } catch (err) {
    logger.error('Triggers', 'live_events_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return res.status(500).json({ message: 'Failed to fetch live events' });
  }
});

router.post('/simulate', requireInsurer, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const city = String(req.body?.city || 'mumbai').toLowerCase();
    const coords = CITY_COORDINATES[city] || CITY_COORDINATES.mumbai;

    const lat = Number(req.body?.lat ?? coords.lat);
    const lng = Number(req.body?.lng ?? coords.lng);
    const triggerType = String(req.body?.trigger_type ?? req.body?.triggerType ?? 'heavy_rainfall');
    const triggerValue = Number(req.body?.trigger_value ?? req.body?.value ?? 0);
    const disruptionHours = Number(
      req.body?.disruption_hours ?? premiumService.getDisruptionHours(triggerType)
    );
    const zone = String(req.body?.zone || '');

    // Clear existing active events for this trigger type so simulate always fires fresh
    await query(
      `UPDATE disruption_events
       SET status='processed'
       WHERE city=$1 AND trigger_type=$2 AND status='active'`,
      [city, triggerType]
    );

    if (triggerType === 'pandemic_containment') {
      const latForPolygon = Number(req.body?.lat ?? coords.lat);
      const lngForPolygon = Number(req.body?.lng ?? coords.lng);
      const severity = String(req.body?.severity ?? 'containment').toLowerCase();

      const webhookResult = await processHealthEmergencyPayload({
        event_type: 'containment_zone_declared',
        source: 'simulate',
        district: zone || 'Test District',
        state: String(req.body?.state ?? 'Test State'),
        city,
        severity: severity as 'watch' | 'adjacent' | 'containment',
        nationwide: false,
        declared_at: new Date().toISOString(),
        lifted_at: null,
        boundary_geojson: req.body?.boundary_geojson ?? buildTestPolygon(latForPolygon, lngForPolygon),
        metadata: { simulated: true },
      });

      return res.status(webhookResult.status_code).json(webhookResult.payload);
    }

    const result = await processTriggerEvent({
      trigger_type: triggerType,
      city,
      zone,
      lat,
      lng,
      trigger_value: triggerValue,
      disruption_hours: disruptionHours,
    });

    // In-memory mode: BullMQ workers are disabled, so run the full
    // claim → validate → payout pipeline synchronously right here
    if (config.USE_IN_MEMORY_REDIS && result.event_id && result.worker_ids.length > 0) {
      logger.info('Triggers', 'sync_pipeline_start', {
        event_id: result.event_id,
        workers: result.worker_ids.length,
      });
      await processTriggerSync({
        disruption_event_id: result.event_id,
        trigger_type: triggerType,
        disruption_hours: disruptionHours,
        trigger_value: triggerValue,
        worker_ids: result.worker_ids,
      });
    }

    let totalPayout = 0;
    if (result.worker_ids.length > 0) {
      const { rows } = await query<{ avg_daily_earning: string }>(
        `SELECT avg_daily_earning::text
         FROM workers
         WHERE id = ANY($1::uuid[])`,
        [result.worker_ids]
      );

      totalPayout = rows.reduce((sum, row) => {
        const earning = Number(row.avg_daily_earning || 0);
        return sum + premiumService.calculateCoverageAmount(earning, triggerType);
      }, 0);
    }

    return res.status(200).json({
      event_id: result.event_id,
      trigger_type: triggerType,
      city,
      zone,
      value: triggerValue,
      affected_workers: result.affected_worker_count,
      total_payout: totalPayout,
      hex_ring_size: result.affected_hex_ids.length,
      event_hex: result.event_hex,
      status: 'processing',
      message: `Trigger fired. ${result.affected_worker_count} workers will receive claims via BullMQ.`,
    });
  } catch (err) {
    logger.error('Triggers', 'simulate_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return res.status(500).json({ message: 'Failed to simulate trigger event' });
  }
});

function buildTestPolygon(lat: number, lng: number) {
  const d = 0.005;
  return {
    type: 'Polygon' as const,
    coordinates: [[
      [lng - d, lat - d],
      [lng + d, lat - d],
      [lng + d, lat + d],
      [lng - d, lat + d],
      [lng - d, lat - d],
    ]],
  };
}

export default router;
