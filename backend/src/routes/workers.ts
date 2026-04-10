import { createHash, randomUUID } from 'crypto';
import { Router, Response } from 'express';
import { latLngToCell } from 'h3-js';
import { config } from '../config';
import { CITIES, getZoneByName, getZonesByCity } from '../constants/zones';
import { query } from '../db';
import { AuthenticatedRequest, issueInsurerToken, issueWorkerToken, requireWorker } from '../middleware/auth';
import { mlService } from '../services/mlService';
import { otpService } from '../services/otpService';

const router = Router();

interface InsurerProfileRow {
  id: string;
  name: string;
  email: string | null;
  phone_number: string | null;
  role: string;
  created_at: string;
}

interface WorkerRow {
  id: string;
  name: string;
  phone_number: string | null;
  platform: 'zomato' | 'swiggy';
  city: string;
  zone: string | null;
  home_hex_id: string | null;
  hex_is_centroid_fallback: boolean;
  avg_daily_earning: number | string;
  zone_multiplier: number;
  history_multiplier: number;
  experience_tier: string | null;
  upi_vpa: string | null;
  avatar_seed: string | null;
  verified: boolean;
  verified_at: string | null;
  created_at: string;
}

function normalizeCity(value: string): string | null {
  const city = value.trim().toLowerCase();
  const match = CITIES.find((item) => item.toLowerCase() === city);
  return match ?? null;
}

function normalizePhoneNumber(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  return null;
}

function getRequestPhone(body: any): string | null {
  return normalizePhoneNumber(body?.phone_number || body?.phone);
}

function computeAvatarSeed(name: string, phoneNumber: string): string {
  const namePart = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const phoneDigits = phoneNumber.replace(/\D/g, '');
  return `${namePart}${phoneDigits.slice(-4)}`;
}

function getDeviceFingerprint(req: AuthenticatedRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : req.ip || 'unknown';
  const userAgent = String(req.headers['user-agent'] || 'unknown');
  return createHash('sha256').update(`${ip}|${userAgent}`).digest('hex');
}

function toHexBigInt(lat: number, lng: number): string {
  const hex = latLngToCell(lat, lng, 8);
  return BigInt(`0x${hex}`).toString();
}

function cityCentroid(city: string): { lat: number; lng: number } | null {
  const zones = getZonesByCity(city);
  if (zones.length === 0) {
    return null;
  }

  const lat = zones.reduce((sum, zone) => sum + Number(zone.lat), 0) / zones.length;
  const lng = zones.reduce((sum, zone) => sum + Number(zone.lng), 0) / zones.length;
  return { lat, lng };
}

function resolveHomeHex(city: string, lat: number, lng: number): { homeHexId: string | null; fallback: boolean } {
  try {
    return {
      homeHexId: toHexBigInt(lat, lng),
      fallback: false,
    };
  } catch {
    const centroid = cityCentroid(city);
    if (!centroid) {
      return { homeHexId: null, fallback: true };
    }

    try {
      return {
        homeHexId: toHexBigInt(centroid.lat, centroid.lng),
        fallback: true,
      };
    } catch {
      return { homeHexId: null, fallback: true };
    }
  }
}

function mapWorkerRow(row: WorkerRow) {
  return {
    id: row.id,
    name: row.name,
    phone_number: row.phone_number,
    platform: row.platform,
    city: row.city,
    zone: row.zone,
    home_hex_id: row.home_hex_id,
    hex_is_centroid_fallback: Boolean(row.hex_is_centroid_fallback),
    avg_daily_earning: Number(row.avg_daily_earning || 0),
    zone_multiplier: Number(row.zone_multiplier || 1),
    history_multiplier: Number(row.history_multiplier || 1),
    experience_tier: row.experience_tier,
    upi_vpa: row.upi_vpa,
    avatar_seed: row.avatar_seed,
    verified: Boolean(row.verified),
    verified_at: row.verified_at,
    created_at: row.created_at,
  };
}

async function fetchWorkerByPhone(phoneNumber: string): Promise<WorkerRow | null> {
  const result = await query<WorkerRow>(
    `SELECT
      id,
      name,
      phone_number,
      platform,
      city,
      zone,
      home_hex_id::text,
      hex_is_centroid_fallback,
      avg_daily_earning::text,
      zone_multiplier,
      history_multiplier,
      experience_tier,
      upi_vpa,
      avatar_seed,
      verified,
      verified_at,
      created_at
    FROM workers
    WHERE phone_number = $1
    LIMIT 1`,
    [phoneNumber]
  );

  return result.rows[0] ?? null;
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

router.post('/register', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const name = String(req.body?.name || '').trim();
    const phoneNumber = getRequestPhone(req.body);
    const platform = String(req.body?.platform || '').toLowerCase();
    const city = normalizeCity(String(req.body?.city || ''));
    const zone = String(req.body?.zone || '').trim();
    const avgDailyEarning = Number(req.body?.avg_daily_earning);
    const upiVpa = String(req.body?.upi_vpa || '').trim();

    if (!name) {
      return res.status(400).json({ message: 'name is required' });
    }
    if (!phoneNumber) {
      return res.status(400).json({ message: 'phone_number must be a valid +91 number' });
    }
    if (!['zomato', 'swiggy'].includes(platform)) {
      return res.status(400).json({ message: 'platform must be zomato or swiggy' });
    }
    if (!city) {
      return res.status(400).json({ message: 'city is required' });
    }
    if (!zone) {
      return res.status(400).json({ message: 'zone is required' });
    }
    if (!Number.isFinite(avgDailyEarning) || avgDailyEarning < 200 || avgDailyEarning > 5000) {
      return res.status(400).json({ message: 'avg_daily_earning must be between 200 and 5000' });
    }

    const atCount = (upiVpa.match(/@/g) || []).length;
    if (atCount !== 1) {
      return res.status(400).json({ message: 'upi_vpa must contain exactly one @ symbol' });
    }

    const existingWorker = await query<{ id: string }>(
      `SELECT id::text FROM workers WHERE phone_number = $1 LIMIT 1`,
      [phoneNumber]
    );

    if (existingWorker.rows[0]) {
      return res.status(409).json({
        message: 'This phone number is already registered',
        code: 'PHONE_ALREADY_REGISTERED',
      });
    }

    const zoneData = getZoneByName(zone, city);
    if (!zoneData) {
      return res.status(400).json({ message: 'Invalid zone for selected city' });
    }

    const workerId = randomUUID();
    const zoneMultiplier = Number(zoneData.zone_multiplier);
    const { homeHexId, fallback } = resolveHomeHex(city, Number(zoneData.lat), Number(zoneData.lng));
    const deviceFingerprint = getDeviceFingerprint(req);
    const avatarSeed = computeAvatarSeed(name, phoneNumber);

    await mlService.predictPremium(workerId, zoneMultiplier, 1.0, 1.0);

    await query(
      `INSERT INTO workers (
        id,
        name,
        phone_number,
        platform,
        city,
        zone,
        avg_daily_earning,
        zone_multiplier,
        history_multiplier,
        upi_vpa,
        experience_tier,
        home_hex_id,
        hex_is_centroid_fallback,
        device_fingerprint,
        avatar_seed,
        verified,
        created_at,
        updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,FALSE,NOW(),NOW()
      )`,
      [
        workerId,
        name,
        phoneNumber,
        platform,
        city,
        zone,
        avgDailyEarning,
        zoneMultiplier,
        1.0,
        upiVpa,
        'new',
        homeHexId,
        fallback,
        deviceFingerprint,
        avatarSeed,
      ]
    );

    try {
      await otpService.issueOtp(phoneNumber, workerId);
    } catch {
      return res.status(503).json({ message: 'OTP service unavailable', code: 'OTP_UNAVAILABLE' });
    }

    return res.status(201).json({
      message: 'OTP sent',
      worker_id: workerId,
      phone: phoneNumber,
      phone_number: phoneNumber,
    });
  } catch (error: any) {
    if (error?.code === '23505') {
      return res.status(409).json({
        message: 'This phone number is already registered',
        code: 'PHONE_ALREADY_REGISTERED',
      });
    }
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

    const phoneNumber = getRequestPhone(req.body);
    if (!phoneNumber) {
      return res.status(400).json({ message: 'phone_number is required' });
    }

    const worker = await fetchWorkerByPhone(phoneNumber);
    if (!worker) {
      return res.status(404).json({
        message: 'Worker account not found for this phone number',
        code: 'WORKER_NOT_FOUND',
      });
    }

    try {
      await otpService.issueOtp(phoneNumber, worker.id);
    } catch {
      return res.status(503).json({ message: 'OTP service unavailable', code: 'OTP_UNAVAILABLE' });
    }

    return res.status(200).json({
      message: 'OTP sent',
      phone: phoneNumber,
      phone_number: phoneNumber,
    });
  } catch {
    return res.status(500).json({ message: 'Login failed' });
  }
});

router.post('/verify-otp', async (req, res: Response) => {
  try {
    const phoneNumber = getRequestPhone(req.body);
    const otp = String(req.body?.otp || '').trim();

    if (!phoneNumber) {
      return res.status(400).json({ message: 'phone_number is required' });
    }
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: 'otp must be a 6-digit code' });
    }

    const worker = await fetchWorkerByPhone(phoneNumber);
    if (!worker) {
      return res.status(404).json({
        message: 'Worker account not found for this phone number',
        code: 'WORKER_NOT_FOUND',
      });
    }

    let isOtpValid = false;

    if (config.IS_DEMO_MODE && otp === '000000') {
      isOtpValid = true;
    } else {
      try {
        const result = await otpService.verifyOtp(phoneNumber, otp);
        isOtpValid = result.valid;
      } catch {
        return res.status(503).json({ message: 'OTP service unavailable', code: 'OTP_UNAVAILABLE' });
      }
    }

    if (!isOtpValid) {
      return res.status(401).json({ message: 'Invalid or expired OTP' });
    }

    await query(
      `UPDATE workers
       SET verified = TRUE,
           verified_at = COALESCE(verified_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [worker.id]
    );

    const refreshedWorker = await fetchWorkerByPhone(phoneNumber);
    const token = issueWorkerToken(worker.id);

    return res.status(200).json({
      token,
      worker: refreshedWorker ? mapWorkerRow(refreshedWorker) : mapWorkerRow(worker),
    });
  } catch {
    return res.status(500).json({ message: 'OTP verification failed' });
  }
});

router.post('/resend-otp', async (req, res: Response) => {
  try {
    const phoneNumber = getRequestPhone(req.body);
    if (!phoneNumber) {
      return res.status(400).json({ message: 'phone_number is required' });
    }

    const worker = await fetchWorkerByPhone(phoneNumber);
    if (!worker) {
      return res.status(404).json({
        message: 'Worker account not found for this phone number',
        code: 'WORKER_NOT_FOUND',
      });
    }

    try {
      const allowed = await otpService.canResend(phoneNumber);
      if (!allowed) {
        return res.status(429).json({
          message: 'Resend limit reached. Try again later.',
          code: 'OTP_RESEND_LIMIT_EXCEEDED',
        });
      }

      await otpService.issueOtp(phoneNumber, worker.id);
    } catch {
      return res.status(503).json({ message: 'OTP service unavailable', code: 'OTP_UNAVAILABLE' });
    }

    return res.status(200).json({
      message: 'OTP sent',
      phone: phoneNumber,
      phone_number: phoneNumber,
    });
  } catch {
    return res.status(500).json({ message: 'Could not resend OTP' });
  }
});

router.get('/me', requireWorker, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workerId = req.user!.id;

    const result = await query<WorkerRow>(
      `SELECT
        id,
        name,
        phone_number,
        platform,
        city,
        zone,
        home_hex_id::text,
        hex_is_centroid_fallback,
        avg_daily_earning::text,
        zone_multiplier,
        history_multiplier,
        experience_tier,
        upi_vpa,
        avatar_seed,
        verified,
        verified_at,
        created_at
      FROM workers
      WHERE id = $1
      LIMIT 1`,
      [workerId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Worker not found' });
    }

    return res.status(200).json(mapWorkerRow(result.rows[0]));
  } catch {
    return res.status(500).json({ message: 'Failed to fetch worker profile' });
  }
});


router.get('/:id/gnn-score', authenticateInsurer, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workerId = req.params.id;
    
    const { rows } = await query(
      `SELECT w.gnn_fraud_score, w.zone
       FROM workers w
       WHERE w.id = $1`,
      [workerId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Worker not found' });
    }
    
    const worker = rows[0];
    const gnnScore = Number(worker.gnn_fraud_score || 0);
    
    // fetch neighbors
    const { rows: edgeRows } = await query(
      `SELECT target_type, target_id FROM graph_edges WHERE source_type = 'worker' AND source_id = $1
       UNION
       SELECT source_type, source_id FROM graph_edges WHERE target_type = 'worker' AND target_id = $1`,
      [workerId]
    );
    
    const flaggedNodes = edgeRows.map((r: any) => `${r.target_type || r.source_type}:${r.target_id || r.source_id}`);
    
    let recommendation = 'approve';
    if (gnnScore >= 0.6) recommendation = 'deny';
    else if (gnnScore >= 0.3) recommendation = 'review';
    
    res.json({
      worker_id: workerId,
      gnn_fraud_score: gnnScore,
      fraud_ring_membership: gnnScore > 0.5 ? worker.zone : null,
      flagged_nodes: flaggedNodes,
      recommendation,
      trust_score: Math.max(0, 1.0 - gnnScore)
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch GNN score' });
  }
});

export default router;

