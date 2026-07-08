#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAIN_CLASSES="$("$ROOT_DIR/scripts/compile-core-calc.sh")"

java -cp "$MAIN_CLASSES" com.fleetmind.corecalc.FuelConsumpExportCli "$@"
