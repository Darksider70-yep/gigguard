const DAILY_CAP = 800;

const TRIGGER_ALIASES: Record<string, string> = {
  flood_red_alert: 'flood_alert',
};

const TRIGGER_DISRUPTION_HOURS: Record<string, number> = {
  heavy_rainfall: 4,
  extreme_heat: 4,
  severe_aqi: 5,
  flood_alert: 8,
  curfew_strike: 8,
};

const TRIGGER_THRESHOLDS: Record<string, number> = {
  heavy_rainfall: 15,
  extreme_heat: 44,
  severe_aqi: 300,
  flood_alert: 1,
  curfew_strike: 1,
};

function normalizeTriggerType(triggerType: string): string {
  return TRIGGER_ALIASES[triggerType] ?? triggerType;
}

export function calculateCoverageAmount(avgDailyEarning: number, triggerType: string): number {
  const normalized = normalizeTriggerType(triggerType);
  const hours = TRIGGER_DISRUPTION_HOURS[normalized] ?? 4;
  const raw = (avgDailyEarning / 8) * hours * 0.8;
  return Math.floor(Math.min(raw, DAILY_CAP));
}

export function calculateAllCoverages(avgDailyEarning: number): Record<string, number> {
  const coverages = Object.fromEntries(
    Object.keys(TRIGGER_DISRUPTION_HOURS).map((trigger) => [
      trigger,
      calculateCoverageAmount(avgDailyEarning, trigger),
    ])
  );
  return {
    ...coverages,
    flood_red_alert: coverages.flood_alert,
  };
}

export function getDisruptionHours(triggerType: string): number {
  return TRIGGER_DISRUPTION_HOURS[normalizeTriggerType(triggerType)] ?? 4;
}

export function getThreshold(triggerType: string): number {
  return TRIGGER_THRESHOLDS[normalizeTriggerType(triggerType)] ?? 0;
}

export function computeSeverity(
  triggerType: string,
  value: number
): 'moderate' | 'severe' | 'extreme' {
  const threshold = TRIGGER_THRESHOLDS[normalizeTriggerType(triggerType)] ?? 0;
  if (threshold <= 0) {
    return 'moderate';
  }

  const ratio = value / threshold;
  if (ratio >= 2.0) {
    return 'extreme';
  }
  if (ratio >= 1.5) {
    return 'severe';
  }
  return 'moderate';
}

export function getWeekBounds(): { weekStart: string; weekEnd: string } {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    weekStart: monday.toISOString().split('T')[0],
    weekEnd: sunday.toISOString().split('T')[0],
  };
}

export const premiumService = {
  calculateCoverageAmount,
  calculateAllCoverages,
  getDisruptionHours,
  getThreshold,
  computeSeverity,
  getWeekBounds,
};

// Backward-compatible exports.
export function calculateCoverage(avgDailyEarning: number, disruptionHours: number): number {
  const raw = (avgDailyEarning / 8) * disruptionHours * 0.8;
  return Math.floor(Math.min(raw, DAILY_CAP));
}

export function buildCoverageBreakdown(avgDailyEarning: number): Record<string, number> {
  return calculateAllCoverages(avgDailyEarning);
}

export function getCurrentWeekRange(): { weekStart: string; weekEnd: string } {
  return getWeekBounds();
}

function getISOWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function buildPolicyCode(workerName: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const weekNum = getISOWeekNumber(now);
  const prefix = workerName.replace(/\s+/g, '').toUpperCase().slice(0, 3).padEnd(3, 'X');
  return `POL-${year}-W${weekNum}-${prefix}`;
}

export function deriveExperienceTier(createdAt: Date): 'new' | 'mid' | 'veteran' {
  const days = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (days < 90) {
    return 'new';
  }
  if (days < 365) {
    return 'mid';
  }
  return 'veteran';
}

export function deriveSeason(): 'monsoon' | 'summer' | 'winter' | 'other' {
  const month = new Date().getMonth() + 1;
  if (month >= 6 && month <= 9) {
    return 'monsoon';
  }
  if (month >= 3 && month <= 5) {
    return 'summer';
  }
  if (month === 11 || month === 12 || month <= 2) {
    return 'winter';
  }
  return 'other';
}

export function deriveZoneRisk(zoneMultiplier: number): 'low' | 'medium' | 'high' {
  if (zoneMultiplier > 1.2) {
    return 'high';
  }
  if (zoneMultiplier >= 1.0) {
    return 'medium';
  }
  return 'low';
}
