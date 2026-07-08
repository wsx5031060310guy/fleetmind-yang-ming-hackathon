#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"$ROOT_DIR/scripts/test-core-calc.sh"

OUT_DIR="$ROOT_DIR/core-calc/build/demo"
mkdir -p "$OUT_DIR"
MAIN_CLASSES="$("$ROOT_DIR/scripts/compile-core-calc.sh")"

java -cp "$MAIN_CLASSES" com.fleetmind.corecalc.FuelConsumpExportCli \
  --input "$ROOT_DIR/samples/noon-reports.csv" \
  --output "$OUT_DIR/fuel-consump.csv"

java -cp "$MAIN_CLASSES" com.fleetmind.corecalc.BusinessImpactCli \
  --baseline-daily-foc 58 \
  --observed-daily-foc 61 \
  --fuel-price-usd-per-mt 650 \
  --cleaning-cost-usd 40000 \
  --carbon-price-usd-per-ton 90 \
  --eu-ets-coverage-rate 0.5 \
  > "$OUT_DIR/business-impact.csv"

echo "Wrote $OUT_DIR/fuel-consump.csv"
echo "Wrote $OUT_DIR/business-impact.csv"
