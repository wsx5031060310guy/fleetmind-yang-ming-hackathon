# Solution Strategy

> ⚠ **Partially superseded**: MoSCoW priorities have shifted — confidence indicator and ESG/cost estimates are now P0 must-dos (docs/13 §3), human review status flow is downgraded to could-have (docs/09 §6). Scheduling follows docs/09 §7 + docs/13 §3.3; this file is early background.

## Recommended Solution

FleetMind: Fleet Efficiency Copilot with Speed Loss dashboard.

The product helps Yang Ming answer:

1. Which vessels show abnormal fuel consumption under comparable operating conditions?
2. Is the pattern consistent with hull or propeller efficiency degradation?
3. What is the estimated speed loss or fuel penalty?
4. Did underwater cleaning or propeller polishing improve performance?
5. Which vessels should a human expert review first?

## Why This Fits The Scoring

Theme relevance:

- Directly targets ship performance analysis and energy-efficiency decision support.

Completeness:

- Can be delivered as a dashboard plus data pipeline plus AI explanation.

Business applicability:

- Supports maintenance timing, fuel-cost reduction, and ESG reporting.

Technical feasibility:

- Uses data filtering, deterministic calculations, anomaly detection, and Bedrock explanation. No custom model training required.

Creativity:

- AI acts as a fleet-efficiency analyst that generates explainable maintenance review briefs.

## MVP Scope For 3 Days

Must have:

- Data ingestion from CSV or sample dataset.
- Filtering by `WIND_SCALE <= 4` and `HOURS_FULL_SPEED >= 22`.
- VLSFO-equivalent normalization.
- Daily FOC calculation.
- Vessel-level dashboard.
- Speed Loss or efficiency degradation signal.
- Underwater event timeline.
- Before-after comparison for cleaning/polishing.
- Bedrock-generated explanation.
- Demo recording and slides.

Should have:

- Confidence/quality indicator for each recommendation.
- Exportable report.
- Human review status: pending, accepted, rejected.

Could have:

- Natural-language query over fleet metrics.
- ESG/fuel cost impact estimate.
- Scenario simulation.

Won't do unless data strongly supports it:

- Route optimization.
- Custom ML model training.
- Computer vision on underwater images.
- Automated captain instructions.

## Product Views

1. Fleet overview
   - Rank vessels by speed loss / fuel penalty.
   - Show data quality and latest underwater event.

2. Vessel detail
   - Daily FOC trend.
   - Speed loss trend.
   - Weather-filtered samples.
   - Underwater cleaning / propeller polishing markers.

3. AI operations brief
   - Summary of anomaly.
   - Likely contributing factors.
   - Evidence from data.
   - Suggested human review action.
   - Confidence and caveats.

4. Before-after analysis
   - Compare periods before and after underwater work.
   - Show improvement or no improvement.

## Core Narrative

We are not asking AI to captain the ship.

We use AI to turn noisy fleet operating data into explainable decision support, so Yang Ming can prioritize hull cleaning and propeller polishing decisions earlier and with clearer evidence.

