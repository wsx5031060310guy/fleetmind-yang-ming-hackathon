# core-calc 用 Java 純函式庫＋單一 Spring Boot 服務

Date: 2026-07-04

## Context

3 天賽期、比賽帳號權限未知、工程四人皆後端（Java/Spring Boot 最強）、評分 55% 集中在 Speed Loss dashboard（30%）與 FUEL_CONSUMP 自動評分（25%）。六條 AWS 架構路線經完整設計與 3 視角評審（docs/11）。

## Decision

- 計算核心 core-calc 為 **Java 純函式庫**（無 I/O、golden-case 單元測試），可內嵌 Spring Boot 亦可打包 Lambda——部署形式退化時計算零重工。
- 部署 default 為**單一 Spring Boot 服務**：同源 serve React build + API + 內嵌 core-calc，跑 App Runner（fallback EC2 + docker），外部依賴僅 S3/DynamoDB/Bedrock/CloudWatch。
- P2 加分路徑（Day2 18:00 端到端全通且超前才做）：同一 core-calc jar 由 S3 event 觸發 Lambda 自動重算。

## Alternatives Considered

全 Serverless（API Gateway+SnapStart+非同步輪詢）、QuickSight 託管分析、事件驅動 Fargate、Bedrock Agents、SageMaker ML——六路線比較與淘汰理由見 docs/11（單服務三視角全拿 9 分，總分 27）。

## Consequences

- 消滅 CORS/HTTPS/VPC/ALB 整類佈建炸彈；infra 稅全場最低（~8h）。
- 唯一「現場網路全掛仍可本機跑完 demo」的路線（H2 + 本機檔案 Plan B）。
- 技術可行性 15% 的架構敘事靠 P2 與「減法架構頁」補。

## Follow-Up

Day1 權限探測 checklist 決定 App Runner／EC2／本機分叉（docs/11 §5.2 決策樹）。
