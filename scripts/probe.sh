#!/usr/bin/env bash
set -u

REGION="${AWS_REGION:-ap-northeast-1}"
APPLY=false
KEEP=false
PREFIX="${FLEETMIND_PROBE_PREFIX:-fleetmind-probe-$(date +%s)}"
BEDROCK_MODEL_ID="${FLEETMIND_BEDROCK_MODEL_ID:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --region)
      REGION="$2"
      shift 2
      ;;
    --prefix)
      PREFIX="$2"
      shift 2
      ;;
    --apply)
      APPLY=true
      shift
      ;;
    --bedrock-model-id)
      BEDROCK_MODEL_ID="$2"
      shift 2
      ;;
    --keep)
      KEEP=true
      shift
      ;;
    -h|--help)
      echo "Usage: scripts/probe.sh [--region ap-northeast-1] [--bedrock-model-id model-id] [--apply] [--keep]"
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

PASS=0
FAIL=0

check() {
  local name="$1"
  shift
  if "$@" >/tmp/fleetmind-probe.out 2>/tmp/fleetmind-probe.err; then
    echo "PASS $name"
    PASS=$((PASS + 1))
    return 0
  fi
  echo "FAIL $name"
  sed 's/^/  /' /tmp/fleetmind-probe.err
  FAIL=$((FAIL + 1))
  return 1
}

info() {
  echo "INFO $*"
}

info "region=$REGION prefix=$PREFIX apply=$APPLY keep=$KEEP"

check "aws cli" aws --version
check "sts caller identity" aws sts get-caller-identity --region "$REGION"
check "s3 list buckets" aws s3api list-buckets --region "$REGION"
check "dynamodb list tables" aws dynamodb list-tables --region "$REGION"
check "lambda list functions" aws lambda list-functions --region "$REGION"
check "apprunner list services" aws apprunner list-services --region "$REGION"
check "bedrock list foundation models" aws bedrock list-foundation-models --region "$REGION"

if aws bedrock list-foundation-models \
  --region "$REGION" \
  --by-provider Anthropic \
  --query 'modelSummaries[*].[modelId,modelName,modelLifecycle.status]' \
  --output table; then
  info "listed Anthropic foundation models"
else
  info "could not list Anthropic foundation models with provider filter"
fi

if aws bedrock list-inference-profiles \
  --region "$REGION" \
  --type SYSTEM_DEFINED \
  --query 'inferenceProfileSummaries[*].[inferenceProfileId,inferenceProfileName,status]' \
  --output table; then
  info "listed Bedrock system inference profiles"
else
  info "could not list Bedrock inference profiles; CLI version or IAM may not support this"
fi

if [[ -n "$BEDROCK_MODEL_ID" ]]; then
  BODY_FILE="/tmp/fleetmind-bedrock-body.json"
  OUT_FILE="/tmp/fleetmind-bedrock-output.json"
  cat > "$BODY_FILE" <<'JSON'
{"anthropic_version":"bedrock-2023-05-31","max_tokens":8,"temperature":0,"messages":[{"role":"user","content":"Return exactly: ok"}]}
JSON
  check "bedrock invoke model $BEDROCK_MODEL_ID" \
    aws bedrock-runtime invoke-model \
      --region "$REGION" \
      --model-id "$BEDROCK_MODEL_ID" \
      --content-type application/json \
      --accept application/json \
      --body "fileb://$BODY_FILE" \
      "$OUT_FILE"
else
  info "skip bedrock invoke; set FLEETMIND_BEDROCK_MODEL_ID to smoke-test a model"
fi

if [[ "$APPLY" == "true" ]]; then
  BUCKET="${PREFIX}-${REGION}"
  TABLE="${PREFIX}-ddb"
  TRUST_FILE="/tmp/fleetmind-probe-trust.json"

  if [[ "$REGION" == "us-east-1" ]]; then
    check "s3 create bucket" aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
  else
    check "s3 create bucket" aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
      --create-bucket-configuration "LocationConstraint=$REGION"
  fi
  check "s3 put object" aws s3api put-object --bucket "$BUCKET" --key health.txt --body /dev/null --region "$REGION"

  check "dynamodb create table" aws dynamodb create-table \
    --region "$REGION" \
    --table-name "$TABLE" \
    --attribute-definitions AttributeName=pk,AttributeType=S \
    --key-schema AttributeName=pk,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST

  cat > "$TRUST_FILE" <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON
  check "iam create role" aws iam create-role \
    --role-name "${PREFIX}-lambda-role" \
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

echo "SUMMARY pass=$PASS fail=$FAIL"
[[ "$FAIL" -eq 0 ]]
