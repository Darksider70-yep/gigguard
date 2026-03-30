import { randomUUID } from 'crypto';
import { Router, Response } from 'express';
import { latLngToCell } from 'h3-js';
import { config } from '../config';
import { query } from '../db';
import { AuthenticatedRequest, issueInsurerToken, issueWorkerToken, requireWorker } from '../middleware/auth';

const router = Router();

const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  mumbai: { lat: 19.1136, lng: 72.8697 },
  delhi: { lat: 28.6139, lng: 77.209 },
  chennai: { lat: 13.0827, lng: 80.2707 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  bengaluru: { lat: 12.9716, lng: 77.5946 },
  hyderabad: { lat: 17.385, lng: 78.4867 },
};

function estimateHomeHexId(city: string): string {
  const coords = CITY_COORDINATES[city.toLowerCase()] ?? CITY_COORDINATES.mumbai;
  const hex = latLngToCell(coords.lat, coords.lng, 8);
  return BigInt(`0x${hex}`).toString();
}

function normalizeIncomingHexId(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  try {
    if (/^\d+$/.test(raw)) {
      return BigInt(raw).toString();
    }
    if (/^0x[0-9a-f]+$/i.test(raw)) {
      return BigInt(raw).toString();
    }
    if (/^[0-9a-f]+$/i.test(raw)) {
      return BigInt(`0x${raw}`).toString();
    }
  } catch {
    return null;
  }

  return null;
}

interface InsurerProfileRow {
  id: string;
  name: string;
  email: string | null;
  phone_number: string | null;
  role: string;
  created_at: string;
}

async function resolveInsurerProfile(): Promise<InsurerProfileRow> {
  const fallback: InsurerProfileRow = {
    id: 'insurer-admin',
    name: 'Daksh Gehlot',
    email: null,
    phone_number: null,
    role: 'admin',
    created_at: new Date().toISOString(),
  };

  try {
    const byName = await query<InsurerProfileRow>(
      `SELECT id::text, name, email, phone_number, role, created_at
       FROM insurer_profiles
       WHERE LOWER(name) = LOWER($1)
       LIMIT 1`,
      ['Daksh Gehlot']
    );

    if (byName.rows[0]) {
      return byName.rows[0];
    }

    const latest = await query<InsurerProfileRow>(
      `SELECT id::text, name, email, phone_number, role, created_at
       FROM insurer_profiles
       ORDER BY updated_at DESC NULLS LAST, created_at DESC
       LIMIT 1`
    );

    if (latest.rows[0]) {
      return latest.rows[0];
    }
  } catch {
    return fallback;
  }

  return fallback;
}

router.post('/register', async (req, res: Response) => {
  try {
    const name = String(req.body?.name || '').trim();
    const phoneNumber = String(req.body?.phone_number || '').trim();
    const platform = String(req.body?.platform || '').toLowerCase();
    const city = String(req.body?.city || '').trim();

    const suppliedHexId = normalizeIncomingHexId(req.body?.home_hex_id);
    const homeHexId = suppliedHexId ?? estimateHomeHexId(city);
    const isCentroidFallback = suppliedHexId === null;

    if (!name || !phoneNumber || !city || !['zomato', 'swiggy'].includes(platform)) {
      return res.status(400).json({ message: 'Invalid worker payload' });
    }

    const workerId = randomUUID();

    const result = await query(
      `INSERT INTO workers (
        id, name, phone_number, platform, city, zone, avg_daily_earning, zone_multiplier,
        history_multiplier, upi_vpa, experience_tier, home_hex_id, hex_is_centroid_fallback, created_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,COALESCE($8,1.0),COALESCE($9,1.0),$10,$11,$12,$13,NOW()
      ) RETURNING id, name, platform, city, zone, home_hex_id::text, hex_is_centroid_fallback, avg_daily_earning, created_at`,
      [
        workerId,
        name,
        phoneNumber,
        platform,
        city,
        req.body?.zone || null,
        Number(req.body?.avg_daily_earning || 0),
        Number(req.body?.zone_multiplier || 1),
        Number(req.body?.history_multiplier || 1),
        req.body?.upi_vpa || null,
        req.body?.experience_tier || null,
        homeHexId,
        isCentroidFallback,
      ]
    );

    const worker = result.rows[0] as any;
    const token = issueWorkerToken(worker.id);

    return res.status(201).json({ token, worker });
  } catch {
    return res.status(500).json({ message: 'Failed to register worker' });
  }
});

router.post('/login', async (req, res: Response) => {
  try {
    const role = String(req.body?.role || 'worker').toLowerCase();

    if (role === 'insurer') {
      if (config.insurerLoginSecret && req.body?.secret !== config.insurerLoginSecret) {
        return res.status(401).json({ message: 'Invalid insurer credentials' });
      }

      const insurer = await resolveInsurerProfile();
      const token = issueInsurerToken(insurer.id);
      return res.status(200).json({ token, role: 'insurer', insurer });
    }

    const phoneNumber = String(req.body?.phone_number || '').trim();
    if (!phoneNumber) {
      return res.status(400).json({ message: 'phone_number is required' });
    }

    const workerResult = await query(
      `SELECT id, name, platform, city, zone, avg_daily_earning, zone_multiplier, created_at
       FROM workers
       WHERE phone_number = $1
       LIMIT 1`,
      [phoneNumber]
    );

    let worker = workerResult.rows[0] as any;

    if (!worker) {
      const id = randomUUID();
      const insert = await query(
        `INSERT INTO workers (
          id, name, phone_number, platform, city, zone, avg_daily_earning,
          zone_multiplier, history_multiplier, home_hex_id, hex_is_centroid_fallback, created_at
        ) VALUES ($1,$2,$3,'zomato','mumbai','Andheri West',900,1.1,1.0,$4,TRUE,NOW())
        RETURNING id, name, platform, city, zone, home_hex_id::text, hex_is_centroid_fallback, avg_daily_earning, zone_multiplier, created_at`,
        [id, 'GigGuard Worker', phoneNumber, estimateHomeHexId('mumbai')]
      );
      worker = insert.rows[0];
    }

    const token = issueWorkerToken(worker.id);

    return res.status(200).json({ token, role: 'worker', worker });
  } catch {
    return res.status(500).json({ message: 'Login failed' });
  }
});

router.get('/me', requireWorker, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workerId = req.user!.id;

    const result = await query(
      `SELECT
         id,
         name,
         platform,
         city,
         zone,
         home_hex_id::text,
         hex_is_centroid_fallback,
         avg_daily_earning,
         zone_multiplier,
         history_multiplier,
         experience_tier,
         upi_vpa,
         created_at
       FROM workers
       WHERE id = $1
       LIMIT 1`,
      [workerId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Worker not found' });
    }

    return res.status(200).json(result.rows[0]);
  } catch {
    return res.status(500).json({ message: 'Failed to fetch worker profile' });
  }
});

export default router;
