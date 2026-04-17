
import { query } from '../src/db';

async function checkWorkerDistribution() {
  console.log('--- Total Workers by City/Zone ---');
  const res = await query(`
    SELECT city, zone, COUNT(*) as total_count
    FROM workers
    GROUP BY city, zone
    ORDER BY city, total_count DESC
  `);
  console.table(res.rows);

  console.log('\n--- Active Policyholders by City/Zone (CURRENT_DATE) ---');
  const activeRes = await query(`
    SELECT w.city, w.zone, COUNT(*) as active_count
    FROM workers w
    JOIN policies p ON p.worker_id = w.id
    WHERE p.status = 'active'
      AND CURRENT_DATE BETWEEN p.week_start AND p.week_end
    GROUP BY w.city, w.zone
    ORDER BY w.city, active_count DESC
  `);
  console.table(activeRes.rows);

  process.exit(0);
}

checkWorkerDistribution().catch(err => {
  console.error(err);
  process.exit(1);
});
