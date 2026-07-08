# Day2 Stretch Gate

> 狀態：賽前可用。用途是 Day2 18:00 用同一張表決定 D5-D8/P1 項目做或砍，避免主觀爭論拖慢 55% 主分數。

## 1. 鐵律

Dashboard 30% + FUEL_CONSUMP 25% 沒全通，P1/P2 stretch 全砍。

Stretch 不是「有空就做」，而是以下四個條件同時滿足才開：

1. `./scripts/demo-local.sh` 通過。
2. 最終或準最終 `FUEL_CONSUMP` 通過 `scripts/validate-fuel-consump.sh`，row count 與官方範圍一致。
3. Live/local demo 主線三擊可跑：Fleet Overview → Vessel Detail/before-after → AI brief citation。
4. Deck 9 頁正片已有可講版本，不再缺 money number、架構頁、方法論防守頁。

任何一項未滿足：只做 bug fix、截圖、錄影、提交，不做 stretch。

## 2. Day2 18:00 判定表

| Check | Pass threshold | Evidence | Owner |
| --- | --- | --- | --- |
| FUEL_CONSUMP correctness | validator pass；無少列；precision/rounding 已依官方答案 | validator output / row count | Feng + Chen |
| Speed Loss dashboard | 最差船排名、vessel trend、before-after、quality flag 全可 demo | live/local URL | Feng |
| AI boundary | AI brief 可產生或 fallback；`guardrail.passed=true`；citation 可點 | `/api/vessels/{id}/ai-brief` | Eddie |
| Business value | Daily avoidable cost、annual fuel/CO2、payback days 有一致數字 | `BusinessImpact` output / deck | Chen + P5 |
| Deployment | Live URL 或可接受 fallback 方案已定；warm-up script 可跑 | `warmup-live-demo` output | Sunny |
| Submission | 七項提交物 owner/source 都有可上傳版本 | `18-submission-control-sheet.md` | P5 |

Decision:

- 6/6 pass：可開 P1 stretch，仍限 2 小時 timebox。
- 5/6 pass：只做 P5/P6/P8 這類低風險呈現補強，不碰計算/架構。
- 4/6 以下：全砍 stretch，進入 stabilization。

## 3. D5-D8 排序

| Rank | Item | 開啟條件 | Timebox | Done means |
| --- | --- | --- | --- | --- |
| 1 | D8 每船速度指數 n 擬合 | 每船有足夠 speed + FOC 樣本；不影響 FUEL_CONSUMP | 1h | backup slide/table 有 n 分佈；主算法仍可 fallback cube law |
| 2 | D7 參考窗＋斷點可視化 | vessel trend 已可畫；至少一個事件/unknown breakpoint 可示範 | 2h | demo 船圖上有 reference window 與 event/breakpoint marker |
| 3 | D6 90 天外推欄位 | 近 60-90 天有連續樣本；business card 已穩 | 1h | Fleet Overview 顯示 forecast penalty 並標註 estimate |
| 4 | D5 累積劣化曲線 | 同船多次 cleaning/drydock 或 sustained reset 足夠清楚 | 3h | demo 船能講「清潔非完全歸零」故事 |

若只剩 1 小時，優先 D8；若資料事件稀疏，不做 D5/D7。

## 4. P1 呈現項排序

| Rank | Item | 開啟條件 | Timebox |
| --- | --- | --- | --- |
| 1 | P6 Q&A 陷阱卡口頭 drill | deck 正片已完成 | 30m |
| 2 | P8 Bedrock prompt 攤開頁 | `/ai-brief/prompt` 可打開 | 45m |
| 3 | P9 成本頁 | Cloud cost 或保守估算可防守 | 45m |
| 4 | P7 故障演示 | 不需改主路徑、不影響 live demo | 30m |

呈現項可由 P5 主筆，工程只供截圖/數字。工程若被拉走超過 30 分鐘，立即停止。

## 5. Stop Rules

- 新增 stretch 導致 `demo-local`、API smoke、submission audit 任一失敗：revert 該 stretch。
- 任何 stretch 需要 raw data 進 repo：砍。
- 任何 stretch 需要新 AWS service 或新 IAM role：砍，除非 Sunny 已確認不影響 live URL。
- Day3 07:30 後不新增 stretch，只修 blocker、截圖、錄影、上傳。

## 6. 會議口徑

Day2 18:00 只問三句：

1. 55% 主分數是否已全通？
2. deck 是否已可上台講 8 分鐘？
3. 還有幾個工程小時可冒險？

答案不清楚時，預設砍 stretch。穩定提交比多一張漂亮圖更值錢。
