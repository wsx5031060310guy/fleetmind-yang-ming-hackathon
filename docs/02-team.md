# Team

## Members

| Member | Role / Company | Known Strengths |
| --- | --- | --- |
| Eddie Chang | Backend Engineer at Seneca ESG | Java, Spring Boot, system design, financial systems, APIs |
| Sunny | Cloud Architect at Xyloc | AWS architecture, cloud infrastructure, reliability |
| Feng Zhi-Sheng | Software Engineer at 閎博科技有限公司 | Software engineering |
| Chen Jian-Ying | Software Engineer at 奕福穎科技股份有限公司 | Software engineering |

## Team Strengths

- Backend engineering
- Java / Spring Boot
- AWS architecture
- API design
- Distributed systems
- Event-driven systems
- Production-grade software

## Risks

- Frontend/dashboard polish must be scoped tightly.
- Avoid custom ML or heavy computer vision.
- Avoid overly broad AI-agent demos.
- Keep data transformation and scoring reproducible because `FUEL_CONSUMP` correctness is explicitly scored.

## Suggested Work Split

| Area | Owner Candidate | Notes |
| --- | --- | --- |
| Data model and processing | Eddie + Feng/Chen | Noon report filtering, fuel normalization, Daily FOC |
| AWS infra | Sunny | S3, Bedrock, API deployment, logs, IAM guardrails |
| API/backend | Eddie | Dashboard API, anomaly explanation endpoint |
| Dashboard/demo flow | Feng/Chen | Speed Loss dashboard, vessel detail, before-after comparison |
| Presentation/story | Eddie + Sunny | Business value, architecture, demo script, Q&A |

