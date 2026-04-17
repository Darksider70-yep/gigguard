
import { getZonesByCity } from '../src/constants/zones';

function simulateFallback(city: string) {
  const cityZones = getZonesByCity(city.charAt(0).toUpperCase() + city.slice(1));
  const cityWideFallback = cityZones.length > 0 
    ? cityZones[Math.floor(Math.random() * cityZones.length)]
    : { lat: 19.1136, lng: 72.8697, zone: 'Default Zone' };
  return cityWideFallback.zone;
}

function verify(city: string) {
  console.log(`--- Verifying Diversity for ${city} ---`);
  const picks: string[] = [];
  for (let i = 0; i < 20; i++) {
    picks.push(simulateFallback(city));
  }
  
  const uniqueZones = [...new Set(picks)];
  console.log(`Unique zones picked in 20 attempts: ${uniqueZones.length}`);
  console.log(`Zones: ${uniqueZones.join(', ')}`);
  
  if (uniqueZones.length > 1) {
    console.log(`✅ Diversity test PASSED for ${city}`);
  } else {
    console.log(`❌ Diversity test FAILED for ${city} (only one zone picked)`);
  }
}

const cities = ['mumbai', 'delhi', 'chennai', 'bangalore', 'hyderabad'];
cities.forEach(verify);
