#!/bin/bash
# GigGuard Phase 2 Demo Script
# Run from repo root: bash scripts/demo/run_demo.sh
# Prerequisites: all services running (docker-compose up -d)

set -euo pipefail

BACKEND="http://localhost:4000"
ML="http://localhost:5001"
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

for cmd in curl jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing dependency: $cmd"
    exit 1
  fi
done

for var in INSURER_JWT SAMEER_JWT PRIYA_JWT; do
  if [ -z "${!var:-}" ]; then
    echo "Missing $var. Run: bash scripts/demo/get_demo_jwts.sh"
    exit 1
  fi
done

echo -e "${BLUE}=== GigGuard Phase 2 Demo ===${NC}"
echo ""

echo -e "${YELLOW}[0/7] Health checks...${NC}"
curl -sf "$BACKEND/health" | jq '.status' || { echo "Backend DOWN"; exit 1; }
curl -sf "$ML/health" | jq '.status' || { echo "ML Service DOWN"; exit 1; }
echo -e "${GREEN}All services healthy ✓${NC}"
echo ""

echo -e "${YELLOW}[1/7] Insurer Dashboard${NC}"
curl -sf -H "Authorization: Bearer $INSURER_JWT" \
  "$BACKEND/insurer/dashboard" | jq '{
    total_workers: .stats.total_workers,
    active_policies: .stats.active_policies,
    loss_ratio: .stats.loss_ratio,
    flagged_claims: .stats.flagged_claims
  }'
echo ""

echo -e "${YELLOW}[2/7] Premium Quote - Priya Murthy, T. Nagar Chennai${NC}"
curl -sf -H "Authorization: Bearer $PRIYA_JWT" \
  "$BACKEND/policies/premium" | jq '{
    premium: .premium,
    rl_premium: .rl_premium,
    recommended_arm: .recommended_arm,
    zone_multiplier: .formula_breakdown.zone_multiplier,
    weather_multiplier: .formula_breakdown.weather_multiplier,
    coverage_heavy_rainfall: .coverage.heavy_rainfall
  }'
echo ""

echo -e "${YELLOW}[3/7] Zone Risk Matrix${NC}"
curl -sf -H "Authorization: Bearer $INSURER_JWT" \
  "$BACKEND/insurer/zone-risk-matrix" | jq '.zones[:5]'
echo ""

echo -e "${YELLOW}[4/7] Simulate Trigger - Heavy Rainfall, Andheri West Mumbai${NC}"
EVENT_RESPONSE=$(curl -sf -X POST \
  -H "Authorization: Bearer $INSURER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"triggerType":"heavy_rainfall","city":"Mumbai","zone":"Andheri West","value":25.4}' \
  "$BACKEND/triggers/simulate")
echo "$EVENT_RESPONSE" | jq '{
  event_id: .event_id,
  affected_workers: .affected_workers,
  total_payout: .total_payout,
  hex_ring_size: .hex_ring_size
}'
echo ""

echo -e "${YELLOW}[5/7] Processing claims via BullMQ...${NC}"
sleep 3

echo -e "${YELLOW}[6/7] Worker Dashboard - Sameer Shaikh, Andheri West${NC}"
curl -sf -H "Authorization: Bearer $SAMEER_JWT" \
  "$BACKEND/policies/active" | jq '{
    has_active_policy: .has_active_policy,
    claim_status: .active_claim.claim_status,
    payout_amount: .active_claim.payout_amount,
    trigger_type: .active_claim.trigger_type
  }'
echo ""

echo -e "${YELLOW}[7/7] Anti-Spoofing Alerts${NC}"
curl -sf -H "Authorization: Bearer $INSURER_JWT" \
  "$BACKEND/insurer/anti-spoofing-alerts" | jq '{
    total_alerts: (.alerts | length),
    first_alert: (
      .alerts[0] // {}
      | { worker_name, bcs_score, bcs_tier, graph_flags }
    )
  }'

echo ""
echo -e "${GREEN}=== Demo Complete ✓ ===${NC}"
echo "Open http://localhost:3000 to show the UI"
