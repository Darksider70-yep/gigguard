-- 014_audit_fixes.sql
-- Addresses findings from GigGuard Codebase Audit Report (B9, D1-D6)

-- 1. Helper function for updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 2. Convert TIMESTAMP to TIMESTAMPTZ and add updated_at where missing

-- Workers
ALTER TABLE workers 
  ALTER COLUMN created_at TYPE TIMESTAMPTZ,
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ;

-- Policies
ALTER TABLE policies 
  ALTER COLUMN created_at TYPE TIMESTAMPTZ,
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ,
  ALTER COLUMN purchased_at TYPE TIMESTAMPTZ;

-- Disruption Events
ALTER TABLE disruption_events 
  ALTER COLUMN created_at TYPE TIMESTAMPTZ,
  ALTER COLUMN event_start TYPE TIMESTAMPTZ,
  ALTER COLUMN event_end TYPE TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Claims
ALTER TABLE claims 
  ALTER COLUMN created_at TYPE TIMESTAMPTZ,
  ALTER COLUMN paid_at TYPE TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Payouts
ALTER TABLE payouts 
  ALTER COLUMN created_at TYPE TIMESTAMPTZ,
  ALTER COLUMN processed_at TYPE TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- RL Shadow Log
ALTER TABLE rl_shadow_log 
  ALTER COLUMN logged_at TYPE TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Add UNIQUE constraint to payouts(claim_id)
-- First, ensure no duplicates exist (shouldn't in clean seed, but safe)
-- ALTER TABLE payouts ADD CONSTRAINT payouts_claim_id_key UNIQUE (claim_id);
-- Using IF NOT EXISTS pattern for idempotency where possible
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payouts_claim_id_key') THEN
        ALTER TABLE payouts ADD CONSTRAINT payouts_claim_id_key UNIQUE (claim_id);
    END IF;
END;
$$;

-- 4. Add missing indexes for foreign keys
CREATE INDEX IF NOT EXISTS idx_claims_disruption_event_id ON claims(disruption_event_id);
CREATE INDEX IF NOT EXISTS idx_payouts_worker_id ON payouts(worker_id);
CREATE INDEX IF NOT EXISTS idx_rl_shadow_log_worker_id ON rl_shadow_log(worker_id);

-- 5. Attach updated_at triggers
DROP TRIGGER IF EXISTS trg_workers_updated_at ON workers;
CREATE TRIGGER trg_workers_updated_at BEFORE UPDATE ON workers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_policies_updated_at ON policies;
CREATE TRIGGER trg_policies_updated_at BEFORE UPDATE ON policies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_disruption_events_updated_at ON disruption_events;
CREATE TRIGGER trg_disruption_events_updated_at BEFORE UPDATE ON disruption_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_claims_updated_at ON claims;
CREATE TRIGGER trg_claims_updated_at BEFORE UPDATE ON claims FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_payouts_updated_at ON payouts;
CREATE TRIGGER trg_payouts_updated_at BEFORE UPDATE ON payouts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_rl_shadow_log_updated_at ON rl_shadow_log;
CREATE TRIGGER trg_rl_shadow_log_updated_at BEFORE UPDATE ON rl_shadow_log FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
