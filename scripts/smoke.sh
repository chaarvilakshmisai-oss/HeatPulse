#!/usr/bin/env sh
set -eu

if [ -z "${API_URL:-}" ]; then
  echo "Set API_URL to the deployed API base URL." >&2
  exit 2
fi
if [ -z "${SITE_ID:-}" ]; then
  echo "Set SITE_ID to the site id from a worker QR URL." >&2
  exit 2
fi

API_URL=${API_URL%/}

echo "Checking GET /health ..."
curl --fail --silent --show-error "$API_URL/health" >/dev/null
echo "GET /health: OK"

echo "Checking GET /public/sites/$SITE_ID ..."
curl --fail --silent --show-error "$API_URL/public/sites/$SITE_ID" >/dev/null
echo "GET /public/sites/$SITE_ID: OK"
