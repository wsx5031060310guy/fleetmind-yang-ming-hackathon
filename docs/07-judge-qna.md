# Judge Q&A Prep

## Why not route optimization?

Because the Yang Ming briefing focused on hull efficiency, speed loss, fuel consumption, and underwater cleaning / propeller polishing. Route optimization would be broader, harder to validate, and less aligned with the explicit scoring around Speed Loss dashboard and `FUEL_CONSUMP` correctness.

## Is the AI making maintenance decisions?

No. The system is decision support. It prioritizes vessels, explains evidence, and generates an operations brief. Human maritime experts remain responsible for final decisions.

## How do you prevent the LLM from hallucinating numbers?

All numeric values come from deterministic data processing:

- Weather/full-speed filtering.
- VLSFO normalization.
- Daily FOC calculation.
- Before-after comparison.

Bedrock only explains processed metrics and generates readable briefs.

## What happens if data quality is poor?

The system marks rejected rows with reasons, shows data quality indicators, and avoids producing high-confidence recommendations when there are not enough comparable samples.

## Why is this commercially useful?

Hull and propeller degradation can cause major fuel inefficiency. Earlier detection helps operations teams prioritize cleaning/polishing reviews, reduce fuel waste, and support sustainability reporting.

## What is creative about this?

The AI is not a generic chatbot. It is attached to a concrete fleet-efficiency workflow: filtered operational data, speed loss dashboard, underwater event evidence, and human-review action briefs.

## Can it scale beyond 15 vessels?

Yes. The pipeline is built around repeatable ingestion, transformation versions, and vessel-level metrics. More vessels increase data volume, but the architecture remains the same.

