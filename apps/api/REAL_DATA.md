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

## Direct event-day alignment

- Dashboard time axis uses synthetic epoch `2021-01-01 + NOON_UTC` days.
- `maintenance.csv` now supplies integer `event_day` on the same per-ship
  relative-day axis as `NOON_UTC` (`Day 0` = that ship's earliest record).
- Every maintenance event joins directly on `ship_id + event_day`. The exporter
  applies the same synthetic epoch to event dates used by `Attribution` and
  `SpeedLoss`; no calendar anchor search or masked-window fallback remains.
- All 77 events are inside their ship's `vt_fd.csv` day range.

Actual report, 2026-07-14:

```text
events mapped: 77; out-of-range: 0
metrics: ships processed=15, total qualified days=8179, finite FOC rows=20866/21282
attribution-example: S23 hullPct=96.26 propPct=3.74
UWI verdicts: event-S11-UWI-2023-04-23=UNEXPECTED, event-S23-UWI-2023-02-10=UNEXPECTED, event-S12-UWI-2023-05-29=NO_CHANGE_AS_EXPECTED, event-S12-UWI-2025-04-22=UNEXPECTED, event-S8-UWI-2025-05-03=UNEXPECTED, event-S5-UWI-2025-05-27=UNEXPECTED, event-S10-UWI-2023-04-20=UNEXPECTED, event-S2-UWI-2025-04-17=UNEXPECTED, event-S3-UWI-2025-04-23=UNEXPECTED, event-S21-UWI-2023-10-01=UNEXPECTED, event-S7-UWI-2022-01-10=UNEXPECTED, event-S7-UWI-2025-06-04=UNEXPECTED
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

UWI never resets hull or propeller state. Direct mapping changed synthetic event
dates by one or two days for most UWI rows, but the current deterministic
validator roster did not flip: the former approximate run had 1/12
`NO_CHANGE_AS_EXPECTED` and 11/12 `UNEXPECTED`; the direct run has the same
counts, so `UNEXPECTED -> NO_CHANGE_AS_EXPECTED` flips = 0. Real S12 synthetic
date `2023-05-29` measures `0.9181%` k change against `4.9488%` noise threshold,
producing `NO_CHANGE_AS_EXPECTED`. Several other UWI rows lack finite
before/after evidence or exceed their MAD-derived threshold, so exact placement
alone does not justify changing their verdict. Validation metadata stays in the
snapshot; the existing four-field `UnderwaterEventDto` response remains
unchanged.

Before-approximation versus direct-event-day UWI roster (paired by ship and
event order):

```text
S11  2023-04-24 UNEXPECTED            -> 2023-04-23 UNEXPECTED
S23  2023-02-11 UNEXPECTED            -> 2023-02-10 UNEXPECTED
S12  2023-05-30 NO_CHANGE_AS_EXPECTED -> 2023-05-29 NO_CHANGE_AS_EXPECTED
S12  2025-04-23 UNEXPECTED            -> 2025-04-22 UNEXPECTED
S8   2025-05-05 UNEXPECTED            -> 2025-05-03 UNEXPECTED
S5   2025-05-28 UNEXPECTED            -> 2025-05-27 UNEXPECTED
S10  2023-04-22 UNEXPECTED            -> 2023-04-20 UNEXPECTED
S2   2025-04-18 UNEXPECTED            -> 2025-04-17 UNEXPECTED
S3   2025-04-23 UNEXPECTED            -> 2025-04-23 UNEXPECTED
S21  2023-10-01 UNEXPECTED            -> 2023-10-01 UNEXPECTED
S7   2022-01-10 UNEXPECTED            -> 2022-01-10 UNEXPECTED
S7   2025-06-05 UNEXPECTED            -> 2025-06-04 UNEXPECTED
```

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
