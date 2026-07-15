#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib/curl-common.sh"

BASE_URL="${BASE_URL:-http://localhost:8080}"
REPEAT=1
SLEEP_SECONDS=2
# S11 is the vessel the demo actually clicks, so it is the one whose ai-brief has to be warm.
# These used to be YM-DEMO-01 / event-2025-03-cleaning, which DemoDataService still answers 200 for
# but which is not in the real fleet: /api/fleet/summary returns S1..S23, so the fleet-summary check
# failed on its own default, the script exited 1, and it never reached the ai-brief call it exists to
# make. Running it before going on stage would have left S11 cold.
VESSEL_ID="S11"
EVENT_ID="event-S11-UWC-PP-2022-07-25"
REQUIRE_AI=false

usage() {
  cat <<'EOF'
Usage:
  scripts/warmup-live-demo.sh [--base-url URL] [--repeat N] [--sleep SECONDS] [--vessel-id ID] [--event-id ID] [--require-ai]

Warms and verifies the live demo URL before judges open it. Checks the root
dashboard and key API paths, including AI brief fallback and FUEL_CONSUMP export.
AI brief failure warns by default and does not fail warm-up. Use --require-ai to fail.

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
    --require-ai)
      REQUIRE_AI=true
      shift
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
  if [[ "$method" == "POST" ]]; then
    # The only POST here is the ai-brief, and curl_post_safe's shared --max-time 12 is tuned for
    # the fast endpoints. A warm brief takes ~7s, but the FIRST one after a deploy also pays a cold
    # JVM, the lazily-built Bedrock client and a TLS handshake — it blew past 12s and curl reported
    # HTTP 000, failing the one call this script exists to make. A later --max-time overrides an
    # earlier one (verified), so this widens it without touching api-smoke.sh or freeze-demo-snapshot.sh.
    # 25s sits above the server's own ceiling: app.js aborts at 15s and AiBriefService gives up at 13s,
    # so the server always answers first and curl never decides the outcome.
    metrics="$(curl_post_safe "$url" --max-time 25 -w "%{http_code} %{time_total}" -o "$tmp")"
  else
    metrics="$(curl_safe "$url" -w "%{http_code} %{time_total}" -o "$tmp")"
  fi
  http_code="$(awk '{print $1}' <<<"$metrics")"
  total_time="$(awk '{print $2}' <<<"$metrics")"
  if [[ "$http_code" != "200" ]]; then
    echo "FAIL $label HTTP $http_code" >&2
    rm -f "$tmp"
    return 1
  fi
  if ! grep -q "$expected" "$tmp"; then
    echo "FAIL $label missing '$expected'" >&2
    cat "$tmp" >&2
    rm -f "$tmp"
    return 1
  fi
  rm -f "$tmp"
  printf "PASS %-18s %ss %s\n" "$label" "$total_time" "$path"
}

check_ai_brief() {
  if check_contains ai-brief POST "/api/vessels/$VESSEL_ID/ai-brief" '"passed":true'; then
    return 0
  fi
  if [[ "$REQUIRE_AI" == "true" ]]; then
    return 1
  fi
  echo "WARN ai-brief unavailable; non-AI demo checks continue" >&2
  return 0
}

for round in $(seq 1 "$REPEAT"); do
  echo "warmup round $round/$REPEAT base_url=$BASE_URL"
  check_contains dashboard GET "/" "FleetMind"
  check_contains health GET "/api/health" "ok"
  check_contains fleet-summary GET "/api/fleet/summary" "$VESSEL_ID"
  check_contains performance GET "/api/vessels/$VESSEL_ID/performance" "dailyFoc"
  # recoveryPct, not paybackDays: every businessImpact field is null now that the cost model is gone
  # (docs/27 — 成本是別部門管的), so asserting one of them proved only that the key still exists.
  # recoveryPct is the payload this endpoint exists to serve, and the number the demo talks about.
  check_contains before-after GET "/api/vessels/$VESSEL_ID/before-after?eventId=$EVENT_ID" "recoveryPct"
  check_ai_brief
  check_contains fuel-export GET "/api/fuel-consump/export" "FUEL_CONSUMP"
  if [[ "$round" -lt "$REPEAT" ]]; then
    sleep "$SLEEP_SECONDS"
  fi
done

echo "live demo warmup passed"
