#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_MODE=false

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
branches. Use --dev while working on feature branches.
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

cd "$ROOT_DIR"

section() {
  echo
  echo "== $* =="
}

section "env template"
zsh -c 'set -a; source .env.example; test -n "$AWS_REGION"; test -n "$BASE_URL"'

section "submission audit"
if [[ "$DEV_MODE" == "true" ]]; then
  ./scripts/submission-audit.sh --allow-dirty --allow-non-main --skip-remote-branches
else
  ./scripts/submission-audit.sh
fi

section "local demo"
./scripts/demo-local.sh

section "schema inventory smoke"
./scripts/schema-inventory.sh samples/noon-reports.csv >/tmp/fleetmind-schema-inventory-smoke.csv
grep -q "samples/noon-reports.csv" /tmp/fleetmind-schema-inventory-smoke.csv

section "git summary"
git status --short --branch
git branch -r
git log --oneline --decorate -5

echo
echo "day3 final check passed"
