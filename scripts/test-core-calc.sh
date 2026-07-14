#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAIN_CLASSES="$("$ROOT_DIR/scripts/compile-core-calc.sh")"
TEST_CLASSES="$ROOT_DIR/core-calc/build/test-classes"

mkdir -p "$TEST_CLASSES"
find "$ROOT_DIR/core-calc/src/test/java" -name '*.java' | sort > "$ROOT_DIR/core-calc/build/test-sources.txt"
javac -encoding UTF-8 -cp "$MAIN_CLASSES" -d "$TEST_CLASSES" @"$ROOT_DIR/core-calc/build/test-sources.txt"
java -cp "$MAIN_CLASSES:$TEST_CLASSES" com.fleetmind.corecalc.CoreCalcGoldenTest
java -cp "$MAIN_CLASSES:$TEST_CLASSES" com.fleetmind.corecalc.SpeedLossGoldenTest
java -cp "$MAIN_CLASSES:$TEST_CLASSES" com.fleetmind.corecalc.AttributionGoldenTest
