-- 010_registration_fields.sql

-- Add verified flag to workers
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;

-- Add avatar_seed for deterministic pixel avatar generation
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS avatar_seed VARCHAR(50);

-- Index for OTP lookup (Redis handles this, but add phone index)
CREATE INDEX IF NOT EXISTS idx_workers_phone
  ON workers(phone_number);

-- Add verified timestamp
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
