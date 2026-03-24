-- Day 5: Contextual bandit persistence + policy audit columns

-- workers.zone_multiplier is used to derive zone_risk context:
-- <1.0 low, 1.0-1.2 medium, >1.2 high.
ALTER TABLE workers
ADD COLUMN IF NOT EXISTS zone_multiplier DECIMAL(5, 2) DEFAULT 1.00;

-- Ensure policies table has purchase/payment fields expected by the
-- policy-tier recommendation flow.
ALTER TABLE policies
ADD COLUMN IF NOT EXISTS premium_paid DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Bandit audit fields on each policy purchase.
ALTER TABLE policies
ADD COLUMN IF NOT EXISTS recommended_arm INTEGER
  CHECK (recommended_arm IS NULL OR recommended_arm BETWEEN 0 AND 3),
ADD COLUMN IF NOT EXISTS arm_accepted BOOLEAN,
ADD COLUMN IF NOT EXISTS context_key VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_policies_context_key ON policies(context_key);
CREATE INDEX IF NOT EXISTS idx_policies_recommended_arm ON policies(recommended_arm);

-- Single-row JSONB table for Thompson Sampling state persistence.
CREATE TABLE IF NOT EXISTS bandit_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  state JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO bandit_state (id, state)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

