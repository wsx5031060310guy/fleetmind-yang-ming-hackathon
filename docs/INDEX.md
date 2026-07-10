# INDEX — 全案總覽（一頁看懂）

> 新成員從這裡開始。這頁回答三件事：專案做什麼、哪份文件是現行真相、你的角色該讀什麼。

## 1. 30 秒版

**FleetMind**：幫陽明海運從 15 艘船 × 5 年正午報表中，偵測船體污損造成的效率衰退（Speed Loss），把「該不該安排水下清潔、划不划算」變成有錢有據的決策支援。AI 不開船——**數字來自計算，語言來自 AI，決策留給人。**

- 賽程：07-14（AWS 辦公室，13:00 起 build）→ 07-15（遠端）→ 07-16（TICC，14:30 上傳死線、15:00 上台 8 分鐘+4 分鐘 Q&A）。
- 評分兩套並存，**55% 主戰場 = Speed Loss dashboard 30%（陽明專家評）+ FUEL_CONSUMP 正確性 25%（程式自動打分）**；其餘商務 20%／技術 15%／AI 創意 10%。

## 2. 現行唯一真相（衝突時以此為準）

| 主題 | 權威文件 |
| --- | --- |
| 定稿架構 | `12` §4（採 `09` §2.2 單服務路線：core-calc Java 純函式庫 + Spring Boot 同源 + S3/DynamoDB/Bedrock） |
| 執行計畫與分工（5 人） | `09` §7 |
| 需求符合度（22 項）與提交缺口 | `12` §1–§3 |
| 差異化與優先級 | `13` §3 |
| 賽前準備 | `14` §1 |
| 簡報 | `10` + `15` + `presentation/fleetmind-proposal-deck.pptx`（9 頁正片 + B1-B15 備援；Day2/Day3 換真數字與截圖） |
| 企業資料應用說明 | `17`（官方提交物草稿；Day1/Day2 補真 schema/列數/檔名） |
| 官方提交控制 | `18`（七項提交物 owner/source/驗證/fallback） |
| 技術架構提交稿 | `19`（短版架構圖、AWS 服務、資料流、AI 邊界、驗證） |
| Day1 schema inventory | `20`（真資料只掃 headers/row counts；mapping template 對齊 core-calc） |
| Day2 stretch gate | `21`（D5-D8/P1 開啟或砍掉的決策表） |
| 重大決策記錄 | `decisions/`（core-calc Java 單服務、全量計算鐵律） |

## 3. 文件地圖

| # | 一句話 | 狀態 |
| --- | --- | --- |
| 00 quick-start | 入門導引 | ✅ 已更新 |
| 01 event-rules | 賽制/議程/七項提交物 | ✅ 事實來源 |
| 02 team | 5 人名單與分工 | ✅ 現行 |
| 03 briefing-notes | 陽明命題與資料邏輯 | ✅ 事實來源 |
| 04 solution-strategy | 產品範圍 MoSCoW | 📚 背景（優先級以 13 為準） |
| 05 architecture-notes | 早期架構筆記 | 📚 背景（以 09/12 為準） |
| 06 demo-storyline | demo 敘事 | ⚠ 三擊版已補，時間以 10 為準 |
| 07 judge-qna | Q&A 防守 15 題 | ✅ 現行 |
| 08 setup-rental-mac | 租借機設定 | ✅ 工具 |
| **09 architecture-and-execution-plan** | **執行藍本：架構/管線/演算法/三天分工** | ✅ **權威** |
| 10 presentation-plan | 8 分鐘 slide 計畫 | ✅ 已回寫 `13` P0 呈現戰術 |
| 11 aws-architecture-options | 六路線比較研究（89KB，看 §1 計分板+§5 裁決即可） | ✅ 決策依據 |
| **12 requirements-fit** | **22 項需求稽核+定稿架構 v1.0** | ✅ **權威** |
| 13 differentiation-strategy | 對手地圖+差異化 backlog | ✅ 待 review 拍板優先級 |
| 14 pre-race-prep | 賽前清單+待回寫追蹤 | ✅ 現行 |
| 15 presentation-readiness-pack | P5 簡報賽前包：假設來源、冷開場、backup slides、提交問題 | ✅ 現行 |
| 16 day1-ops-runbook | Day1 AWS/Bedrock/部署/資料清理執行手冊 | ✅ 現行 |
| 17 enterprise-data-application | 官方「企業資料與資料應用說明」提交草稿 | ✅ 骨架完成 |
| 18 submission-control-sheet | Day3 七項提交物上傳管制表 | ✅ 骨架完成 |
| 19 technical-architecture-submission | 官方「Technical architecture」短版提交稿 | ✅ 骨架完成 |
| 20 day1-schema-inventory | Day1 真資料 schema 掃描與欄位 mapping 流程 | ✅ 賽前可用 |
| 21 day2-stretch-gate | Day2 18:00 stretch 決策與 stop rules | ✅ 賽前可用 |
| presentation/ | 可編輯提案 deck、preview、可重生 source | ✅ 骨架完成 |

## 4. 角色閱讀路徑

- **P5 成員（簡報/提交）**：`02` 分工 → `18` 全文 → `presentation/README.md` → `presentation/fleetmind-proposal-deck.pptx` → `17` 全文 → `19` 全文 → `10` 全文 → `15` 全文 → `13` §3.2 呈現項+§4 → `12` §3（G1/G4/G5 提交缺口）→ `09` §7 只看 P5 欄 → `14` PR-6/PR-9 → 本頁 §6 checklist。
- **工程新人**：`00` → `03` → `09` 全文 → `12` → `20` → `21` → 背景 `05`/`11`。
- **只看架構/部署**：`09` §2 → `12` §4 → `16` → `11` §1 計分板+§5 決策樹 → `decisions/`。
- **賽前最後一天惡補**：README 評分表 → `10` → `13` §1+§5 → `07` 全部 15 題 → `09` §4.4 ISO 偏離表。

## 5. 命名 legend

- **P5 成員** = 第 5 位隊員（PM/簡報）≠ `13` 呈現項 P5（ISO 偏離表進正片）。
- `13` D1–D9 = 產品差異化項；P1–P11 = 呈現差異化項；**P0/P1/P2 單獨出現 = 優先級**。
- 架構 P1/P2 = 部署階段（P1 單服務 default／P2 Lambda 加分），見 `09` §2.2。
- G1–G5 = 提交缺口（`12` §3）；R1–R22 = 題目需求（`12` §1）；PR-1~9 = 賽前準備項（`14` §1）。

## 6. 官方七項提交物 checklist（P5 owner，Day3 12:00–14:00 上傳、不等 14:30 死線）

完整管制表見 `18-submission-control-sheet.md`。

| # | 項目 | 素材來源 |
| --- | --- | --- |
| 1 | 完整提案 deck | `presentation/fleetmind-proposal-deck.pptx` 起手；Day2/Day3 換凍結數字與真截圖 |
| 2 | Challenge link | **定義 Day1 09:40–10:00 向主辦方確認**（`12` G5） |
| 3 | 企業資料與資料應用說明 | `17` 起手；Day1/Day2 補真 schema、列數、檔名與截圖限制 |
| 4 | 技術架構 | `19` 起手；細節回查 `09` §2 + `12` §4 |
| 5 | GitHub repo 連結 | 提交前檢查：無原始資料、無憑證（R19） |
| 6 | Live demo 連結 | 雲端 URL（App Runner/EC2）；本機 fallback 只救上台不救此項 |
| 7 | Demo 錄影連結 | Day3 07:30–11:00 場外錄（與 live demo 同一份凍結快照） |

## 7. Glossary（10 詞白話）

- **noon report 正午報表**：船每天中午回報的航速/油耗/天氣日報——唯一資料源。
- **FOC**（Fuel Oil Consumption）：油耗，單位 MT/day；**Daily FOC** = 官方公式換算的日油耗（自動評分 25% 的標的）。
- **VLSFO 當量**：不同燃料依熱值換算成同一基準，才能互相比較。
- **Speed Loss**：同樣馬力下船變慢了幾 %——船底變髒的訊號（dashboard 30% 的主 KPI）。
- **hull fouling 船體污損**：藤壺/藻類附著增加阻力；嚴重可損 >20% 效率。
- **k 值**：FOC ÷ 船速³，船體阻力的代理指標；污損 → k 上升。
- **ISO 19030**：船體與螺槳性能量測的國際標準（我們的方法論參考系＋偏離表）。
- **before-after**：清潔/拋光前後的 k 值對比 → 清潔回收效率與回本天數。
- **Bedrock**：AWS 的 LLM 服務；只負責把數字解釋成營運語言，不產生數字。
- **noon report 篩選旗標**：WIND_SCALE ≤ 4（好天氣）、HOURS_FULL_SPEED ≥ 22（滿速日）——只標記、不丟列。

## 8. 現況與追蹤

- 已 merge：core-calc + golden checks、business impact、CI checks、single-service API skeleton、AI brief prompt/guardrail、Day1 ops runbook、proposal deck skeleton、enterprise data application draft、submission control sheet、technical architecture submission draft、submission audit、schema inventory pack、demo freeze、FUEL_CONSUMP validator、live warm-up、stretch gate、AI fallback demo control、.env template、submission audit CI、day3 final check。
- 2026-07-10 賽前硬化輪（PR #27-#32）：export 韌性（never-drop + submission profile flags + `--qualified-only` 雙版本）、SpeedLoss 聚合 pipeline（golden tests 進 CI）、互動 dashboard（SVG 趨勢圖 + 切船 + citation 點回）、Bedrock 骨架（`AiBriefService` fallback ladder + 逐 claim citation guardrail）、ops 硬化（curl timeout、probe REQUIRED/OPTIONAL、day3 strict mode、macOS CI）、入口文件同步 + 陽明截圖移出 tracking（git 歷史重寫待團隊決策）。
- 本地可跑：`./scripts/test-core-calc.sh`（含 SpeedLossGoldenTest）、`./scripts/demo-local.sh`、`./scripts/schema-inventory.sh samples/noon-reports.csv`、`./scripts/day3-final-check.sh --dev`；GitHub Actions 跑 Maven package、API smoke、shellcheck 與 macOS job。
- 待回寫：deck 只剩 Day2/Day3 真資料與截圖替換（重產腳本依賴私有 runtime，以 repo 內 pptx 為 canonical）；D5-D8/P1 只依 `21` gate 開啟。
