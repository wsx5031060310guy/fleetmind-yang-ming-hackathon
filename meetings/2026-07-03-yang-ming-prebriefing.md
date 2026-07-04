# 2026-07-03 Yang Ming Pre-Briefing

## Key Takeaways

- The challenge is narrower than generic ship performance AI.
- Yang Ming cares about hull efficiency, speed loss, fuel consumption, and underwater maintenance actions.
- The output they explicitly expect is a Speed Loss dashboard.
- `FUEL_CONSUMP` objective correctness has a large scoring weight.
- Business decision value matters more than academic model complexity.

## Data Mentioned

- 15 vessels.
- 2021-2025 daily noon reports.
- Underwater reports:
  - Underwater inspection
  - Underwater cleaning
  - Underwater propeller polishing

## Required Data Logic

- Filter `WIND_SCALE <= 4`.
- Filter `HOURS_FULL_SPEED >= 22`.
- Normalize fuel to VLSFO equivalent.
- Calculate:

```text
Daily FOC = ME_FULLSPEED_CONSUMP_VLSFO / HOURS_FULL_SPEED * 24
```

## Product Implication

Prioritize:

1. Speed Loss dashboard.
2. Fuel normalization correctness.
3. Before-after underwater maintenance analysis.
4. Bedrock-generated operations brief.

Avoid:

- Generic chatbot.
- Unvalidated route optimization.
- Computer vision from underwater images.
- Custom ML training.

