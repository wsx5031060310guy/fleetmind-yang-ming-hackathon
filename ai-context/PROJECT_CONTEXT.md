# Project Context For AI Agents

## Team

1. Eddie Chang
   - Backend Engineer at Seneca ESG
   - Java, Spring Boot, system design, financial systems, APIs
2. Sunny
   - Cloud Architect at Xyloc
   - AWS architecture, cloud infrastructure, reliability
3. Feng Zhi-Sheng
   - Software Engineer at 閎博科技有限公司
4. Chen Jian-Ying
   - Software Engineer at 奕福穎科技股份有限公司
5. P5 (name TBD)
   - PM / presentation / design
   - Dedicated presentation-and-submission owner: slides author, demo script director, rehearsal timekeeper, official seven-item submission checklist owner, mock Q&A host

Team strengths:

- Backend engineering
- Java / Spring Boot
- AWS cloud architecture
- APIs
- Distributed systems
- Event-driven systems
- Production-grade software

Team is not specialized in:

- Computer vision
- Heavy ML research
- Video processing
- Custom model training

## Competition

Event:

- AWS Summit Taipei 2026 `百工百業瘋 AI - AI Everywhere Hackathon`

Assigned company:

- Yang Ming Marine Transportation / 陽明海運

Assigned theme:

- AI Ship Performance Analysis and Energy Efficiency Decision Support System

Constraints:

- Use AWS-provided environment.
- Use AWS models and services only.
- Build during the competition window.
- Submit **six items via the team surveycake form** (confirmed 2026-07-14, docs/22 §6): team info, proposal outline, complete deck (enterprise-data application + technical architecture as chapters inside the deck), GitHub repo link, live demo link, demo recording link. Missing any = forfeit. Plus the 25% prediction file `predict/output/submission.csv` (102 rows — docs/23); upload channel confirmed at the Day1 briefing.
- Presentation is 8 minutes plus 4 minutes Q&A.

Official scoring:

- Theme relevance: 30%
- Completeness: 25%
- Business applicability: 20%
- Technical feasibility: 15%
- Creativity: 10%

Yang Ming briefing scoring:

- Speed Loss dashboard: 30%
- `FUEL_CONSUMP` objective correctness: 25%
- Business decision value: 20%
- Technical feasibility: 15%
- AI collaboration creativity: 10%

## Domain Problem

Ship efficiency materially affects fuel operating cost. Yang Ming has used Power BI tools and human monitoring, but maritime talent and shore-side management capacity are limited.

The briefing narrowed the challenge toward hull efficiency:

- Main engine efficiency is generally maintained through mechanical maintenance and affects efficiency by around 3-5%.
- Hull and propeller efficiency can degrade due to seawater temperature, anchorage/waiting time, marine biofouling, and operating environment.
- Severe hull/propeller degradation can affect ship efficiency by more than 20%.
- Increased hull resistance directly appears in main engine fuel consumption.
- The business goal is early detection of vessels with low hull efficiency so cleaning or propeller polishing can be arranged.

## Provided Data Direction

Expected source data:

- 15 vessels.
- Daily noon reports from 2021 to 2025.
- Underwater reports covering underwater inspection, underwater cleaning, and underwater propeller polishing.

Important filters:

- `WIND_SCALE`: good weather, Beaufort wind force <= 4.
- `HOURS_FULL_SPEED`: full-speed sailing hours >= 22.
- `ME_FULLSPEED_CONSUMP_VLSFO`: normalize fuel to VLSFO equivalent.

Fuel conversion baseline:

- LCV MGO = 42.7
- ULSFO = 41.2
- HFO = 40.2
- VLSFO = 40.2

Daily fuel consumption metric:

```text
Daily FOC = ME_FULLSPEED_CONSUMP_VLSFO / HOURS_FULL_SPEED * 24
```

## Recommended Product Direction

Build a Fleet Efficiency Copilot with a Speed Loss dashboard.

**Finalized architecture (authoritative — see docs/09 §2.2 and docs/12 §4):** core-calc as a Java pure-function library (no I/O, golden-case tested) embedded in a single Spring Boot service that also serves the vanilla-JS static dashboard (same origin — no React), backed by S3 + DynamoDB + Bedrock + CloudWatch. Default deployment: App Runner; sanctioned fallbacks: ECS Express Mode or EC2 docker (docs/16 §3). Deliberately NOT using RDS/CloudFront/QuickSight/Bedrock Agents (six-route evaluation in docs/11). Optional P2 bonus: the same core-calc jar triggered as an S3-event Lambda.

Core flow:

1. Ingest vessel noon reports and underwater event reports into S3.
2. **Compute VLSFO normalization and Daily FOC for EVERY row unconditionally (iron rule — protects the 25% auto-scored FUEL_CONSUMP output). Filters only produce quality flags; no rows are dropped.**
3. Speed Loss analysis uses only rows whose quality flags all pass (WIND_SCALE <= 4, HOURS_FULL_SPEED >= 22).
4. Compare vessel performance before/after underwater cleaning or propeller polishing (same-denominator k-value comparison).
5. Detect abnormal hull-efficiency degradation, speed loss, and fouling attribution.
6. Show a dashboard with explainable trend lines and recommended maintenance review.
7. Let Bedrock produce an operations-friendly explanation and action brief (numbers come only from deterministic calculation; Bedrock explains, never computes).

Positioning:

- AI supports human experts.
- AI explains and prioritizes.
- Humans decide maintenance actions.

Avoid:

- Autonomous route planning.
- Captain replacement framing.
- Research-heavy ML.
- Overly broad multi-agent systems that cannot be demoed.

