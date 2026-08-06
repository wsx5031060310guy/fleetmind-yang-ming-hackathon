# FleetMind on Vercel — port spec

Goal: serve the existing FleetMind demo site (8 hand-authored HTML pages + its JSON API)
from Vercel. Vercel cannot run the Spring Boot backend, so the API is re-implemented as
Vercel Functions (Node) that reproduce the Java app's **demo mode** responses.

Source of truth for behaviour: `apps/api/src/main/java/com/fleetmind/api/**` and
`core-calc/src/main/java/com/fleetmind/corecalc/**`, plus the captured golden snapshots
in `web/test/golden/` (produced by `web/test/capture-golden.sh` against the real jar).

## Hard constraints

1. **Never read, copy, bundle, or reference `core-calc/target/real-metrics.json`.**
   That file holds real Yang Ming vessel metrics and is deliberately gitignored. The
   deployed site uses only the synthetic `DemoDataService` dataset (vessels
   `YM-DEMO-01/02/03`). Add an explicit guard: if `FLEETMIND_METRICS_FILE` is set in the
   Vercel environment, ignore it and keep serving demo data.
2. **Do not modify anything under `apps/`, `core-calc/`, `docs/`, `presentation/`,
   `submission/`.** All new code lives under `web/`. The Java app stays the reference
   implementation.
3. The static HTML/CSS/JS keeps its single source of truth at
   `apps/api/src/main/resources/static/`. `web/` copies it at build time; it never forks it.

## Layout to create

```
web/
  package.json          # type: module, node >=22, scripts: build, dev, test
  vercel.json           # or vercel.ts — routing + function config
  scripts/build-public.mjs   # copies apps/api/src/main/resources/static/ -> web/public/
  api/**                # Vercel Functions
  lib/**                # ported domain logic (shared by the functions)
  test/
    capture-golden.sh   # already written — regenerates golden from the Java jar
    golden/             # already captured — 58 snapshots, do not edit by hand
    parity.mjs          # NEW: boots the Node handlers and diffs against golden
  SPEC.md               # this file
```

## Endpoints to implement (19)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | `{status:"ok",time:<ISO instant>}` |
| GET | `/api/fleet/summary` | `VesselSummaryDto[]`, threshold applied per request |
| GET | `/api/config/threshold` | `{thresholdPct:<double>}` |
| PUT | `/api/config/threshold?value=<double>` | **query param, not a JSON body**. Valid range `0 < v <= 50`; otherwise 400 `{"message":"threshold must satisfy 0 < value <= 50","status":"bad_request"}`. Missing param → 400. |
| GET | `/api/alerts` | `DecisionDto[]` — summaries with status ACT or WATCH, sorted by severity(ACT<WATCH) → speedLoss desc → forecastDays asc (null = MAX_INT) → vesselId |
| POST | `/api/alerts/notify` | No AWS creds on Vercel ⇒ every channel `configured:false`. Shape must match `golden/alerts-notify.json` |
| GET | `/api/vessels/{id}/decision` | 404 `{"message":"unknown vessel: X","status":"not_found"}` for unknown ids |
| GET | `/api/vessels/{id}/performance` | `DailyMetricDto[]` |
| GET | `/api/vessels/{id}/underwater-events` | `UnderwaterEventDto[]` |
| GET | `/api/vessels/{id}/before-after?eventId=` | `BeforeAfterDto` |
| POST | `/api/vessels/{id}/ai-brief?forceFallback=` | Bedrock is unavailable on Vercel. Always take the deterministic path: `mode:"deterministic-fallback"`, or `"deterministic-forced-fallback"` when `forceFallback=true`. Port `AiBriefGuardrail` + the deterministic brief text and `citedMetrics` exactly. |
| GET | `/api/vessels/{id}/ai-brief/prompt` | `AiBriefPromptDto` — the prompt text is a constant assembled from vessel metrics |
| GET | `/api/data-quality/summary` | |
| GET | `/api/fuel-consump/export` | |
| GET | `/api/admin/settings` | `snsConfigured/sesConfigured/webhookConfigured` all false |
| PUT | `/api/admin/settings` | Partial patch (`AdminSettingsUpdateDto`, every field nullable). Null/absent body is a no-op returning the current snapshot. `thresholdPct` **writes through** to the same store `/api/config/threshold` reads. Validation errors → 400 `{"message":...,"status":"bad_request"}` |
| GET | `/api/export/decisions?format=json\|csv&status=ACT,WATCH` | csv → `text/csv` + `Content-Disposition: attachment; filename="fleet-decisions.csv"` |
| GET | `/api/export/alerts?format=json\|csv&since=<ISO>` | `since` strictly after now ⇒ empty alert set |
| POST | `/api/uploads/noon-report` (multipart, `file`, `dryRun` default true) | Port `NoonReportCsvParser` in full: header aliases, encoding detection, required columns `vesselId,date,stwKn,dailyFocMt`, row-level `qualityFlags` (`FUEL_TYPE_UNMAPPED`, `UNKNOWN_VESSEL`, `DUP_IN_FILE`, `INVALID_DATE`, …), `overwrites`, 10MB cap. **Preview-only in Java too — it never persists.** Keep it a pure function. |

`/api/integrations/webhooks` is only a documentation row in `admin.js` (`live:false`) — it
returns 404 in Java. Leave it unimplemented.

## Mutable state: cookie-scoped, not process-global

Java keeps threshold + admin settings in process memory (`AtomicReference`), which worked
because one ECS task served everyone. Vercel Functions have no reliable shared memory
across instances, and a public demo should not let one visitor's threshold change what
another sees.

Implement threshold + admin settings as **per-visitor state in a cookie**:

- cookie `fleetmind_settings`, value = base64url of the settings JSON, `Path=/`,
  `SameSite=Lax`, `Max-Age=2592000`, not `HttpOnly` is fine (no secrets in it).
- absent/corrupt cookie ⇒ fall back to the Java defaults (threshold 10.0, horizon 30,
  channels `["sns"]`, etc. — see `golden/admin-settings.json`).
- every mutating endpoint (`PUT /api/config/threshold`, `PUT /api/admin/settings`) sets
  the cookie on its response; every read endpoint reads it.
- reject a cookie payload over 4KB by falling back to defaults rather than throwing.

Document this divergence in `web/README.md` — it is intentional, not a porting bug.

## Static hosting

`web/scripts/build-public.mjs` copies `apps/api/src/main/resources/static/` into
`web/public/` (~35MB, 85 files, includes `demo/fleetmind-demo.mp4` at 10MB and
`deck/` at 14MB). Preserve directory structure and extensionless routing so
`/dashboard` and `/dashboard.html` both resolve, matching Spring Boot's behaviour —
check what the pages' own links use before choosing (`app.js` requests `/app.js` at the
root, `voyage.html` uses a relative `voyage.js`).

Spring Boot served these with gzip on (`application.yml`); Vercel compresses
automatically, so no config is needed for that.

## Verification — this is the acceptance gate

Write `web/test/parity.mjs`, runnable as `npm test` from `web/`:

1. Start the Node API locally (a thin `node:http` shim that dispatches to the same
   handler modules the Vercel Functions export — do **not** require `vercel dev`, it must
   run in CI without auth).
2. Replay every request in `web/test/capture-golden.sh` against it.
3. Deep-compare each response against `web/test/golden/<name>` **and** its HTTP status
   against `web/test/golden/<name>.status`.
4. Normalise only genuinely volatile fields before comparing: `time`, `generatedAt`,
   `computedAt`, `batchId`, and the `generatedAt` column inside exported CSV. Assert they
   are present and parse as an ISO instant / `batch-<uuid>` rather than dropping them.
5. Any other difference is a failure. Print a per-case diff.

The parity runner must be **mutation-verified**: temporarily break one ported value (e.g.
change a `rationale` string) and confirm the runner goes red, then revert. A runner that
cannot fail is not a test. State in your report which mutation you used and that it
failed as expected.

Also confirm the guard from constraint 1 works: with `FLEETMIND_METRICS_FILE` pointing at
a real file, the API still returns the `YM-DEMO-*` dataset.

## Out of scope

- Real Bedrock/SNS/SES/webhook calls. Everything stays deterministic and unconfigured.
- Persisting noon-report uploads (Java is preview-only too).
- Touching the Java app, the decks, or the submission bundle.
