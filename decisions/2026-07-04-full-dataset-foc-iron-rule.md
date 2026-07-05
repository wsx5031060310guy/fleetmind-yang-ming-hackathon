# Daily FOC 全量計算鐵律（篩選只打旗標、不丟列）

Date: 2026-07-04

## Context

FUEL_CONSUMP 正確性佔 25%，由程式自動評分。評分程式可能要求對所有列（或官方指定列）輸出 Daily FOC；提交格式開賽日才會確認。早期管線設計（docs/05 初版）是「先篩選（WIND_SCALE ≤ 4、HOURS_FULL_SPEED ≥ 22）→ 再計算 FOC」，對抗式審查指出：不合格列在計算前被丟棄會讓提交檔缺列，直接在自動評分丟分。

## Decision

- **VLSFO 換算與 Daily FOC 對全量資料列無條件計算**（純函式、防 HOURS=0 除零）。
- 篩選條件只產生 `quality_flags`，供下游 Speed Loss 分析過濾使用，**任何列都不丟棄**。
- FUEL_CONSUMP 提交檔預產「全量版＋篩選版」雙版本，官方格式確認後擇一提交。

## Alternatives Considered

先篩後算（原設計）——被審查否決；只出全量版——保留雙版本更保險，成本近零。

## Consequences

- 25% 自動評分不再依賴「格式假設猜對」；提交 harness 成為管線正式輸出（owner: Feng）。
- 品質旗標統計上 dashboard 品質面板，誠實呈現資料品質。

## Follow-Up

Day1 最高優先釐清官方提交格式（欄位名/精度/範圍）；harness 三次迭代（Day1 晚/Day2 晚/Day3 上午）。
