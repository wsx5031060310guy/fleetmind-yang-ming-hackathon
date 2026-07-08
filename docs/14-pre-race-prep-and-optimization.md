# 賽前準備與剩餘優化方向（Pre-Race Prep & Remaining Optimization）

> 目的：把 09–13 的規劃收斂成「開賽前（2026-07-05 ~ 07-13）就能先做完的事」＋「文件體系還缺什麼」，讓 Day1 一到現場就進入高速執行，不浪費現場的 13:00–17:00。
> 原則：真實資料與比賽帳號要 07-14 才拿到，但**腳本、骨架、測試、演練、模板**全部可以提前。賽前每提前 1 人時，等於現場多 1 人時打磨 55% 硬盤。
> 狀態：Draft，待團隊 review。

## 1. 賽前準備清單（07-05 ~ 07-13，總預算 ~20 人時）

團隊 5 人都有正職，賽前只求把「一定要有、且不依賴真實資料/帳號」的東西先備好。

### 1.1 P0 — 不先做會直接拖慢 Day1

| # | 項目 | 內容 | Owner | 工時 |
| --- | --- | --- | --- | --- |
| PR-1 | **core-calc 函式庫骨架 + 介面凍結** | 用假資料先寫好 `core-calc` 的公開介面（`filterFlags()`／`vlsfoEquiv()`／`dailyFOC()`／`speedLoss()`／`beforeAfter()`）與資料結構（NoonReportDaily／DailyMetric／VesselSummary）。純函式、無 I/O，Day1 拿到真欄位只改欄位映射 | Chen | 4h |
| PR-2 | **golden case 測試先寫（假資料）** | VLSFO 換算與 Daily FOC 的 ≥10 個手算案例（多燃料、HOURS=0、邊界 22h、風力 4 級）先寫成單元測試，Day1 資料一到即可跑驗證 | Feng | 3h |
| PR-3 | **權限探測 checklist 腳本預寫** | 一支 `probe.sh`：建 S3 bucket／建 DynamoDB table／建 IAM role／部署 hello Lambda／App Runner 可用性／Bedrock InvokeModel + 列可用模型，每項印 pass/fail。Day1 10:40 環境一到手立刻跑（`12` §5 已定，把它變成真腳本） | Sunny | 3h |
| PR-4 | **Spring Boot + React skeleton 在自己帳號搭一次** | 同源 serve React build 的最小骨架，跑通 App Runner（或 EC2）部署一次——把前端工具鏈與部署鏈的坑在賽前引爆，不留到 Day1。dashboard 選定現成 admin template（Recharts）不自創 | Eddie + Sunny | 4h |
| PR-5 | **FUEL_CONSUMP harness 骨架** | 提交檔輸出器骨架：吃 DailyMetric 列 → 輸出 CSV（欄位名/精度 Day1 確認後填），全量版與篩選版雙輸出。先跑假資料驗證列數不缺 | Feng | 2h |

P0 小計 ≈ 16h。

### 1.2 P1 — 提前做能顯著加分

| # | 項目 | 內容 | Owner | 工時 |
| --- | --- | --- | --- | --- |
| PR-6 | **Q&A 15 題演練稿** | `07-judge-qna.md` 從 7 題擴到 15 題，含五大海事追問（基準怎麼定／slow steaming 分離／該不該花 4 萬清／SOG 黑潮／歸因 68% 憑什麼）。**P5 主持模擬 Q&A**，工程師按專長答題演練一次 | P5 主持＋全員 | 3h |
| PR-7 | **CII / ROI 卡假資料原型** | 用假數字先把 `13` D1（CII/CO₂/EU ETS 卡）與 D2（清潔 ROI 回本天數）的 UI 元件與算式寫好，Day2 換真資料即可 | Chen + Feng | 2h |
| PR-8 | **Bedrock prompt 初稿 + 防幻覺後驗證** | ai-brief 的系統 prompt（只引用給定 JSON＋水下事件關聯段）與 regex 後驗證邏輯先寫好，用假 metrics JSON 測一次幻覺防線 | Eddie | 2h |
| PR-9 | **簡報線賽前包（P5 專屬）** | slides 模板選定＋冷開場文案草稿（數字留位）＋行情與標準查證（VLSFO 市價、清潔成本區間、CII 分級表——當假設值的引用來源）＋提交平台問題清單預寫 | P5 | 3h |

P1 小計 ≈ 10h（P0+P1 = 26h，**5 人分攤 ≈ 5h/人**，在預算內——原 20h 是按 4 人估的）。

### 1.3 賽前可查到答案的「待確認」項

`09` §10 有些問題不必等 Day1，賽前就能查：

- ISO 19030 / CII / EEXI 的公式與 rating 分級表（公開標準）— 併入 PR-7 準備。
- VLSFO 市價區間（US$500–550/MT）、清潔成本區間（US$30k–50k）、進塢週期 — 公開行情，先查好當假設值來源，簡報標「假設值」有依據。
- Bedrock 在台灣區域（ap-*）可用的 Claude 模型清單 — 賽前查 AWS 文件先有預期。

## 2. 文件體系剩餘缺口（待回寫）

`13` §6 承諾的回寫尚未執行（原訂等 team review）。若團隊確認方向，以下是待落地清單：

| # | 缺口 | 動作 | 阻塞 |
| --- | --- | --- | --- |
| G-a | `10-presentation-plan` 已回寫 `13` 呈現戰術；實際 pptx 仍需套版 | 依新版 slide 清單製作簡報：money number、評分表前置、三擊 demo、減法架構、ISO 偏離表進正片 | P5 套版 |
| G-b | `06-demo-storyline` 已有三擊 demo 草稿，但仍是 raw material | 以 `10` 的新版 demo 段為唯一彩排腳本，`06` 保留原始素材定位 | team review 通過 |
| G-c | `07-judge-qna` 已擴到 15 題 | 轉成 backup slides 並實際演練一次（= PR-6） | 可先做 |
| G-d | `13` P0 產品項已併入 `09` §4.5；§7 分工表尚未細化 | 把 D1–D4 owner 對位回寫 Day2 任務表；D5–D8 維持 P1 閘門項 | team review 通過 |
| G-e | 累積劣化曲線仍標 stretch，避免未看真資料前擠壓 55% 硬盤 | Day2 18:00 若事件數與合格天足夠再升必做；否則保留 backup slide | team review 通過 |

**為何暫不自動回寫**：09/10 是團隊執行藍本，改動幅度大（重排簡報、升級必做項）應由團隊拍板；本文件把待辦列清，review 後一次性回寫，避免反覆。

## 3. 整體優化方向收斂（三層防線）

把 09–13 的所有優化收斂成一句話心智模型，供團隊對齊：

```
第一層 守住 55% 硬盤：FUEL_CONSUMP 全量計算零錯 + Speed Loss 方法論正確（09 §3-§4）
   ↓ 守住才有資格談差異化
第二層 拉開 20% 商務：把 % 算成錢（CII 合規卡 + 清潔 ROI 回本天數）（13 D1-D2）
   ↓ 同型隊之間最容易拉開的維度
第三層 被記住：冷開場 money number + 三擊 demo + 評分表骨架 + 誠實限制主動講（13 P 系列）
   ↓ 疲勞評審只在三個位置形成記憶
認賠：創意 10% 不追 Agents 炫技、技術 15% 不追服務數量（13 §5）
```

**優化的鐵律（貫穿所有文件）**：任何新點子先過三個閘門——(1) 是否擠壓 55% 硬盤工時？擠壓就砍。(2) 是否零架構變更？破壞單服務簡單性就砍。(3) 真實資料不支援時有沒有 fallback？沒有就標條件項。

## 4. 建議的下一步（team review 議程）

1. 確認賽前準備 P0 五項的 owner 認領與時程（本週內）。
2. 拍板 `13` §3 backlog 的 P0 項是否全收（CII 卡、ROI、信心徽章、行動三分級、冷開場、評分表骨架、三擊 demo、減法架構頁、ISO 偏離表進正片）。
3. 通過後回寫 `09` dashboard 規格與分工；`10` 已先回寫，`06`/`07` 狀態需做收斂標記。
4. 開賽日待確認清單（`09` §10 + `12` §5）列印成一頁隨身表。
