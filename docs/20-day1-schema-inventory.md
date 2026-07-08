# Day1 Schema Inventory And Mapping

> 狀態：賽前可用。Day1 拿到真資料後先跑本流程，再改 `core-calc` header mapping、`docs/17` 欄位表與 FUEL_CONSUMP 提交格式。

## 1. 目的

Day1 10:00-10:40 的資料接入不應直接開 IDE 猜欄位。先做三件事：

1. 掃描真資料檔案，只產出 schema inventory，不輸出 raw cell value。
2. 用 `samples/schema-map.template.csv` 對齊 FleetMind 必要欄位與真實欄位。
3. 把確定欄位回填到 `docs/17-enterprise-data-application.md`、`core-calc` export header 參數與提交檢核表。

## 2. 安全邊界

- 不把陽明 raw CSV/PDF/圖片放進 `samples/`、`inputs/` 或任何會被提交的路徑。
- 若必須放在 repo 內暫存，只能放 `data/raw/` 或 `data/private/`；兩者已被 `.gitignore` 排除。
- `schema-inventory.sh` 只輸出檔名、大小、列數、欄位數、headers、解析狀態，不輸出資料列內容。
- 可提交的是 mapping template、欄位名稱、聚合列數與處理方法；不可提交 raw data 或敏感 free text。

## 3. 指令

用假資料 smoke test：

```bash
./scripts/schema-inventory.sh samples/noon-reports.csv
```

Day1 真資料建議輸出到 ignored `build/`：

```bash
./scripts/schema-inventory.sh --output build/schema-inventory.csv /path/to/event-data
```

建立 mapping 工作檔：

```bash
cp samples/schema-map.template.csv build/schema-map.csv
```

若官方欄位名稱和預設不同，先不要改公式，先用 `export-fuel-consump` header override 驗證全量輸出：

```bash
./scripts/export-fuel-consump.sh \
  --input /path/to/noon-report.csv \
  --output build/fuel-consump.csv \
  --vessel-id-header SHIP_CODE \
  --date-header REPORT_DATE \
  --consump-header ME_FULLSPEED_CONSUMP_VLSFO \
  --hours-header HOURS_FULL_SPEED \
  --wind-header WIND_SCALE
```

## 4. Mapping 必填

| FleetMind field | 用途 | 沒找到時 |
| --- | --- | --- |
| `vessel_id` | join dashboard、事件與 FUEL_CONSUMP | 立刻問主辦/陽明；不可用船名猜 |
| `date` | Daily FOC 與 before-after window | 確認 timezone/日期格式後轉 ISO |
| `ME_FULLSPEED_CONSUMP_VLSFO` | 官方 Daily FOC 分子 | 若是多燃料欄位，先確認 VLSFO equivalent 規則 |
| `HOURS_FULL_SPEED` | 官方 Daily FOC 分母 | 0 或缺值仍保留列，輸出空值/quality flag |
| `WIND_SCALE` | quality flag | 可缺；缺值不丟列 |
| `event_vessel_id` + `event_date` + `event_type` | underwater event join | 若水下報告是 PDF/圖片，先手建事件表 |
| official output precision | 25% 自動評分格式 | Day1 09:40-10:00 必問 |

## 5. 回填位置

| 產物 | 回填位置 |
| --- | --- |
| 檔名、列數、船舶數、資料期間 | `docs/17` §2 Day1 待填 |
| 欄位 mapping 與缺欄位處理 | `docs/17` §3、§5 |
| FUEL_CONSUMP 欄位、rounding、列範圍 | `docs/18` §2、§6 |
| export header override | README Current Execution Plan、Day1 handoff note |
| raw data 保留/刪除規則 | `docs/16`、`docs/18`、`scripts/cleanup-event-data.sh` 執行參數 |

## 6. Day1 Owner Flow

| 時間 | Owner | 動作 |
| --- | --- | --- |
| 10:00-10:10 | Feng + P5 | 跑 schema inventory，確認檔案數、列數、headers |
| 10:10-10:25 | Feng + Chen | 填 `build/schema-map.csv`，鎖定 FUEL_CONSUMP 必要欄位 |
| 10:25-10:40 | Chen | 跑 `export-fuel-consump` header override，確認列數不掉 |
| 13:00 前 | P5 | 把 schema/列數/截圖限制回填 `docs/17` |
| Day2 18:00 | Feng + P5 | 凍結 dashboard/deck 使用的 demo data snapshot |

## 7. Stop Rules

- 找不到 `vessel_id`、`date`、`ME_FULLSPEED_CONSUMP_VLSFO`、`HOURS_FULL_SPEED` 任一欄位：停止改 UI，先問官方或寫明轉換規則。
- row count 不等於官方要求的提交範圍：保留 full + filtered 兩版，等平台確認。
- PDF/圖片水下報告無結構化事件欄：手建最小事件表，只填 vessel/date/type，不抄敏感全文。
- raw data 出現在 `git status`：立即移到 ignored/private path，再跑 `./scripts/submission-audit.sh`。
