#!/usr/bin/env bash
set -euo pipefail

URL="${CARSANDKIDS_FORMS_URL:-}"
if [[ -z "$URL" ]]; then
  if [[ -f ../forms-config.js ]]; then
    URL=$(grep -oE "https://script\.google\.com/macros/s/[^'\"]+" ../forms-config.js || true)
  fi
fi

if [[ -z "$URL" ]]; then
  echo "ERROR: CARSANDKIDS_FORMS_URL is not set and forms-config.js has no deploy URL." >&2
  echo "Complete FORMS_SETUP.md steps 1-4 first." >&2
  exit 1
fi

echo "Health check: ${URL}?health=1"
RESPONSE=$(curl -fsSL "${URL}?health=1")
echo "$RESPONSE"

if ! echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "ERROR: Health check failed." >&2
  exit 1
fi

echo "OK: Forms endpoint is live."

echo ""
echo "Manual checks still required after deploy:"
echo "  - Submit Drive, Visit, and Support forms on the live site"
echo "  - Confirm rows in Cars & Kids Intake spreadsheet"
echo "  - Confirm notification at info@carsandkids.net"
echo "  - Confirm auto-reply to submitter"
