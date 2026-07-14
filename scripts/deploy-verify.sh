#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/curl-common.sh"

IMAGE_NAME="fleetmind-api"
CONTAINER_NAME="fleetmind-api-deploy-verify-$$"
BASE_URL="http://localhost:8080"
METRICS_FILE="$ROOT_DIR/core-calc/target/real-metrics.json"
HAS_REAL_DATA=0
DOCKER_READY=0
VERIFY_RESULT="FAIL"

cleanup() {
  local exit_code=$?
  if [[ "$DOCKER_READY" -eq 1 ]]; then
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
  case "$VERIFY_RESULT:$exit_code" in
    PASS:0)
      printf '\nPASS: FleetMind container deploy verification\n'
      ;;
    SKIP:0)
      printf '\nSKIP: Docker unavailable; core-calc build and metrics export passed\n'
      ;;
    *)
      printf '\nFAIL: FleetMind container deploy verification\n' >&2
      ;;
  esac
}
trap cleanup EXIT
trap 'exit 130' INT TERM

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

select_java_home() {
  local candidate="${JAVA_HOME:-}"
  local maven_runtime=""
  local java_major=""

  if command -v mvn >/dev/null 2>&1; then
    maven_runtime="$(mvn -version 2>&1 \
      | sed -n 's/^Java version: .* runtime: //p' | head -n 1)"
    if [[ -x "$maven_runtime/bin/java" && -x "$maven_runtime/bin/javac" ]]; then
      candidate="$maven_runtime"
    fi
  fi
  if [[ -z "$candidate" || ! -x "$candidate/bin/java" \
    || ! -x "$candidate/bin/javac" ]]; then
    candidate="$(cd "$(dirname "$(command -v java)")/.." && pwd)"
  fi
  java_major="$("$candidate/bin/java" -version 2>&1 \
    | sed -n '1s/.*version "\([0-9][0-9]*\).*/\1/p')"
  if [[ -z "$java_major" || "$java_major" -lt 21 ]]; then
    fail "JDK 21+ required; selected Java home: $candidate"
  fi
  printf '%s\n' "$candidate"
}

wait_for_health() {
  local attempt=1
  local max_attempts=45

  printf 'Waiting for %s/api/health' "$BASE_URL"
  while [[ "$attempt" -le "$max_attempts" ]]; do
    if curl_safe --connect-timeout 1 --max-time 2 --retry 0 \
      "$BASE_URL/api/health" 2>/dev/null | grep -q 'ok'; then
      printf ' ready\n'
      return 0
    fi
    printf '.'
    sleep 1
    attempt=$((attempt + 1))
  done
  printf ' timeout\n' >&2
  docker logs "$CONTAINER_NAME" >&2 || true
  return 1
}

stop_container() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}

start_container() {
  local metrics_file_override="${1:-}"
  local args

  stop_container
  args=(--rm -d --name "$CONTAINER_NAME" -e PORT=8080 -p 8080:8080)
  if [[ -n "$metrics_file_override" ]]; then
    args+=( -e "FLEETMIND_METRICS_FILE=$metrics_file_override" )
  fi
  docker run "${args[@]}" "$IMAGE_NAME" >/dev/null
  wait_for_health
}

assert_real_summary() {
  local summary
  summary="$(curl_safe "$BASE_URL/api/fleet/summary")"

  if printf '%s' "$summary" | grep -q 'YM-DEMO-'; then
    fail "real-data image returned YM-DEMO vessels"
  fi
  if ! printf '%s' "$summary" \
    | grep -Eq '"vesselId"[[:space:]]*:[[:space:]]*"S([1-9]|1[0-9]|2[0-3])"'; then
    fail "fleet summary did not contain a real S1..S23 vessel id"
  fi
  printf 'Real fleet summary: PASS (S1..S23 ids; no YM-DEMO ids)\n'
}

require_command java
JAVA_HOME_FOR_BUILD="$(select_java_home)"

cd "$ROOT_DIR"

printf 'Building core-calc...\n'
MAIN_CLASSES="$(PATH="$JAVA_HOME_FOR_BUILD/bin:$PATH" \
  "$SCRIPT_DIR/compile-core-calc.sh")"

if [[ -d "$ROOT_DIR/data" ]]; then
  printf 'Exporting real dashboard metrics...\n'
  mkdir -p "$(dirname "$METRICS_FILE")"
  "$JAVA_HOME_FOR_BUILD/bin/java" -cp "$MAIN_CLASSES" \
    com.fleetmind.corecalc.MetricsExportCli \
    --data-dir "$ROOT_DIR/data" \
    --out "$METRICS_FILE"
  [[ -s "$METRICS_FILE" ]] || fail "metrics export is empty: $METRICS_FILE"
  HAS_REAL_DATA=1
else
  rm -f "$METRICS_FILE"
  printf 'data/ absent; continuing with demo-only image verification.\n'
fi

if ! command -v docker >/dev/null 2>&1; then
  printf 'Docker CLI unavailable; skipping image and container checks.\n'
  VERIFY_RESULT="SKIP"
  exit 0
fi
if ! docker info >/dev/null 2>&1; then
  printf 'Docker daemon unreachable; skipping image and container checks.\n'
  VERIFY_RESULT="SKIP"
  exit 0
fi
DOCKER_READY=1
require_command curl

printf 'Building container image %s...\n' "$IMAGE_NAME"
docker build -f apps/api/Dockerfile -t "$IMAGE_NAME" .
[[ "$(docker image inspect --format '{{.Config.User}}' "$IMAGE_NAME")" == "fleetmind" ]] \
  || fail "runtime image user is not fleetmind"
docker image inspect --format '{{json .Config.Healthcheck.Test}}' "$IMAGE_NAME" \
  | grep -q '/api/health' || fail "image HEALTHCHECK does not use /api/health"
printf 'Image metadata: PASS (non-root user + /api/health HEALTHCHECK)\n'

printf 'Verifying demo fallback with existing API smoke...\n'
# A non-existent explicit path suppresses the baked-file default for this phase.
start_container /app/no-real-metrics.json
BASE_URL="$BASE_URL" "$SCRIPT_DIR/api-smoke.sh"
stop_container

if [[ "$HAS_REAL_DATA" -eq 1 ]]; then
  printf 'Verifying baked real-data mode...\n'
  start_container
  assert_real_summary
  curl_safe "$BASE_URL/" | grep -q 'FleetMind' \
    || fail "dashboard root did not contain FleetMind"
  printf 'Real Speed Loss dashboard: PASS\n'
fi

VERIFY_RESULT="PASS"
