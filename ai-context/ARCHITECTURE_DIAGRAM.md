# FleetMind 系統流程架構圖

> 此文件供 AI Agents (Claude / Codex / Kiro) 參考，用於理解專案完整架構後執行各自分工任務。
> 最後更新：2026-07-14

---

## 1. 高層架構總覽

```mermaid
graph TB
    subgraph FleetMind System
        Frontend["Frontend<br/>(vanilla JS, same-origin)"]
        API["Spring Boot API<br/>(apps/api, Port 8080)"]
        Predict["Python Predict Pipeline<br/>(predict/, offline)"]

        Frontend <-->|REST| API

        subgraph Dependencies
            CoreCalc["core-calc<br/>(pure Java lib)"]
            Bedrock["AWS Bedrock<br/>(Claude/Nova)"]
            Storage["S3 / DynamoDB"]
        end

        API --> CoreCalc
        API --> Bedrock
        API --> Storage
        Predict --> |"output/submission.csv<br/>(102 rows)"| Submission["Submission File"]
    end
```

---

## 2. 模組分層架構

```mermaid
graph TD
    subgraph Deployment["Deployment Layer"]
        Docker["Docker (ECR) → ECS Fargate ARM64<br/>或 App Runner / EC2 docker fallback"]
    end

    subgraph API["apps/api (Spring Boot 4.1)"]
        Controller["FleetMindController (REST)<br/>/api/health<br/>/api/fleet/summary<br/>/api/vessels/{id}/*<br/>/api/data-quality/summary<br/>/api/fuel-consump/export"]
        DataProvider["FleetDataProvider (interface)"]
        Demo["DemoDataService"]
        Real["RealDataService"]
        AiBrief["AiBriefService<br/>Converse → Guardrail → Cache → Fallback"]
        Dashboard["Static Dashboard (vanilla JS)<br/>SVG chart + vessel switching"]

        DataProvider --> Demo
        DataProvider --> Real
        Controller --> DataProvider
        Controller --> AiBrief
    end

    subgraph CoreCalc["core-calc (pure Java lib)"]
        Calc["CoreCalc (Daily FOC)"]
        SpeedLoss["SpeedLoss (ISO 19030)"]
        Impact["BusinessImpact (ROI/EU ETS)"]
        Attr["Attribution (hull/prop)"]
        Export["FuelConsumpExportCli (CSV)"]
        Metrics["MetricsExportCli (JSON)"]
    end

    subgraph PredictPipeline["predict/ (Python 3.12)"]
        Load["load.py → 讀取 CSV"]
        Anchor["anchor.py → event_day 對齊"]
        Features["features.py → 特徵工程"]
        Models["models.py → GBM/物理/混合"]
        Validate["validate.py → 洩漏控制驗證"]
        Submit["submit.py → submission.csv"]
        CLI["cli.py → orchestrator"]

        CLI --> Load --> Anchor --> Features --> Models --> Validate --> Submit
    end

    Docker --> API
    API --> CoreCalc
```

---

## 3. 資料流程圖 (Data Flow)

```mermaid
flowchart TD
    Data["Yang Ming 提供資料<br/>vt_fd.csv (午報)<br/>maintenance.csv (水下作業)<br/>15 艘船, 2021-2025"]

    Data --> CoreCalcPipe["core-calc Pipeline"]
    Data --> PredictPipe["predict Pipeline"]

    subgraph CoreCalcPipe["core-calc Processing"]
        C1["1. 讀入 CSV"]
        C2["2. VLSFO 正規化 (LCV 換算)"]
        C3["3. Daily FOC 計算 (每行無條件)"]
        C4["4. QualityFlag 標記<br/>WIND_SCALE>4 / HOURS<22"]
        C5["5. Speed Loss 計算<br/>(同速帶/滾動中位)"]
        C6["6. Before/After 比對"]
        C7["7. Business Impact<br/>(EU ETS / payback)"]
        C1 --> C2 --> C3 --> C4 --> C5 --> C6 --> C7
    end

    subgraph PredictPipe["predict Processing"]
        P1["1. load_dataset()"]
        P2["2. solve_anchor()"]
        P3["3. build_features()<br/>fouling clocks / propulsion / environment"]
        P4["4. validate_models()<br/>Extended sim-mask / GroupKFold"]
        P5["5. fit_named_model()"]
        P6["6. predict_submission_rows()"]
        P7["7. write_submission()<br/>→ submission.csv (102 rows)"]
        P1 --> P2 --> P3 --> P4 --> P5 --> P6 --> P7
    end

    CoreCalcPipe --> MetricsJSON["MetricsExportCli<br/>→ real-metrics.json"]
    MetricsJSON --> RealData["RealDataService<br/>(FLEETMIND_METRICS_FILE)"]
    RealData --> SpringAPI["Spring Boot API<br/>+ AiBriefService → Bedrock"]
    SpringAPI --> DashboardUI["Dashboard<br/>(前端即時呈現)"]
```

---

## 4. API 端點清單

| Method | Path | 功能 | 資料來源 |
|--------|------|------|----------|
| GET | `/api/health` | 健康檢查 | 即時 |
| GET | `/api/fleet/summary` | 船隊總覽 (15 vessels) | FleetDataProvider |
| GET | `/api/vessels/{id}/performance` | 單船每日效能指標 | FleetDataProvider |
| GET | `/api/vessels/{id}/underwater-events` | 水下作業事件列表 | FleetDataProvider |
| GET | `/api/vessels/{id}/before-after?eventId=` | 事件前後比較 + 商業影響 | FleetDataProvider |
| POST | `/api/vessels/{id}/ai-brief` | AI 營運摘要 (Bedrock/fallback) | AiBriefService |
| GET | `/api/vessels/{id}/ai-brief/prompt` | 查看 AI prompt 構造 | AiBriefService |
| GET | `/api/data-quality/summary` | 資料品質統計 | FleetDataProvider |
| GET | `/api/fuel-consump/export` | FUEL_CONSUMP CSV 匯出 | FleetDataProvider |

---

## 5. AI Bedrock 整合流程

```mermaid
flowchart TD
    Request["POST /api/vessels/{id}/ai-brief"]
    Request --> CheckConfig{"AWS_REGION &<br/>BEDROCK_MODEL_ID<br/>configured?"}

    CheckConfig -->|NO| DetFallback["Return deterministic<br/>fallback text"]

    CheckConfig -->|YES| BuildPrompt["Build prompt:<br/>AiBriefPrompt.system()<br/>+ buildUserPrompt()<br/>+ citations + metrics"]

    BuildPrompt --> CallBedrock["Bedrock Converse API<br/>maxTokens=600, temp=0.2<br/>timeout=10s, retry=1"]

    CallBedrock -->|SUCCESS| Guardrail{"AiBriefGuardrail<br/>.validate()"}
    CallBedrock -->|FAIL| FallbackLadder

    Guardrail -->|PASSED| ReturnBedrock["Return bedrock response<br/>+ cache as last-good"]
    Guardrail -->|REJECTED| FallbackLadder

    subgraph FallbackLadder["Fallback Ladder"]
        Cached{"Cached last-good<br/>exists?"}
        Cached -->|YES| ReturnCached["Return cached-bedrock"]
        Cached -->|NO| ReturnDet["Return deterministic-fallback"]
    end
```

---

## 6. 部署架構 (AWS)

```mermaid
graph TB
    subgraph AWS["AWS Cloud (Event Account)"]
        subgraph ECR["ECR (Container Registry)"]
            Image["fleetmind-api:latest<br/>(ARM64 multi-stage build)"]
        end

        subgraph Compute["ECS Fargate / App Runner / EC2"]
            Container["fleetmind-api container<br/>Spring Boot 4.1 + Java 21<br/>Port 8080<br/>Health: GET /api/health"]
        end

        subgraph Services["AWS Services"]
            S3["S3<br/>(data storage)"]
            DynamoDB["DynamoDB<br/>(metrics)"]
            BedrockSvc["Bedrock<br/>(Claude/Nova)"]
        end

        subgraph Observability["Observability"]
            CW["CloudWatch<br/>(logs / alarms)"]
        end

        ECR --> Compute
        Container --> S3
        Container --> DynamoDB
        Container --> BedrockSvc
        Container --> CW
    end

    User["User / Judge Browser"] --> Container
```

---

## 7. 關鍵類別/模組對照表

### core-calc (com.fleetmind.corecalc)

| 類別 | 職責 |
|------|------|
| `CoreCalc` | Daily FOC = ME_FULLSPEED_CONSUMP / HOURS * 24 |
| `SpeedLoss` | ISO 19030 Speed Loss 聚合 (reference window, speed band, rolling median, Theil-Sen, before-after) |
| `BusinessImpact` | 年化燃料成本、CO₂、EU ETS、payback days |
| `Attribution` | Hull vs propeller 歸因 (ISO 19030 framing) |
| `FuelConsumpExportCli` | FUEL_CONSUMP CSV 匯出 (crash-proof, never drop rows) |
| `MetricsExportCli` | real-metrics.json 輸出給 API |
| `QualityFlag` | 品質旗標邏輯 (WIND_SCALE, HOURS_FULL_SPEED) |
| `FuelType` / `FuelMass` | 燃料 LCV 轉換 (HFO=40.2, VLSFO=40.2, ULSFO=41.2, MGO=42.7) |

### apps/api (com.fleetmind.api)

| 類別 | 職責 |
|------|------|
| `FleetMindController` | REST endpoints |
| `FleetDataProvider` | 資料提供介面 |
| `FleetDataConfiguration` | Bean wiring (FLEETMIND_METRICS_FILE 切換 demo/real) |
| `RealDataService` | 讀 real-metrics.json 提供真實資料 |
| `DemoDataService` | 硬編碼示範資料 (fallback) |
| `AiBriefService` | Bedrock Converse + guardrail + fallback ladder |
| `AiBriefGuardrail` | 數值守門 (AI 輸出 vs 確定性計算比對) |
| `AiBriefPrompt` | System/User prompt 構造 |

### predict/ (Python — fleetpredict)

| 模組 | 職責 |
|------|------|
| `load.py` | 讀取 vt_fd.csv + maintenance.csv |
| `anchor.py` | event_day 直接 join (maintenance → vt_fd.NOON_UTC) |
| `features.py` | 特徵工程 (fouling clocks, propulsion, loading, direction, ship/fuel) |
| `models.py` | GBM baseline / GBM+fouling / Physics / Blend 四組候選模型 |
| `validate.py` | Extended sim-mask + GroupKFold 驗證；自動選出 min RMSE 模型 |
| `submit.py` | 產出 submission.csv (102 rows, 正向有限值, 上限裁剪) |
| `external.py` | 外部 SST/洋流 join (OFF by default) |
| `cli.py` | 一鍵 `uv run python -m fleetpredict all` |

---

## 8. 環境變數

| 變數 | 用途 | 必要性 |
|------|------|--------|
| `AWS_REGION` | Bedrock 與 AWS 服務 region | Bedrock 必要 |
| `FLEETMIND_BEDROCK_MODEL_ID` | Bedrock model ID | Bedrock 必要 |
| `FLEETMIND_METRICS_FILE` | real-metrics.json 路徑 | Real data 必要 |
| `PORT` | HTTP port (default 8080) | 選用 |
| `FINAL_FUEL_CONSUMP` | Day3 final check 用 | Day3 |
| `OFFICIAL_ROW_COUNT` | Day3 final check 用 | Day3 |
| `BASE_URL` | Live demo URL | Day3 |

---

## 9. 腳本工具鏈

```mermaid
graph LR
    subgraph Testing["Testing & Validation"]
        T1["test-core-calc.sh<br/>golden tests"]
        T2["demo-local.sh<br/>端對端 smoke"]
        T3["validate-fuel-consump.sh<br/>CSV 驗證"]
        T4["api-smoke.sh<br/>API 煙測"]
    end

    subgraph Export["Export & Build"]
        E1["export-fuel-consump.sh<br/>CSV 匯出"]
        E2["business-impact.sh<br/>商業影響"]
        E3["compile-core-calc.sh<br/>javac 編譯"]
    end

    subgraph AWS_Ops["AWS Operations"]
        A1["probe.sh<br/>權限檢查"]
        A2["bedrock-models.sh<br/>模型列表"]
        A3["deploy-verify.sh<br/>部署驗證"]
    end

    subgraph Day3["Day3 Submission"]
        D1["schema-inventory.sh<br/>欄位盤點"]
        D2["freeze-demo-snapshot.sh<br/>demo 快照"]
        D3["warmup-live-demo.sh<br/>暖機"]
        D4["submission-audit.sh<br/>提交審計"]
        D5["day3-final-check.sh<br/>最終檢查"]
        D6["cleanup-event-data.sh<br/>賽後清除"]
    end
```

---

## 10. 建置與執行指令

```bash
# === Java (Maven multi-module) ===
mvn -pl apps/api -am clean package -DskipTests   # 建置 API jar
java -jar apps/api/target/fleetmind-api-0.1.0-SNAPSHOT.jar  # 啟動

# === Docker ===
docker build -f apps/api/Dockerfile -t fleetmind-api .
docker run -p 8080:8080 \
  -e FLEETMIND_METRICS_FILE=/app/real-metrics.json \
  -e AWS_REGION=ap-northeast-1 \
  -e FLEETMIND_BEDROCK_MODEL_ID=<model-id> \
  fleetmind-api

# === Python Prediction ===
cd predict
uv run python -m fleetpredict all       # 跑全部pipeline
uv run pytest tests -q                  # 跑測試

# === 驗證 ===
./scripts/test-core-calc.sh             # golden tests
./scripts/demo-local.sh                 # 端對端 demo
./scripts/api-smoke.sh                  # API 煙測
./scripts/day3-final-check.sh --dev     # Day3 檢查 (開發模式)
```

---

## 11. Commit 歷程摘要 (開發階段)

```mermaid
gitGraph
    commit id: "Initial setup"
    branch Eddie425/scaffold
    commit id: "PR#1-26: Architecture, CI, API skeleton"
    commit id: "PR#27: Export resilience"
    commit id: "PR#28: Ops hardening"
    commit id: "PR#29: SpeedLoss pipeline"
    commit id: "PR#30: Interactive dashboard"
    commit id: "PR#31: Docs compliance"
    commit id: "PR#32: Bedrock skeleton"
    commit id: "PR#33-36: Status rollup, rules, attribution"
    checkout main
    merge Eddie425/scaffold id: "Phase 1 complete"
    branch wsx5031060310guy/features
    commit id: "PR#1: Fuel prediction pipeline"
    commit id: "PR#2-3: Questions + real data dashboard"
    commit id: "PR#4-6: event_day corrections"
    commit id: "PR#7-9: Submission refresh + fixes"
    commit id: "PR#10-12: Deck + deploy hardening"
    commit id: "PR#13-14: Predict safety + guardrail fix"
    commit id: "PR#15: AWS live deploy recipe"
    checkout main
    merge wsx5031060310guy/features id: "Phase 2 complete (HEAD)"
```

### Phase 1: 基礎建設 (Eddie — PR #1~#36)
- 架構文件、CI、API skeleton、golden tests
- core-calc: Daily FOC + Speed Loss + Business Impact + Attribution
- apps/api: Spring Boot + static dashboard + Bedrock skeleton
- 運維腳本全套、部署驗證、合規檢查

### Phase 2: 真實資料整合 (Feng — PR #1~#15)
- PR #1: fuel prediction pipeline (25% deliverable)
- PR #3: 真實資料 Speed Loss dashboard
- PR #6: predict pipeline 整合 event_day
- PR #10~#11: 簡報重建 + Day1 checklist
- PR #13: prediction safety guard
- PR #14: Bedrock prompt guardrail fix
- PR #15: AWS live deploy recipe (ECR + ECS Fargate + Bedrock)

---

## 12. 評分對應模組

```mermaid
pie title Yang Ming 評分權重 vs 模組
    "Speed Loss Dashboard (30%)" : 30
    "FUEL_CONSUMP 正確性 (25%)" : 25
    "Business Decision Value (20%)" : 20
    "Technical Feasibility (15%)" : 15
    "AI Collaboration (10%)" : 10
```

| 評分項目 (權重) | 對應模組/功能 |
|----------------|---------------|
| Speed Loss Dashboard (30%) | core-calc/SpeedLoss + apps/api dashboard (SVG chart + vessel switching) |
| FUEL_CONSUMP 正確性 (25%) | predict/ pipeline → submission.csv (102 rows, RMSE ~3.5 MT) |
| Business Decision Value (20%) | core-calc/BusinessImpact + BeforeAfter + AI Brief |
| Technical Feasibility (15%) | Docker + ECS + Bedrock + CI/CD + golden tests |
| AI Collaboration Creativity (10%) | AiBriefService (Bedrock + guardrail + fallback) + AI agent 工作流程 |

---

## 13. 給其他 AI Agent 的執行指引

```mermaid
flowchart LR
    Task{"你的任務是什麼？"}

    Task -->|"修改 Speed Loss"| SL["修改 core-calc/SpeedLoss.java<br/>驗證: ./scripts/test-core-calc.sh"]
    Task -->|"修改 API"| AP["修改 FleetMindController.java<br/>+ FleetDataProvider + implementations<br/>驗證: mvn -pl apps/api -am package"]
    Task -->|"修改 Dashboard"| FE["修改 static/app.js + index.html + styles.css<br/>無需建置，same-origin serve"]
    Task -->|"修改 AI Brief"| AI["修改 AiBriefService.java<br/>+ AiBriefPrompt.java<br/>+ AiBriefGuardrail.java"]
    Task -->|"改善預測模型"| ML["修改 predict/models.py + features.py<br/>驗證: uv run python -m fleetpredict all<br/>確認 submission.csv = 102 行"]
    Task -->|"部署"| DEP["參考 docs/26-aws-live-deploy.md<br/>docker build → push ECR → update ECS"]
```

### 詳細指引

- **Speed Loss 計算邏輯** → `core-calc/src/main/java/com/fleetmind/corecalc/SpeedLoss.java`
- **API endpoints** → `apps/api/src/main/java/com/fleetmind/api/FleetMindController.java`
- **前端 Dashboard** → `apps/api/src/main/resources/static/app.js` + `index.html` + `styles.css`
- **AI Brief / Bedrock** → `AiBriefService.java` + `AiBriefPrompt.java` + `AiBriefGuardrail.java`
- **預測模型** → `predict/src/fleetpredict/models.py` + `features.py`
- **部署** → `docs/26-aws-live-deploy.md` + `apps/api/Dockerfile`

---

## 14. 鐵律 (Iron Rules)

1. **Daily FOC 每行無條件計算** — filter 只設 quality flag，不刪行
2. **Bedrock 只解釋不計算** — 數字永遠來自 core-calc 確定性計算
3. **submission.csv 永遠 102 行** — 正向有限值，六位小數
4. **不使用 RDS / CloudFront / QuickSight / Bedrock Agents** — 已在 docs/11 評估淘汰
5. **Dashboard 是 vanilla JS** — 不引入 React/Vue/Angular

---

## 15. 目錄結構速查

```
fleetmind-yang-ming-hackathon/
├── pom.xml                          # 根 POM (multi-module)
├── AGENTS.md                        # AI agent 指令
├── README.md                        # 專案總覽
├── .env.example                     # 環境變數模板
├── ai-context/
│   ├── PROJECT_CONTEXT.md           # 完整 AI context
│   ├── ASK_AI_PROMPT.md             # 初始 AI prompt
│   └── ARCHITECTURE_DIAGRAM.md      # ← 本文件
├── apps/api/
│   ├── Dockerfile                   # 多段建置
│   ├── pom.xml                      # API module POM
│   └── src/main/
│       ├── java/com/fleetmind/api/  # Java 源碼
│       └── resources/static/        # 前端 (HTML/JS/CSS)
├── core-calc/
│   ├── pom.xml                      # 計算庫 POM
│   └── src/main/java/com/fleetmind/corecalc/  # 純函數計算
├── predict/
│   ├── pyproject.toml               # Python 專案設定
│   ├── data/                        # 輸入資料
│   ├── output/                      # submission.csv 輸出
│   └── src/fleetpredict/            # pipeline 源碼
├── docs/                            # 26 份文件 + INDEX
├── scripts/                         # 運維腳本
├── presentation/                    # 簡報 (PPTX)
└── .github/workflows/checks.yml     # CI
```

---

## 16. 完整系統序列圖 (使用者操作流程)

```mermaid
sequenceDiagram
    participant User as 使用者/評審
    participant Dashboard as Dashboard (JS)
    participant API as Spring Boot API
    participant Provider as FleetDataProvider
    participant CoreCalc as core-calc
    participant Bedrock as AWS Bedrock
    participant Guardrail as AiBriefGuardrail

    User->>Dashboard: 開啟首頁
    Dashboard->>API: GET /api/fleet/summary
    API->>Provider: fleetSummary()
    Provider-->>API: List<VesselSummaryDto>
    API-->>Dashboard: JSON response
    Dashboard-->>User: 顯示船隊總覽表

    User->>Dashboard: 點選船隻
    Dashboard->>API: GET /api/vessels/{id}/performance
    API->>Provider: performance(vesselId)
    Provider-->>API: List<DailyMetricDto>
    API-->>Dashboard: JSON response
    Dashboard-->>User: 繪製 SVG 趨勢圖

    User->>Dashboard: 點擊 "Generate AI Brief"
    Dashboard->>API: POST /api/vessels/{id}/ai-brief
    API->>Provider: aiBrief(vesselId, false)
    Provider->>CoreCalc: 計算 citations (確定性數字)
    CoreCalc-->>Provider: CitedMetricDto list
    Provider->>Bedrock: Converse (prompt + citations)
    Bedrock-->>Provider: AI generated text
    Provider->>Guardrail: validate(text, citations)
    Guardrail-->>Provider: passed/rejected
    Provider-->>API: AiBriefDto
    API-->>Dashboard: JSON response
    Dashboard-->>User: 顯示 AI 營運摘要 + citations
```
