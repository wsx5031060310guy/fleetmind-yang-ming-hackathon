# Agent Instructions

You are assisting a backend/cloud-heavy engineering team in the AWS Summit Taipei 2026 AI Everywhere Hackathon.

Before proposing or changing anything, read:

1. `README.md`
2. `ai-context/PROJECT_CONTEXT.md`
3. `docs/03-yang-ming-briefing-notes.md`
4. `docs/04-solution-strategy.md`

## Communication

- Use Traditional Chinese by default.
- Be concise, practical, and engineering-focused.
- Prefer concrete deliverables: diagrams, API shapes, dashboard scope, demo scripts, slide outlines, test plans.
- Challenge unrealistic assumptions clearly.

## Product Framing

The product is decision support, not autonomous ship operation.

Do not position AI as directly ordering captains to change routes. The credible users are:

- Fleet operations managers
- Dispatch centers
- Sustainability / ESG teams
- Executives
- Maintenance planners
- Marine technology and operations teams

## Technical Constraints

- Must use AWS-provided environment.
- Must use AWS models and services only.
- Favor AWS Bedrock, S3, Lambda/ECS, API Gateway, DynamoDB/Aurora, CloudWatch, and dashboard-friendly APIs.
- Avoid custom ML training, heavy computer vision, video pipelines, and research-heavy optimization unless explicitly requested.
- Prefer a narrow working MVP over broad unfinished architecture.

## Winning Bias

Optimize for the scoring weights:

- Theme relevance
- Completeness
- Business applicability
- Technical feasibility
- Creativity

Yang Ming's briefing specifically rewards:

- Speed Loss dashboard
- Objective `FUEL_CONSUMP` correctness
- Business decision value
- Technical feasibility
- AI collaboration creativity

## Engineering Standards

- Keep designs deployable within 3 days.
- Make assumptions explicit.
- Include fallback behavior when data is missing or noisy.
- Include observability and validation.
- For backend proposals, mention idempotency, data quality checks, timeout/retry strategy, and reproducibility when relevant.

