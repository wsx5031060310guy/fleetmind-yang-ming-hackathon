# core-calc

Pure Java calculation seed for FleetMind.

This module intentionally has no framework dependency and no I/O in the core
calculator. Scripts under `scripts/` compile it with `javac`, so the team can
run golden checks before Maven/Spring Boot scaffolding is finalized.

## Quick Checks

```bash
./scripts/test-core-calc.sh
```

## Fuel Export Skeleton

Expected input headers by default:

- `vessel_id`
- `date`
- `ME_FULLSPEED_CONSUMP_VLSFO`
- `HOURS_FULL_SPEED`
- `WIND_SCALE`

```bash
./scripts/export-fuel-consump.sh \
  --input sample-noon.csv \
  --output fuel-consump.csv

./scripts/validate-fuel-consump.sh \
  --input fuel-consump.csv \
  --expected-rows <same-as-source-row-count>
```

The CLI exports every input row and only marks quality flags. It does not drop
rows, matching the project iron rule for the 25% `FUEL_CONSUMP` score.

## Business Impact Skeleton

```bash
./scripts/business-impact.sh \
  --baseline-daily-foc 58 \
  --observed-daily-foc 61 \
  --fuel-price-usd-per-mt 650 \
  --cleaning-cost-usd 40000
```

Defaults intentionally use explicit assumptions:

- fuel price: USD 650/MT
- cleaning cost: USD 40,000
- carbon price: USD 90/tCO2
- EU ETS coverage: 50%

Outputs are estimate fields for dashboard cards and slides, not official
financial advice.
