# Yang Ming Briefing Notes

Source:

- Yang Ming online pre-briefing screenshots from 2026-07-03.
- Notes below are extracted from screenshots and should be verified against the official deck or recording if available.

## Company Context

Yang Ming Marine Transport Corp. was shown as the global #9 container operator by capacity in 2026-06.

Fleet resource snapshot:

- 2026 Q2 total vessels: 97.
- 2026 Q2 total capacity: 741,970 TEU.
- 2025 total vessels: 97.
- 2025 total capacity: 713,694 TEU.
- Own vessels: 61 / 63% in 2025, 63 / 65% in 2026 Q2.
- Chartered vessels: 36 / 37% in 2025, 34 / 35% in 2026 Q2.
- Own vessel capacity: 348,980 TEU / 49% in 2025, 380,180 TEU / 51% in 2026 Q2.
- Chartered vessel capacity: 364,714 TEU / 51% in 2025, 361,790 TEU / 49% in 2026 Q2.
- 2026 Q2 capacity increased by 28,276 TEU compared with 2025, mainly due to two 15K LNG dual-fuel owned vessels delivered and put into operation.

Stakeholder groups implied by organization chart:

- Marine technology
- Operations management
- Sustainability / sustainable development
- IT management
- Route business
- Strategic development

## Operational Pain Point

Ship efficiency has a major impact on operating fuel cost.

Yang Ming has used Power BI efficiency management tools and human monitoring, but operational pain points remain because:

- Maritime talent is limited.
- Shore-side management personnel are insufficient.
- There are management and decision-support gaps.

The challenge asks teams to use AWS AI to address this operational pain.

## Efficiency Categories

Based on management experience, ship efficiency can be roughly divided into:

- Main engine efficiency
- Hull and propeller efficiency

Main engine efficiency:

- Usually maintained through mechanical maintenance.
- Estimated impact on ship efficiency is around 3-5%.

Hull and propeller efficiency:

- Affected by operating environment.
- Factors include seawater temperature, anchorage/waiting time, marine biofouling, and similar conditions.
- Severe deterioration can affect ship efficiency by more than 20%.
- Propeller efficiency can also be affected by marine biofouling.

## Challenge Focus

The case focuses on hull efficiency.

When hull resistance increases:

- It directly reflects in main engine fuel consumption.
- Fuel operating cost increases.
- Yang Ming needs early detection of vessels whose hull efficiency has declined.
- The business action is to arrange underwater inspection, hull cleaning, or propeller polishing to restore efficiency.

## Expected Data And Modeling Direction

Yang Ming expects teams to use:

- Historical daily noon reports of target vessels.
- Underwater reports, including:
  - Underwater inspection
  - Underwater cleaning
  - Underwater propeller polishing

Goal:

- Use AI to find the relationship between vessel speed/fuel consumption and underwater report status.

Provided data direction:

- 15 vessels.
- Daily noon reports from 2021 to 2025.
- Field names and filtering conditions are provided to avoid extreme sailing conditions that would make modeling unreliable.

## Important Filtering Conditions

`WIND_SCALE`:

- Good weather definition.
- Wind force <= 4 Beaufort.

`HOURS_FULL_SPEED`:

- Full-speed sailing hours >= 22 hours.

`ME_FULLSPEED_CONSUMP_VLSFO`:

- Unified fuel metric.
- VLSFO is the calculation baseline.
- If a day uses two or more fuel types, convert by heating value to VLSFO equivalent.

Heating value baseline:

| Fuel | LCV |
| --- | ---: |
| MGO | 42.7 |
| ULSFO | 41.2 |
| HFO | 40.2 |
| VLSFO | 40.2 |

Daily fuel-consumption comparison metric:

```text
Daily FOC = ME_FULLSPEED_CONSUMP_VLSFO / HOURS_FULL_SPEED * 24
```

## Expected Output

Yang Ming explicitly mentioned:

- Speed Loss dashboard.
- Speed Loss value display.
- Percentage of speed loss caused by hull fouling or related conditions.

## Yang Ming Briefing Scoring

| Dimension | Weight | Scoring Method |
| --- | ---: | --- |
| Speed Loss dashboard | 30% | Yang Ming expert review |
| `FUEL_CONSUMP` objective correctness | 25% | Automatic program scoring |
| Business decision value | 20% | Judge review |
| Technical feasibility | 15% | Judge review |
| AI collaboration creativity | 10% | Judge review |

## Implication For Our MVP

We should not over-index on a generic AI chatbot.

The highest-leverage MVP is:

- Correct data filtering.
- Correct VLSFO fuel normalization.
- Reliable Daily FOC calculation.
- Speed loss / hull fouling dashboard.
- Before-after comparison around underwater cleaning or propeller polishing.
- Bedrock-generated explanation and decision-support brief.

