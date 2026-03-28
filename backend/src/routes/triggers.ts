import { Router, Response } from 'express';
import { AuthenticatedRequest, requireInsurer } from '../middleware/auth';
import { processTriggerEvent } from '../jobs/triggerMonitor';

const router = Router();

const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  mumbai: { lat: 19.1136, lng: 72.8697 },
  delhi: { lat: 28.6139, lng: 77.209 },
  chennai: { lat: 13.0827, lng: 80.2707 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  hyderabad: { lat: 17.385, lng: 78.4867 },
};

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
