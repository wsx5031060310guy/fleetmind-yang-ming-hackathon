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
```

The CLI exports every input row and only marks quality flags. It does not drop
rows, matching the project iron rule for the 25% `FUEL_CONSUMP` score.
