#!/bin/bash
# Run once before demo to get JWTs for demo users
# Outputs export commands to paste into shell

set -euo pipefail

BACKEND="http://localhost:4000"

if ! command -v curl >/dev/null 2>&1; then
  echo "Missing dependency: curl"
  exit 1
fi

HAS_JQ=0
if command -v jq >/dev/null 2>&1; then
  HAS_JQ=1
fi

extract_token() {
  if [ "$HAS_JQ" -eq 1 ]; then
    jq -r '.token // empty'
    return
  fi
  sed -n 's/.*"token":"\([^"]*\)".*/\1/p'
}

get_worker_jwt() {
  for phone in "$@"; do
    token=$(curl -sf -X POST \
      -H "Content-Type: application/json" \
      -d "{\"phone_number\":\"$phone\"}" \
      "$BACKEND/workers/login" | extract_token)
    if [ -n "$token" ]; then
      echo "$token"
      return 0
    fi
  done
  return 1
}

echo "Getting demo JWTs..."

INSURER_JWT=$(curl -sf -X POST \
  -H "Content-Type: application/json" \
  "$BACKEND/auth/insurer-demo-token" | extract_token)

# Sameer demo worker for trigger flow: Andheri West, Mumbai
SAMEER_JWT=$(get_worker_jwt "9000000001" "+919000000001")

# Chennai demo worker for premium quote flow (T Nagar)
PRIYA_JWT=$(get_worker_jwt "9000000005" "+919000000005")

if [ -z "$INSURER_JWT" ]; then
  echo "Failed to get INSURER_JWT. Ensure IS_DEMO_MODE=true in backend."
  exit 1
fi

if [ -z "$SAMEER_JWT" ] || [ -z "$PRIYA_JWT" ]; then
  echo "Failed to get one or more worker JWTs."
  exit 1
fi

echo ""
echo "# Paste these into your shell before running run_demo.sh:"
echo "export INSURER_JWT='$INSURER_JWT'"
echo "export SAMEER_JWT='$SAMEER_JWT'"
echo "export PRIYA_JWT='$PRIYA_JWT'"
