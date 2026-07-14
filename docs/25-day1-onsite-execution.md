# 25 · Day1 現場執行清單（7/14 開賽 + 7/16 收官）

> **Owner**：P5（節奏）＋ Sunny（技術指揮）。**對象**：4 後端工程師（Feng / Chen / Sunny / Eddie）＋ 1 PM（P5）。
> **目的**：build 大致已完成（core-calc/api/predict/Bedrock client 皆已建好並測過），Day1 是**組裝與接真環境**，不是從零開發。本清單把每個時段拆到「誰、跑哪支 script、什麼算過關」，避免現場亂轉。
> **前置**：授權計畫 = `docs/16`（ops runbook）＋ `docs/18`（提交管制）＋ `docs/22`（官方規則）＋ `docs/23`（預測任務）＋ `docs/24`（現場提問清單）。衝突以官方 7/14 09:40 現場公告為準。
> **地點**：7/14 微風南山 12F（AWS 台北）／7/16 TICC 4F 鳳凰廳（11:30 前完成報到）。
> **region 一律 `us-east-1`**（官方白名單預設；備援 `us-west-2`）。⚠ 所有 script 內建預設是 `ap-northeast-1`，**每次都要先 `export AWS_REGION=us-east-1` 或帶 `--region us-east-1`**。

---

## 0. 已就緒 vs 待現場接（開賽前心智模型）

| 已建好且測過（不要重寫） | Day1/2/3 現場才做 |
| --- | --- |
| core-calc：Daily FOC + SpeedLoss + Attribution（golden test 綠） | 接真資料進 `MetricsExportCli` → dashboard |
| `apps/api` 單一 Spring Boot：真資料 Speed Loss dashboard（`FLEETMIND_METRICS_FILE` 觸發 `RealDataService`） | 產 real-metrics.json、部署上雲、拿 live URL |
| `predict/` pipeline：102 列 `submission.csv`（GBM baseline，模擬遮蔽 RMSE **3.51 MT** / MAPE **5.22%**） | 現場重跑一次、鎖檔、確認交付管道 |
| `AiBriefService` Bedrock client（含 guardrail + fallback ladder） | 設 2 個 env（`AWS_REGION` + `FLEETMIND_BEDROCK_MODEL_ID`）＋ 真 invoke 煙測 |
| 全套 script：probe / bedrock-models / freeze / warmup / day3-final-check / api-smoke | 對真 URL、真檔案跑 |

**責任使用鐵律（違反可能被回收帳號，docs/22 §1）**：S3 一律 Block Public Access；不建 wide-open SG／public RDS/EMR；Bedrock 請求節流、只申請實際需要的模型；賽後帳號自動回收，**要留的資料/程式賽前自行備份**。

---

## 1. Day1 開賽前情報捕捉（09:40–10:40，尚未能動手）

官方議程：09:40 規則/上傳平台說明 → 10:00 命題企業題目+數據說明 → 10:40 開發環境說明 → 13:00 才開放實作。**這段唯一任務＝把下列未定項問到答案並寫進記錄**（提問類不佔 T 時間軸）。

| ☐ | 要問到的事 | 為何關鍵 | 問誰 / 負責人 | 對應 |
| --- | --- | --- | --- | --- |
| ☐ | **油耗預測評分指標＝RMSE？MAPE？其他？** 102 格等權還是逐燃料/逐船加權？比對絕對值還是相對誤差？ | 直接決定 25% 客觀分怎麼優化 | **P5**（10:00 說明會） | `docs/24` A#1 |
| ☐ | **`submission.csv` 交到哪？** 併本組 surveycake 附件，還是另有上傳口？欄位 `ship_id,day,fuel_type,predicted_value`、102 列確認？ | 第 7 項提交物管道 | **P5** | `docs/24` A#2 |
| ☐ | **`predicted_value` 語義**＝當日全速時段實際油量（MT，原欄位），非 24h 正規化？ | 牽動整條校正邏輯 | **Feng** | `docs/24` A#3 |
| ☐ | **是否有即時 leaderboard？可否賽中試交看分？** | 決定 Day2 迭代策略 | **P5** | `docs/24` A#4 |
| ☐ | **Live demo 規則**：評審可否免登入開？需連場地 wifi？**雲端故障可否用錄影替代？** | 決定 fallback 底線 | **Sunny + P5** | `docs/24` E#19 |
| ☐ | deck 收 **PPTX 還是 PDF**？檔案大小限制？企業數據/技術架構併 deck 章節即可？有無官方模板？ | 第 3 項提交物 | **P5** | `docs/18` §2 |
| ☐ | 原始資料 / 截圖 / 錄影可否留在 repo / artifact / 簡報？ | 合規（賽後須刪資料） | **Feng / Sunny** | `docs/18` §2 |
| ☐ | AWS 帳號號碼（全隊同一）、region 白名單、Bedrock 模型申請流程、Kiro credit | 開發環境前提 | **Sunny**（10:40 dev env 說明） | `docs/22` §1 |

> 未問到＝標記「**Day1 現場確認**」，不得用假設值往下做。P5 把答案即時回填到 `docs/18` §2 與 `docs/24`。

---

## 2. Day1 實作時間軸（T+0 = build 開放 ≈ 13:00）

採相對制。所有指令從 **repo 根目錄**執行。先開一個 shell 設好 `export AWS_REGION=us-east-1`。

| ☐ | 時間 | 動作 | Owner | 指令 / 過關條件 |
| --- | --- | --- | --- | --- |
| ☐ | T+0–T+15 | AWS 憑證到手驗證 | Sunny + P5 | `export AWS_REGION=us-east-1`；`aws sts get-caller-identity --region "$AWS_REGION"` 回帳號＝過 |
| ☐ | T+15–T+35 | AWS 權限探測（REQUIRED/OPTIONAL 分流）＋ 列 Bedrock 模型 | Sunny | `./scripts/probe.sh --region "$AWS_REGION"`；`./scripts/bedrock-models.sh --region "$AWS_REGION"` |
| ☐ | T+15–T+35（平行） | 資料上 S3（**Block Public Access**） | Sunny | `aws s3 cp data/ s3://<bucket>/data/ --recursive --region "$AWS_REGION"`（bucket 名 = Day1 現場確認） |
| ☐ | T+20–T+40 | 挑真 Bedrock model id → **真 invoke 煙測** | Eddie | `export FLEETMIND_BEDROCK_MODEL_ID=<model-or-inference-profile-id>`；`./scripts/probe.sh --region "$AWS_REGION" --bedrock-model-id "$FLEETMIND_BEDROCK_MODEL_ID"`（`bedrock invoke model` PASS＝過） |
| ☐ | T+15–T+50（平行） | 產真 dashboard metrics JSON | Feng + Chen | `MAIN_CLASSES="$(./scripts/compile-core-calc.sh)"`；`java -cp "$MAIN_CLASSES" com.fleetmind.corecalc.MetricsExportCli --data-dir data --out core-calc/target/real-metrics.json`（印出 `events mapped: 77; out-of-range: 0`＝過） |
| ☐ | T+15–T+50（平行） | 重跑預測 pipeline → 鎖 `submission.csv` | Feng | `cd predict && uv run python -m fleetpredict all && uv run pytest tests -q`（`output/submission.csv` 恰 102 列、pytest 綠＝過；印出 `selected model: GBM baseline`） |
| ☐ | T+30–T+50 | 裁決部署路線（見 §5） | Sunny + Eddie | App Runner → ECS Express → EC2 docker，30 分內定案 |
| ☐ | T+50–T+120 | 第一個雲端 `/api/health` URL 上線 | Sunny | 部署後 `BASE_URL=<cloud-url> ./scripts/api-smoke.sh` 全綠 |
| ☐ | T+50–T+120（平行） | 接 RealDataService（真資料進 dashboard） | Feng + Eddie | 起服務時帶 `FLEETMIND_METRICS_FILE="$PWD/core-calc/target/real-metrics.json"`（或 `--fleetmind.metrics-file=`絕對路徑）；`/api/fleet/summary` 出現 `S11`/`S23` 等真船＝過 |
| ☐ | 部署後 | 開 Bedrock 真路徑（2 個 env） | Eddie | 服務環境設 `AWS_REGION=us-east-1` + `FLEETMIND_BEDROCK_MODEL_ID`；`POST /api/vessels/{id}/ai-brief` 回 `"passed":true`（不通留 deterministic fallback，不阻塞） |
| ☐ | T+120 | 第一個雲端 health URL 寫入提交 checklist | P5 | URL 記入 `build/submission-links.txt` |
| ☐ | T+240 | sample→real 垂直切片跑通 | 全員 | 真資料進 dashboard + `submission.csv` 鎖定；三擊主線（Fleet → Vessel/before-after → AI brief citation）可 demo |
| ☐ | 16:00 | 抽發表順序（記錄到 deck 節奏） | P5 | — |
| ☐ | 收工前 | demo URL / repo URL / fallback 錄影方案全寫入 `docs/18` checklist | P5 | 三者皆有可上傳版本 |

---

## 3. Day2（7/15 遠端）— 迭代與定稿

**只在 §5 主分數門檻通過後才碰 stretch。** 三件事：模型迭代、dashboard 打磨、deck 換真數字/真截圖。

| ☐ | 動作 | Owner | 過關 |
| --- | --- | --- | --- |
| ☐ | 預測特徵/驗證迭代（仍以「模擬遮蔽 RMSE 最小」選型，別用隨機 K-fold 當唯一指標） | Feng + Chen | `uv run pytest tests -q` 綠；RMSE/MAPE 逐燃料/逐船分解可講 |
| ☐ | 真資料 dashboard 打磨（切船、事件標記、before-after、quality flag） | Feng | live/local URL 三擊順 |
| ☐ | Bedrock 反事實數字接進 AI brief citations | Eddie | guardrail `passed=true`、citation 可點回 |
| ☐ | 部署穩定 + CloudWatch + fallback 路徑 | Sunny | `warmup-live-demo.sh` 可跑 |
| ☐ | deck 換真 money number / 真截圖（正片可講 8 分鐘） | P5（工程只供截圖/數字） | 無缺 money number/架構頁/方法論頁 |
| ☐ | **Day2 18:00 stretch gate**（`docs/21`）：問三句——55% 主分全通？deck 可講 8 分？還有幾工程小時可冒險？ | 全員 | 4/6 以下＝全砍 stretch 進穩定化；6/6＝可開 P1，限 2h timebox |

> **stretch stop rules**：任何 stretch 弄壞 `demo-local`/api-smoke/submission-audit、需 raw data 進 repo、需新 AWS service/IAM role → 立刻 revert。Day3 07:30 後不新增 stretch。

---

## 4. Day3（7/16）收官 11:30–14:30

死線 **14:30**，逾時視同放棄。**內部硬規則：14:00 前完成上傳，14:00 後只修阻塞、不新增功能、不換故事線。**
> 建議 Day2 深夜先對 live URL 做一次 freeze/warmup **乾跑**；Day3 現場 11:00–11:30 報到後，11:30 起做真凍結。

| ☐ | 時間 | 動作 | Owner | 指令 / 過關 |
| --- | --- | --- | --- | --- |
| ☐ | 11:30–12:00 | 凍結 demo 快照（API/AI/export 輸出 + checksum） | Sunny + Feng | `BASE_URL=<live-url> ./scripts/freeze-demo-snapshot.sh --out build/demo-freeze`（`manifest.txt` 存在＝過） |
| ☐ | 11:30–12:00（平行） | 產最終 `submission.csv`＋鎖數字 | Feng | `cd predict && uv run python -m fleetpredict all && uv run pytest tests -q`（102 列、pytest 綠）；數字一旦進 deck/錄影不再重算除非 blocking |
| ☐ | 12:00–12:20 | live URL 暖機（評審開之前） | Sunny | `BASE_URL=<live-url> ./scripts/warmup-live-demo.sh --repeat 3`（`live demo warmup passed`） |
| ☐ | 12:00–12:20（平行） | 錄 demo 影片（health→fleet ranking→before-after→AI brief） | P5 + operator | 可播放、長度/格式符合平台限制（限制 = Day1 現場確認） |
| ☐ | 12:20–12:40 | **day3-final-check 嚴格模式**（repo 安全 + FUEL_CONSUMP + branch） | Sunny + P5 | `FINAL_FUEL_CONSUMP=<final.csv> OFFICIAL_ROW_COUNT=<官方列數> BASE_URL=<live-url> ./scripts/day3-final-check.sh`（印 `day3 final check passed`） |
| ☐ | 12:40–14:00 | **surveycake 七項上傳**（見下方順序），每項截圖存證 | P5（primary）+ Sunny（shadow） | 每項上傳成功畫面截圖存 `build/`；連結回填 `build/submission-links.txt` |
| ☐ | 上傳後 | 第二人用另一台機器/無痕開每個連結驗證 | Sunny | 任一打不開→立即重傳/換備援連結 |
| ☐ | 14:00–14:30 | 緩衝：只驗證、不動內容 | P5 + shadow | 不新增功能、不換故事線 |

**surveycake 上傳順序（先上不會再變的，live/錄影連結最後填）**：

| # | 提交物 | 來源 | Owner |
| --- | --- | --- | --- |
| ① | 團隊基本資料 | `docs/02` | P5 |
| ② | 提案大綱 | `docs/10`/`13` | P5 |
| ③ | 完整提案簡報（**含企業數據/技術架構章節**；**PPTX + PDF、字型內嵌/轉外框**） | `presentation/…deck.pptx` + `docs/17`/`19`/`07` | P5 |
| ④ | GitHub repo 連結（`origin` = wsx5031060310guy/…，main 綠、無 raw data/憑證/未 merge branch） | README | Sunny + P5 |
| ⑤ | Live demo 連結（`/api/health` OK、免登入） | 雲端 URL | Sunny |
| ⑥ | Demo 錄影連結 | Day3 錄影 | P5 |
| ⑦ | **預測結果檔 `submission.csv`（陽明限定）** | `predict/output/submission.csv`（102 列） | **Feng** |

> **單點故障防護**：shadow uploader = **Sunny**；兩台 Mac 都預先登入 surveycake 並驗上傳權限；七項最終值另存 `build/submission-links.txt` + 列印一份；離線提交包（七項檔案 + 連結清單）存兩台機器 + 隨身碟/雲端。P5 機器掛→shadow 依離線包續傳。

---

## 5. Go/No-go 門檻與 fallback 觸發

**主分數門檻（Speed Loss 30% + 預測 25% = 55%）未全通 → P1/P2 stretch 全砍（`docs/21` 鐵律）。**

| 故障 | 觸發判斷 | 立即做法 | 提交策略 |
| --- | --- | --- | --- |
| Bedrock invoke 不通 | probe `invoke model` FAIL 30 分內不通 | 保留 deterministic AI brief fallback；不再追 model access | 不阻塞七項提交 |
| 評審要看 AI 失敗模式 | 現場要求 | UI `Force fallback` 或 `POST /api/vessels/{id}/ai-brief?forceFallback=true` | dashboard/export 照常 |
| App Runner 不可建 | `create-service` 30 分內無路徑 | 轉 **ECS Express Mode**（需 ECR image + `ecsTaskExecutionRole` + `ecsInfrastructureRoleForExpressServices`） | live URL 填可用雲端 URL |
| ECS 也不通 | Express 亦失敗 | **EC2 docker**：`docker build -f apps/api/Dockerfile -t fleetmind-api .`；`docker run -p 8080:8080 fleetmind-api` | 同上 |
| 雲端 live URL 全掛 | warmup 連 15 分不通 | 上台用本機/錄影；平台填錄影連結 + 說明（**Day1 需先問是否可接受**） | P5 記錄主辦答案 |
| 任何部署路線影響 core-calc/預測正確性 | 計算被污染 | 砍部署路線、回本機/EC2 | 保住 55% 主分 |
| FUEL_CONSUMP 格式未定 | 官方精度/rounding 未答 | 同產 full + `--qualified-only` 版，確認後擇一 | 不讓 dashboard filter 影響提交檔 |
| deck 真截圖來不及 | 07:30 後仍缺 | 用凍結數字 + 現場 demo 展示 | 不延誤上傳 |

---

## 6. Owner 矩陣與出發前 kit

**Owner 矩陣**

| 人 | 主責 | Day3 收官角色 |
| --- | --- | --- |
| **Feng** | 預測 pipeline / `submission.csv` / 資料語義 / metrics 匯出 | 產最終 `submission.csv`（第 7 項 owner）+ freeze |
| **Chen** | core-calc 計算正確性 / Speed Loss / 特徵 | 陪 Feng 驗證、數字一致性 |
| **Sunny** | AWS 環境 / 部署路線 / CloudWatch / repo 安全 | **shadow uploader** + URL health + freeze/warmup + day3-final-check |
| **Eddie** | Bedrock（2 env + smoke）/ AI brief citations / RealDataService 接線 | AI brief / API 煙測 |
| **P5** | 提交管制 / deck / surveycake / 現場提問記錄 | **primary uploader** + 錄影 + 節奏控管 |

**出發前 kit（賽前備齊）**

| ☐ | 項目 | 負責 |
| --- | --- | --- |
| ☐ | **隊長：身分證影本 + 匯款存摺影本**（領獎用；獎金 ≥NT$20,000 依法代扣 10%/20%） | 隊長 |
| ☐ | 全員筆電（自備開發用；**上台簡報用主辦電腦投影**） | 全員 |
| ☐ | deck **PPTX + PDF 兩版，字型內嵌/轉外框**（他機可開） | P5 |
| ☐ | 離線提交包：七項檔案 + `build/submission-links.txt` + 列印一份，存兩台機器 + 隨身碟/雲端 | P5 + Sunny |
| ☐ | 兩台 Mac 預登入 surveycake 並驗上傳權限 | P5 + Sunny |
| ☐ | Kiro 賽前每人裝好 + 註冊（有 credit 額度，省用） | 全員 |
| ☐ | AWS Summit Taipei 各自報名完成（先 1F 大會報到再 4F 競賽報到） | 全員 |
| ☐ | 行前信/入場邀請函（2F 閘門出示） | 全員 |

> **完賽證明**：全員須實體出席 7/14 + 7/16（開幕/提交/頒獎），違規可取消資格與獎金。
