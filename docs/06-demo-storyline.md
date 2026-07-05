# Demo Storyline

> ⚠ **Superseded for timing**: slide-by-slide plan and timing live in `docs/10` (live demo ≤ 3 minutes, three-click narrative per docs/13 P3). This file is the original full-length narrative; use the script below only as raw material. Tracking: docs/14 §2 G-b.

## 8-Minute Presentation Flow

1. Business pain
   - Fuel cost is material.
   - Hull/propeller degradation can exceed the efficiency impact of main engine changes.
   - Human monitoring alone does not scale across fleet and years of reports.

2. Product statement
   - FleetMind detects hull-efficiency degradation and generates explainable decision-support briefs.

3. Data logic
   - Use 2021-2025 noon reports and underwater reports.
   - Filter comparable conditions.
   - Normalize VLSFO fuel.
   - Calculate Daily FOC.

4. Live demo
   - Open fleet dashboard.
   - Show vessel ranking by speed loss / fuel penalty.
   - Drill into a vessel.
   - Show underwater cleaning/polishing event markers.
   - Generate AI operations brief.
   - Show before-after improvement.

5. Architecture
   - S3, processing job, database, API, dashboard, Bedrock, CloudWatch.

6. Business value
   - Earlier maintenance review.
   - Lower fuel waste.
   - Better evidence for fleet operations and ESG reporting.

7. Close
   - AI does not replace maritime experts.
   - AI makes fleet-efficiency evidence faster, explainable, and operationally usable.

## Live Demo Script (≤ 3 minutes, three-click version)

Per docs/13 P3 — one vessel, three clicks, citation click-through as the climax:

1. Click 1 — Fleet ranking: "This is the fleet overview, ranked by speed loss under comparable conditions. Vessel A is worst — we click in."
2. Click 2 — Vessel detail: "Event markers show the last cleaning; the k-value drops right at the event date. The underwater-report-status × fuel relationship is visible at a glance."
3. Click 3 — AI brief: "One click generates the operations brief (pre-generated cache, note the generated_at timestamp). Now the key move: click any number in the brief — it jumps back to the exact dashboard data point. Every AI statement is traceable."
4. Close with before-after card: payback days and annualized fuel cost difference.

## Original Full Script (raw material)

1. "This is the fleet overview. We filtered out poor weather and incomplete full-speed days so vessels are compared fairly."
2. "Vessel A is flagged because its Daily FOC increased while operating under comparable conditions."
3. "The underwater event timeline shows no recent cleaning, and the trend worsened after a long operating period."
4. "Now we ask Bedrock to produce an operations brief."
5. "The brief cites the data, explains the likely hull-efficiency issue, and recommends human review for underwater cleaning or propeller polishing."
6. "After cleaning, the before-after view shows whether fuel consumption and speed loss improved."

