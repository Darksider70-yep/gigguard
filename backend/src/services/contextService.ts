export type ExperienceTier = 'new' | 'mid' | 'veteran';
export type Season = 'monsoon' | 'summer' | 'winter' | 'other';
export type ZoneRisk = 'low' | 'medium' | 'high';
export type WorkerPlatform = 'zomato' | 'swiggy';

export interface BanditContext {
  platform: WorkerPlatform;
  city: string;
  experience_tier: ExperienceTier;
  season: Season;
  zone_risk: ZoneRisk;
}

export interface WorkerContextSource {
  platform: string;
  city: string;
  created_at: Date | string;
  zone_multiplier: number;
}

function sanitizeCity(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

export function deriveExperienceTier(createdAtInput: Date | string, now: Date = new Date()): ExperienceTier {
  const createdAt = createdAtInput instanceof Date ? createdAtInput : new Date(createdAtInput);
  const diffInMs = now.getTime() - createdAt.getTime();
  const diffInDays = diffInMs / (1000 * 60 * 60 * 24);
  const diffInMonths = diffInDays / 30;

  if (diffInMonths < 3) {
    return 'new';
  }
  if (diffInMonths <= 12) {
    return 'mid';
  }
  return 'veteran';
}

export function deriveSeason(now: Date = new Date()): Season {
  const month = now.getMonth() + 1; // 1-12

  if (month >= 6 && month <= 9) {
    return 'monsoon';
  }
  if (month >= 3 && month <= 5) {
    return 'summer';
  }
  if (month >= 11 || month <= 2) {
    return 'winter';
  }
  return 'other';
}

export function deriveZoneRisk(zoneMultiplier: number): ZoneRisk {
  if (zoneMultiplier < 1.0) {
    return 'low';
  }
  if (zoneMultiplier <= 1.2) {
    return 'medium';
  }
  return 'high';
}

export function buildBanditContextFromWorker(
  worker: WorkerContextSource,
  now: Date = new Date()
): BanditContext {
  const normalizedPlatform = worker.platform.trim().toLowerCase() as WorkerPlatform;
  const platform: WorkerPlatform = normalizedPlatform === 'swiggy' ? 'swiggy' : 'zomato';

  return {
    platform,
    city: sanitizeCity(worker.city),
    experience_tier: deriveExperienceTier(worker.created_at, now),
    season: deriveSeason(now),
    zone_risk: deriveZoneRisk(Number(worker.zone_multiplier ?? 1.0)),
  };
}

export function buildContextKey(context: BanditContext): string {
  return [
    context.platform,
    context.city,
    context.experience_tier,
    context.season,
    context.zone_risk,
  ].join('_');
}

