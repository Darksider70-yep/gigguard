export interface CoverageBreakdown {
  heavy_rainfall: number;
  extreme_heat: number;
  flood_red_alert: number;
  severe_aqi: number;
  curfew_strike: number;
}

const DAILY_CAP = 800;

export function calculateCoverage(avgDailyEarning: number, disruptionHours: number): number {
  const payout = (avgDailyEarning / 8) * disruptionHours * 0.8;
  return Math.floor(Math.min(DAILY_CAP, payout));
}

export function buildCoverageBreakdown(avgDailyEarning: number): CoverageBreakdown {
  return {
    heavy_rainfall: calculateCoverage(avgDailyEarning, 4),
    extreme_heat: calculateCoverage(avgDailyEarning, 4),
    flood_red_alert: calculateCoverage(avgDailyEarning, 8),
    severe_aqi: calculateCoverage(avgDailyEarning, 5),
    curfew_strike: calculateCoverage(avgDailyEarning, 8),
  };
}

export function getCurrentWeekRange(now: Date = new Date()): { weekStart: string; weekEnd: string } {
  const date = new Date(now);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);

  const weekStart = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

  return {
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
  };
}

function isoWeekNumber(date: Date): number {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function buildPolicyCode(workerName: string, now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const week = String(isoWeekNumber(now)).padStart(2, '0');
  const initials = workerName
    .replace(/[^a-zA-Z ]/g, '')
    .trim()
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, 'X');
  return `POL-${year}-W${week}-${initials}`;
}

export type ExperienceTier = 'new' | 'mid' | 'veteran';
export type Season = 'monsoon' | 'summer' | 'winter' | 'other';
export type ZoneRisk = 'low' | 'medium' | 'high';

export function deriveExperienceTier(createdAt: Date): ExperienceTier {
  const ageDays = (Date.now() - createdAt.getTime()) / 86400000;
  if (ageDays < 90) {
    return 'new';
  }
  if (ageDays <= 365) {
    return 'mid';
  }
  return 'veteran';
}

export function deriveSeason(now: Date = new Date()): Season {
  const month = now.getUTCMonth() + 1;
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
