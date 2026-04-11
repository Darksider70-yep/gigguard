-- Safe to run on live DB: adds column with default, no lock escalation
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) NOT NULL DEFAULT 'en';

-- Constraint: only allow valid language codes
ALTER TABLE workers
  ADD CONSTRAINT workers_language_valid
  CHECK (preferred_language IN ('en', 'hi', 'ta', 'te', 'kn', 'mr'));

-- Index for analytics (how many workers per language)
CREATE INDEX IF NOT EXISTS idx_workers_language ON workers(preferred_language);

COMMENT ON COLUMN workers.preferred_language IS
  'Worker preferred UI language. ISO 639-1 code. Default: en (English).
   Set during onboarding. Used to load next-intl messages and generate
   localised ML service claim explanations.';
