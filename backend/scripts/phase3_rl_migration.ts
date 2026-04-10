import { query } from '../src/db';

async function migrate() {
  console.log('Starting Phase 3 RL Migration...');

  try {
    await query(`
      CREATE TABLE IF NOT EXISTS rl_rollout_config (
        id SERIAL PRIMARY KEY,
        rollout_percentage INT DEFAULT 0,
        kill_switch_engaged BOOLEAN DEFAULT false,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Created rl_rollout_config table.');

    // Initialize with 0% if empty
    await query(`
      INSERT INTO rl_rollout_config (id, rollout_percentage, kill_switch_engaged)
      SELECT 1, 0, false
      WHERE NOT EXISTS (SELECT 1 FROM rl_rollout_config WHERE id = 1);
    `);
    
    await query(`
      CREATE TABLE IF NOT EXISTS rl_ab_assignments (
        worker_id VARCHAR PRIMARY KEY,
        cohort VARCHAR(10) NOT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Created rl_ab_assignments table.');

    await query(`
      CREATE TABLE IF NOT EXISTS rl_daily_metrics (
        date DATE,
        cohort VARCHAR(10),
        total_payout NUMERIC DEFAULT 0,
        total_premium NUMERIC DEFAULT 0,
        loss_ratio NUMERIC DEFAULT 0,
        PRIMARY KEY(date, cohort)
      );
    `);
    console.log('Created rl_daily_metrics table.');

    // Alter policies table safely
    try {
      await query(`ALTER TABLE policies ADD COLUMN ab_cohort VARCHAR(10) DEFAULT 'A';`);
      console.log('Added ab_cohort to policies.');
    } catch (e: any) {
      if (e.code !== '42701') console.log('Notice: ab_cohort may already exist.', e.message);
    }
    
    try {
      await query(`ALTER TABLE policies ADD COLUMN pricing_source VARCHAR(20) DEFAULT 'formula';`);
      console.log('Added pricing_source to policies.');
    } catch (e: any) {
      if (e.code !== '42701') console.log('Notice: pricing_source may already exist.', e.message);
    }

    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
