
import { query } from '../src/db';

async function check() {
  const { rows } = await query(`
    SELECT w.city, w.zone, COUNT(*) as worker_count
    FROM workers w
    JOIN policies p ON p.worker_id = w.id
    WHERE p.status = 'active'
      AND CURRENT_DATE BETWEEN p.week_start AND p.week_end
    GROUP BY w.city, w.zone
    ORDER BY worker_count DESC
  `);
  console.log('Active Workers by Zone:');
  console.table(rows);
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
