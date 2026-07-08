#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"

check_contains() {
  local label="$1"
  local method="$2"
  local url="$3"
  local expected="$4"
  local body

  echo "checking $label"
  body="$(curl -fsS -X "$method" "$url")"
  if ! printf "%s" "$body" | grep -q "$expected"; then
    echo "missing expected text '$expected' from $label"
    printf "%s\n" "$body"
    exit 1
  fi
}

check_contains health GET "$BASE_URL/api/health" "ok"
check_contains fleet-summary GET "$BASE_URL/api/fleet/summary" "YM-DEMO-01"
check_contains performance GET "$BASE_URL/api/vessels/YM-DEMO-01/performance" "dailyFoc"
check_contains before-after GET "$BASE_URL/api/vessels/YM-DEMO-01/before-after?eventId=event-2025-03-cleaning" "paybackDays"
check_contains ai-brief POST "$BASE_URL/api/vessels/YM-DEMO-01/ai-brief" "citedMetrics"
check_contains fuel-export GET "$BASE_URL/api/fuel-consump/export" "FUEL_CONSUMP"

echo "api smoke checks passed"
