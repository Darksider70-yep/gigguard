
const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: "postgresql://gigguard_owner:u8mInR3wNPhM@ep-fancy-snowflake-a5izfks9.us-east-2.aws.neon.tech/gigguard?sslmode=require",
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  
  console.log('--- Delhi Active Workers ---');
  const res = await client.query(`
    SELECT w.name, w.zone, w.home_hex_id::text as hex, p.status, p.week_start, p.week_end
    FROM workers w
    JOIN policies p ON p.worker_id = w.id
    WHERE LOWER(w.city) = 'delhi'
      AND p.status = 'active'
      AND CURRENT_DATE BETWEEN p.week_start AND p.week_end
  `);
  console.table(res.rows);

  await client.end();
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
