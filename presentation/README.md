# FleetMind Proposal Deck

This folder contains the proposal deck for the Yang Ming AWS AI Hackathon presentation.

Tracked deliverables:

- `fleetmind-proposal-deck.pptx` — the deck (11 main slides + 5 Q&A backup slides), real-data numbers, zh-TW.
- `apps/api/src/main/resources/static/deck.html` — the public 11-slide web viewer. It uses the proposal deck's main narrative, not the separate AWS architecture options deck.
- `build-fleetmind-deck-v2.mjs` — **current** generator. Offline, pure `pptxgenjs` (no private deps), runs anywhere.
- `build-fleetmind-deck.mjs` — legacy generator (needs the private `@oai/artifact-tool`; does **not** run on the rental Mac). Superseded by v2; kept for reference only.
- `fleetmind-proposal-deck-preview.webp` — visual montage (from the legacy deck).

Content sources (kept in sync):

- Enterprise data & data application chapter: `docs/17-enterprise-data-application.md`
- Technical architecture & algorithms chapter: `docs/19-technical-architecture-submission.md`
- Judge Q&A backup answers: `docs/07-judge-qna.md`
- Fuel-prediction plan / real numbers: `docs/23-fuel-prediction-plan.md`
- Day1 ops/deployment: `docs/16-day1-ops-runbook.md`, `docs/25-day1-onsite-execution.md`

## Regenerate (offline, any machine)

```bash
npm install -g pptxgenjs
NODE_PATH="$(npm root -g)" node presentation/build-fleetmind-deck-v2.mjs
# → writes presentation/fleetmind-proposal-deck.pptx
```

Export a PDF for the projection machine (the presentation runs on the organizer's computer;
ship PPTX **and** PDF with fonts embedded / outlined):

```bash
soffice --headless --convert-to pdf presentation/fleetmind-proposal-deck.pptx
```

## Day2/Day3 update points

- The numbers in `build-fleetmind-deck-v2.mjs` come from the real run (fleet Speed Loss, prediction RMSE/MAPE, bounded counterfactual ROI). Refresh them from the frozen Day3 metrics before recording.
- Slides 1–11 are the 8-minute flow; slides 12–16 are Q&A backup.
- Do not commit dashboard screenshots that contain enterprise raw data; QA render artifacts (`slide-*.jpg`, `*.pdf`) are gitignored.
