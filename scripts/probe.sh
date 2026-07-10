#!/usr/bin/env bash
set -u

REGION="${AWS_REGION:-ap-northeast-1}"
APPLY=false
KEEP=false
STRICT=false
PREFIX="${FLEETMIND_PROBE_PREFIX:-fleetmind-probe-$(date +%s)}"
BEDROCK_MODEL_ID="${FLEETMIND_BEDROCK_MODEL_ID:-}"
DEPLOYMENT_URL="${FLEETMIND_DEPLOYMENT_URL:-}"

usage() {
  cat <<'EOF'
Usage:
  scripts/probe.sh [--region REGION] [--bedrock-model-id ID] [--deployment-url URL] [--apply] [--keep] [--strict]

REQUIRED: AWS CLI, STS identity, S3 access, DynamoDB access, real Bedrock
invoke-model smoke call, and chosen deployment URL reachability when supplied.
OPTIONAL: Lambda, App Runner, Bedrock list-models/inference-profiles.

Default exit depends only on required failures. --strict restores all-mandatory
behavior, so optional failures also make the command fail.
EOF
}

require_value() {
  if [[ $# -lt 2 || -z "$2" || "$2" == --* ]]; then
    echo "missing value for $1" >&2
    exit 2
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --region) require_value "$1" "${2:-}"; REGION="$2"; shift 2 ;;
    --prefix) require_value "$1" "${2:-}"; PREFIX="$2"; shift 2 ;;
    --apply) APPLY=true; shift ;;
    --bedrock-model-id) require_value "$1" "${2:-}"; BEDROCK_MODEL_ID="$2"; shift 2 ;;
    --deployment-url) require_value "$1" "${2:-}"; DEPLOYMENT_URL="$2"; shift 2 ;;
    --keep) KEEP=true; shift ;;
    --strict) STRICT=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

REQUIRED_PASS=0
REQUIRED_FAIL=0
OPTIONAL_PASS=0
OPTIONAL_FAIL=0

run_check() {
  local class="$1"
  local name="$2"
  shift 2
  if "$@" >/tmp/fleetmind-probe.out 2>/tmp/fleetmind-probe.err; then
    echo "PASS [$class] $name"
    if [[ "$class" == "REQUIRED" ]]; then
      REQUIRED_PASS=$((REQUIRED_PASS + 1))
    else
      OPTIONAL_PASS=$((OPTIONAL_PASS + 1))
    fi
    return 0
  fi
  echo "FAIL [$class] $name"
  sed 's/^/  /' /tmp/fleetmind-probe.err
  if [[ "$class" == "REQUIRED" ]]; then
    REQUIRED_FAIL=$((REQUIRED_FAIL + 1))
  else
    OPTIONAL_FAIL=$((OPTIONAL_FAIL + 1))
  fi
  return 1
}

required() { run_check REQUIRED "$@" || true; }
optional() { run_check OPTIONAL "$@" || true; }
info() { echo "INFO $*"; }

info "region=$REGION prefix=$PREFIX apply=$APPLY keep=$KEEP strict=$STRICT"

required "aws cli" aws --version
required "sts caller identity" aws sts get-caller-identity --region "$REGION"
required "s3 list buckets" aws s3api list-buckets --region "$REGION"
required "dynamodb list tables" aws dynamodb list-tables --region "$REGION"
optional "lambda list functions" aws lambda list-functions --region "$REGION"
optional "apprunner list services" aws apprunner list-services --region "$REGION"
optional "bedrock list foundation models" aws bedrock list-foundation-models --region "$REGION"
optional "bedrock list inference profiles" aws bedrock list-inference-profiles --region "$REGION" --type SYSTEM_DEFINED

if [[ -n "$BEDROCK_MODEL_ID" ]]; then
  BODY_FILE="/tmp/fleetmind-bedrock-body.json"
  OUT_FILE="/tmp/fleetmind-bedrock-output.json"
  printf '%s\n' '{"anthropic_version":"bedrock-2023-05-31","max_tokens":1,"temperature":0,"messages":[{"role":"user","content":"ok"}]}' >"$BODY_FILE"
  required "bedrock invoke model $BEDROCK_MODEL_ID" \
    aws bedrock-runtime invoke-model \
      --cli-read-timeout 15 \
      --region "$REGION" \
      --model-id "$BEDROCK_MODEL_ID" \
      --content-type application/json \
      --accept application/json \
      --body "fileb://$BODY_FILE" \
      "$OUT_FILE"
else
  echo "FAIL [REQUIRED] bedrock invoke model: set --bedrock-model-id or FLEETMIND_BEDROCK_MODEL_ID" >&2
  REQUIRED_FAIL=$((REQUIRED_FAIL + 1))
fi

if [[ -n "$DEPLOYMENT_URL" ]]; then
  required "chosen deployment health" curl --fail --silent --show-error \
    --connect-timeout 3 --max-time 12 "${DEPLOYMENT_URL%/}/api/health"
else
  info "deployment URL not supplied; reachability check deferred until path is deployed"
fi

if [[ "$APPLY" == "true" ]]; then
  BUCKET="${PREFIX}-${REGION}"
  TABLE="${PREFIX}-ddb"
  TRUST_FILE="/tmp/fleetmind-probe-trust.json"

  if [[ "$REGION" == "us-east-1" ]]; then
    required "s3 create bucket" aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
  else
    required "s3 create bucket" aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
      --create-bucket-configuration "LocationConstraint=$REGION"
  fi
  required "s3 put object" aws s3api put-object --bucket "$BUCKET" --key health.txt --body /dev/null --region "$REGION"
  required "dynamodb create table" aws dynamodb create-table --region "$REGION" --table-name "$TABLE" \
    --attribute-definitions AttributeName=pk,AttributeType=S --key-schema AttributeName=pk,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST

  printf '%s\n' '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >"$TRUST_FILE"
  optional "iam create Lambda role" aws iam create-role --role-name "${PREFIX}-lambda-role" \
    --assume-role-policy-document "file://$TRUST_FILE"

  if [[ "$KEEP" != "true" ]]; then
    aws s3api delete-object --bucket "$BUCKET" --key health.txt --region "$REGION" >/dev/null 2>&1
    aws s3api delete-bucket --bucket "$BUCKET" --region "$REGION" >/dev/null 2>&1
    aws dynamodb delete-table --table-name "$TABLE" --region "$REGION" >/dev/null 2>&1
    aws iam delete-role --role-name "${PREFIX}-lambda-role" >/dev/null 2>&1
    info "cleanup requested resources; some async deletions may finish later"
  else
    info "kept resources: s3://$BUCKET, DynamoDB $TABLE, IAM role ${PREFIX}-lambda-role"
  fi
else
  info "dry probe only; pass --apply to create/delete S3, DynamoDB, and IAM smoke resources"
fi

echo "SUMMARY required_pass=$REQUIRED_PASS required_fail=$REQUIRED_FAIL optional_pass=$OPTIONAL_PASS optional_fail=$OPTIONAL_FAIL"
if [[ "$REQUIRED_FAIL" -ne 0 ]]; then
  exit 1
fi
if [[ "$STRICT" == "true" && "$OPTIONAL_FAIL" -ne 0 ]]; then
  exit 1
fi
