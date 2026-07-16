# 離線提交包 · 2026-07-16（死線 14:30）

上傳至指定成果存放平台（主辦 S3）。**官方 checklist 就是下面這 6 項**，逐項對照要交什麼。

## 官方 6 項 → 交這個

| # | 官方項目 | 交什麼 |
|---|---|---|
| 1 | 團隊基本資料 | 表單直接填（隊名 + 成員，見 [`docs/02-team.md`](../docs/02-team.md)） |
| 2 | 提案大綱 | 表單直接填（可濃縮 proposal deck 第 1–3 頁：痛點 → 兩條主線 → 方法 k=FOC/STW³） |
| 3 | 完整提案簡報（含企業數據及資料應用、技術架構） | 上傳 **`fleetmind-proposal-deck.pptx`**（或 `.pdf`）。已驗這一份**同時涵蓋三者**：企業數據（21,282 列日報 + 77 維修事件）、資料應用（ISO 19030 Speed Loss + 油耗預測模型）、技術架構（ECS Fargate + Bedrock + AWS）。**架構要更深** → 另附 `fleetmind-aws-architecture.pptx`（18 頁） |
| 4 | GitHub 網站連結 | `https://github.com/wsx5031060310guy/fleetmind-yang-ming-hackathon`（維持 private，決定：靠 S3 交檔不靠公開連結；主辦要看原始碼再加協作者） |
| 5 | Live Demo 網址連結 | `http://fleetmind-alb-330672315.us-east-1.elb.amazonaws.com`（免登入，`/api/health` 回 200） |
| 6 | Demo 錄製影片連結 | 上傳 **`fleetmind-demo.mp4`**（141 秒 · 1280×720 · H.264）；線上備援 URL：`…/demo/fleetmind-demo.mp4` |

**上傳的檔案（本資料夾）：** `fleetmind-proposal-deck.pptx` + `.pdf`（③）、`fleetmind-aws-architecture.pptx` + `.pdf`（③ 架構深水區）、`fleetmind-demo.mp4`（⑥）。

已驗：pptx 可在 **PowerPoint 開啟**（移除 pptxgenjs chart 部件與空目錄，0 chart / 0 dir / CRC OK / python-pptx OPC 通過）；兩份 PDF 字體皆 **HiraginoSans + PingFangTC**，0 fallback、0 未嵌入。

> ⚠️ **若之前壓過 `.zip` 上傳包，重壓一次** —— 舊 zip 的 deck 早於最新修正（PowerPoint 可開 + slide 6/10 評審答案補強）。直接上傳本資料夾的個別檔最保險。

## 不在這 6 項裡：預測結果 CSV（陽明組限定）

`submission-predictions.csv`（102 列）**不在上面的官方 6 項 checklist**——它是陽明命題的評分檔，走**命題資料平台的另一管道**（非這個 6 項成果表）。確認該管道後再交。上傳前務必在有 `data/` 的機器重跑比對，見下方「⚠️ 上傳前務必看這段」。

---

## ⚠️ `submission-predictions.csv`：上傳前務必看這段

這是全案**唯一由程式客觀評分**的項目（25%）。其餘都是人評。

### 通過的檢查

```
header            ship_id,day,fuel_type,predicted_value      ✅ 合規格
列數              102                                        ✅ 恰好 102
空值 / NaN        0                                          ✅
分船              S21=43 · S22=24 · S23=35                   ✅ 與 docs/07 Q4 記載完全相符
分燃料            HSHFO 91 · VLSFO 11                        ✅ 與 docs/07 Q4 記載完全相符
```

分船／分燃料的分布是**獨立交叉檢查**：`docs/07` 是從資料寫的，CSV 是 pipeline 產的，兩者一致。

### 沒通過的兩件事

**一、檔案是 2026-07-14 13:09 產的，之後 `predict/` 還有一個 commit。**

`a3ab9dd`（13:37）動了 `models.py` / `features.py`。讀過那個 diff：改動都是**加參數但預設維持舊行為**
（`feature_columns=tuple(FEATURE_COLUMNS)`、`external_feature_columns=()`），新能力 `--use-external` 是 opt-in。
所以不帶該旗標跑，預測值**應該**一致——**但那是推論，不是證明**。

**二、有 4 格在物理上說不通，而防呆抓不到。**

官方條件（`docs/22` §4）：每個 PREDICT 格都是**全速航行 ≥22 小時**的日子。

```
中位數                    86.92 MT
S21 day=961  VLSFO         2.45 MT   ← ÷22h ≈ 0.11 MT/hr
S21 day=1008 HSHFO         2.87 MT
S21 day=962  VLSFO         7.12 MT
S21 day=960  VLSFO        17.35 MT
```

中位數對應約 3.6–4 MT/hr（大型貨櫃輪全速的合理量級）。**2.45 MT 差了 33 倍**——主機全速跑 22 小時
燒不了 2.45 噸。而 `submit.py` 的 `_assert_plausible_predictions` **只檢查上界**
（`value > 該船可見最大值 × 1.5` 才擋），**沒有下界**，所以這 4 格直接穿過去。

已在 `submit.py` 加一條**警告**（不是 raise——沒有資料在手，門檻沒校準過，不該讓它有能力擋下提交）。
下次重產時它會對這種格子出聲。

### 因此，上傳前請在**有 `data/` 的機器**上做這件事

```bash
cd predict
uv run python -m fleetpredict all          # 不要加 --use-external
diff <(sort output/submission.csv) <(sort ../submission/submission-predictions.csv)
```

- **相同** → 現檔有效，直接上傳（那 4 格仍建議看一眼 `HOURS_FULL_SPEED`）
- **不同** → 現檔是舊模型產的，上傳新的
- **跑的時候留意 stderr 的 WARNING** —— 那就是上面那 4 格

`data/`（`vt_fd.csv` / `maintenance.csv`）是命題資料、gitignored、賽後須刪，不在這台機器上，
所以以上兩件事在這裡都做不了。
