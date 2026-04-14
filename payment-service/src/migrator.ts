import * as fs from 'fs';
import * as path from 'path';
import { pool } from './db';

export async function runMigrations(): Promise<void> {
  const migrationsDir = process.env.NODE_ENV === 'production'
    ? path.join(process.cwd(), 'db', 'migrations')
    : path.join(__dirname, '..', 'db', 'migrations');

  console.log(`[payment-service] [DB] Migrator starting. Dir: ${migrationsDir}`);
  
  const client = await pool.connect();
  try {
    // 1. Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations_payment (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    if (!fs.existsSync(migrationsDir)) {
      console.warn('[payment-service] [DB] Migrations directory NOT FOUND');
      return;
    }

    const files = fs.readdirSync(migrationsDir).sort();
    console.log(`[payment-service] [DB] Found ${files.length} migration files.`);
    
    for (const file of files) {
      if (!file.endsWith('.sql')) continue;

      const { rows } = await client.query('SELECT id FROM _migrations_payment WHERE name = $1', [file]);
      if (rows.length > 0) continue;

      console.log(`[payment-service] [DB] STARTING: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations_payment (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[payment-service] [DB] SUCCESS: ${file}`);
      } catch (err: any) {
        await client.query('ROLLBACK');
        console.error(`[payment-service] [DB] FAILED: ${file}`, err.message);
        throw err;
      }
    }

    console.log('[payment-service] [DB] All migrations processed.');
  } catch (err: any) {
    console.error('[payment-service] migration_runner_error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
