# Changelog

All notable changes to GigGuard are documented here.

---

## [3.0.0] — Phase 3: GNN Fraud Detection & RL A/B Testing (2026-04)

### Added
- **GraphSAGE GNN fraud detection** — graph-based fraud ring detection with synthetic training data
  - Node feature encoders, graph builder, PyG data loader
  - Ensemble scoring with Isolation Forest fallback
- **RL A/B testing framework** — SAC-based reinforcement learning pricing agent
  - Deterministic worker-to-cohort assignment (`rl_ab_assignments`)
  - Automated safety monitoring with kill-switch (`rl_rollout_config`)
  - Daily metrics tracking per cohort (`rl_daily_metrics`)
  - Live RL premium endpoint (`/rl-live-premium`)
- **GNN dashboard** for insurer portal — fraud ring visualization, scorer breakdown
- **Safety monitor worker** — automatic kill-switch on high loss ratio (> 1.25)
- **Phase 3 RL migration** — `rl_rollout_config`, `rl_ab_assignments`, `rl_daily_metrics` tables

### Changed
- ML service Dockerfile optimized for RAM — `--max-requests 1000`, `--worker-tmp-dir /dev/shm`
- Frontend Dockerfile optimized — removed unnecessary `npm ci --omit=dev` (standalone bundles all deps)
- Docker configuration consolidated to `infra/` directory (root `docker-compose.yml` removed)

### Security
- Fixed wildcard CORS (`*`) → configurable origin via `CORS_ORIGIN` env var
- Added security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy)
- Fixed JWT_SECRET fallback — no longer falls back to Razorpay secret
- Sanitized `.env` — removed leaked API keys

### Fixed
- Missing `authenticateInsurer` import in `workers.ts` GNN endpoint
- Duplicate migration numbering (`009_` appeared twice) — renamed to `011_`

---

## [2.0.0] — Phase 2: Anti-Fraud, Bandits & H3 Geo (2026-03)

### Added
- **Contextual Thompson Sampling bandit** for policy tier recommendation
  - 4-arm bandit (Basic, Standard, Premium, Ultra)
  - Context-aware: platform × city × experience × season × zone risk
  - Persistent state with database-backed store
- **H3 geospatial indexing** — hex-based zone mapping at resolution 8
  - Worker home hex assignment with centroid fallback
  - Nightly backfill job for legacy workers
  - GIN indexes for hex-based queries
- **Anti-spoofing BCS (Behavioral Coherence Score)** — multi-flag fraud detection
  - Cell tower mismatch, shared UPI, shared device, registration burst detection
  - 3-tier scoring: auto-approve (BCS ≥ 67), review (34–66), flag (< 34)
- **Insurer portal API** — dashboard, worker management, disruption events, payout history
- **Payout deduplication** — UNIQUE constraint + application guard + Razorpay idempotency key
- **Shadow RL logging** — formula vs SAC premium comparison logged asynchronously
- **Weather API budget tracking** — city clustering to reduce API calls
- **Demo mode** — reset endpoint, mock payout mode, demo OTP bypass

### Changed
- JWT authentication moved to custom HMAC-SHA256 implementation (no jsonwebtoken dependency)
- Worker registration flow: OTP-based phone verification
- Policy purchase flow: Razorpay integration with webhook-based status updates

### Security
- Bandit update endpoint: JWT-only auth (worker_id from token, not body)
- Husky pre-commit hook for secret scanning
- Zod request body validation middleware

---

## [1.0.0] — Phase 1: Core Platform (2026-02)

### Added
- **Worker registration and login** with phone-based OTP
- **Weekly micro-insurance policies** — platform-specific (Zomato/Swiggy)
- **Disruption event monitoring** — rain, AQI, flood triggers
- **Automatic claim creation** for affected workers
- **Premium calculation** — formula-based with zone/weather/history multipliers
- **ML service** — Isolation Forest fraud scoring, formula premium calculation
- **BullMQ job queues** — claim creation, claim validation, payout processing
- **Razorpay payout integration** — UPI-based payouts with webhook confirmation
- **PostgreSQL schema** — workers, policies, claims, payouts, disruption_events
- **Redis** — caching, job queues, OTP storage
- **Multi-stage Docker builds** — Node.js backend, Python ML service, Next.js frontend
