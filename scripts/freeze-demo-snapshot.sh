#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib/curl-common.sh"

BASE_URL="${BASE_URL:-http://localhost:8080}"
OUT_DIR="build/demo-freeze"
VESSEL_ID="YM-DEMO-01"
EVENT_ID="event-2025-03-cleaning"

usage() {
  cat <<'EOF'
Usage:
  scripts/freeze-demo-snapshot.sh [--base-url URL] [--out DIR] [--vessel-id ID] [--event-id ID]

Captures Day3 demo API outputs into an ignored local directory:
health, fleet summary, vessel performance, before-after, data quality,
AI brief, AI prompt contract, and FUEL_CONSUMP export.

Default BASE_URL is http://localhost:8080. You can also set BASE_URL env.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      if [[ $# -lt 2 ]]; then
        echo "missing value for --base-url" >&2
        exit 2
      fi
      BASE_URL="$2"
      shift 2
      ;;
    --out)
      if [[ $# -lt 2 ]]; then
        echo "missing value for --out" >&2
        exit 2
      fi
      OUT_DIR="$2"
      shift 2
      ;;
    --vessel-id)
      if [[ $# -lt 2 ]]; then
        echo "missing value for --vessel-id" >&2
        exit 2
      fi
      VESSEL_ID="$2"
      shift 2
      ;;
    --event-id)
      if [[ $# -lt 2 ]]; then
        echo "missing value for --event-id" >&2
        exit 2
      fi
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

BASE_URL="${BASE_URL%/}"
if ! command -v ruby >/dev/null 2>&1; then
  echo "ruby is required for URL encoding; verify macOS Ruby or install with: brew install ruby" >&2
  exit 2
fi

url_encode() {
  ruby -rcgi -e 'print CGI.escape(ARGV.fetch(0)).gsub("+", "%20")' "$1"
}

VESSEL_ID_ENCODED="$(url_encode "$VESSEL_ID")"
EVENT_ID_ENCODED="$(url_encode "$EVENT_ID")"

if [[ -d "$OUT_DIR" ]] && [[ -n "$(find "$OUT_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  PREVIOUS_DIR="${OUT_DIR}.prev-$(date +%s)"
  mv "$OUT_DIR" "$PREVIOUS_DIR"
  echo "NOTICE moved non-empty snapshot directory to $PREVIOUS_DIR"
fi
mkdir -p "$OUT_DIR"

fetch_and_check() {
  local label="$1"
  local method="$2"
  local path="$3"
  local output="$4"
  local expected="$5"
  local url="$BASE_URL$path"

  echo "capturing $label"
  if [[ "$method" == "POST" ]]; then
    curl_post_safe "$url" -o "$OUT_DIR/$output"
  else
    curl_safe "$url" -o "$OUT_DIR/$output"
  fi
  if ! grep -q "$expected" "$OUT_DIR/$output"; then
    echo "missing expected text '$expected' from $label" >&2
    exit 1
  fi
}

checksum() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$@"
  else
    shasum -a 256 "$@"
  fi
}

fetch_and_check health GET "/api/health" health.json '"ok"'
fetch_and_check fleet-summary GET "/api/fleet/summary" fleet-summary.json "vesselId"
fetch_and_check performance GET "/api/vessels/$VESSEL_ID_ENCODED/performance" vessel-performance.json "dailyFoc"
fetch_and_check underwater-events GET "/api/vessels/$VESSEL_ID_ENCODED/underwater-events" underwater-events.json "event"
fetch_and_check before-after GET "/api/vessels/$VESSEL_ID_ENCODED/before-after?eventId=$EVENT_ID_ENCODED" before-after.json "paybackDays"
fetch_and_check data-quality GET "/api/data-quality/summary" data-quality.json "flagCounts"
fetch_and_check ai-brief POST "/api/vessels/$VESSEL_ID_ENCODED/ai-brief" ai-brief.json '"passed":true'
fetch_and_check ai-brief-prompt GET "/api/vessels/$VESSEL_ID_ENCODED/ai-brief/prompt" ai-brief-prompt.json "systemPrompt"
fetch_and_check fuel-export GET "/api/fuel-consump/export" fuel-consump.csv "FUEL_CONSUMP"

MANIFEST="$OUT_DIR/manifest.txt"
{
  echo "fleetmind_demo_snapshot"
  echo "generated_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "base_url=$BASE_URL"
  echo "git_sha=$(git rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "vessel_id=$VESSEL_ID"
  echo "event_id=$EVENT_ID"
  echo
  echo "sha256"
  for file in "$OUT_DIR"/*; do
    [[ "$(basename "$file")" == "manifest.txt" ]] && continue
    checksum "$file"
  done
} >"$MANIFEST"

echo "wrote $OUT_DIR"
echo "manifest $MANIFEST"
