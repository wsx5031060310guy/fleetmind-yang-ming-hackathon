# 簡報賽前包（Presentation Readiness Pack）

> Owner：P5。目的：把 `10` 的 slide 計畫、`07` 的 Q&A、`14` 的 PR-9 查證，整理成可直接套版與彩排的材料。
> 狀態：PPTX 骨架已產於 `presentation/fleetmind-proposal-deck.pptx`（9 頁正片 + B1-B15）；可用假數字彩排，Day2 18:00 後換真資料與 Day3 凍結截圖。

## 1. 正片數字假設（2026-07-08 查證版）

| 假設 | Deck 用值 | 來源與用法 |
| --- | ---: | --- |
| VLSFO fuel price | **USD 650/MT** | 當作 demo 中位假設。Ship & Bunker 最新頁面顯示 global VLSFO 約 USD 741/MT，主要港口有差異（例如 Singapore/Rotterdam 較低），所以 deck 用 650 作保守、可辯護值：[Ship & Bunker prices](https://shipandbunker.com/prices)。 |
| EU ETS carbon price | **USD 90/tCO2** | Trading Economics 2026-07-08 EUA 約 EUR 80/tCO2；ICAP 2025 EU ETS auction average 約 USD 82.97。Deck 用 USD 90 作 round scenario：[Trading Economics](https://tradingeconomics.com/commodity/carbon)、[ICAP EU ETS](https://icapcarbonaction.com/en/ets/eu-emissions-trading-system-eu-ets)。 |
| Cleaning scenario | **USD 40,000** | GreenVoyage2050 估 hull cleaning implementation cost 約 USD 5k-50k，且 fuel reduction 1-5%。Deck 用 40k 作中高情境；Day1 若陽明/供應商給真成本，立即換：[GreenVoyage2050 hull cleaning](https://greenvoyage2050.imo.org/technology/hull-cleaning/)。 |
| EU ETS coverage | **50%** | 展示用情境，標「assumption」。若航線不在 EU ETS 範圍，UI 可切 0%。 |
| CII framing | **A-E rating, D/E 觸發管理壓力** | IMO：CII 適用 5,000 GT 以上，A-E rating；D 連續三年或 E 需 corrective action plan：[IMO EEXI/CII FAQ](https://www.imo.org/en/mediacentre/hottopics/pages/eexi-cii-faq.aspx)、[IMO energy efficiency page](https://www.imo.org/en/ourwork/environment/pages/improving%20the%20energy%20efficiency%20of%20ships.aspx)。 |

Demo fake case 目前口徑：

| Metric | Value |
| --- | ---: |
| Baseline Daily FOC | 58.0 MT/day |
| Observed Daily FOC | 61.0 MT/day |
| Extra fuel | 3.0 MT/day |
| Daily fuel cost | USD 1,950/day |
| Daily CO2 | 9.342 tCO2/day |
| Daily EU ETS scenario cost | USD 420/day |
| Daily avoidable cost | **USD 2,370/day** |
| Annualized avoidable cost | **USD 865k/year** |
| Cleaning payback | **16.87 days** |

## 2. 30 秒冷開場

> 「我們不是問 AI：這艘船該不該洗。  
> 我們先用確定性計算找證據：這艘 demo 船每天多燒 3.0 噸油，燃油加碳成本約 USD 2,370/day，年化約 USD 865k。若一次清潔用 USD 40k，回本約 16.87 天。  
> FleetMind 做的事很窄：把 15 艘船的正午報表和水下事件變成可追溯的 Speed Loss、FUEL_CONSUMP、ROI，再讓 AI 只負責講清楚證據。」  

講法要求：慢，數字停頓；不要說「模型建議清潔」，只說「human review」。

## 3. Slide 套版填數表

現行 PPTX：

- `presentation/fleetmind-proposal-deck.pptx`
- `presentation/fleetmind-proposal-deck-preview.webp`
- `presentation/build-fleetmind-deck.mjs`

| Slide | 必填素材 | 來源 | 凍結時間 |
| --- | --- | --- | --- |
| 1 Money number | demo 船 extra fuel、daily cost、annualized cost、payback | `BusinessImpact` / `/api/vessels/{id}/before-after` | Day2 18:00 |
| 2 評分表 | 30/25/20/15/10 權重 + 一句定位 | `README.md`、`10` | 賽前 |
| 3 營運痛點 | fuel cost 佔比、biofouling impact、岸端人力不足 | `03`、本文件來源區 | Day2 |
| 4 資料邏輯 | 全量計算、品質旗標、不丟列 | `09` §3 | Day1 |
| 5 Speed Loss 方法 | k=FOC/V^n、事件切段、同速度帶 | `09` §4 | Day2 |
| Live Demo | 三擊 demo 截圖/錄影 | 凍結 dashboard | Day3 07:30 |
| 6 商業價值 | ROI、CO2、EU ETS、CII | `BusinessImpact` + 本文件假設 | Day2 18:00 |
| 7 架構+防幻覺 | single-service 圖、prompt/guardrail | `09` §2、`apps/api` | Day2 |
| 8 ISO 偏離表 | SOG/STW、正午報表頻率、無軸功率 | `09` §4.4 | 賽前 |
| 9 收尾 | 15→97 艘同架構、AI 不取代人 | `10` | 賽前 |

## 4. Backup Slides 清單

| Backup | 標題 | 取材 |
| --- | --- | --- |
| B1 | 為什麼不做 route optimization | `07` Why not route optimization |
| B2 | AI 是否做維修決策 | `07` Is the AI making maintenance decisions |
| B3 | 防幻覺三道線 | `apps/api/AiBriefPrompt`、`AiBriefGuardrail`、`07` |
| B4 | 品質差時怎麼辦 | `07` data quality |
| B5 | Baseline 怎麼定 | `07` baseline/dry-dock |
| B6 | Slow steaming 分離 | `07` slow steaming |
| B7 | USD 40k 清潔要不要花 | `07` ROI answer + 本文件假設 |
| B8 | SOG vs current/Kuroshio | `07` SOG answer |
| B9 | Fouling attribution 68% | `07` attribution answer |
| B10 | 為什麼不用 SageMaker | `07` SageMaker answer |
| B11 | V^3 是否過度簡化 | `07` cube-law answer |
| B12 | AWS 月成本 | `07` AWS cost answer |
| B13 | CII A-E 與 corrective action | 本文件 IMO sources |
| B14 | 提交檔為何全量計算 | `09` §3.1、`12` R9 |
| B15 | Repo 安全與資料刪除 | `12` R19/G3、`INDEX` §6 |

每張 backup slide 只放三行：短答、證據位置、限制。不要做成小字論文頁。

## 5. Q&A 彩排流程（30 分鐘）

1. P5 連續問 15 題，每題 40 秒內答完。
2. 答題 owner 固定：架構 Sunny、API/Bedrock Eddie、計算 Feng/Chen、商務/P5。
3. 答案超過 40 秒就砍成「一句結論 + 一個數字 + 一個限制」。
4. 每題結尾回到主心智：「數字確定性，AI 可追溯，決策留給人。」
5. 彩排後把答不順的題目新增為 backup slide。

## 6. 提交平台問題清單

Day1 09:40-10:00 先問，P5 記錄：

七項提交物上傳管制表見 `18-submission-control-sheet.md`。

| 問題 | 為何重要 |
| --- | --- |
| Challenge link 是什麼格式？ | 七項提交物之一，不能到 Day3 才猜。 |
| FUEL_CONSUMP 要 CSV、API 還是平台上傳？ | 25% 自動評分，格式錯直接失分。 |
| `FUEL_CONSUMP` 欄位精度/rounding/列範圍？ | 影響 harness 最終輸出。 |
| 原始企業資料能否留在賽後 repo / artifact？ | R19 安全與刪除 runbook。 |
| live demo link 可否為 App Runner 預設 URL？ | 影響部署方案與 HTTPS。 |
| 錄影格式/長度/上傳位置？ | Day3 上午錄影排程。 |
| 企業資料與資料應用說明是否有模板？ | 七項提交物之一；若無官方模板，直接用 `17-enterprise-data-application.md` 起手。 |

## 7. P5 完成定義

- Deck 初版：已完成，有 9 頁正片骨架與來源註解。
- Deck 主體：已可用假數字彩排；Day2 晚只換真數字/截圖。
- Backup：B1-B15 已有頁面；彩排後若新增問題再追加。
- Day3 12:00 前：七項提交物全部有連結與備份。
- 上台前：live URL、錄影 URL、repo、deck 開啟測試各跑一次。
