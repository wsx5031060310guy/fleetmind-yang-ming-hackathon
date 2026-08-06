#!/usr/bin/env bash
# Capture the Spring Boot API's demo-mode responses as the golden baseline that
# the Vercel Functions port must reproduce byte-for-byte (modulo volatile fields).
#
#   1. Build/obtain apps/api/target/fleetmind-api-*.jar
#   2. JAVA=/opt/homebrew/opt/openjdk@21/bin/java PORT=8099 ./web/test/capture-golden.sh
#
# Demo mode = FLEETMIND_METRICS_FILE unset, so DemoDataService supplies the data.
# Nothing here touches the real Yang Ming metrics file.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${OUT_DIR:-$REPO_ROOT/web/test/golden}"
PORT="${PORT:-8099}"
BASE="http://127.0.0.1:${PORT}"
JAVA="${JAVA:-java}"
JAR="$(ls "$REPO_ROOT"/apps/api/target/fleetmind-api-*.jar 2>/dev/null | head -1)"

if [ -z "$JAR" ]; then
  echo "no jar at apps/api/target/fleetmind-api-*.jar — run: mvn -pl apps/api -am package -DskipTests" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

started=""
if ! curl -fsS --max-time 2 "$BASE/api/health" >/dev/null 2>&1; then
  echo "starting $JAR on :$PORT (demo mode)"
  env -u FLEETMIND_METRICS_FILE PORT="$PORT" "$JAVA" -jar "$JAR" >/tmp/fleetmind-golden.log 2>&1 &
  started=$!
  trap '[ -n "$started" ] && kill "$started" 2>/dev/null || true' EXIT
  for _ in $(seq 1 60); do
    curl -fsS --max-time 2 "$BASE/api/health" >/dev/null 2>&1 && break
    sleep 1
  done
fi

curl -fsS --max-time 5 "$BASE/api/health" >/dev/null || { echo "API never came up"; tail -30 /tmp/fleetmind-golden.log; exit 1; }

fails=0
snap() { # snap <name> <curl-args...>
  local name="$1"; shift
  local code
  code=$(curl -sS -o "$OUT_DIR/$name" -w "%{http_code}" "$@")
  printf '%-42s %s\n' "$name" "$code"
  echo "$code" > "$OUT_DIR/$name.status"
}

# ---- threshold-independent + default-threshold (10.0) reads -------------------
curl -sS -X PUT "$BASE/api/config/threshold?value=10" >/dev/null
snap health.json                      "$BASE/api/health"
snap fleet-summary.json               "$BASE/api/fleet/summary"
snap config-threshold.json            "$BASE/api/config/threshold"
snap alerts.json                      "$BASE/api/alerts"
snap data-quality.json                "$BASE/api/data-quality/summary"
snap fuel-export.json                 "$BASE/api/fuel-consump/export"
snap admin-settings.json              "$BASE/api/admin/settings"
snap export-decisions.json            "$BASE/api/export/decisions"
snap export-decisions.csv             "$BASE/api/export/decisions?format=csv"
snap export-decisions-filtered.json   "$BASE/api/export/decisions?status=ACT,WATCH"
snap export-alerts.json               "$BASE/api/export/alerts"
snap export-alerts.csv                "$BASE/api/export/alerts?format=csv"
snap export-alerts-since-future.json  "$BASE/api/export/alerts?since=2099-01-01T00:00:00Z"

for v in YM-DEMO-01 YM-DEMO-02 YM-DEMO-03; do
  snap "$v-decision.json"             "$BASE/api/vessels/$v/decision"
  snap "$v-performance.json"          "$BASE/api/vessels/$v/performance"
  snap "$v-underwater.json"           "$BASE/api/vessels/$v/underwater-events"
  snap "$v-before-after.json"         "$BASE/api/vessels/$v/before-after"
  snap "$v-ai-prompt.json"            "$BASE/api/vessels/$v/ai-brief/prompt"
  snap "$v-ai-brief-fallback.json"    -X POST "$BASE/api/vessels/$v/ai-brief?forceFallback=true"
done

# ---- threshold sensitivity: 3.0 flips YM-DEMO-01 to ACT and populates alerts --
curl -sS -X PUT "$BASE/api/config/threshold?value=3" >/dev/null
snap t3-fleet-summary.json            "$BASE/api/fleet/summary"
snap t3-alerts.json                   "$BASE/api/alerts"
snap t3-export-alerts.json            "$BASE/api/export/alerts"
snap t3-export-alerts.csv             "$BASE/api/export/alerts?format=csv"
snap t3-export-decisions.csv          "$BASE/api/export/decisions?format=csv"
snap t3-YM-DEMO-01-decision.json      "$BASE/api/vessels/YM-DEMO-01/decision"
curl -sS -X PUT "$BASE/api/config/threshold?value=10" >/dev/null

# ---- exact-equality boundaries: DecisionSupport treats `speedLoss >= threshold` --
# ---- as crossed. Without a case where they are equal, flipping >= to > passes.  --
# ---- 4.76 / 2.10 / 0.00 are YM-DEMO-01/02/03's latestSpeedLossPct.              --
bt() { # bt <threshold> <tag>
  curl -sS -X PUT "$BASE/api/config/threshold?value=$1" >/dev/null
  snap "bound-$2-fleet-summary.json" "$BASE/api/fleet/summary"
  snap "bound-$2-alerts.json"        "$BASE/api/alerts"
}
bt 4.76  eq-v1        # equal to YM-DEMO-01 -> must be ACT, not NORMAL
bt 4.761 just-above-v1
bt 4.759 just-below-v1
bt 2.1   eq-v2
bt 0.001 near-zero    # YM-DEMO-03 sits at 0.0, so only >= 0 would trip it
bt 50    max-valid
curl -sS -X PUT "$BASE/api/config/threshold?value=10" >/dev/null

# ---- validation + error paths -------------------------------------------------
snap err-threshold-zero.json          -X PUT "$BASE/api/config/threshold?value=0"
snap err-threshold-over.json          -X PUT "$BASE/api/config/threshold?value=51"
snap err-threshold-missing.json       -X PUT "$BASE/api/config/threshold"
snap err-unknown-vessel.json          "$BASE/api/vessels/NOPE-99/decision"

# ---- admin settings PUT is a partial patch; thresholdPct writes through to ----
# ---- ThresholdService, so /api/config/threshold must observe the same value ---
jput() { snap "$1" -X PUT "$BASE/api/admin/settings" -H 'Content-Type: application/json' -d "$2"; }
jput admin-put-partial.json      '{"alertHorizonDays":45}'
jput admin-put-channels.json     '{"channels":["email","webhook"],"emailRecipients":["ops@example.com"]}'
jput admin-put-threshold.json    '{"thresholdPct":6.5}'
snap admin-after-threshold-writethrough.json "$BASE/api/config/threshold"
jput err-admin-bad-channel.json  '{"channels":["carrier-pigeon"]}'
jput err-admin-bad-email.json    '{"emailRecipients":["not-an-email"]}'
jput err-admin-bad-arn.json      '{"snsTopicArn":"nope"}'
jput err-admin-bad-horizon.json  '{"alertHorizonDays":0}'
jput err-admin-bad-threshold.json '{"thresholdPct":99}'
snap admin-null-body.json        -X PUT "$BASE/api/admin/settings" -H 'Content-Type: application/json'
# restore defaults for the snapshots that follow
jput admin-restored.json '{"thresholdPct":10,"alertHorizonDays":30,"channels":["sns"],"emailRecipients":[]}'

# ---- notify (no AWS creds => every channel unconfigured) ----------------------
snap alerts-notify.json               -X POST "$BASE/api/alerts/notify"

# ---- noon-report upload: rejected (sample CSV lacks stwKn/dailyFocMt) ---------
snap upload-missing-cols.json         -X POST "$BASE/api/uploads/noon-report?dryRun=true" \
                                      -F "file=@$REPO_ROOT/samples/noon-reports.csv"

# ---- noon-report upload: accepted + row-level errors --------------------------
tmp_csv="$(mktemp -t noon-ok-XXXX).csv"
cat > "$tmp_csv" <<'CSV'
vessel_id,date,stw_kn,daily_foc_mt,fuel_type,wind_scale
YM-DEMO-01,2025-01-01,14.2,52.4,VLSFO,4
YM-DEMO-02,2025-01-02,13.8,48.1,HFO,3
YM-DEMO-03,2025-01-03,15.1,55.9,MGO,2
NOT-IN-FLEET,2025-01-04,14.0,50.0,VLSFO,3
YM-DEMO-01,2025-01-01,14.2,52.4,VLSFO,4
YM-DEMO-01,not-a-date,abc,,VLSFO,9
CSV
snap upload-mixed.json                -X POST "$BASE/api/uploads/noon-report?dryRun=true" \
                                      -F "file=@$tmp_csv"
snap upload-commit.json               -X POST "$BASE/api/uploads/noon-report?dryRun=false" \
                                      -F "file=@$tmp_csv"
rm -f "$tmp_csv"

empty_csv="$(mktemp -t noon-empty-XXXX).csv"
: > "$empty_csv"
snap upload-empty.json                -X POST "$BASE/api/uploads/noon-report?dryRun=true" \
                                      -F "file=@$empty_csv"
rm -f "$empty_csv"

echo
echo "golden written to $OUT_DIR"
exit $fails
