-- Day 1: Add H3-related columns to the database schema.
-- This migration adds H3 geospatial column support to workers and disruption_events.
-- NOTE: home_hex_id starts as NULLABLE; after backfill script completes, add NOT NULL constraint.

-- 1. Add columns to the 'workers' table for H3 geospatial indexing.
--    - home_hex_id: Stores the H3 resolution-8 cell ID for the worker's primary location.
--                   It's a 64-bit integer, so we use BIGINT. Initially NULLABLE to support
--                   backfill process. Once backfill is complete, add the NOT NULL constraint.
--    - active_hex_id: Stores the H3 resolution-8 cell ID for the worker's current location,
--                     updated every 30 minutes during a delivery shift. It is NULLABLE because
--                     we may not have live location data for all workers at all times.
ALTER TABLE workers
ADD COLUMN IF NOT EXISTS home_hex_id BIGINT,
ADD COLUMN IF NOT EXISTS active_hex_id BIGINT;

-- 2. Add a column to the 'disruption_events' table.
--    - affected_hex_ids: Stores an array of H3 resolution-8 cell IDs that were affected
--                      by a trigger event. This represents the k=1 ring (7 hexagons).
--                      We use a BIGINT array to store these 64-bit integer IDs efficiently.
ALTER TABLE disruption_events
ADD COLUMN IF NOT EXISTS affected_hex_ids BIGINT[];

-- 3. Create GIN index on the 'affected_hex_ids' array column.
--    A GIN (Generalized Inverted Index) is optimal for BIGINT[] columns.
--    It creates an index entry for each array element, enabling very fast:
--    - Containment checks: affected_hex_ids @> ARRAY[hex1] -- rows where hex1 is in array
--    - Overlap checks: affected_hex_ids && ARRAY[hex1, hex2] -- rows where arrays overlap
--    This will be crucial for efficiently finding disruption events that affected a specific hex.
--    
--    Performance benefit: Without GIN index, a query checking if a single hex affected any
--    events would require a full table scan. With GIN index, it's O(log n) like a BTree.
CREATE INDEX IF NOT EXISTS idx_disruption_events_affected_hex_ids 
  ON disruption_events USING GIN (affected_hex_ids);

-- 4. Create additional indexes for faster worker queries during backfill
CREATE INDEX IF NOT EXISTS idx_workers_home_hex_id ON workers(home_hex_id);
CREATE INDEX IF NOT EXISTS idx_workers_active_hex_id ON workers(active_hex_id);

-- Gotcha: Why BIGINT for H3 IDs?
-- H3 cell IDs are 64-bit unsigned integers (bits 0-63). PostgreSQL's BIGINT is a signed
-- 64-bit integer (bits 0-62 usable + 1 sign bit). This is safe because valid H3 IDs never
-- use bit 63, so they won't overflow the signed range. Using BIGINT instead of VARCHAR
-- saves ~8x storage and enables much faster comparisons.
--
-- Gotcha: Why GIN and not GiST?
-- GIN is optimal for exact matches and containment (array elements). GiST would be better
-- for range queries or bounding box searches. Since we're looking for exact hex IDs, GIN wins.
--
-- Post-Backfill: Execute this to make home_hex_id required:
-- ALTER TABLE workers 
-- ADD CONSTRAINT workers_home_hex_id_not_null 
-- CHECK (home_hex_id IS NOT NULL);
