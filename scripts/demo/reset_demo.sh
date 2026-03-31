#!/bin/bash
# Reset demo state between runs
# Preserves: workers, policies, bandit_state
# Truncates: claims, payouts, disruption_events, rl_shadow_log

set -euo pipefail

BACKEND="http://localhost:4000"

if ! command -v curl >/dev/null 2>&1; then
  echo "Missing dependency: curl"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Missing dependency: jq"
  exit 1
fi

if [ -z "${INSURER_JWT:-}" ]; then
  echo "INSURER_JWT is not set. Run: bash scripts/demo/get_demo_jwts.sh"
  exit 1
fi

echo "Resetting GigGuard demo state..."
curl -sf -X POST \
  -H "Authorization: Bearer $INSURER_JWT" \
  "$BACKEND/admin/demo-reset" | jq '.'

echo "Demo state reset complete"
echo "  Workers: preserved"
echo "  Policies: preserved"
echo "  Claims: truncated"
echo "  Payouts: truncated"
echo "  Disruption events: truncated"
echo "  RL shadow log: truncated"
