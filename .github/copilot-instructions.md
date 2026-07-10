# Copilot Instructions

Read `AGENTS.md` and `ai-context/PROJECT_CONTEXT.md` before suggesting code or documentation changes.

Architecture and pipeline decisions follow `docs/09-architecture-and-execution-plan.md` §2–§4 and `docs/12-requirements-fit-and-final-architecture.md` §4: core-calc Java pure library, single Spring Boot service (same-origin vanilla-JS static dashboard — no React), full-dataset Daily FOC calculation with quality flags (no row dropping). Deployment: App Runner default, ECS Express Mode / EC2 docker fallbacks (docs/16 §3). Do not re-propose services eliminated in `docs/11` (RDS, CloudFront, QuickSight, Bedrock Agents).

Keep the solution focused on Yang Ming's Speed Loss dashboard, fuel-consumption correctness, and human-in-the-loop decision support.

