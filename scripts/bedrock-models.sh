#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-ap-northeast-1}"
PROVIDER="${FLEETMIND_BEDROCK_PROVIDER:-Anthropic}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --region)
      REGION="$2"
      shift 2
      ;;
    --provider)
      PROVIDER="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: scripts/bedrock-models.sh [--region ap-northeast-1] [--provider Anthropic]"
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

echo "== Bedrock foundation models =="
aws bedrock list-foundation-models \
  --region "$REGION" \
  --by-provider "$PROVIDER" \
  --query 'modelSummaries[*].[modelId,modelName,modelLifecycle.status]' \
  --output table

echo
echo "== Bedrock system inference profiles =="
if aws bedrock list-inference-profiles \
  --region "$REGION" \
  --type SYSTEM_DEFINED \
  --query 'inferenceProfileSummaries[*].[inferenceProfileId,inferenceProfileName,status]' \
  --output table; then
  :
else
  echo "INFO list-inference-profiles failed; CLI version or IAM may not support it in this account." >&2
fi

cat <<EOF

Next:
  export FLEETMIND_BEDROCK_MODEL_ID=<model-id-or-inference-profile-id>
  ./scripts/probe.sh --region $REGION
EOF
