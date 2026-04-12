# GigGuard Codebase Audit Report

## 1.1 Backend Audit Findings

| ID | File Path | severity | Description |
|:---|:---|:---|:---|
| B1 | `backend/src/routes/claims.ts` | HIGH | Async route handlers not wrapped in `try/catch` or `asyncRoute()`. |
| B2 | `backend/src/routes/policies.ts` | MEDIUM | `coverage_tier` in `/create-order` lacks bounds checking (0-3). |
| B3 | `backend/src/services/mlService.ts` | HIGH | Circuit breaker not implemented for ML service calls. |
| B4 | `backend/src/services/paymentClient.ts` | HIGH | Circuit breaker and timeouts not implemented for payment service calls. |
| B5 | `backend/src/routes/insurer.ts` | MEDIUM | `/rl-rollout` does not use Zod validation for request body. |
| B6 | `backend/src/app.ts` | MEDIUM | No startup health check calls for `ml-service` or `payment-service`. |
| B7 | `backend/src/routes/workers.ts` | HIGH | Missing `GET /workers/me` and `PATCH /workers/profile` (as per specs). |
| B8 | `backend/src/routes/claims.ts` | HIGH | Missing `POST /claims/:id/appeal` endpoint. |
| B9 | `backend/src/routes/insurer.ts` | MEDIUM | Missing `GET /insurer/triggers` (uses `/disruption-events` instead). |

## 1.2 Frontend Audit Findings

| ID | File Path | severity | Description |
|:---|:---|:---|:---|
| F1 | `gigguard-frontend/app/page.tsx` | MEDIUM | Missing Hindi script and correct Hero CTAs as per Section 3 specs. |
| F2 | `gigguard-frontend/lib/api.ts` | HIGH | Fetch request timeout (10s) not implemented. |
| F3 | `gigguard-frontend/app/page.tsx` | LOW | No skeleton loader for LiveTicker data fetching. |
| F4 | `gigguard-frontend/app/layout.tsx` | HIGH | Missing global providers (`QueryClientProvider`, `Toaster`, `AuthProvider`). |
| F5 | `gigguard-frontend/lib/auth.ts` | HIGH | Auth guard HOCs (`withWorkerAuth`, `withInsurerAuth`) are missing. |
| F6 | `gigguard-frontend/app/dashboard/page.tsx` | MEDIUM | Real-time polling (30s) not implemented for claim status updates. |

## 1.3 Database Audit Findings

| ID | File Path / Table | severity | Description |
|:---|:---|:---|:---|
| D1 | `workers`, `policies`, etc. | HIGH | `TIMESTAMP` used instead of `TIMESTAMPTZ`. |
| D2 | `payouts` | HIGH | Missing `UNIQUE(claim_id)` constraint to prevent duplicate payouts. |
| D3 | `disruption_events`, `claims`, `payouts` | MEDIUM | Missing `updated_at` column. |
| D4 | `claims(disruption_event_id)` | MEDIUM | Missing index on foreign key. |
| D5 | `payouts(worker_id)` | MEDIUM | Missing index on foreign key. |
| D6 | `rl_shadow_log(worker_id)` | MEDIUM | Missing index on foreign key. |

## 1.4 Cross-service Contract Audit Findings

| ID | Check | severity | Description |
|:---|:---|:---|:---|
| C1 | Backend Startup | MEDIUM | `payment-service /health` is not called on startup. |
| C2 | Backend Startup | MEDIUM | `ml-service /health` is not called on startup. |
| C3 | Inter-service Timeouts | HIGH | `payment-service` calls lack timeouts in `paymentClient.ts`. |
| C4 | Health Standard | LOW | `ml-service` health response format doesn't match Section 5.5 specs. |
