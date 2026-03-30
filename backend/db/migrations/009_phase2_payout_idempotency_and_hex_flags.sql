-- Phase 2 hardening:
-- 1) Prevent duplicate payouts per claim.
-- 2) Track whether worker home_hex_id is a centroid fallback.
-- Safe to re-run.

-- Worker precision tracking for H3 backfill.
ALTER TABLE workers
ADD COLUMN IF NOT EXISTS hex_is_centroid_fallback BOOLEAN DEFAULT FALSE;

UPDATE workers
SET hex_is_centroid_fallback = COALESCE(hex_is_centroid_fallback, FALSE)
WHERE hex_is_centroid_fallback IS NULL;

-- Keep exactly one payout row per claim before adding uniqueness.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY claim_id
      ORDER BY
        CASE status
          WHEN 'paid' THEN 1
          WHEN 'processing' THEN 2
          WHEN 'pending' THEN 3
          WHEN 'failed' THEN 4
          ELSE 5
        END,
        created_at DESC,
        id DESC
    ) AS rn
  FROM payouts
  WHERE claim_id IS NOT NULL
)
DELETE FROM payouts p
USING ranked r
WHERE p.id = r.id
  AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payouts_claim_id_unique'
  ) THEN
    ALTER TABLE payouts
    ADD CONSTRAINT payouts_claim_id_unique UNIQUE (claim_id);
  END IF;
END;
$$;
