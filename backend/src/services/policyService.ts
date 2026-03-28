import { cellToLatLng } from 'h3-js';

export function getExperienceTier(createdAt: Date): 'new' | 'mid' | 'veteran' {
  const days = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (days < 90) {
    return 'new';
  }
  if (days < 365) {
    return 'mid';
  }
  return 'veteran';
}

export function getSeason(): 'monsoon' | 'summer' | 'winter' | 'other' {
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

export function getZoneRisk(zoneMultiplier: number): 'low' | 'medium' | 'high' {
  if (zoneMultiplier > 1.2) {
    return 'high';
  }
  if (zoneMultiplier >= 1.0) {
    return 'medium';
  }
  return 'low';
}

export function generatePolicyId(workerName: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const weekNum = getISOWeekNumber(now);
  const prefix = workerName.replace(/\s+/g, '').toUpperCase().slice(0, 3).padEnd(3, 'X');
  return `POL-${year}-W${weekNum}-${prefix}`;
}

function getISOWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function hexToLatLng(hexId: bigint | string | number): { lat: number; lng: number } {
  let hexString: string;

  if (typeof hexId === 'bigint') {
    hexString = hexId.toString(16);
  } else if (typeof hexId === 'number') {
    hexString = BigInt(hexId).toString(16);
  } else if (hexId.startsWith('0x')) {
    hexString = hexId.slice(2);
  } else {
    hexString = BigInt(hexId).toString(16);
  }

  const [lat, lng] = cellToLatLng(hexString);
  return { lat, lng };
}

export const policyService = {
  getExperienceTier,
  getSeason,
  getZoneRisk,
  generatePolicyId,
  hexToLatLng,
};
