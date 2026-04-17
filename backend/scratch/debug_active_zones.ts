
import { query } from '../src/db';
import { ZONES } from '../src/constants/zones';

async function check() {
  console.log('--- Checking active zones for simulation ---');
  
  const cities = ['mumbai', 'delhi', 'chennai', 'bangalore', 'hyderabad'];
  
  for (const city of cities) {
    const { rows: allActiveZones } = await query(
      `SELECT DISTINCT w.zone, w.home_hex_id::text
       FROM workers w
       JOIN policies p ON p.worker_id = w.id
       WHERE LOWER(w.city) = $1
         AND p.status = 'active'
         AND CURRENT_DATE BETWEEN p.week_start AND p.week_end
         AND w.home_hex_id IS NOT NULL`,
      [city]
    );
    
    console.log(`City: ${city}`);
    console.log(`Active Zones Found: ${allActiveZones.length}`);
    if (allActiveZones.length > 0) {
      console.log('Zones:', allActiveZones.map(z => z.zone).join(', '));
    } else {
      console.log('FALLBACK TRIGGERED for this city');
    }
    console.log('-------------------');
  }
  
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
