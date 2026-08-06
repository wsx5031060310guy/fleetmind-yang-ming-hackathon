# FleetMind Vercel port

Node 22 Vercel Functions port of the Spring Boot demo API. Production handlers use only
the synthetic `YM-DEMO-01/02/03` fixtures ported from `DemoDataService`; they never read
`FLEETMIND_METRICS_FILE`. Setting that environment variable has no effect.

## Commands

```bash
npm run build        # regenerate public/ from apps/api/src/main/resources/static/
npm run dev          # API-only local server on 127.0.0.1:3000
npm test             # parity against every captured golden case
npm run deploy       # build + test + preview deploy
npm run deploy:prod  # build + test + production deploy

# same 69-case suite against a live deployment, so the Vercel entrypoint and
# routing are covered too — not just the router module
PARITY_BASE_URL=https://fleetmind-ym.vercel.app npm test

# regenerate the golden baseline from the real Spring Boot jar (demo mode)
JAVA=/opt/homebrew/opt/openjdk@21/bin/java ./test/capture-golden.sh
```

`public/` is generated and git-ignored. The Spring Boot static directory remains the only
source of truth.

## Deploy mechanics

`public/` is built **locally** and uploaded with the deployment: its source
(`apps/api/src/main/resources/static/`) sits outside this deploy root, so Vercel's builder
cannot reach it. That is why `.vercelignore` exists — without it the CLI falls back to
`.gitignore`, which excludes the one directory that has to ship. Vercel's `buildCommand`
runs `scripts/verify-public.mjs`, which fails the build if `public/` is missing, incomplete,
or contains an empty file. Always deploy through `npm run deploy*`, never bare `vercel`.

`cleanUrls` is **off**: every internal link in the site is written as `/dashboard.html`, so
enabling it would turn each navigation into a 308 redirect for no gain, and `.html` paths
resolve exactly as they did under Spring Boot.

`vercel.json` carries an explicit `/api/:path*` rewrite. Vercel's zero-config route for
`api/[...path].js` compiles to `^/api/([^/]+)$` — single segment only — so without the
rewrite every nested endpoint (`/api/fleet/summary`, `/api/admin/settings`) 404s in
production while `/api/health` works. The handler reconstructs the path from either URL
shape, so it does not depend on which route wins.

## Intentional state divergence

Spring Boot stores threshold and admin settings in process memory. Serverless instances cannot
share that state safely, so this port stores the complete settings document per visitor in the
`fleetmind_settings` cookie (base64url JSON, `Path=/`, `SameSite=Lax`, 30-day max age). Missing,
corrupt, invalid, or over-4KB cookie values fall back to Java defaults. Both mutating endpoints
set the cookie; all read/decision/export/upload endpoints consume it. No mutable module-global
settings exist, so one public visitor cannot change another visitor's dashboard.

No AWS calls run on Vercel. AI briefs always use the guarded deterministic fallback, and alert
delivery channels always report `configured: false`. Noon-report upload remains a pure,
preview-only validation path and never persists data.

## Golden baseline notes

`test/golden/` is captured from the real jar and must not be hand-edited. Two of its cases are
non-deterministic **on the Java side**, and `parity.mjs` normalises for that rather than pinning
one arbitrary capture:

- `data-quality.json`'s `flagCounts` and the JSON embedded in `ai-brief/prompt`'s `userPrompt`
  come from `Map.of()`, whose iteration order Java randomises per JVM run. Object comparison is
  already order-insensitive; the embedded document inside the `userPrompt` **string** is parsed
  and key-sorted before comparing, so its content still has to match exactly.
- Volatile fields (`time`, `generatedAt`, `computedAt`, `timestamp`, `batchId`) are asserted to
  be well-formed, then replaced with placeholders — never dropped.

The `bound-*` cases pin exact-equality thresholds (4.76 = YM-DEMO-01's speed loss, 2.1 = -02's).
`DecisionSupport` crosses on `speedLoss >= threshold`; with only the 10 / 3 thresholds the
original capture used, relaxing `>=` to `>` passed 57/57 undetected. With the boundary cases it
fails 4/69. Keep them.
