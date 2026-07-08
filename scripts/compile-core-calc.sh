#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/core-calc/build"
MAIN_CLASSES="$BUILD_DIR/classes"

rm -rf "$BUILD_DIR"
mkdir -p "$MAIN_CLASSES"

find "$ROOT_DIR/core-calc/src/main/java" -name '*.java' | sort > "$BUILD_DIR/main-sources.txt"
javac -encoding UTF-8 -d "$MAIN_CLASSES" @"$BUILD_DIR/main-sources.txt"

echo "$MAIN_CLASSES"
