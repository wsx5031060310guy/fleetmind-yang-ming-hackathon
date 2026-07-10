#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-ap-northeast-1}"
BUCKET="${FLEETMIND_DATA_BUCKET:-}"
TABLE="${FLEETMIND_DDB_TABLE:-}"
LOCAL_SNAPSHOT_DIR="${FLEETMIND_LOCAL_SNAPSHOT_DIR:-}"
EXECUTE=false
YES=false
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --region)
      REGION="$2"
      shift 2
      ;;
    --bucket)
      BUCKET="$2"
      shift 2
      ;;
    --table)
      TABLE="$2"
      shift 2
      ;;
    --local-snapshot-dir)
      LOCAL_SNAPSHOT_DIR="$2"
      shift 2
      ;;
    --execute)
      EXECUTE=true
      shift
      ;;
    --yes)
      YES=true
      shift
      ;;
    -h|--help)
      cat <<'EOF'
Usage:
  scripts/cleanup-event-data.sh [--region ap-northeast-1] [--bucket name] [--table name] [--local-snapshot-dir path] [--execute --yes]

Default is dry-run. Set FLEETMIND_DATA_BUCKET, FLEETMIND_DDB_TABLE, and
FLEETMIND_LOCAL_SNAPSHOT_DIR instead of passing flags if preferred.
EOF
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

run_or_print() {
  if [[ "$EXECUTE" == "true" ]]; then
    "$@"
  else
    printf 'DRY-RUN'
    printf ' %q' "$@"
    printf '\n'
  fi
}

if [[ "$EXECUTE" == "true" && "$YES" != "true" ]]; then
  echo "Refusing to execute without --yes." >&2
  exit 2
fi

echo "region=$REGION execute=$EXECUTE"

if [[ -n "$BUCKET" ]]; then
  for prefix in raw processed exports reports; do
    run_or_print aws s3 rm "s3://$BUCKET/$prefix/" --recursive --region "$REGION"
  done
else
  echo "INFO no S3 bucket specified; skipping S3 cleanup"
fi

if [[ -n "$TABLE" ]]; then
  run_or_print aws dynamodb delete-table --table-name "$TABLE" --region "$REGION"
else
  echo "INFO no DynamoDB table specified; skipping table cleanup"
fi

if [[ -n "$LOCAL_SNAPSHOT_DIR" ]]; then
  case "$LOCAL_SNAPSHOT_DIR" in
    /*) RESOLVED_SNAPSHOT_DIR="$LOCAL_SNAPSHOT_DIR" ;;
    *) RESOLVED_SNAPSHOT_DIR="$ROOT_DIR/$LOCAL_SNAPSHOT_DIR" ;;
  esac
  case "$RESOLVED_SNAPSHOT_DIR" in
    "$ROOT_DIR"/*|/tmp/*)
      run_or_print rm -rf "$RESOLVED_SNAPSHOT_DIR"
      ;;
    *)
      echo "Refusing to delete local dir outside repo or /tmp: $RESOLVED_SNAPSHOT_DIR" >&2
      exit 2
      ;;
  esac
else
  echo "INFO no local snapshot dir specified; skipping local cleanup"
fi
