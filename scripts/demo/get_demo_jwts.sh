#!/bin/bash
# Run once before demo to get JWTs for demo users
# Outputs export commands to paste into shell

set -euo pipefail

BACKEND="http://localhost:4000"

for cmd in curl jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing dependency: $cmd"
    exit 1
  fi
done

echo "Getting demo JWTs..."

INSURER_JWT=$(curl -sf -X POST \
  -H "Content-Type: application/json" \
  "$BACKEND/auth/insurer-demo-token" | jq -r '.token // empty')

SAMEER_JWT=$(curl -sf -X POST \
  -H "Content-Type: application/json" \
  -d '{"phone_number":"+919000000001"}' \
  "$BACKEND/workers/login" | jq -r '.token // empty')

PRIYA_JWT=$(curl -sf -X POST \
  -H "Content-Type: application/json" \
  -d '{"phone_number":"+919000000013"}' \
  "$BACKEND/workers/login" | jq -r '.token // empty')

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
