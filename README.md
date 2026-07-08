# FleetMind - Yang Ming AWS AI Hackathon

Private team knowledge repo for AWS Summit Taipei 2026 `百工百業瘋 AI - AI Everywhere Hackathon`.

Assigned challenge:

- Group: 航運物流組
- Company: Yang Ming Marine Transportation / 陽明海運
- Theme: AI Ship Performance Analysis and Energy Efficiency Decision Support System

Working product direction:

FleetMind is an AI decision-support copilot for fleet efficiency. It helps operations and sustainability teams detect hull-efficiency degradation, explain fuel-consumption anomalies, estimate speed loss, and decide when hull cleaning or propeller polishing should be reviewed by human experts.

## Start Here

For humans:

1. Read [docs/INDEX.md](docs/INDEX.md) — one-page master overview: doc map, role-based reading paths, glossary, submission checklist.
2. New members: find your role in [docs/02-team.md](docs/02-team.md), then follow your reading path in INDEX.
3. Authoritative plan = [docs/09](docs/09-architecture-and-execution-plan.md) (execution) + [docs/12](docs/12-requirements-fit-and-final-architecture.md) (final architecture) + [docs/15](docs/15-presentation-readiness-pack.md) (P5 presentation pack). Older docs (04/05/06) are background; on conflict, 09–15 win.
4. Add new notes under `meetings/`, `decisions/`, or `docs/`.

For AI agents:

1. Read [AGENTS.md](AGENTS.md).
2. Read [ai-context/PROJECT_CONTEXT.md](ai-context/PROJECT_CONTEXT.md).
3. Use [ai-context/ASK_AI_PROMPT.md](ai-context/ASK_AI_PROMPT.md) as the initial prompt when asking another AI tool.

## Current Status

Status as of 2026-07-08:

- `main` has the implementation starter kit, CI, API skeleton, AI guardrails, business-impact calculator, and presentation readiness pack merged.
- GitHub Actions checks pass on `main`: core-calc golden checks, local demo smoke, Maven package, API smoke, Markdown links, and diff hygiene.
- Merged feature branches were cleaned up from GitHub after merge; keep future branches short-lived and delete them after PR merge.
- Remaining human work: run the skeleton in the real AWS/event account, connect real data/DynamoDB, finish the actual deck/PPTX, and validate Bedrock model access on Day1.

Merged work log:

| PR | Scope | Result |
| --- | --- | --- |
| #1 | Architecture and execution docs | Established single-service plan and presentation outline. |
| #2 | Pre-race scaffold | Added `core-calc`, golden checks, FUEL_CONSUMP export skeleton, and AWS probe script. |
| #3 | Business impact calculators | Added fuel cost, CO2, EU ETS, avoidable cost, and cleaning payback calculation. |
| #4 | Local CI checks | Added GitHub Actions for local checks, Markdown links, and diff hygiene. |
| #5 | Single-service API skeleton | Added Maven multi-module app, Spring Boot API, same-origin static dashboard, Dockerfile, and API smoke. |
| #6 | AI brief guardrails | Added prompt contract, cited-metric numeric validator, JUnit tests, and prompt preview endpoint. |
| #7 | Presentation readiness pack | Added P5 deck pack, source-backed assumptions, backup slide list, Q&A drill, and submission questions. |
| #8 | Execution plan sync | Updated docs/09/12/14 to match implemented scaffolds and owner mapping. |

## What Runs Now

Implementation starter kit:

- `apps/api/` contains the single-service Spring Boot skeleton that serves the static dashboard and `/api/**` from one origin.
- `core-calc/` contains the pure Java calculation seed and golden checks.
- `scripts/test-core-calc.sh` runs local golden checks with `javac`.
- `scripts/export-fuel-consump.sh` exports a first-pass `FUEL_CONSUMP` CSV skeleton without dropping rows.
- `scripts/business-impact.sh` estimates fuel cost, CO2, EU ETS, and cleaning payback days from explicit assumptions.
- `scripts/demo-local.sh` runs the local golden checks and sample exports end to end.
- `scripts/api-smoke.sh` checks the Spring Boot API once the service is running.
- `scripts/probe.sh` smoke-tests AWS permissions for Day1.

Local commands:

```bash
./scripts/test-core-calc.sh
./scripts/demo-local.sh
mvn -pl apps/api -am package
java -jar apps/api/target/fleetmind-api-0.1.0-SNAPSHOT.jar
./scripts/api-smoke.sh
```

Key demo API endpoints:

- `GET /api/health`
- `GET /api/fleet/summary`
- `GET /api/vessels/{id}/performance`
- `GET /api/vessels/{id}/underwater-events`
- `GET /api/vessels/{id}/before-after?eventId=...`
- `POST /api/vessels/{id}/ai-brief`
- `GET /api/vessels/{id}/ai-brief/prompt`
- `GET /api/data-quality/summary`
- `GET /api/fuel-consump/export`

## Current Execution Plan

Day1:

- P5 confirms platform fields, challenge link definition, upload limits, and FUEL_CONSUMP format.
- Sunny runs `scripts/probe.sh` in the event AWS account and validates Bedrock model access.
- Eddie connects `apps/api` to real DynamoDB/S3-backed data instead of demo fixtures.
- Feng validates real schema and locks the FUEL_CONSUMP export format.
- Chen maps real fields into `core-calc` and runs golden checks against official examples.

Day2:

- Chen finishes Speed Loss, fouling attribution, confidence grade, CII/ROI outputs.
- Feng builds the dashboard pages from the existing API contract.
- Eddie connects Bedrock InvokeModel behind `AiBriefPrompt` and `AiBriefGuardrail`.
- Sunny owns deployment, CloudWatch, fallback path, and end-to-end integration.
- P5 builds the deck from [docs/15](docs/15-presentation-readiness-pack.md), with engineering only supplying screenshots and numbers.

Day3:

- Freeze demo data, regenerate final FUEL_CONSUMP, cache demo AI brief, record demo video, and swap final screenshots into deck.
- Upload all seven official deliverables by 12:00-14:00, before the 14:30 hard deadline.
- Run final warm-up: live URL, recording URL, repo, deck, and fallback demo.

Remaining open items:

- Actual AWS App Runner or EC2 deployment in event account.
- Real dataset schema mapping and official FUEL_CONSUMP precision/rounding confirmation.
- Bedrock model ID/region confirmation through `scripts/probe.sh`.
- Actual PPTX/deck creation from docs/10 and docs/15.
- Decide whether D5-D8 stretch items move into must-have after Day2 18:00 data review.

## Important Dates

- 2026-07-03 15:30-16:30: Yang Ming online pre-briefing.
- 2026-07-14 09:00: Hackathon starts at AWS Taipei Office, Breeze Nan Shan 12F.
- 2026-07-15: Remote build day.
- 2026-07-16 11:10: Team returns to TICC 4F Phoenix Hall.
- 2026-07-16 14:30: Final proposal upload deadline.
- 2026-07-16 15:00-17:00: Presentation, judging, awards.

## Deliverables

Official submission is **seven items** (missing any = forfeit under the 14:30 deadline rule; see docs/12 §3 G5). Owner: P5.

- Complete proposal deck
- Challenge link
- Enterprise data and data application description
- Technical architecture
- GitHub repository link
- Live demo link
- Demo recording link

Presentation format:

- 8 minutes presentation
- 4 minutes Q&A

## Scoring

Official event scoring:

- Theme relevance: 30%
- Completeness: 25%
- Business applicability: 20%
- Technical feasibility: 15%
- Creativity: 10%

Yang Ming briefing scoring emphasis:

- Speed Loss dashboard: 30%
- `FUEL_CONSUMP` objective correctness: 25%
- Business decision value: 20%
- Technical feasibility: 15%
- AI collaboration creativity: 10%

## Repository Rules

- Keep this repository private.
- Do not commit secrets, AWS credentials, personal tokens, or production keys.
- Do not commit raw enterprise datasets unless the team confirms repository storage is allowed.
- If Yang Ming provides data only for the competition period, delete or archive it according to the official rules after the event.
- Prefer short Markdown notes with source/date/context over screenshots alone.
- Delete merged feature branches after PR merge; keep `main` as the only long-lived branch.
