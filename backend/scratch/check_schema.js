
const { Client } = require('pg');

async function checkSchema() {
  const client = new Client({
    connectionString: "postgresql://gigguard_owner:u8mInR3wNPhM@ep-fancy-snowflake-a5izfks9.us-east-2.aws.neon.tech/gigguard?sslmode=require",
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'disruption_events';
  `);
  console.table(res.rows);
  await client.end();
}

checkSchema().catch(err => {
  console.error(err);
  process.exit(1);
});
