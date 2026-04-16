
const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: "postgresql://gigguard_owner:u8mInR3wNPhM@ep-fancy-snowflake-a5izfks9.us-east-2.aws.neon.tech/gigguard?sslmode=require",
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  
  console.log('--- Active Policies by City/Zone ---');
  const res = await client.query(`
    SELECT w.city, w.zone, COUNT(*) as active_policy_count
    FROM workers w
    JOIN policies p ON p.worker_id = w.id
    WHERE p.status = 'active'
      AND CURRENT_DATE BETWEEN p.week_start AND p.week_end
    GROUP BY w.city, w.zone
    ORDER BY active_policy_count DESC
  `);
  console.table(res.rows);

  console.log('\n--- Specific Worker Locations (First 10) ---');
  const workers = await client.query(`
    SELECT w.name, w.city, w.zone, w.home_hex_id::text as hex, p.status as policy_status
    FROM workers w
    LEFT JOIN policies p ON p.worker_id = w.id
    WHERE p.status = 'active'
      AND CURRENT_DATE BETWEEN p.week_start AND p.week_end
    LIMIT 10
  `);
  console.table(workers.rows);

  await client.end();
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
