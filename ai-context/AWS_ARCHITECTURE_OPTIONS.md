# FleetMind AWS 架構方案圖集

> 六種 AWS 架構方案的 Mermaid 圖 + 評分比較，供簡報/提交物/AI agent 參考。
> 現行部署 = 方案 B（單服務容器 on ECS Fargate **+ ALB**）。
> 最後更新：2026-07-15
>
> ⚠️ **讀本檔前先看這段**：下方各方案的淘汰理由是 **2026-07-14 當下的決策紀錄**，不是現況。
> 其中一條已被推翻：方案 D 的淘汰理由之一寫「VPC/ALB 14h 稅」，但之後為了取得
> **固定網址**（task 重啟換 IP 會讓 live demo 連結失效），已實際加上 ALB 並上線 ——
> ALB **不是**被否決的技術，它就在 production 上跑：
> `http://fleetmind-alb-330672315.us-east-1.elb.amazonaws.com`（帳號 516665228894 · us-east-1）。
> 各方案「已淘汰」= 當時不選它作為主線，不代表其中的元件不可用。

---

## 方案總覽比較

```mermaid
quadrantChart
    title 架構方案評估 (可交付性 vs Demo風險)
    x-axis "低可交付性" --> "高可交付性"
    y-axis "高Demo風險" --> "低Demo風險"
    quadrant-1 "最佳選擇"
    quadrant-2 "穩但難產"
    quadrant-3 "高風險高回報"
    quadrant-4 "不推薦"
    "B 單服務容器": [0.9, 0.9]
    "F ML增強": [0.6, 0.8]
    "A 全Serverless": [0.5, 0.7]
    "C QuickSight": [0.4, 0.5]
    "D 事件驅動": [0.2, 0.4]
    "E Bedrock Agent": [0.3, 0.3]
```

| 路線 | 可交付性 | 評分最大化 | Demo 風險 | **總分** | Infra 人時 |
|------|:--------:|:----------:|:---------:|:--------:|:----------:|
| **B. 單服務容器 (現行)** | 9 | 9 | 9 | **27** | 8h |
| F. ML 增強 (SageMaker) | 6 | 6 | 8 | 20 | 18h |
| A. 全 Serverless | 5 | 7 | 7 | 19 | 18h |
| C. QuickSight 託管分析 | 4 | 3 | 5 | 12 | 20h |
| E. Bedrock Agent 中心 | 3 | 5 | 3 | 11 | 22h |
| D. 事件驅動管線 | 2 | 4 | 4 | 10 | 14h |

---

## 方案 B：單服務容器 (現行部署方案)

> 評分 27/30 | Infra 8h | **已在 Day1 實測部署成功**

```mermaid
flowchart LR
    subgraph Local["本機開發"]
        DEV["團隊筆電<br/>docker build + push"]
    end

    subgraph AWS["AWS Cloud (us-east-1)"]
        ECR["Amazon ECR<br/>fleetmind-api:latest<br/>(ARM64)"]

        subgraph Compute["ECS Fargate (ARM64)"]
            Container["fleetmind-api container<br/>Spring Boot 4.1 + Java 21<br/>Port 8080<br/>real-metrics.json 烤入映像"]
        end

        subgraph Storage["資料儲存"]
            S3["Amazon S3<br/>raw/ processed/ exports/"]
            DDB[("Amazon DynamoDB<br/>daily_metrics<br/>vessel_summary")]
        end

        subgraph AI["AI 服務"]
            Bedrock["Amazon Bedrock<br/>us.anthropic.claude-haiku-4-5<br/>Converse API"]
        end

        CW["CloudWatch<br/>Logs /fleetmind/api"]
    end

    DEV -->|"docker push"| ECR
    ECR -->|"部署來源"| Container
    Container -->|"讀取 metrics"| DDB
    Container -->|"FUEL_CONSUMP 提交檔"| S3
    Container -->|"決策簡報<br/>Converse API"| Bedrock
    Container -->|"stdout/stderr"| CW

    User["評審瀏覽器<br/>http://public-ip:8080"] -->|"HTTP"| Container
```

### 現行部署細節

```mermaid
flowchart TD
    subgraph Build["建置流程"]
        A1["compile-core-calc.sh"] --> A2["MetricsExportCli<br/>→ real-metrics.json"]
        A2 --> A3["docker build<br/>(ARM64, multi-stage)"]
        A3 --> A4["docker push<br/>→ ECR"]
    end

    subgraph Deploy["ECS 部署"]
        A4 --> B1["Task Definition<br/>cpu:512 mem:1024<br/>ARM64/LINUX"]
        B1 --> B2["run-task<br/>public subnet<br/>assignPublicIp=ENABLED"]
        B2 --> B3["取得 Public IP"]
    end

    subgraph IAM["IAM 角色"]
        R1["fleetmind-ecs-exec<br/>ECR pull + logs"]
        R2["fleetmind-ecs-task<br/>bedrock:InvokeModel"]
    end

    subgraph Env["環境變數"]
        E1["PORT=8080"]
        E2["AWS_REGION=us-east-1"]
        E3["FLEETMIND_BEDROCK_MODEL_ID=<br/>us.anthropic.claude-haiku-4-5-20251001-v1:0"]
    end

    R1 --> B1
    R2 --> B1
    Env --> B1
```

### Fallback 階梯

```mermaid
flowchart TD
    Start["Day1 權限探測"] --> AppRunner{"App Runner<br/>可用?"}
    AppRunner -->|"YES"| AR["App Runner<br/>自帶 HTTPS *.awsapprunner.com<br/>(最優)"]
    AppRunner -->|"NO (AccessDenied)"| ECS{"ECS Fargate<br/>可用?"}
    ECS -->|"YES ✓ 現行"| Fargate["ECS Fargate<br/>Public IP + SG open 8080<br/>(現行方案)"]
    ECS -->|"NO"| EC2{"EC2<br/>可用?"}
    EC2 -->|"YES"| Docker["EC2 + docker run<br/>HTTP demo"]
    EC2 -->|"NO"| Local["全本機跑<br/>H2 + 本機檔案<br/>錄影為 demo link"]
```

---

## 方案 A：全 Serverless

> 評分 19/30 | Infra 18h | 未採用

```mermaid
flowchart LR
    subgraph Ingest["資料進入"]
        CSV["CSV 上傳"] --> S3R["Amazon S3<br/>raw/"]
    end

    S3R -->|"S3 Event Notification<br/>ObjectCreated"| CalcFn["Lambda calc-fn<br/>Java 21 · 2048MB · 300s<br/>內嵌 core-calc 全量重算"]

    CalcFn --> DDB[("DynamoDB<br/>單表 fleetmind<br/>on-demand")]
    CalcFn --> S3P["S3 processed/<br/>FUEL_CONSUMP 提交檔"]

    subgraph Frontend["前端層"]
        Amplify["AWS Amplify Hosting<br/>React SPA · HTTPS"]
    end

    Amplify -->|"rewrite /api/* 200 proxy<br/>同源免 CORS"| GW["API Gateway<br/>HTTP API"]
    GW -->|"ANY /{proxy+}"| ApiFn["Lambda api-fn<br/>Java 21 + SnapStart<br/>Lambda-lith 內部路由"]

    ApiFn --> DDB
    ApiFn -->|"POST ai-brief → 202<br/>async Event invoke"| BriefFn["Lambda brief-fn<br/>Java 21 · 120s"]
    BriefFn --> Bedrock["Bedrock Claude<br/>Converse API"]
    BriefFn -->|"寫回 AiBrief item"| DDB
    ApiFn -->|"presigned URL"| S3P

    User["評審"] --> Amplify
```

---

## 方案 C：QuickSight 託管分析

> 評分 12/30 | Infra 20h | 已淘汰 (客製天花板鎖死 30% dashboard)

```mermaid
flowchart LR
    subgraph Ingest["資料層"]
        CSV["正午報表 + 水下報告"] --> S3R["Amazon S3 raw/"]
    end

    subgraph ETL["計算層 (core-calc 不變)"]
        S3R -->|"S3 event / 手動 invoke"| Lambda["Lambda Java 21<br/>內嵌 core-calc<br/>全量 FOC + Speed Loss"]
        Lambda --> S3P["S3 processed/<br/>CSV + Parquet"]
        Lambda --> S3E["S3 exports/<br/>FUEL_CONSUMP 提交檔"]
    end

    subgraph Serve["呈現層 (取代自刻前端)"]
        S3P --> Glue["AWS Glue<br/>Data Catalog<br/>手寫 DDL"]
        Glue --> Athena["Amazon Athena<br/>SQL views"]
        Athena --> QS["QuickSight SPICE<br/>三頁 dashboard"]
    end

    subgraph AI["AI 簡報 (獨立)"]
        S3P --> BriefFn["Lambda 簡報服務<br/>讀 processed JSON"]
        BriefFn --> Bedrock["Bedrock Claude"]
        BriefFn --> FnURL["Lambda Function URL<br/>HTTPS 簡報頁"]
    end

    QS --> User["評審"]
    FnURL --> User
```

---

## 方案 D：事件驅動管線

> 評分 10/30 | Infra 14h | 已淘汰 (VPC/ALB/CORS 炸彈回歸)

```mermaid
flowchart LR
    subgraph Ingest["資料進入"]
        CSV["CSV 上傳"] --> S3R["Amazon S3 raw/"]
    end

    S3R -->|"S3 Event → EventBridge"| SF["Step Functions<br/>ETL 編排"]

    subgraph Pipeline["事件驅動處理"]
        SF --> L1["Lambda: Schema 驗證"]
        L1 --> L2["Lambda: core-calc<br/>全量 FOC 計算"]
        L2 --> L3["Lambda: Speed Loss<br/>歸因 + 信心等級"]
    end

    L2 --> S3P["S3 processed/"]
    L2 --> DDB[("DynamoDB<br/>DailyMetric")]
    L3 --> DDB2[("DynamoDB<br/>VesselSummary")]
    L3 --> Aurora[("Aurora Serverless v2<br/>PostgreSQL + Data API")]

    subgraph Serve["服務層"]
        ECS["ECS Fargate<br/>Spring Boot API"]
        ECS --> Bedrock["Bedrock Claude"]
    end

    DDB --> ECS
    DDB2 --> ECS
    Aurora --> ECS

    subgraph Front["前端層"]
        Amplify["Amplify Hosting<br/>React HTTPS"]
        CF["CloudFront<br/>HTTPS 終結"]
        ALB["ALB port 80"]
    end

    Amplify -->|"CORS"| CF --> ALB --> ECS
    User["評審"] --> Amplify
```

---

## 方案 E：Bedrock Agent 中心

> 評分 11/30 | Infra 22h | 已淘汰 (用最高風險追最低 10% 權重)

```mermaid
flowchart LR
    subgraph Data["資料計算"]
        CSV["CSV"] --> S3["S3 raw/"]
        S3 --> Batch["Lambda 批次計算<br/>Java, 內嵌 core-calc"]
        Batch --> DDB[("DynamoDB<br/>metrics")]
        Batch --> S3P["S3 processed/<br/>+ FUEL_CONSUMP"]
    end

    subgraph KB["Knowledge Base"]
        Docs["水下報告文字<br/>方法論文件"] --> S3KB["S3 kb-docs/"]
        S3KB --> KnowledgeBase["Bedrock KB<br/>(S3 Vectors /<br/>OpenSearch Serverless)"]
    end

    subgraph Agent["Bedrock Agent 核心"]
        BAgent["Bedrock Agent (Claude)<br/>temperature=0<br/>strict instructions"]
        AG["Action Group Lambda<br/>getFleetSummary<br/>getVesselPerformance<br/>getBeforeAfter"]
        BAgent --> AG
        AG --> DDB
        BAgent --> KnowledgeBase
    end

    subgraph Frontend["前端"]
        SPA["Amplify SPA"] --> APIGW["API Gateway<br/>dashboard 查詢"]
        APIGW --> QueryFn["Lambda 查詢"]
        QueryFn --> DDB
        SPA --> FnURL["Lambda Function URL<br/>chat 端點 (15min)"]
        FnURL --> BAgent
        FnURL --> Validate["後驗證層<br/>regex 數字比對 trace"]
    end

    User["評審"] --> SPA
```

---

## 方案 F：ML 增強 (SageMaker)

> 評分 20/30 | Infra 18h | 作為 stretch 選項 (閘門管制)

```mermaid
flowchart LR
    subgraph Main["主管線 (= 方案 B 完整保留)"]
        CSV["正午報表 + 水下報告"] --> S3R["S3 raw/"]
        S3R --> APP["Spring Boot on ECS<br/>內嵌 core-calc<br/>全量重算"]
        APP --> DDB[("DynamoDB<br/>metrics")]
        APP --> Dashboard["Dashboard<br/>Speed Loss"]
        APP --> Bedrock["Bedrock Claude<br/>決策簡報"]
    end

    subgraph ML["ML 支線 (閘門管制, 4h timebox)"]
        APP -->|"每船 k_t 序列匯出"| S3ML["S3 ml-input/"]
        S3ML --> Train["SageMaker Training Job<br/>Random Cut Forest<br/>shingle_size=7"]
        Train -->|"model artifact"| Transform["SageMaker Batch Transform<br/>離線評分 (無常駐 endpoint)"]
        S3ML --> Transform
        Transform --> S3Out["S3 ml-output/<br/>anomaly score CSV"]
        S3Out -->|"Java 讀回<br/>3σ + CUSUM 交集"| APP
    end

    APP -.->|"type=unknown_breakpoint_ml<br/>疑似未知事件"| DDB

    User["評審"] --> Dashboard
```

### ML 閘門決策

```mermaid
flowchart TD
    G1{"Day1 探測:<br/>CreateTrainingJob OK?<br/>PassRole OK?<br/>ml.m5.large quota > 0?"}
    G1 -->|"任一 FAIL"| NoML["放棄 ML 支線<br/>退回基準計畫"]
    G1 -->|"全部 PASS"| G2{"Day2 12:00 sync:<br/>Speed Loss 首版落 DDB?<br/>FUEL_CONSUMP harness OK?"}
    G2 -->|"NO"| NoML
    G2 -->|"YES"| DoML["Sunny 一人 4h timebox<br/>13:00-17:00"]
    DoML --> G3{"17:00:<br/>結果合理?"}
    G3 -->|"NO"| Revert["git revert ML commit<br/>系統 = 基準計畫"]
    G3 -->|"YES"| Keep["保留 ML 標記<br/>slides 加一頁"]
```

---

## 現行架構 vs 淘汰方案的關鍵差異

```mermaid
flowchart TD
    subgraph Winner["方案 B (現行) 的優勢"]
        W1["單一容器<br/>同源 serve"]
        W2["Infra 僅 8h<br/>全場最低"]
        W3["本機 Plan B<br/>H2 + 本機檔案"]
        W4["55% 主分數<br/>工時最大化"]
        W5["零 CORS<br/>零憑證問題"]
    end

    subgraph Eliminated["被淘汰的原因"]
        E1["C: 客製天花板鎖死<br/>陽明已用 Power BI"]
        E2["D: VPC/ALB 14h 稅<br/>逆風交易"]
        E3["E: Agent 8-40s 延遲<br/>live demo 定時炸彈"]
    end
```

---

## 開賽日決策樹 (完整版)

```mermaid
flowchart TD
    Start["Day1 10:40<br/>權限探測 checklist"] --> Probe{"S3 / DDB / ECR /<br/>Bedrock InvokeModel<br/>全部 OK?"}

    Probe -->|"任一 FAIL"| LocalOnly["全本機開發<br/>Day3 場外重試部署"]

    Probe -->|"全 OK"| AppRunner{"App Runner<br/>可建新服務?"}
    AppRunner -->|"YES"| AR["方案 B: App Runner<br/>自帶 HTTPS (最優)"]
    AppRunner -->|"NO (AccessDenied) ✓實測"| ECS{"ECS Fargate<br/>可用?"}
    ECS -->|"YES ✓實測"| Fargate["方案 B: ECS Fargate<br/>Public IP:8080<br/>(現行部署)"]
    ECS -->|"NO"| EC2["方案 B': EC2 docker<br/>HTTP-only fallback"]

    Fargate --> Day2{"Day2 18:00<br/>端到端全通<br/>且進度超前?"}
    AR --> Day2
    EC2 --> Day2

    Day2 -->|"YES"| P2["P2 加分:<br/>S3 event → Lambda(core-calc)<br/>自動重算 (架構圖用)"]
    Day2 -->|"NO"| Freeze["凍結架構<br/>全力 dashboard + 提交檔"]

    Day2 -->|"YES + 賽前已跑通 RCF"| ML{"ML 閘門<br/>全部 PASS?"}
    ML -->|"YES"| SageMaker["方案 F stretch:<br/>SageMaker RCF 4h timebox"]
    ML -->|"NO"| P2

    P2 --> Day3["Day3 凍結 + 錄影 + 上傳"]
    Freeze --> Day3
    SageMaker --> Day3
    LocalOnly --> Day3
```

---

## 簡報用：定稿架構 (v1.0)

> 此圖可直接用於提交的技術架構文件

```mermaid
flowchart LR
    subgraph Data["資料層"]
        CSV["Yang Ming<br/>正午報表 CSV<br/>水下報告"]
        CSV --> S3["Amazon S3<br/>raw/ · processed/ · exports/"]
    end

    subgraph Core["確定性計算 (數字唯一來源)"]
        S3 --> CoreCalc["core-calc<br/>Java 純函式庫<br/>零 I/O · 零框架依賴"]
        CoreCalc --> |"全量 FOC<br/>品質旗標<br/>Speed Loss<br/>歸因"| DDB[("Amazon DynamoDB<br/>daily_metrics<br/>vessel_summary")]
        CoreCalc --> Export["FUEL_CONSUMP 提交檔<br/>全量版 + 篩選版<br/>→ S3 exports/"]
    end

    subgraph Serve["服務層 (單服務, 同源)"]
        DDB --> API["Spring Boot 4.1<br/>REST API +<br/>Vanilla JS Dashboard<br/>(同源靜態檔)"]
        API --> |"Converse API<br/>決策簡報 + 事件關聯"| Bedrock["Amazon Bedrock<br/>Claude Haiku 4.5<br/>(inference profile)"]
    end

    subgraph Deploy["部署"]
        ECR["Amazon ECR"] --> ECS["ECS Fargate<br/>ARM64<br/>us-east-1"]
        ECS --> API
    end

    API --> CW["CloudWatch<br/>Logs + Metrics"]

    subgraph Predict["預測管線 (離線)"]
        S3 --> Python["Python 3.12<br/>fleetpredict<br/>GBM baseline"]
        Python --> Submission["submission.csv<br/>102 rows"]
    end

    User["評審 / 陽明專家"] --> API

    S3 -.->|"P2 加分 (Day2 超前才做):<br/>S3 Event → Lambda(core-calc)<br/>自動重算"| CoreCalc
```

---

## 評分權重 vs 架構對應

```mermaid
pie title Yang Ming 評分權重
    "Speed Loss Dashboard 30%" : 30
    "油耗預測正確性 25%" : 25
    "Business Decision 20%" : 20
    "Technical Feasibility 15%" : 15
    "AI Collaboration 10%" : 10
```

```mermaid
flowchart LR
    subgraph Score["評分項目 → 對應元件"]
        S1["Speed Loss 30%"] --> M1["core-calc/SpeedLoss<br/>+ Dashboard SVG chart"]
        S2["油耗預測 25%"] --> M2["predict/ pipeline<br/>→ submission.csv 102行"]
        S3["Business 20%"] --> M3["BusinessImpact<br/>+ BeforeAfter<br/>+ AI Brief"]
        S4["Technical 15%"] --> M4["Docker + ECS<br/>+ Bedrock + CI<br/>+ P2 Lambda 敘事"]
        S5["AI Creative 10%"] --> M5["AiBriefService<br/>guardrail + fallback<br/>+ citation click-back"]
    end
```

---

## 服務使用清單 (現行)

| AWS 服務 | 用途 | 狀態 |
|----------|------|------|
| Amazon ECR | Container image registry | ✅ 已部署 |
| Amazon ECS (Fargate) | ARM64 容器運行 | ✅ 已部署 |
| Amazon S3 | 資料儲存 (raw/processed/exports) | ✅ 已使用 |
| Amazon DynamoDB | Metrics 儲存 (透過 real-metrics.json) | 設計中 |
| Amazon Bedrock | Claude Haiku 4.5 AI 簡報 | ✅ 已驗證 |
| Amazon CloudWatch | 日誌與監控 | ✅ 自動掛載 |
| AWS IAM | 執行角色 + 任務角色 | ✅ 已建立 |

### 明確不使用的服務 (已在 docs/11 評估淘汰)

| 服務 | 淘汰原因 |
|------|----------|
| Amazon RDS / Aurora | 2.7 萬列不需要關聯式 DB |
| Amazon CloudFront | 增加 CORS + 傳播延遲 |
| Amazon QuickSight | 客製天花板 + 陽明已用 Power BI |
| Bedrock Agents | 8-40s 延遲 + 不可控 live demo |
| Amazon SageMaker | 期望值僅 +1-2%，工時不划算 |
| AWS App Runner | 帳號 AccessDenied (實測) |
