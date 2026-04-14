const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { Pool } = require('pg');

async function assertDatabaseReachable(databaseUrl) {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query('SELECT 1');
  } finally {
    await pool.end();
  }
}

async function assertMlReachable(mlUrl) {
  const response = await fetch(`${mlUrl.replace(/\/$/, '')}/health`);
  if (!response.ok) {
    throw new Error(`ML health endpoint returned ${response.status}`);
  }
}

module.exports = async () => {
  const dbUrl = process.env.DATABASE_URL;
  const mlUrl = process.env.ML_SERVICE_URL;

  if (!dbUrl) {
    throw new Error(
      'Integration tests require DATABASE_URL env var. ' +
        'Use `npm run test` for unit tests.'
    );
  }
  if (!mlUrl) {
    throw new Error(
      'Integration tests require ML_SERVICE_URL env var. ' +
        'Use `npm run test` for unit tests.'
    );
  }

  try {
    await assertDatabaseReachable(dbUrl);
  } catch (error) {
    throw new Error(`DB not reachable at ${dbUrl}: ${error}`);
  }

  try {
    await assertMlReachable(mlUrl);
  } catch (error) {
    throw new Error(`ML service not reachable at ${mlUrl}: ${error}`);
  }
};
