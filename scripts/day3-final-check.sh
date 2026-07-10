#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$(dirname "${BASH_SOURCE[0]}")/lib/curl-common.sh"
DEV_MODE=false
STRICT_DATA_MODE=false

usage() {
  cat <<'EOF'
Usage:
  scripts/day3-final-check.sh [--dev]

Runs the local Day3 pre-upload checks:
- source-safe .env.example
- submission audit
- local demo export + FUEL_CONSUMP validation
- schema inventory smoke
- git status / branch summary

Default mode is strict for final upload: clean main branch and no extra remote
branches. Use --dev while working on feature branches; sample checks are labeled DEV.

Real-data strict mode activates when FINAL_FUEL_CONSUMP or OFFICIAL_ROW_COUNT is
set. Both are then required. Optional BASE_URL checks live health and warm-up.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev)
      DEV_MODE=true
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

if [[ -n "${FINAL_FUEL_CONSUMP:-}" || -n "${OFFICIAL_ROW_COUNT:-}" ]]; then
  STRICT_DATA_MODE=true
fi

if [[ "$STRICT_DATA_MODE" == "true" ]]; then
  if [[ -z "${FINAL_FUEL_CONSUMP:-}" || -z "${OFFICIAL_ROW_COUNT:-}" ]]; then
    echo "strict mode requires FINAL_FUEL_CONSUMP and OFFICIAL_ROW_COUNT" >&2
    exit 2
  fi
fi

cd "$ROOT_DIR"

section() {
  echo
  echo "== $* =="
}

section "env template"
bash -c 'set -a; source .env.example; test -n "$AWS_REGION"; test -n "$BASE_URL"'

section "submission audit"
if [[ "$STRICT_DATA_MODE" == "true" ]]; then
  ./scripts/submission-audit.sh --check-inputs
elif [[ "$DEV_MODE" == "true" ]]; then
  ./scripts/submission-audit.sh --allow-dirty --allow-non-main --skip-remote-branches
else
  ./scripts/submission-audit.sh
fi

if [[ "$STRICT_DATA_MODE" == "true" ]]; then
  section "STRICT real FUEL_CONSUMP"
  if ./scripts/validate-fuel-consump.sh --help | grep -q -- '--max-blank-foc'; then
    ./scripts/validate-fuel-consump.sh \
      --input "$FINAL_FUEL_CONSUMP" \
      --expected-rows "$OFFICIAL_ROW_COUNT" \
      --max-blank-foc 0
  else
    echo "INFO validator lacks --max-blank-foc; applying independent blank-FOC guard"
    ./scripts/validate-fuel-consump.sh \
      --input "$FINAL_FUEL_CONSUMP" \
      --expected-rows "$OFFICIAL_ROW_COUNT"
    ruby -rcsv -e '
      table = CSV.read(ARGV.fetch(0), headers: true, encoding: "bom|utf-8")
      blank = table.count { |row| row["FUEL_CONSUMP"].to_s.strip.empty? }
      abort("blank FUEL_CONSUMP count=#{blank}; expected 0") unless blank.zero?
      puts "blank FUEL_CONSUMP guard passed count=0"
    ' "$FINAL_FUEL_CONSUMP"
  fi

  if [[ -n "${BASE_URL:-}" ]]; then
    section "STRICT live demo"
    LIVE_BASE_URL="${BASE_URL%/}"
    curl_safe "$LIVE_BASE_URL/api/health" >/dev/null
    BASE_URL="$LIVE_BASE_URL" ./scripts/warmup-live-demo.sh
  fi
else
  section "DEV local demo (sample data)"
  ./scripts/demo-local.sh
fi

section "$([[ "$STRICT_DATA_MODE" == "true" ]] && echo STRICT || echo DEV) schema inventory smoke"
./scripts/schema-inventory.sh samples/noon-reports.csv >/tmp/fleetmind-schema-inventory-smoke.csv
grep -q "samples/noon-reports.csv" /tmp/fleetmind-schema-inventory-smoke.csv

section "git summary"
git status --short --branch
git branch -r
git log --oneline --decorate -5

echo
echo "day3 final check passed"
