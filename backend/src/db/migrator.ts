import * as fs from 'fs';
import * as path from 'path';
import { pool } from './index';
import { logger } from '../lib/logger';

export async function runMigrations(): Promise<void> {
  logger.info('DB', 'Starting migrations...');
  
  const client = await pool.connect();
  try {
    // 1. Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 2. Resolve migration directory
    // In production, we are in dist/src/db, migrations are in db/migrations (at root)
    // Relative path depends on whether we are in src/db (dev) or dist/src/db (prod)
    const migrationsDir = process.env.NODE_ENV === 'production'
      ? path.join(process.cwd(), 'db', 'migrations')
      : path.join(__dirname, '..', '..', 'db', 'migrations');

    if (!fs.existsSync(migrationsDir)) {
      logger.error('DB', 'migrations_dir_not_found', { path: migrationsDir });
      return;
    }

    const files = fs.readdirSync(migrationsDir).sort();
    
    for (const file of files) {
      if (!file.endsWith('.sql')) continue;

      const { rows } = await client.query('SELECT id FROM _migrations WHERE name = $1', [file]);
      if (rows.length > 0) continue;

      logger.info('DB', `Executing migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        logger.info('DB', `✓ Migration successful: ${file}`);
      } catch (err: any) {
        await client.query('ROLLBACK');
        logger.error('DB', `✗ Migration failed: ${file}`, { error: err.message });
        throw err;
      }
    }

    logger.info('DB', 'All migrations completed successfully.');
  } catch (err: any) {
    logger.error('DB', 'migration_runner_error', { error: err.message });
    throw err;
  } finally {
    client.release();
  }
}
