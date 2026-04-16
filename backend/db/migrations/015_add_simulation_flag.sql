-- Add is_simulated flag to disruption_events to handle demo/simulation states
ALTER TABLE disruption_events
ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN DEFAULT FALSE;
