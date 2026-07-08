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

The AI brief path is still deterministic locally. The prompt contract and guardrail make the future Bedrock call boring: only supplied JSON, cited metric IDs, and exact cited numbers pass.

## Docker

```bash
docker build -f apps/api/Dockerfile -t fleetmind-api .
docker run --rm -p 8080:8080 fleetmind-api
```
