# Real Yang Ming dashboard data

`MetricsExportCli` converts gitignored `data/vt_fd.csv` and
`data/maintenance.csv` into one gitignored API snapshot. `core-calc` stays
dependency-free; JSON is written by its small built-in writer.

## Generate and run

From repository root:

```bash
MAIN_CLASSES="$(./scripts/compile-core-calc.sh)"
java -cp "$MAIN_CLASSES" com.fleetmind.corecalc.MetricsExportCli \
  --data-dir data \
  --out core-calc/target/real-metrics.json

mvn -pl apps/api -am package
FLEETMIND_METRICS_FILE="$PWD/core-calc/target/real-metrics.json" \
  java -jar apps/api/target/fleetmind-api-0.1.0-SNAPSHOT.jar
```

`data/` and every `target/` directory are ignored. Do not move the generated
snapshot outside an ignored build directory.

If `FLEETMIND_METRICS_FILE` is blank or does not name a regular file, the app
keeps existing `YM-DEMO-*` behavior. The equivalent Spring property is
`--fleetmind.metrics-file=/absolute/path/real-metrics.json`.

Smoke:

```bash
curl -fsS http://localhost:8080/api/fleet/summary | jq '.[0:2]'
curl -fsS http://localhost:8080/api/vessels/S11/performance \
  | jq 'map(select(.speedLossPct != "NaN")) | last'
curl -fsS http://localhost:8080/api/data-quality/summary | jq
jq '.vessels.S12.events[] | select(.verdict == "NO_CHANGE_AS_EXPECTED")' \
  core-calc/target/real-metrics.json
```

## Calendar alignment

- Dashboard time axis uses synthetic epoch `2021-01-01 + NOON_UTC` days.
- S21-S23: maintenance events pair chronologically with 14 contiguous masked
  windows. Effective event day is `masked window start - 1`; result is 14/14.
- S1-S12: no masked window identifies exact event day. Best robust global Day-0
  is `2021-01-01`, selected by maximum exact predict-window alignments and
  median tie-break; only 7/14 predict events align under one global anchor.
  Training-ship calendar placement is therefore approximate.

Actual report, 2026-07-14:

```text
anchor: 14/14 predict-window events aligned; global Day0 offset=2021-01-01 (7/14 exact without fallback)
anchor-note: S21-S23 use masked-window-start fallback; S1-S12 use 2021-01-01 as approximate Day0
metrics: ships processed=15, total qualified days=8179, finite FOC rows=20866/21282
```

## Physics and business assumptions

- Speed is `SPEED_THROUGH_WATER` (STW), matching `k = Daily FOC / STW³`.
- Each day's positive full-speed fuel cells are summed as VLSFO equivalent via
  supplied LCVs: MGO/LSMGO 42.7, ULSFO 41.2, HSHFO/VLSFO 40.2. No separate
  BIO_HSFO LCV was supplied, so it uses 40.2 and is documented as a proxy.
- `CoreCalc.dailyFoc` runs before filtering. `WIND_SCALE <= 4` and
  `HOURS_FULL_SPEED >= 22` only control quality flags and Speed Loss eligibility.
- `HIDDEN`, `PREDICT`, empty, or invalid fuel remains a performance row with
  JSON `null` k/loss. `RealDataService` maps it to non-finite DTO values so the
  existing chart produces a gap; rows are never dropped.
- `SpeedLoss` supplies reference window, series, rolling median, before/after,
  and fuel penalty. `Attribution` supplies hull/propeller split and event
  validation. No exporter-side reimplementation of those calculations.
- Counterfactual savings is
  `positive fuelPenaltyPct × median qualified Daily FOC`, split by the computed
  hull/propeller shares. Annual USD uses an explicit `USD 650/MT` fuel price.
  This is review evidence, not causal proof or an autonomous maintenance order.

UWI never resets hull or propeller state. Real S12 event `2023-05-30` measures
`0.9181%` k change against `3.5395%` noise threshold, producing
`NO_CHANGE_AS_EXPECTED`; its limited same-speed samples retain a low-confidence
flag. Validation metadata stays in the snapshot; the existing
four-field `UnderwaterEventDto` response remains unchanged.

## Real endpoint evidence

Handler-level smoke against the generated snapshot produced the following. The
execution sandbox used for this run allowed complete Spring context loading but
blocked TCP bind, so these values were captured through the same
`FleetMindController` and selected `RealDataService`; run the curl commands above
on a normal host.

```text
GET /api/fleet/summary ->
[{"vesselId":"S11","latestSpeedLossPct":21.8388954703989,"foulingAttributionPct":100.0,"confidence":"HIGH","sampleDays":539,"daysSinceLastCleaning":691,"dataQualityScore":36,"reviewPriority":1},{"vesselId":"S23","latestSpeedLossPct":8.912882594232096,"foulingAttributionPct":96.27026075040592,"confidence":"HIGH","sampleDays":506,"daysSinceLastCleaning":289,"dataQualityScore":35,"reviewPriority":2}]

GET /api/vessels/S11/performance (latest finite) ->
{"dailyFoc":154.0,"kValue":0.03021190496148223,"date":"2025-12-28","vesselId":"S11","speedLossPct":21.8388954703989,"qualityFlags":[]}

GET /api/data-quality/summary ->
{"totalRows":21282,"exportedRows":21282,"flagCounts":{"HIGH_WIND":7512,"INSUFFICIENT_FULL_SPEED_HOURS":6825,"MISSING_FUEL_CONSUMP":416,"NONFINITE_FOC":416,"INVALID_FUEL_CONSUMP":27,"MISSING_WIND_SCALE":10,"INVALID_FULL_SPEED_HOURS":0,"PARSE_ERROR":0,"NON_INTEGER_WIND_SCALE":0}}
```
