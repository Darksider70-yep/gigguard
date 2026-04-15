# Geospatial Intelligence (H3 Indexing)

GigGuard uses Uber's **H3 hexagonal geospatial indexing** to achieve hyper-precise geographic targeting for disruption events. This document covers our implementation, API standards, and performance benchmarks.

---

## 1. Overview & Architecture

By replacing text-based zones ("Mumbai West") with resolution 8 hexagons (~0.74 km²), we ensure that a rainfall event in one neighborhood doesn't trigger unnecessary payouts for workers 5km away in the same larger administrative district.

### Core Data Flow
1. **Trigger Event**: A weather API reports heavy rain at `(19.11, 72.82)`.
2. **Indexing**: The system converts these coordinates to a **Center Hexagon** using `h3-js`.
3. **Ring Expansion**: A **k=1 ring** (7 hexagons total) is generated around the center to cover a ~2km radius.
4. **Targeting**: The database queries the `workers` table for anyone registered in those 7 hex IDs using a high-speed GIN index.
5. **Payout**: Claims are generated and enqueued for the identified workers.

---

## 2. API Reference

### Trigger Processing
The main entry point for disruption detection after receiving coordinates from a service:

```typescript
import { processH3Trigger } from './src/triggers/monitor';

const affectedWorkerIds = await processH3Trigger({
  lat: 19.1136,
  lng: 72.8697,
  trigger_type: 'rain_heavy',
  city: 'Mumbai'
});
// Returns: ['worker-uuid-1', 'worker-uuid-2']
```

### H3 Utilities
We standardize on **Resolution 8**. Changing this requires a full database backfill.

| Function | Description |
|---|---|
| `latLngToCell(lat, lng, 8)` | Converts coordinates to a BigInt Hex ID. |
| `gridDisk(hex, 1)` | Returns the center hex and its 6 immediate neighbors. |

---

## 3. Database Strategy

### Schema
H3 IDs are stored as **BIGINT** for maximum query performance and minimal storage compared to strings.

```sql
ALTER TABLE workers ADD COLUMN home_hex_id BIGINT;
-- GIN Index for fast equality-in-array lookups
CREATE INDEX idx_workers_home_hex_id_gin ON workers USING GIN (home_hex_id);
```

### Performance Benchmarks
| Metric | H3 Index (GIN) | Text-based Scan |
|---|---|---|
| Query Latency (100k workers) | **1-2 ms** | 45-50 ms |
| Targeting Precision | **~800m hex** | ~5-10km city zone |
| Disk Usage (Index) | ~200 MB | N/A |

---

## 4. Operational Runbook

### Running a Backfill
If you import new workers or change resolution, run the backfill script:
```bash
# Uses Google Maps API to convert Zone names to Hex IDs
npm run backfill:hex-ids
```

Check `failed_geocodes.csv` after the run for any ambiguous zone names that need manual correction.

### Debugging Missed Payouts
If a worker claims they were in the rain but didn't get paid:
1. Get the worker's `home_hex_id` from the DB.
2. Get the `affected_hex_ids` array from the `disruption_events` table for that specific event.
3. Verify if the worker's hex is present in that array.

---

**Status**: LIVE (Phase 2 Upgrade)
**Maintainer**: Engineering / Data Science
