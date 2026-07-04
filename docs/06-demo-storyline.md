# Demo Storyline

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

## Live Demo Script

1. "This is the fleet overview. We filtered out poor weather and incomplete full-speed days so vessels are compared fairly."
2. "Vessel A is flagged because its Daily FOC increased while operating under comparable conditions."
3. "The underwater event timeline shows no recent cleaning, and the trend worsened after a long operating period."
4. "Now we ask Bedrock to produce an operations brief."
5. "The brief cites the data, explains the likely hull-efficiency issue, and recommends human review for underwater cleaning or propeller polishing."
6. "After cleaning, the before-after view shows whether fuel consumption and speed loss improved."

