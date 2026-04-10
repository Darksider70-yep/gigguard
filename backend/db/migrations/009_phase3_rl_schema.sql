CREATE TABLE IF NOT EXISTS rl_rollout_config (
  id SERIAL PRIMARY KEY,
  rollout_percentage INT DEFAULT 0,
  kill_switch_engaged BOOLEAN DEFAULT false,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO rl_rollout_config (id, rollout_percentage, kill_switch_engaged)
SELECT 1, 0, false
WHERE NOT EXISTS (SELECT 1 FROM rl_rollout_config WHERE id = 1);

CREATE TABLE IF NOT EXISTS rl_ab_assignments (
  worker_id VARCHAR PRIMARY KEY,
  cohort VARCHAR(10) NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rl_daily_metrics (
  date DATE,
  cohort VARCHAR(10),
  total_payout NUMERIC DEFAULT 0,
  total_premium NUMERIC DEFAULT 0,
  loss_ratio NUMERIC DEFAULT 0,
  PRIMARY KEY(date, cohort)
);

ALTER TABLE policies ADD COLUMN IF NOT EXISTS ab_cohort VARCHAR(10) DEFAULT 'A';
ALTER TABLE policies ADD COLUMN IF NOT EXISTS pricing_source VARCHAR(20) DEFAULT 'formula';
