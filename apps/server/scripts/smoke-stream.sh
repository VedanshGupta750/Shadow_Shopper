#!/usr/bin/env bash
# Smoke test for /api/stream-personas SSE endpoint.
# Usage: ./scripts/smoke-stream.sh [ASIN]

set -euo pipefail

ASIN="${1:-B09V3KXJPB}"
HOST="${HOST:-http://localhost:8080}"

echo "POST ${HOST}/api/stream-personas asin=${ASIN}"
echo "----- streaming SSE (Ctrl+C to abort) -----"

curl -N -X POST "${HOST}/api/stream-personas" \
  -H "Content-Type: application/json" \
  -d "{\"productUrl\":\"https://www.amazon.com/dp/${ASIN}\"}"
