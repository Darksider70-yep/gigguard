-- Runtime schema compatibility for current backend queries/workers.
-- Safe to re-run.

-- disruption_events compatibility columns
ALTER TABLE disruption_events
ADD COLUMN IF NOT EXISTS trigger_threshold DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS severity VARCHAR(20),
ADD COLUMN IF NOT EXISTS affected_workers_count INTEGER,
ADD COLUMN IF NOT EXISTS total_claims_triggered INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_payout_amount DECIMAL(15, 2);

UPDATE disruption_events
SET affected_workers_count = COALESCE(affected_workers_count, affected_worker_count, 0)
WHERE affected_workers_count IS NULL;

UPDATE disruption_events
SET total_payout_amount = COALESCE(total_payout_amount, total_payout, 0)
WHERE total_payout_amount IS NULL;

UPDATE disruption_events
SET trigger_threshold = CASE trigger_type
  WHEN 'heavy_rainfall' THEN 15
  WHEN 'severe_aqi' THEN 300
  WHEN 'extreme_heat' THEN 44
  WHEN 'flood_alert' THEN 1
  WHEN 'curfew_strike' THEN 1
  ELSE trigger_threshold
END
WHERE trigger_threshold IS NULL;

UPDATE disruption_events
SET severity = CASE
  WHEN trigger_value IS NULL OR trigger_threshold IS NULL OR trigger_threshold = 0
    THEN COALESCE(severity, 'moderate')
  WHEN trigger_value >= (trigger_threshold * 1.5) THEN 'extreme'
  WHEN trigger_value >= (trigger_threshold * 1.2) THEN 'high'
  ELSE 'moderate'
END
WHERE severity IS NULL;

-- claims compatibility columns
ALTER TABLE claims
ADD COLUMN IF NOT EXISTS trigger_value DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS trigger_threshold DECIMAL(10, 2);

UPDATE claims c
SET trigger_value = de.trigger_value
FROM disruption_events de
WHERE c.disruption_event_id = de.id
  AND c.trigger_value IS NULL
  AND de.trigger_value IS NOT NULL;

UPDATE claims c
SET trigger_threshold = de.trigger_threshold
FROM disruption_events de
WHERE c.disruption_event_id = de.id
  AND c.trigger_threshold IS NULL
  AND de.trigger_threshold IS NOT NULL;

UPDATE claims
SET trigger_threshold = CASE trigger_type
  WHEN 'heavy_rainfall' THEN 15
  WHEN 'severe_aqi' THEN 300
  WHEN 'extreme_heat' THEN 44
  WHEN 'flood_alert' THEN 1
  WHEN 'curfew_strike' THEN 1
  ELSE trigger_threshold
END
WHERE trigger_threshold IS NULL;
