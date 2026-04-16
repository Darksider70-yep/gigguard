
const { Client } = require('pg');

async function checkDiversity() {
  const client = new Client({
    connectionString: "postgresql://gigguard_owner:u8mInR3wNPhM@ep-fancy-snowflake-a5izfks9.us-east-2.aws.neon.tech/gigguard?sslmode=require",
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  
  console.log('--- Delhi Worker Hex Diversity ---');
  const res = await client.query(`
    SELECT w.zone, w.home_hex_id::text, COUNT(*) as worker_count
    FROM workers w
    WHERE LOWER(w.city) = 'delhi'
    GROUP BY w.zone, w.home_hex_id::text
    ORDER BY worker_count DESC
  `);
  console.table(res.rows);

  await client.end();
}

checkDiversity().catch(err => {
  console.error(err);
  process.exit(1);
});
