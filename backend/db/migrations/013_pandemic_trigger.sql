-- Phase 3: Pandemic / Health Emergency Trigger
-- Safe to re-run.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Add pandemic trigger enum value only if a PG enum exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'trigger_type_enum'
  ) THEN
    ALTER TYPE trigger_type_enum ADD VALUE IF NOT EXISTS 'pandemic_containment';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS health_advisories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  district VARCHAR(255) NOT NULL,
  state VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  boundary_geojson JSONB NOT NULL,
  affected_hex_ids BIGINT[] NOT NULL DEFAULT '{}'::bigint[],
  severity VARCHAR(20) NOT NULL DEFAULT 'containment',
  declared_at TIMESTAMPTZ NOT NULL,
  lifted_at TIMESTAMPTZ,
  source VARCHAR(100) NOT NULL,
  nationwide BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT health_advisories_severity_check
    CHECK (severity IN ('watch', 'adjacent', 'containment'))
);

CREATE INDEX IF NOT EXISTS idx_health_advisories_active
  ON health_advisories (city, lifted_at)
  WHERE lifted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_health_advisories_hex_ids
  ON health_advisories USING GIN (affected_hex_ids);

CREATE INDEX IF NOT EXISTS idx_health_advisories_district_state
  ON health_advisories (district, state, lifted_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_health_advisories_unique_declared
  ON health_advisories (district, state, city, declared_at);

CREATE TABLE IF NOT EXISTS pandemic_claim_dedup (
  id BIGSERIAL PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  health_advisory_id UUID NOT NULL REFERENCES health_advisories(id) ON DELETE CASCADE,
  claim_date DATE NOT NULL,
  claim_id UUID REFERENCES claims(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (worker_id, health_advisory_id, claim_date)
);

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS zone_updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE workers
SET zone_updated_at = COALESCE(created_at::timestamptz, NOW())
WHERE zone_updated_at IS NULL;
