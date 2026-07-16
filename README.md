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
3. Authoritative plan = [docs/09](docs/09-architecture-and-execution-plan.md) (execution) + [docs/12](docs/12-requirements-fit-and-final-architecture.md) (final architecture) + [docs/15](docs/15-presentation-readiness-pack.md) (P5 presentation pack) + [docs/17](docs/17-enterprise-data-application.md) (enterprise data application) + [docs/18](docs/18-submission-control-sheet.md) (Day3 submission control) + [docs/19](docs/19-technical-architecture-submission.md) (technical architecture submission) + [docs/20](docs/20-day1-schema-inventory.md) (Day1 schema inventory) + [docs/21](docs/21-day2-stretch-gate.md) (Day2 stretch gate) + [presentation](presentation/) (editable proposal deck). Older docs (04/05/06) are background; on conflict, 09–21 and `presentation/` win.
4. Add new notes under `meetings/`, `decisions/`, or `docs/`.

For AI agents:

1. Read [AGENTS.md](AGENTS.md).
2. Read [ai-context/PROJECT_CONTEXT.md](ai-context/PROJECT_CONTEXT.md).
3. Use [ai-context/ASK_AI_PROMPT.md](ai-context/ASK_AI_PROMPT.md) as the initial prompt when asking another AI tool.

## Current Status

Status as of 2026-07-16 (Day 3, submission day):

**Live and deployed.** The whole product runs at
`http://fleetmind-alb-330672315.us-east-1.elb.amazonaws.com` on the workshop account
(516665228894, us-east-1): a single Spring Boot container on ECS Fargate (ARM64) behind an
ALB, serving the vanilla-JS dashboard and the REST API from one image, with Bedrock (Claude
Haiku) for the AI decision brief, SNS/SES for alerts, and CloudWatch for logs. Real data
(15 vessels, 21,282 noon-report rows, 77 maintenance events) is baked into the image at build
time — no data store on the request path. `/api/health` returns 200 to anyone, no login.

**What is built** (all on `main`, all verified against the live site):

- Speed Loss dashboard — fleet ranking, threshold, per-vessel trend with event markers,
  before/after, hull-vs-propeller attribution, and a Bedrock AI decision brief whose every
  number is a click-back citation to the API that produced it. Speed Loss uses an ISO 19030
  practical adaptation: `k = FOC / STW³`, compared only within a ±1 kn band, Theil-Sen trend.
- Fuel prediction model (`predict/`, Python/sklearn) — physics baseline (k·STW³) → HistGBM →
  best-of, leakage-guarded (simulated masking + GroupKFold), predicting the 102 masked PREDICT
  cells. Measured best is the plain GBM baseline, RMSE 3.51 MT / MAPE 5.22%.
- AI is Explainable Decision Support, not a Prediction Engine: every number comes from the
  deterministic `core-calc`; Bedrock only turns computed metrics into operations language and
  a guardrail rejects any brief whose figure does not trace to a cited source. Engineer decides.

**Deliverables** are assembled in [`submission/`](submission/): both decks as PPTX + PDF, the
102-row prediction CSV, and the demo MP4. See [`submission/README.md`](submission/README.md).
The PPTX open in PowerPoint (the pptxgenjs chart part that PowerPoint refused was replaced with
native shapes). Costs/ROI are deliberately omitted per the Yang Ming engineer's request
([docs/27](docs/27-yang-ming-engineer-feedback.md)) — the deck reports excess-fuel tonnage only.

**Open decisions for the team (not code):** the repo is still **private**, so the GitHub link
(submission item ④) 404s for a judge until it is made public or the judges are added; and the
prediction CSV was generated 2026-07-14 and should be regenerated on a machine that has the
gitignored `data/` before upload (four cells look physically low — see `submission/README.md`).

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
| #9 | README status rollup | Updated README, execution status, and branch cleanup rules. |
| #10 | Day1 ops runbook | Added AWS/Bedrock/deployment/data-cleanup runbook and helper scripts. |
| #11 | Proposal deck skeleton | Added editable PPTX, visual preview, and regeneratable deck source. |
| #12 | Enterprise data application | Added official submission draft for data sources, transformations, AI boundary, and data safety. |
| #13 | Submission control sheet | Added Day3 seven-deliverable upload checklist, timing, fallback, and verification flow. |
| #14 | Technical architecture submission | Added concise architecture draft for the official technical architecture deliverable. |
| #15 | Submission audit script | Added repo safety and deliverable-source audit for Day3 upload readiness. |
| #16 | Day1 schema inventory | Added schema-only inventory script, mapping template, and Day1 data mapping runbook. |
| #17 | Demo freeze snapshot | Added Day3 API snapshot capture with manifest and checksums for recording/deck freeze. |
| #18 | FUEL_CONSUMP validator | Added export shape validator and wired it into local demo/CI smoke. |
| #19 | Live demo warm-up | Added root/API warm-up script for Day3 live URL checks before judges open it. |
| #20 | Day2 stretch gate | Added D5-D8/P1 decision gate to protect the 55% main score. |
| #21 | AI fallback demo | Added forced fallback query/button for Bedrock failure demonstration. |
| #22 | Environment template | Added safe `.env.example` and audit allowlist for placeholders. |
| #23 | Source-safe env template | Replaced shell-unsafe placeholders in `.env.example`. |
| #24 | CI submission audit | Added submission audit to GitHub Actions. |
| #25 | Day3 final check | Added one-command final local pre-upload check. |
| #26 | Strict final check mode | Fixed strict-mode handling in the Day3 final check. |
| #27 | Export resilience | Made FUEL_CONSUMP export crash-proof (never-drop rows, BOM/Big5, multiline quotes, submission-profile flags, atomic write) and hardened the validator (blank FOC fails by default). |
| #28 | Ops hardening | Added curl timeouts, ASIA/STS secret scan, screenshots gate, probe REQUIRED/OPTIONAL split, Day3 strict real-data mode, dynamic port/jar, shellcheck + macOS CI. |
| #29 | Speed Loss pipeline | Implemented the full docs/09 §4 aggregation (reference window, speed band, rolling median, Theil-Sen, before-after) as pure functions with golden tests. |
| #30 | Interactive dashboard | Added SVG trend chart with event markers, vessel switching, citation click-back, per-panel error states, and XSS-safe rendering. |
| #31 | Docs and compliance | Synced AI entry docs, removed tracked Yang Ming screenshots, relative Day1 timeline, Day3 shadow-uploader plan. |
| #32 | Bedrock skeleton | Added AiBriefService (Converse, timeouts, retry, cached fallback ladder) and per-claim citation guardrail matching. |

## What Runs Now

Implementation starter kit:

- `apps/api/` contains the single-service Spring Boot app: same-origin static dashboard (SVG trend chart, vessel switching, citation click-back), `/api/**`, and the Bedrock-ready `AiBriefService` (deterministic fallback until `AWS_REGION` + `FLEETMIND_BEDROCK_MODEL_ID` are set).
- `core-calc/` contains the pure Java calculation library and golden checks: Daily FOC/quality flags plus the full Speed Loss aggregation (`SpeedLoss`: reference window, same-speed band, rolling median, Theil-Sen, before-after).
- `scripts/test-core-calc.sh` runs both golden suites (`CoreCalcGoldenTest`, `SpeedLossGoldenTest`) with `javac`.
- `scripts/export-fuel-consump.sh` exports the `FUEL_CONSUMP` CSV without ever dropping or crashing on a row (dirty rows are emitted with `PARSE_ERROR`/`INVALID_*` flags); the CLI supports `--charset`, `--date-format`, `--scale`, `--rounding-mode`, `--output-columns`, `--line-ending`, and `--qualified-only` (filtered submission variant) so the official Day1 format needs no recompile.
- `scripts/validate-fuel-consump.sh` validates export headers, row count, duplicate keys, real calendar dates, numeric precision, and quality flags; blank `FUEL_CONSUMP` fails by default (`--max-blank-foc`).
- `scripts/business-impact.sh` estimates fuel cost, CO2, EU ETS, and cleaning payback days from explicit assumptions.
- `scripts/demo-local.sh` runs the local golden checks and sample exports end to end.
- `scripts/api-smoke.sh` checks the Spring Boot API once the service is running.
- `scripts/probe.sh` smoke-tests AWS permissions for Day1 with a REQUIRED/OPTIONAL split (real Bedrock invoke-model counts, list-models does not); `--strict` restores all-mandatory.
- `scripts/bedrock-models.sh` lists Bedrock Anthropic models and inference profiles available in the event account.
- `scripts/cleanup-event-data.sh` dry-runs or executes post-event data cleanup.
- `scripts/submission-audit.sh` checks Day3 repo safety and required deliverable source files before upload.
- `scripts/schema-inventory.sh` scans CSV/TSV headers and row counts without printing raw values.
- `scripts/freeze-demo-snapshot.sh` captures live/local demo API outputs, AI brief, FUEL_CONSUMP, and checksums into ignored `build/`.
- `samples/schema-map.template.csv` maps Day1 real fields to FleetMind/core-calc fields.
- `scripts/warmup-live-demo.sh` warms and verifies the root dashboard plus key API paths before judging.
- `scripts/day3-final-check.sh` runs the local pre-upload check bundle; strict real-data mode activates with `FINAL_FUEL_CONSUMP` + `OFFICIAL_ROW_COUNT` (+ optional `BASE_URL`), `--dev` keeps the sample-based checks.
- `.env.example` lists Day1/Day3 environment variables without secrets.
- `presentation/build-fleetmind-deck.mjs` regenerates the editable PPTX skeleton in a Codex artifact-tool runtime.

Local commands:

```bash
./scripts/test-core-calc.sh
./scripts/demo-local.sh
./scripts/validate-fuel-consump.sh --input core-calc/build/demo/fuel-consump.csv --expected-rows 3
./scripts/schema-inventory.sh samples/noon-reports.csv
BASE_URL=http://localhost:8080 ./scripts/freeze-demo-snapshot.sh
BASE_URL=http://localhost:8080 ./scripts/warmup-live-demo.sh --repeat 2
./scripts/day3-final-check.sh --dev
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
- Feng runs `scripts/schema-inventory.sh`, fills `samples/schema-map.template.csv` into a private working map, and locks the FUEL_CONSUMP export format.
- Chen maps real fields into `core-calc`, verifies export header overrides, and runs golden checks against official examples.

Day2:

- Chen wires real data into the pre-built `SpeedLoss` pipeline (already implemented and golden-tested; remaining work is schema mapping into `DailyPoint`) and finishes CII/ROI outputs.
- Feng extends the pre-built interactive dashboard (chart, vessel switching, and citation click-back already work on demo data) to the real-data repository.
- Eddie enables the pre-built `AiBriefService` Bedrock path: set `AWS_REGION` + `FLEETMIND_BEDROCK_MODEL_ID`, smoke one Converse call, verify the guardrail-gated fallback ladder.
- Sunny owns deployment, CloudWatch, fallback path, and end-to-end integration.
- P5 starts from [presentation/fleetmind-proposal-deck.pptx](presentation/fleetmind-proposal-deck.pptx) and [docs/15](docs/15-presentation-readiness-pack.md), with engineering only supplying screenshots and numbers.

Day3:

- Freeze demo data, regenerate final FUEL_CONSUMP, cache demo AI brief, record demo video, and swap final screenshots into deck.
- Capture Day3 demo snapshot with `BASE_URL=<live-url> ./scripts/freeze-demo-snapshot.sh --out build/demo-freeze`.
- Upload all seven official deliverables by 12:00-14:00, before the 14:30 hard deadline.
- Run final warm-up: `BASE_URL=<live-url> ./scripts/warmup-live-demo.sh --repeat 3`, recording URL, repo, deck, and fallback demo.

Remaining open items:

- Actual AWS App Runner, ECS Express Mode, or EC2 deployment in event account.
- App Runner is only a fast path if the event account already has access; otherwise use ECS Express Mode or EC2 docker fallback (see [docs/16](docs/16-day1-ops-runbook.md)).
- Real dataset values still need to be inventoried with docs/20; official FUEL_CONSUMP precision/rounding still needs Day1 confirmation (now flag-configurable on the export CLI, no recompile).
- Bedrock model ID/region confirmation through `scripts/probe.sh` (real invoke-model smoke), then set the two env vars for `AiBriefService`.
- Deck regeneration script depends on a private Codex-runtime package; treat the committed PPTX as canonical and swap numbers/screenshots manually unless the runtime is available.
- Deck finalization with Day2/Day3 frozen real values and screenshots.
- Decide D5-D8/P1 stretch only through [docs/21](docs/21-day2-stretch-gate.md) after Day2 18:00 data review.

## Important Dates

- 2026-07-03 15:30-16:30: Yang Ming online pre-briefing.
- 2026-07-14 09:00: Hackathon starts at AWS Taipei Office, Breeze Nan Shan 12F.
- 2026-07-15: Remote build day.
- 2026-07-16 11:10: Team returns to TICC 4F Phoenix Hall.
- 2026-07-16 14:30: Final proposal upload deadline.
- 2026-07-16 15:00-17:00: Presentation, judging, awards.

## Deliverables

Official submission is **six items via the team's dedicated surveycake form** (missing any = forfeit under the 14:30 deadline rule; confirmed on the official workshop page 2026-07-14 — see [docs/22](docs/22-official-workshop-rules.md) §6). Owner: P5.
Control sheet: [docs/18](docs/18-submission-control-sheet.md).

- Team basic information
- Proposal outline
- Complete proposal deck (**with enterprise-data application and technical architecture as chapters inside the deck** — source material: [docs/17](docs/17-enterprise-data-application.md), [docs/19](docs/19-technical-architecture-submission.md)): [presentation/fleetmind-proposal-deck.pptx](presentation/fleetmind-proposal-deck.pptx)
- GitHub repository link
- Live demo link
- Demo recording link

Plus the **prediction submission file** for the 25% auto-graded score: `predict/output/submission.csv` (102 rows, `ship_id,day,fuel_type,predicted_value` — see [docs/23](docs/23-fuel-prediction-plan.md)); its exact upload channel is a Day1 briefing question.

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
- Use `.env.example` as the only committed environment template; filled `.env` files stay local.
- Do not commit raw enterprise datasets unless the team confirms repository storage is allowed.
- Do not commit Yang Ming screenshots or briefing images anywhere in the repo (docs/20 §2); `scripts/submission-audit.sh` warns on tracked files under `inputs/screenshots/` and fails with `--check-inputs`.
- If Yang Ming provides data only for the competition period, delete or archive it according to the official rules after the event.
- Prefer short Markdown notes with source/date/context over screenshots alone.
- Delete merged feature branches after PR merge; keep `main` as the only long-lived branch.
