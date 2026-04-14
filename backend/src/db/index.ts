import { Pool, PoolClient } from 'pg';
import { config } from '../config';
import { logger } from '../lib/logger';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || config.DATABASE_URL,
  max: 5, // max 5 connections from backend
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.DB_SSL === 'false'
    ? false
    : (process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false } // Render uses self-signed certs
        : false),
});

pool.on('error', (err: Error) => {
  logger.error('DB', 'pool_error', {
    error: err.message,
  });
});

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number }> {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) {
    logger.warn('DB', 'slow_query', { text, duration });
  }
  return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export { pool };
