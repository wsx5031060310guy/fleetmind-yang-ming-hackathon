# 油耗預測任務計畫（25% 客觀評分）

> 2026-07-14 Day1。依官方資料包 README（`data/README.md`，資料包已下載、`data/` 已 gitignore 不入庫）與 docs/22 官方命題摘要制定。
> **定位修正**：25% 客觀評分＝預測被遮蔽的油耗值（102 個 `PREDICT` 格），**不是**確定性 Daily FOC 計算。core-calc 重定位為特徵工程／dashboard 計算核心；預測由 `predict/` Python pipeline 承載。

## 1. 任務事實（已對真資料驗證）

- `vt_fd.csv`：21,282 列＝15 船 × 5 年航行日報（僅排除純靠港/錨泊日）。
- 訓練船 S1–S12 全可見；預測船 S21–S23 養護後區間遮蔽。
- 船型：W1＝S1–S8+S21；W2＝S9–S12+S22–S23（同設計姊妹船、不同航線）→ **可跨船遷移學習**。
- **102 個 `PREDICT` 格**：S21=43、S22=24、S23=35；燃料 HSHFO=91、VLSFO=11（BIO 不在預測窗）。
- 每個 PREDICT 日皆：全速 ≥22h、風 ≤4 級、單一燃料（實測 min hours=22.8、max wind=4.0 ✓）。
- 欄位三類：A（環境/航行，遮蔽區間內仍可見）、H（主機性能，遮蔽）、T（油耗，遮蔽/預測）。
- `HIDDEN` 油耗格 1,550 個（僅表資料不提供，非預測標的）。
- 熱值（MJ/kg）：HSHFO 40.2 / ULSFO 41.2 / VLSFO 40.2 / LSMGO 42.7 / BIO_HSFO 39.4*。
- 養護 77 筆、6 類：PP／UWI+PP／UWC／UWC+PP／DD／**UWI（純檢查，不得視為改善——官方兩度明示）**。預測船共 14 事件（S21×6、S22×3、S23×5）＝ 14 個遮蔽窗。

## 2. 關鍵坑（先解再建模）

1. ~~時間軸錨點難題~~ **（2026-07-14 資料 v2 已解決）**：官方重釋出資料，`maintenance.csv` 由 `event_date`（日曆）改為 **`event_day`（相對天數，與 vt_fd `NOON_UTC` 同軸）**。養護事件現直接 `(ship_id, event_day)` join vt_fd，**不需再解錨**。先前「全船同錨只 7/14 精確」的近似作廢；fouling-clock 特徵改用精確事件日。
2. **提交值語義**：`predicted_value`＝**全速時段內消耗的油料總量（MT/day，原欄位語義）**，不是 per-24h 正規化值。模型內部可用 rate×hours 校正，**提交時務必還原原語義**（官方 README 明示）。
3. **STW vs SOG**：兩欄皆 100% 填充但因洋流可有明顯差異；阻力物理用 STW（對水），距離/營運用 SOG。
4. HSHFO 佔 91/102——模型重心放 HSHFO；VLSFO 11 格靠熱值折算＋fuel_type 特徵共用模型。

## 3. 管線（`predict/`，Python 3.12 + uv，僅 pandas/numpy/sklearn）

```
load → anchor（直讀 event_day，直接 join）→ features → models → validate → submit
```

- **特徵**：STW/STW³/RPM/滑差；吃水/排水量/載貨；風浪湧/水溫/水深；**污損時鐘**（距上次船殼介入天數、距上次螺旋槳介入天數、水溫×天數積溫=生物污損壓力 proxy；**UWI 不重置任何時鐘**）；船別/船型 W1/W2/燃料+熱值；HOURS_FULL_SPEED。
- **模型階梯**：①物理 baseline（k·STW³，滾動中位數 k 含時間漂移）②sklearn HistGradientBoosting（目標=每全速小時油耗率，預測後×hours 還原）③驗證擇優混合。
- **驗證（防漏答案）**：在 S1–S12 上模擬真實遮蔽模式——取真養護事件後 5–10 合格日窗遮蔽再評分（RMSE/MAPE，逐窗分解）；另跑 GroupKFold(by ship)。**不可用隨機 K-fold 當唯一指標**（時序+事件結構會漏訊息）。
- **反事實**（商務決策價值 20% 的彈藥）：同日特徵、把船殼/螺旋槳時鐘歸零重預測 → 「現在做 UWC/PP 每天省 X MT ≈ Y%」→ 接 dashboard ROI 卡。
- **提交**：`predict/output/submission.csv`，欄位 `ship_id,day,fuel_type,predicted_value`，**恰 102 列**與 PREDICT 格 1:1，程式強制核對後才寫檔。

## 4. 與現有資產的關係

| 資產 | 新角色 |
|------|--------|
| core-calc FOC/quality flags | 特徵工程參考＋dashboard 計算核心（不變） |
| FuelConsumpExportCli | 保留（dashboard 的資料匯出/品質面板用）；**不是**預測提交檔的產生器 |
| validate-fuel-consump.sh | 對 dashboard 匯出檔用；預測提交檔由 `submit.py` 自帶 102 列核對 |
| SpeedLoss.java | 30% dashboard 用；歸因擴充見 Attribution（WP-P2） |
| Bedrock AiBriefService | 決策簡報引用預測/反事實數字（citation guardrail 既有） |

## 5. 分工（Day1 下午起）

- **Feng+Chen**：跑通 `predict/` 全管線（anchor 現為 event_day 直接 join）、審 validation 表、迭代特徵。
- **Eddie**：Bedrock env 兩變數+smoke；把反事實數字接進 AI brief citations。
- **Sunny**：AWS 環境（region 一律 us-east-1）、S3 放資料、部署路線。
- **P5**：surveycake 表單欄位確認（六項）、10:00 說明會記錄評分細則（尤其油耗預測的比對指標——RMSE? MAPE? 公布否）。

## 6. 開放風險

- ~~錨點假說~~ 已由 v2 資料 `event_day` 消除，無此風險。
- 官方評分指標未公布（RMSE/MAPE/其他）→ 10:00 說明會必問；模型選擇以兩指標同時看。
- 外部資料（洋流/海溫 reanalysis）官方允許 → P2 加分項，時間允許才做。
