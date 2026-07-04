# Prompt To Give Another AI Agent

Use this prompt when a teammate wants another AI tool to understand the project quickly.

```text
You are helping our 4-person engineering team build for AWS Summit Taipei 2026 百工百業瘋 AI - AI Everywhere Hackathon.

We are assigned to Yang Ming Marine Transportation / 陽明海運.

Theme:
AI Ship Performance Analysis and Energy Efficiency Decision Support System.

Team:
- Eddie Chang: backend engineer, Java/Spring Boot, APIs, system design.
- Sunny: cloud architect, AWS infrastructure/reliability.
- Feng Zhi-Sheng: software engineer.
- Chen Jian-Ying: software engineer.

Team strengths:
Backend engineering, AWS architecture, APIs, distributed systems, production-grade software.

Avoid:
Custom ML training, heavy computer vision, video processing, unrealistic autonomous route planning.

Competition constraints:
- Use AWS-provided environment.
- Use AWS models and services only.
- Submit GitHub repo, architecture, live demo, demo recording, and slides.
- Presentation: 8 minutes + 4 minutes Q&A.

Official scoring:
- Theme relevance 30%
- Completeness 25%
- Business applicability 20%
- Technical feasibility 15%
- Creativity 10%

Yang Ming briefing scoring:
- Speed Loss dashboard 30%
- FUEL_CONSUMP objective correctness 25%
- Business decision value 20%
- Technical feasibility 15%
- AI collaboration creativity 10%

Domain facts:
Yang Ming wants to detect hull-efficiency degradation because increased hull resistance directly affects main engine fuel consumption. Main engine efficiency impact is around 3-5%, while hull/propeller degradation can exceed 20% in severe cases. The target is early detection of low hull-efficiency vessels so experts can arrange underwater inspection, hull cleaning, or propeller polishing.

Data direction:
- 15 vessels.
- 2021-2025 daily noon reports.
- Underwater reports: inspection, cleaning, propeller polishing.
- Filter good weather: WIND_SCALE <= 4 Beaufort.
- Filter full-speed days: HOURS_FULL_SPEED >= 22.
- Normalize fuel to VLSFO equivalent using LCV MGO=42.7, ULSFO=41.2, HFO=40.2, VLSFO=40.2.
- Daily FOC = ME_FULLSPEED_CONSUMP_VLSFO / HOURS_FULL_SPEED * 24.

Recommended solution:
Fleet Efficiency Copilot + Speed Loss dashboard.

MVP:
1. Data ingestion and filtering.
2. Fuel normalization and Daily FOC calculation.
3. Speed loss / hull fouling signal dashboard.
4. Before/after cleaning or polishing comparison.
5. Bedrock-generated operations brief explaining anomaly, likely cause, confidence, and suggested human review action.

Please optimize for business applicability, completeness, technical feasibility, and a strong live demo. Keep suggestions practical and buildable in 3 days.
```

