import { Router, Response } from 'express';
import { AuthenticatedRequest, requireInsurer } from '../middleware/auth';
import { processTriggerEvent } from '../jobs/triggerMonitor';
import { query } from '../db';

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
    console.error('[Triggers] live-events failed:', err);
    return res.status(500).json({ message: 'Failed to fetch live events' });
  }
});

router.post('/simulate', requireInsurer, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const city = String(req.body?.city || 'mumbai').toLowerCase();
    const coords = CITY_COORDINATES[city] || CITY_COORDINATES.mumbai;

    const lat = Number(req.body?.lat ?? coords.lat);
    const lng = Number(req.body?.lng ?? coords.lng);
    const triggerType = String(req.body?.trigger_type || 'heavy_rainfall');
    const triggerValue = Number(req.body?.trigger_value || 0);
    const disruptionHours = Number(req.body?.disruption_hours || 4);

    const result = await processTriggerEvent({
      trigger_type: triggerType,
      city,
      zone: String(req.body?.zone || ''),
      lat,
      lng,
      trigger_value: triggerValue,
      disruption_hours: disruptionHours,
    });

    return res.status(200).json({
      success: true,
      message: 'Event simulated. Trigger monitor processed affected workers.',
      event: result,
    });
  } catch {
    return res.status(500).json({ message: 'Failed to simulate trigger event' });
  }
});

export default router;
