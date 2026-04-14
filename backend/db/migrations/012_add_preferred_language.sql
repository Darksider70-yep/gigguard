-- Safe to run on live DB: adds column with default, no lock escalation
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) NOT NULL DEFAULT 'en';

-- Constraint: only allow valid language codes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workers_language_valid') THEN
    ALTER TABLE workers
      ADD CONSTRAINT workers_language_valid
      CHECK (preferred_language IN ('en', 'hi', 'ta', 'te', 'kn', 'mr'));
  END IF;
END $$;

-- Index for analytics (how many workers per language)
CREATE INDEX IF NOT EXISTS idx_workers_language ON workers(preferred_language);

COMMENT ON COLUMN workers.preferred_language IS
  'Worker preferred UI language. ISO 639-1 code. Default: en (English).
   Set during onboarding. Used to load next-intl messages and generate
   localised ML service claim explanations.';
