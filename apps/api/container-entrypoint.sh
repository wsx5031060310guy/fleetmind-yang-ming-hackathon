#!/bin/sh
set -eu

export PORT="${PORT:-8080}"

if [ -z "${FLEETMIND_METRICS_FILE:-}" ] && [ -f /app/real-metrics.json ]; then
  export FLEETMIND_METRICS_FILE=/app/real-metrics.json
fi

exec java -jar /app/fleetmind-api.jar "$@"
