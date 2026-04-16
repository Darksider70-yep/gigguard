
const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: "postgresql://gigguard_owner:u8mInR3wNPhM@ep-fancy-snowflake-a5izfks9.us-east-2.aws.neon.tech/gigguard?sslmode=require",
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  const res = await client.query(`
    SELECT w.city, w.zone, COUNT(*) as worker_count
    FROM workers w
    JOIN policies p ON p.worker_id = w.id
    WHERE p.status = 'active'
      AND CURRENT_DATE BETWEEN p.week_start AND p.week_end
    GROUP BY w.city, w.zone
    ORDER BY worker_count DESC
    LIMIT 20
  `);
  console.log('Active Workers by Zone:');
  console.table(res.rows);
  await client.end();
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
