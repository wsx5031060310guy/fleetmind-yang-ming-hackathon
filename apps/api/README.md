# FleetMind API Skeleton

Single-service Spring Boot starter for the P1 architecture:

- serves static dashboard assets from the same origin
- exposes the demo API contract under `/api/**`
- uses `core-calc` for deterministic numbers
- keeps Bedrock as a later integration point behind deterministic fallback data

## Run

```bash
mvn -pl apps/api -am spring-boot:run
```

Then open:

- dashboard: `http://localhost:8080/`
- health: `http://localhost:8080/api/health`
- fleet summary: `http://localhost:8080/api/fleet/summary`
- AI brief fallback: `POST http://localhost:8080/api/vessels/YM-DEMO-01/ai-brief`
- forced fallback demo: `POST http://localhost:8080/api/vessels/YM-DEMO-01/ai-brief?forceFallback=true`
- AI brief prompt contract: `http://localhost:8080/api/vessels/YM-DEMO-01/ai-brief/prompt`

## Decision-support endpoints

- `GET /api/config/threshold`: current Speed Loss alert threshold; default `10%`.
- `PUT /api/config/threshold?value=8`: runtime update; valid range `0 < value <= 50`.
- `GET /api/alerts`: vessels already at threshold or forecast to cross within 30 days,
  sorted ACT before WATCH and then by current loss.
- `GET /api/vessels/{id}/decision`: current threshold, forecast, status, action,
  cleaning-decay state, fuel penalty, and active fuel.
- `POST /api/alerts/notify`: asynchronously publish current alert roster when
  `FLEETMIND_ALERT_TOPIC_ARN` is set. Unset means safe no-op; SNS failure never
  fails the HTTP response. `AWS_REGION` may be set explicitly; otherwise region
  is read from the topic ARN.

Forecast uses the persisted recent Theil-Sen Speed Loss slope and recomputes the
crossing day against the live threshold. Recommendation rules: NORMAL observes;
WATCH schedules UWILD; ACT schedules UWILD first, and recommends cleaning only
for high-confidence hull-dominated attribution. UWILD is inspection, not cleaning.

`cleaningEffectiveness` is a simple post-dry-dock decay label: 0-1 hull cleanings
= FRESH, 2-3 = DIMINISHING, 4+ = DEPLETED. DD resets this counter but does not
guarantee fuel improvement; measured before/after data remains authoritative.

Dollar ROI was intentionally removed from decision outputs per Yang Ming
engineering feedback. `fuelPenaltyPct` is primary; optional
`estimatedAnnualExcessFuelMt` is a rough tonnes-only estimate with no fuel-price
assumption.

The AI brief path is still deterministic locally. The prompt contract and guardrail make the future Bedrock call boring: only supplied JSON, cited metric IDs, and exact cited numbers pass.

## Docker

```bash
docker build -f apps/api/Dockerfile -t fleetmind-api .
docker run --rm -p 8080:8080 fleetmind-api
```
