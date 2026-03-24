-- Phase 2 schema alignment for backend + frontend API compatibility.
-- This migration is idempotent and safe to re-run.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Workers
ALTER TABLE workers
ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20),
ADD COLUMN IF NOT EXISTS active_hex_id BIGINT,
ADD COLUMN IF NOT EXISTS zone_multiplier FLOAT DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS history_multiplier FLOAT DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS experience_tier VARCHAR(10),
ADD COLUMN IF NOT EXISTS upi_vpa VARCHAR(100),
ADD COLUMN IF NOT EXISTS device_id VARCHAR,
ADD COLUMN IF NOT EXISTS device_fingerprint VARCHAR(64),
ADD COLUMN IF NOT EXISTS gnn_risk_score FLOAT DEFAULT 0,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_workers_phone_number_unique
  ON workers(phone_number)
  WHERE phone_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workers_active_hex_id ON workers(active_hex_id);
CREATE INDEX IF NOT EXISTS idx_workers_upi_vpa ON workers(upi_vpa);

-- Policies
ALTER TABLE policies
ADD COLUMN IF NOT EXISTS premium_paid DECIMAL(8, 2),
ADD COLUMN IF NOT EXISTS week_end DATE,
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active',
ADD COLUMN IF NOT EXISTS recommended_arm INTEGER,
ADD COLUMN IF NOT EXISTS arm_accepted BOOLEAN,
ADD COLUMN IF NOT EXISTS context_key VARCHAR(100),
ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMP DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'policies_recommended_arm_check'
  ) THEN
    ALTER TABLE policies
    ADD CONSTRAINT policies_recommended_arm_check
    CHECK (recommended_arm IS NULL OR recommended_arm BETWEEN 0 AND 3);
  END IF;
END;
$$;

UPDATE policies
SET status = CASE
  WHEN COALESCE(active, TRUE) THEN 'active'
  ELSE 'expired'
END
WHERE status IS NULL;

UPDATE policies
SET week_end = (week_start + INTERVAL '6 days')::date
WHERE week_end IS NULL;

CREATE INDEX IF NOT EXISTS idx_policies_week_start_status ON policies(week_start, status);
CREATE INDEX IF NOT EXISTS idx_policies_purchased_at ON policies(purchased_at DESC);

-- Disruption events
ALTER TABLE disruption_events
ADD COLUMN IF NOT EXISTS affected_hex_ids BIGINT[],
ADD COLUMN IF NOT EXISTS trigger_value DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS disruption_hours INTEGER,
ADD COLUMN IF NOT EXISTS event_start TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS event_end TIMESTAMP,
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

UPDATE disruption_events
SET event_start = COALESCE(event_start, created_at)
WHERE event_start IS NULL;

CREATE INDEX IF NOT EXISTS idx_disruption_events_status_start ON disruption_events(status, event_start DESC);

-- Claims
CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES policies(id) ON DELETE SET NULL,
  disruption_event_id UUID REFERENCES disruption_events(id) ON DELETE SET NULL,
  trigger_type VARCHAR(30),
  payout_amount DECIMAL(10, 2),
  disruption_hours INTEGER,
  fraud_score FLOAT,
  isolation_forest_score FLOAT,
  gnn_fraud_score FLOAT,
  graph_flags JSONB DEFAULT '[]'::jsonb,
  bcs_score INTEGER,
  status VARCHAR(20) DEFAULT 'triggered',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  paid_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_claims_worker_created ON claims(worker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claims_policy_id ON claims(policy_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);

-- Payouts
CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id UUID REFERENCES claims(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2),
  upi_vpa VARCHAR(100),
  razorpay_payout_id VARCHAR(100),
  razorpay_fund_account_id VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payouts_claim_id ON payouts(claim_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payouts_razorpay_payout_id_unique
  ON payouts(razorpay_payout_id)
  WHERE razorpay_payout_id IS NOT NULL;

-- RL shadow logs
CREATE TABLE IF NOT EXISTS rl_shadow_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
  formula_premium DECIMAL(8, 2),
  rl_premium DECIMAL(8, 2),
  state_vector FLOAT8[],
  action_value FLOAT4,
  formula_won BOOLEAN,
  logged_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rl_shadow_log_logged_at ON rl_shadow_log(logged_at DESC);
