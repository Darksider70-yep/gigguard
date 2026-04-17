export const ZONES = [
  { zone_id: 'MUM-AND-W', zone: 'Andheri West', city: 'Mumbai', lat: 19.1136, lng: 72.8697, zone_multiplier: 1.4, risk: 'high' },
  { zone_id: 'MUM-AND-E', zone: 'Andheri East', city: 'Mumbai', lat: 19.1197, lng: 72.8799, zone_multiplier: 1.3, risk: 'high' },
  { zone_id: 'MUM-BAN', zone: 'Bandra', city: 'Mumbai', lat: 19.0596, lng: 72.8295, zone_multiplier: 1.35, risk: 'high' },
  { zone_id: 'MUM-DAH', zone: 'Dahisar', city: 'Mumbai', lat: 19.2494, lng: 72.8567, zone_multiplier: 1.2, risk: 'medium' },
  { zone_id: 'MUM-KUR', zone: 'Kurla', city: 'Mumbai', lat: 19.0726, lng: 72.8789, zone_multiplier: 1.25, risk: 'medium' },
  { zone_id: 'MUM-THN', zone: 'Thane', city: 'Mumbai', lat: 19.2183, lng: 72.9781, zone_multiplier: 1.15, risk: 'medium' },
  { zone_id: 'DEL-CON', zone: 'Connaught Place', city: 'Delhi', lat: 28.6315, lng: 77.2167, zone_multiplier: 1.3, risk: 'high' },
  { zone_id: 'DEL-LAJ', zone: 'Lajpat Nagar', city: 'Delhi', lat: 28.5677, lng: 77.243, zone_multiplier: 1.25, risk: 'medium' },
  { zone_id: 'DEL-ROH', zone: 'Rohini', city: 'Delhi', lat: 28.741, lng: 77.0674, zone_multiplier: 1.2, risk: 'medium' },
  { zone_id: 'DEL-DWA', zone: 'Dwarka', city: 'Delhi', lat: 28.5921, lng: 77.046, zone_multiplier: 1.15, risk: 'medium' },
  { zone_id: 'DEL-SAK', zone: 'Saket', city: 'Delhi', lat: 28.5245, lng: 77.2066, zone_multiplier: 1.1, risk: 'medium' },
  { zone_id: 'NOI-SEC18', zone: 'Sector 18', city: 'Noida', lat: 28.5679, lng: 77.326, zone_multiplier: 1.3, risk: 'high' },
  { zone_id: 'NOI-SEC52', zone: 'Sector 52', city: 'Noida', lat: 28.5866, lng: 77.3621, zone_multiplier: 1.25, risk: 'medium' },
  { zone_id: 'NOI-SEC62', zone: 'Sector 62', city: 'Noida', lat: 28.6235, lng: 77.3685, zone_multiplier: 1.2, risk: 'medium' },
  { zone_id: 'NOI-SEC126', zone: 'Sector 126', city: 'Noida', lat: 28.5414, lng: 77.3312, zone_multiplier: 1.15, risk: 'medium' },
  { zone_id: 'CHE-TNA', zone: 'T. Nagar', city: 'Chennai', lat: 13.0418, lng: 80.2341, zone_multiplier: 1.1, risk: 'medium' },
  { zone_id: 'CHE-ADY', zone: 'Adyar', city: 'Chennai', lat: 13.0012, lng: 80.2565, zone_multiplier: 1.15, risk: 'medium' },
  { zone_id: 'CHE-ANN', zone: 'Anna Nagar', city: 'Chennai', lat: 13.085, lng: 80.2101, zone_multiplier: 1.05, risk: 'low' },
  { zone_id: 'CHE-VEL', zone: 'Velachery', city: 'Chennai', lat: 12.9815, lng: 80.218, zone_multiplier: 1.2, risk: 'medium' },
  { zone_id: 'CHE-PON', zone: 'Porur', city: 'Chennai', lat: 13.0358, lng: 80.1572, zone_multiplier: 1.0, risk: 'low' },
  { zone_id: 'CHE-CHR', zone: 'Chromepet', city: 'Chennai', lat: 12.9516, lng: 80.1462, zone_multiplier: 0.95, risk: 'low' },
  { zone_id: 'BLR-KOR', zone: 'Koramangala', city: 'Bangalore', lat: 12.9352, lng: 77.6245, zone_multiplier: 1.2, risk: 'medium' },
  { zone_id: 'BLR-IND', zone: 'Indiranagar', city: 'Bangalore', lat: 12.9784, lng: 77.6408, zone_multiplier: 1.1, risk: 'medium' },
  { zone_id: 'BLR-WHI', zone: 'Whitefield', city: 'Bangalore', lat: 12.9698, lng: 77.7499, zone_multiplier: 1.0, risk: 'low' },
  { zone_id: 'BLR-ELE', zone: 'Electronic City', city: 'Bangalore', lat: 12.8399, lng: 77.677, zone_multiplier: 0.95, risk: 'low' },
  { zone_id: 'BLR-JAY', zone: 'Jayanagar', city: 'Bangalore', lat: 12.9299, lng: 77.5826, zone_multiplier: 1.05, risk: 'low' },
  { zone_id: 'BLR-MAL', zone: 'Malleswaram', city: 'Bangalore', lat: 13.0035, lng: 77.5673, zone_multiplier: 0.9, risk: 'low' },
  { zone_id: 'HYD-BAN', zone: 'Banjara Hills', city: 'Hyderabad', lat: 17.4156, lng: 78.4347, zone_multiplier: 0.95, risk: 'low' },
  { zone_id: 'HYD-HIT', zone: 'HITEC City', city: 'Hyderabad', lat: 17.4435, lng: 78.3772, zone_multiplier: 0.9, risk: 'low' },
  { zone_id: 'HYD-SEC', zone: 'Secunderabad', city: 'Hyderabad', lat: 17.4399, lng: 78.4983, zone_multiplier: 1.0, risk: 'low' },
  { zone_id: 'HYD-KUK', zone: 'Kukatpally', city: 'Hyderabad', lat: 17.4849, lng: 78.3994, zone_multiplier: 1.05, risk: 'low' },
  { zone_id: 'HYD-CHI', zone: 'Charminar', city: 'Hyderabad', lat: 17.3616, lng: 78.4747, zone_multiplier: 1.1, risk: 'medium' },
  { zone_id: 'HYD-LBN', zone: 'LB Nagar', city: 'Hyderabad', lat: 17.3478, lng: 78.5519, zone_multiplier: 1.0, risk: 'low' },
] as const;

export const CITIES = ['Mumbai', 'Delhi', 'Chennai', 'Bangalore', 'Hyderabad', 'Noida'] as const;

export type ZoneRisk = (typeof ZONES)[number]['risk'];
export type ZonePlatform = 'zomato' | 'swiggy';
export type ZoneCity = (typeof CITIES)[number];

export function getZonesByCity(city: string) {
  return ZONES.filter((zone) => zone.city === city);
}

export function getZoneById(zoneId: string) {
  return ZONES.find((zone) => zone.zone_id === zoneId);
}

export function getZoneByName(zone: string, city: string) {
  return ZONES.find((item) => item.zone === zone && item.city === city);
}
