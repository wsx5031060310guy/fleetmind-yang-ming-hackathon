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

## How did you define the baseline? Did you know this vessel dry-docked in 2023?

We segment each vessel's timeline at every underwater cleaning/polishing event, and additionally run breakpoint detection on the k-value series (sudden sustained drops) to catch efficiency resets the underwater reports do not record — dry-docking with antifouling repaint being the classic case. Those segments are marked "unknown breakpoint" and shown on the trend chart. Reference window = first 10–15 qualifying days after each event, capped at 60 calendar days, so regrowth does not inflate the baseline. (Details: docs/09 §4.1.)

## The whole fleet slowed down from 2021 to 2025. How do you separate commercial slow steaming from fouling?

We never compare raw FOC or raw speed across years. k = FOC/V³ normalizes speed; we compare k only within the same speed band (±1 kn of the reference window), and speed deviation lowers the confidence grade. Where data allows, we fit each vessel's actual resistance exponent n by log-log regression instead of hard-coding 3. Slow steaming changes V; it does not change k under these controls.

## Speed loss is 3.2%. Should I spend USD 40k on cleaning? What is the uncertainty?

First the confidence grade and sample count, then a tiered recommendation: low confidence → underwater inspection first (a few thousand USD — the cheapest information purchase); high confidence with payback under ~45 days → schedule cleaning; otherwise keep observing. We show payback days = cleaning cost ÷ daily extra fuel cost on the before-after card. We never answer "the model says clean."

## Your speed is speed-over-ground, right? What about currents like the Kuroshio?

Correct — noon reports give SOG, not the speed-through-water ISO 19030 requires. On fixed routes, currents are a systematic bias, not random noise. Mitigations: same-route pairing of legs, long-window medians, and the residual is explicitly shown as "unexplained" rather than attributed to fouling. If log speed / slip fields exist in the real data, we cross-validate. (Full deviation table: docs/09 §4.4.)

## Fouling attribution 68% — where does that number come from?

It is an operational definition, computed and reproducible: within each segment we run a Theil-Sen robust regression of k over time; the trend component (slope × elapsed days) is attributed to fouling because biological growth is monotonic in time; the residual is labeled unattributed. We state the assumptions openly and show the unexplained share in the UI instead of hiding it. If sea-surface temperature fields exist, we verify seasonal effects sit in the residual, not the trend.

## Why not train an ML model on SageMaker?

Three reasons. ISO 19030 itself is a deterministic method; after good-weather and full-speed filtering, per-vessel qualifying samples are too few to train without overfitting; and the 25% auto-scored output requires the exact prescribed formula, not a prediction. Fouling is a monotonic physical process — a robust regression slope tells the story a black-box model cannot defend in front of marine engineers.

## Is FOC really proportional to V-cubed?

The cube law is an approximation; container ships in service-speed range often show exponents of 3.5–4.5. That is exactly why we compare only within the same speed band, and fit per-vessel exponents from reference-window data when samples allow. Small speed-band violations lower the confidence grade automatically.

## What does this cost to run on AWS?

For 15 vessels: a single small App Runner instance (~USD 50/month), DynamoDB on-demand and S3 in cents, Bedrock billed per brief generation — under USD 70/month total, and effectively the same at 97 vessels because the full recalculation takes under a minute. One avoided month of a 5% fuel penalty on one vessel pays for decades of this system.

