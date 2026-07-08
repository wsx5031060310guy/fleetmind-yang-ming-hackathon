#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
REPEAT=1
SLEEP_SECONDS=2
VESSEL_ID="YM-DEMO-01"
EVENT_ID="event-2025-03-cleaning"

usage() {
  cat <<'EOF'
Usage:
  scripts/warmup-live-demo.sh [--base-url URL] [--repeat N] [--sleep SECONDS] [--vessel-id ID] [--event-id ID]

Warms and verifies the live demo URL before judges open it. Checks the root
dashboard and key API paths, including AI brief fallback and FUEL_CONSUMP export.

Default BASE_URL is http://localhost:8080. You can also set BASE_URL env.
EOF
}

require_value() {
  local name="$1"
  local value="${2:-}"
  if [[ -z "$value" || "$value" == --* ]]; then
    echo "missing value for $name" >&2
    exit 2
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      require_value "$1" "${2:-}"
      BASE_URL="$2"
      shift 2
      ;;
    --repeat)
      require_value "$1" "${2:-}"
      REPEAT="$2"
      shift 2
      ;;
    --sleep)
      require_value "$1" "${2:-}"
      SLEEP_SECONDS="$2"
      shift 2
      ;;
    --vessel-id)
      require_value "$1" "${2:-}"
      VESSEL_ID="$2"
      shift 2
      ;;
    --event-id)
      require_value "$1" "${2:-}"
      EVENT_ID="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

if ! [[ "$REPEAT" =~ ^[0-9]+$ ]] || [[ "$REPEAT" -lt 1 ]]; then
  echo "--repeat must be a positive integer" >&2
  exit 2
fi

BASE_URL="${BASE_URL%/}"

check_contains() {
  local label="$1"
  local method="$2"
  local path="$3"
  local expected="$4"
  local url="$BASE_URL$path"
  local tmp
  local metrics
  local http_code
  local total_time

  tmp="$(mktemp)"
  metrics="$(curl -sS --retry 2 --retry-delay 1 -X "$method" "$url" \
    -w "%{http_code} %{time_total}" \
    -o "$tmp")"
  http_code="$(awk '{print $1}' <<<"$metrics")"
  total_time="$(awk '{print $2}' <<<"$metrics")"
  if [[ "$http_code" != "200" ]]; then
    echo "FAIL $label HTTP $http_code" >&2
    rm -f "$tmp"
    exit 1
  fi
  if ! grep -q "$expected" "$tmp"; then
    echo "FAIL $label missing '$expected'" >&2
    cat "$tmp" >&2
    rm -f "$tmp"
    exit 1
  fi
  rm -f "$tmp"
  printf "PASS %-18s %ss %s\n" "$label" "$total_time" "$path"
}

for round in $(seq 1 "$REPEAT"); do
  echo "warmup round $round/$REPEAT base_url=$BASE_URL"
  check_contains dashboard GET "/" "FleetMind"
  check_contains health GET "/api/health" "ok"
  check_contains fleet-summary GET "/api/fleet/summary" "$VESSEL_ID"
  check_contains performance GET "/api/vessels/$VESSEL_ID/performance" "dailyFoc"
  check_contains before-after GET "/api/vessels/$VESSEL_ID/before-after?eventId=$EVENT_ID" "paybackDays"
  check_contains ai-brief POST "/api/vessels/$VESSEL_ID/ai-brief" '"passed":true'
  check_contains fuel-export GET "/api/fuel-consump/export" "FUEL_CONSUMP"
  if [[ "$round" -lt "$REPEAT" ]]; then
    sleep "$SLEEP_SECONDS"
  fi
done

echo "live demo warmup passed"
