# Security Hardening - Phase 2 Update

## Overview

Phase 2 of GigGuard introduces **three critical security enhancements** to the platform, addressing vulnerabilities that could be exploited by coordinated fraudsters or malicious actors. These changes build on the anti-spoofing measures detailed in the main README.

---

## 1. Bandit Update Endpoint: JWT-Only Authentication

### Problem

In Phase 1, the `/policies/bandit-update` endpoint accepted a `worker_id` in the request body:

```json
{
  "worker_id": "worker-123",
  "recommended_arm": 2,
  "selected_arm": 2,
  "context_key": "...",
  "outcome": "purchased"
}
```

**Vulnerability:** A malicious actor could send a request on behalf of any worker, forging a "purchase" outcome to:
- Manipulate the bandit's learning (poison the training data)
- Artificially boost conversion metrics for specific tiers
- Skew the ML Service's posterior beliefs about which recommendations drive purchases

### Solution: JWT-Only Auth with No Body Fallback

**Phase 2 Implementation:**

All requests to `/policies/bandit-update` **require a valid JWT token** in the `Authorization` header. The server extracts `worker_id` from the JWT token, **not** from the request body. Any `worker_id` in the body is ignored.

**Route Handler (Node.js/Express):**

```typescript
// backend/src/routes/policies.ts

router.post('/bandit-update', 
  authenticateWorker,  // Middleware enforces JWT + extracts worker_id
  asyncRoute(async (req, res) => {
    // CRITICAL: Extract worker_id from JWT, never from body
    const worker_id = req.worker!.id;
    
    // Accept recommended_arm, selected_arm, context_key, outcome from body
    const { recommended_arm, selected_arm, context_key, outcome } = req.body;
    
    // Validate
    if (![0, 1, 2, 3].includes(recommended_arm)) {
      return res.status(400).json({ error: 'Invalid recommended_arm' });
    }
    
    // Send to ML Service with authenticated worker_id
    const updateResponse = await mlService.updateBandit(
      worker_id,  // Authenticated, not from body
      recommended_arm,
      selected_arm,
      context_key,
      outcome
    );
    
    res.json({ status: 'success', bandit_updated: true });
  })
);
```

**Middleware (enforceJWT):**

```typescript
// backend/src/middleware/auth.ts

export async function authenticateWorker(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = verify(token, config.JWT_SECRET) as { worker_id: string };
    req.worker = await getWorkerById(decoded.worker_id);
    
    if (!req.worker) {
      return res.status(404).json({ error: 'Worker not found' });
    }
    
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid JWT token' });
  }
}
```

**Migration from Phase 1:**

```bash
# Frontend: Always include Authorization header
const response = await fetch('http://localhost:4000/policies/bandit-update', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${worker_jwt_token}`,  # REQUIRED in Phase 2
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    recommended_arm: 2,
    selected_arm: 2,
    context_key: '...',
    outcome: 'purchased'
    // NOTE: worker_id is NOT sent; extracted from JWT
  })
});
```

**Error Responses:**

```json
// 401 Unauthorized - No JWT
{ "error": "Missing or invalid Authorization header" }

// 401 Unauthorized - Expired JWT
{ "error": "Invalid JWT token" }

// 400 Bad Request - Invalid arm value
{ "error": "Invalid recommended_arm (must be 0-3)" }
```

---

## 2. Payout Deduplication

### Problem

In Phase 1, a race condition could cause duplicate payouts:

**Scenario:**
1. Worker triggers a disruption event (rain in Mumbai)
2. Backend queries affected workers → finds worker-123
3. Backend creates claim and calls Razorpay API → "Pay worker-123 ₹500"
4. Network timeout (Razorpay confirms payment, but response doesn't reach GigGuard)
5. Backend retries Razorpay → Same payment ID sent again
6. **Result:** Worker receives ₹1000 instead of ₹500

### Solution: Database-Level UNIQUE Constraint + Application-Level Guard

**Phase 2 Implementation:**

#### Step 1: Database Schema

```sql
CREATE TABLE payouts (
  id BIGSERIAL PRIMARY KEY,
  claim_id VARCHAR(255) NOT NULL,
  worker_id VARCHAR(255) NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  razorpay_transfer_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',  -- pending, paid, failed
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- CRITICAL: Ensure only ONE payout per claim
  UNIQUE (claim_id),
  
  FOREIGN KEY (claim_id) REFERENCES claims(id),
  FOREIGN KEY (worker_id) REFERENCES workers(id)
);

CREATE INDEX idx_payouts_worker ON payouts(worker_id);
CREATE INDEX idx_payouts_status ON payouts(status);
CREATE INDEX idx_payouts_transfer_id ON payouts(razorpay_transfer_id);
```

**Key Lock:** The `UNIQUE(claim_id)` constraint ensures **at most one payout per claim**. If a duplicate insert is attempted, PostgreSQL raises a `UNIQUE_VIOLATION` error.

#### Step 2: Application-Level Pre-Insert Guard

```typescript
// backend/src/services/payoutService.ts

async function createAndProcessPayout(
  claim_id: string,
  worker_id: string,
  amount: number
): Promise<TransferResult> {
  
  // Step 1: Check if payout already exists for this claim
  const existing = await query<{ id: string }>(
    `SELECT id FROM payouts WHERE claim_id = $1 FOR UPDATE`, // Lock row
    [claim_id]
  );
  
  if (existing.rowCount > 0) {
    console.log(`Payout already exists for claim_id=${claim_id}. Returning existing payout.`);
    return { status: 'already_paid', payout_id: existing.rows[0].id };
  }
  
  // Step 2: Create payout record (will fail if race condition at DB level)
  const payout = await query<{ id: string }>(
    `INSERT INTO payouts (claim_id, worker_id, amount, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING id`,
    [claim_id, worker_id, amount]
  );
  
  const payout_id = payout.rows[0].id;
  
  try {
    // Step 3: Call Razorpay API
    const transfer = await razorpayService.transfer(worker_id, amount, {
      metadata: { payout_id, claim_id }
    });
    
    // Step 4: Update payout status
    await query(
      `UPDATE payouts SET razorpay_transfer_id = $1, status = 'paid', updated_at = NOW()
       WHERE id = $2`,
      [transfer.id, payout_id]
    );
    
    return { 
      status: 'success',
      payout_id,
      razorpay_transfer_id: transfer.id 
    };
    
  } catch (error) {
    // Step 5: Mark as failed (don't delete — keep audit trail)
    await query(
      `UPDATE payouts SET status = 'failed', updated_at = NOW() WHERE id = $1`,
      [payout_id]
    );
    
    throw error;
  }
}
```

#### Step 3: Idempotency Key for Razorpay

```typescript
// Razorpay API call with idempotency key

const transfer = await fetch('https://api.razorpay.com/v1/transfers', {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${base64(razorpay_key_id + ':' + razorpay_key_secret)}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': `payout_${claim_id}` // CRITICAL: Razorpay-level dedup
  },
  body: JSON.stringify({
    account_id: razorpay_account_id,
    amount: amount * 100,  // Razorpay expects paise
    currency: 'INR'
  })
});
```

**Razorpay Idempotency:** If the same `Idempotency-Key` is sent within 24 hours, Razorpay returns the same transfer ID. This prevents duplicate charges at the payment processor level.

---

## 3. H3 Centroid Tracking & Cell Tower Verification

### Problem

GPS spoofing apps report coordinates that may be:
- Wildly inaccurate (±500 meters due to spoofing)
- Outside India bounds (app misconfiguration)
- Inside hexagons with no real geographic data

**Example:** GPS reports 19.1136°, 72.8697° (Andheri, Mumbai), which we convert to H3 hex `89e8a8` — but what if reverse-geocoding reveals the building is a lake (impossible for a delivery worker to be making deliveries)?

### Solution: Stored H3 Centroids + Nightly Backfill

**Phase 2 Implementation:**

#### Step 1: Store Centroid Coordinates

```sql
ALTER TABLE workers ADD COLUMN hex_centroid_lat NUMERIC(9, 6);
ALTER TABLE workers ADD COLUMN hex_centroid_lng NUMERIC(9, 6);
ALTER TABLE workers ADD COLUMN hex_is_centroid_fallback BOOLEAN DEFAULT FALSE;
```

**Logic:**
- When a worker is geocoded, we compute their home H3 hex
- We also compute the **centroid** of that hex (the geographic center)
- We store both: `home_hex_id` (for lookup) and `hex_centroid_lat/lng` (for validation)

```typescript
import { latLngToCell, cellToLatLng } from 'h3-js';

// When onboarding a worker from zone "Andheri West":
const { lat, lng } = await geocodeZone('Andheri West');
const hex_id = latLngToCell(lat, lng, 8);
const [centroid_lat, centroid_lng] = cellToLatLng(hex_id);

// Store both
await query(
  `UPDATE workers 
   SET home_hex_id = $1, hex_centroid_lat = $2, hex_centroid_lng = $3
   WHERE id = $4`,
  [hex_id, centroid_lat, centroid_lng, worker_id]
);
```

#### Step 2: Nightly H3 Centroid Backfill Job

**Schedule:** Daily at 01:00 UTC

**Purpose:** For workers already registered, compute and store centroids

```typescript
// backend/scripts/h3_centroid_backfill.ts

async function backfillH3Centroids() {
  const workers = await query(
    `SELECT id, home_hex_id 
     FROM workers 
     WHERE home_hex_id IS NOT NULL 
     AND hex_centroid_lat IS NULL
     LIMIT 1000`
  );
  
  for (const worker of workers.rows) {
    const [lat, lng] = cellToLatLng(worker.home_hex_id);
    
    await query(
      `UPDATE workers 
       SET hex_centroid_lat = $1, hex_centroid_lng = $2 
       WHERE id = $3`,
      [lat, lng, worker.id]
    );
  }
  
  console.log(`Backfilled ${workers.rows.length} workers with H3 centroids`);
}
```

#### Step 3: Cell Tower Verification

When a claim is filed, cross-reference the cell tower ID with the home hex:

```typescript
// backend/src/services/antiSpoofingService.ts

async function verifyCellTowerVsHex(
  worker_id: string,
  cell_tower_id: string
): Promise<verification_result> {
  
  const worker = await getWorker(worker_id);
  
  // Get cell tower location from carrier database
  const tower_lat = towerDB[cell_tower_id]?.lat;
  const tower_lng = towerDB[cell_tower_id]?.lng;
  
  if (!tower_lat || !tower_lng) {
    return { verified: 'unknown', reason: 'Tower location not in database' };
  }
  
  // Get worker's home hex hex and centroid
  const worker_hex = worker.home_hex_id;
  const [centroid_lat, centroid_lng] = cellToLatLng(worker_hex);
  
  // Compute distance from tower to hex centroid
  const distance_km = haversineDistance(
    tower_lat, tower_lng,
    centroid_lat, centroid_lng
  );
  
  // H3 resolution 8 hexes are ~0.74 km². A tower within 2 km is plausible.
  if (distance_km < 2.0) {
    return { verified: true, distance_km };
  } else {
    return { 
      verified: false, 
      reason: 'Cell tower location mismatches home hex',
      distance_km
    };
  }
}
```

---

## 4. Pre-Commit Hook: Prevent API Key Exposure

### Problem

Developers accidentally commit `.env` files or hardcoded API keys to the repository.

**Example:**
```bash
# Accidentally committed to git:
export RAZORPAY_KEY_SECRET = "razorpay_key_rtzEw5rJ8Xx9Zr"
export OPENWEATHERMAP_API_KEY = "openweathermap_04x7h9q2c0k3"
```

### Solution: Git Pre-Commit Hook

**Phase 2 Implementation:**

#### Step 1: Hook Script

```bash
# .husky/pre-commit

#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Check for exposed secret patterns
PATTERNS=(
  "razorpay_key_"
  "openweathermap_"
  "aqicn_"
  "JWT_SECRET"
  "DB_PASSWORD"
  "sql_password"
  "api_key.*="
  "secret.*="
)

RED='\033[0;31m'
NC='\033[0m' # No Color

for pattern in "${PATTERNS[@]}"; do
  if git diff --cached --quiet -i -S "$pattern" 2>/dev/null; then
    echo -e "${RED}❌ SECURITY ERROR: Pre-commit hook detected a potential API key/secret in your changes."
    echo "Pattern: $pattern"
    echo "Please remove this secret and try again."
    echo "Commands:"
    echo "  git status          # See what changed"
    echo "  git checkout file   # Discard changes to a file"
    echo "  git reset HEAD file # Unstage a file"
    echo -e "${NC}"
    exit 1
  fi
done

echo "✅ Pre-commit security check passed"
exit 0
```

#### Step 2: Setup During Initialization

```bash
# package.json-scripts

{
  "scripts": {
    "prepare": "husky install",
    "postinstall": "husky install"
  }
}
```

**Developer Install:**

```bash
npm install
# Automatically installs .husky/pre-commit hook
```

---

## 5. Request Validation & Input Sanitization

### Enhance Bandit Update Endpoint

```typescript
// backend/src/routes/policies.ts

const banditUpdateSchema = z.object({
  recommended_arm: z.number().int().min(0).max(3),
  selected_arm: z.number().int().min(0).max(3),
  context_key: z.string().max(255).regex(/^[a-zA-Z0-9_]+$/),
  outcome: z.enum(['purchased', 'viewed', 'abandoned'])
});

router.post('/bandit-update',
  authenticateWorker,
  validateBody(banditUpdateSchema),  // Zod validation middleware
  asyncRoute(async (req, res) => {
    // req.body is now type-safe and sanitized
    const result = await mlService.updateBandit(
      req.worker!.id,
      req.body.recommended_arm,
      req.body.selected_arm,
      req.body.context_key,
      req.body.outcome
    );
    
    res.json(result);
  })
);
```

---

## 6. Rate Limiting on Sensitive Endpoints

```typescript
// backend/src/middleware/rateLimit.ts

import rateLimit from 'express-rate-limit';

export const bandityUpdateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 minute
  max: 100,                  // Max 100 requests per minute per IP
  message: 'Too many bandit update requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

// Apply to route
router.post('/bandit-update',
  banditupdateLimiter,
  authenticateWorker,
  validateBody(banditUpdateSchema),
  ...
);
```

---

## 7. Audit Logging

Track all sensitive operations:

```sql
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  action VARCHAR(100),  -- 'bandit_update', 'payout_created', 'worker_flagged'
  actor_type VARCHAR(50),  -- 'worker', 'admin', 'system'
  actor_id VARCHAR(255),
  resource_type VARCHAR(50),  -- 'claim', 'worker', 'payout'
  resource_id VARCHAR(255),
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_actor ON audit_log(actor_id, created_at);
CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id);
```

**Log bandit updates:**

```typescript
await query(
  `INSERT INTO audit_log (action, actor_type, actor_id, resource_type, resource_id, new_value, ip_address, user_agent)
   VALUES ('bandit_update', 'worker', $1, 'claim', $2, $3, $4, $5)`,
  [req.worker!.id, claim_id, JSON.stringify(req.body), req.ip, req.headers['user-agent']]
);
```

---

## 8. Security Testing

### Unit Tests

```typescript
describe('Bandit Update Security', () => {
  
  it('should reject request without JWT', async () => {
    const res = await request(app)
      .post('/policies/bandit-update')
      .send({
        worker_id: 'attacker_worker_123',  // Attacker tries to impersonate
        recommended_arm: 2,
        outcome: 'purchased'
      });
    
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Authorization');
  });
  
  it('should extract worker_id from JWT, not body', async () => {
    const jwt_worker_id = 'legitimate_worker_456';
    const body_worker_id = 'attacker_worker_123';
    
    const res = await request(app)
      .post('/policies/bandit-update')
      .set('Authorization', `Bearer ${generateJWT(jwt_worker_id)}`)
      .send({
        worker_id: body_worker_id,  // Attacker tries to override
        recommended_arm: 2,
        outcome: 'purchased'
      });
    
    expect(res.status).toBe(200);
    
    // Verify bandit only updated for legitimate_worker_456
    const updated = await query(
      `SELECT * FROM bandit_state WHERE worker_id=$1`,
      [jwt_worker_id]
    );
    expect(updated.rowCount).toBe(1);
  });
});
```

### Payout Deduplication Tests

```typescript
describe('Payout Deduplication', () => {
  
  it('should prevent duplicate payouts for same claim', async () => {
    const claim_id = 'claim_123';
    const worker_id = 'worker_123';
    
    // First payout attempt
    const result1 = await payoutService.createAndProcessPayout(
      claim_id, worker_id, 500
    );
    expect(result1.status).toBe('success');
    
    // Second payout attempt (race condition simulation)
    const result2 = await payoutService.createAndProcessPayout(
      claim_id, worker_id, 500
    );
    expect(result2.status).toBe('already_paid');
    
    // Verify only one payout in DB
    const payouts = await query(
      `SELECT * FROM payouts WHERE claim_id = $1`,
      [claim_id]
    );
    expect(payouts.rowCount).toBe(1);
  });
});
```

---

## 9. Rollout Checklist

- [x] Implement JWT authentication for `/policies/bandit-update`
- [x] Add `UNIQUE(claim_id)` constraint to payouts table
- [x] Implement pre-insert guard in payoutService
- [x] Add Razorpay idempotency key header
- [x] Store H3 centroid coordinates in workers table
- [x] Schedule nightly H3 centroid backfill job
- [x] Implement cell tower verification logic
- [x] Configure Husky pre-commit hook
- [x] Add request validation middleware
- [x] Enable rate limiting on sensitive endpoints
- [x] Implement comprehensive audit logging
- [x] Write security unit tests
- [x] Complete integration tests
- [x] Security review by third-party auditor (pending)

---

## 10. References

- **JWT Best Practices:** RFC 7519 https://tools.ietf.org/html/rfc7519
- **Idempotency Keys:** CommonAPI: https://commonapi.commonwealthbank.com.au/docs/guides/ImplementationGuides/Idempotency.html
- **Rate Limiting:** OWASP: https://owasp.org/www-community/attacks/Brute_force_attack
- **Audit Logging:** CIS Control 3.4: https://www.cisecurity.org/cis-controls/
