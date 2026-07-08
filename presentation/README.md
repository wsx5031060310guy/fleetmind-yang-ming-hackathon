# FleetMind Proposal Deck

This folder contains the generated proposal deck skeleton for the Yang Ming AWS AI Hackathon presentation.

Tracked deliverables:

- `fleetmind-proposal-deck.pptx` — editable PowerPoint deck, 9 main slides + 15 Q&A backup slides.
- `fleetmind-proposal-deck-preview.webp` — visual montage for quick review in GitHub.
- `build-fleetmind-deck.mjs` — source used to regenerate the deck from the current plan.

Content sources:

- Main flow: `docs/10-presentation-plan.md`
- Scenario assumptions, cold open, backup list: `docs/15-presentation-readiness-pack.md`
- Architecture and method: `docs/09-architecture-and-execution-plan.md`
- Q&A backup answers: `docs/07-judge-qna.md`
- Day1 ops/deployment/data cleanup: `docs/16-day1-ops-runbook.md`

Regenerate in a Codex runtime that has `@oai/artifact-tool` installed:

```bash
NODE_PATH=/path/to/codex-primary-runtime/dependencies/node/node_modules \
  node presentation/build-fleetmind-deck.mjs
```

Day2/Day3 replacement points:

- Replace demo scenario numbers on slides 1 and 6 with frozen real values from `/api/vessels/{id}/before-after`.
- Replace assumption text if Yang Ming or suppliers provide real fuel, carbon, or cleaning-cost values.
- Add final dashboard screenshots only after Day3 data freeze; keep screenshots out of git if they include enterprise raw data.
- Rehearse with slides 1-9 only; slides B1-B15 are Q&A backup.
