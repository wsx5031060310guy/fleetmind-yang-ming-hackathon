# 離線提交包 · 2026-07-16（死線 14:30）

繳交管道：航運物流組專屬 **surveycake** 表單（連結在命題頁）。官方 6 項見 `docs/22` §6。
現場填表時對照 [`docs/28-submission-status-2026-07-16.md`](../docs/28-submission-status-2026-07-16.md)。

## 這個資料夾裡的檔案

| 檔案 | 對應繳交項 | 說明 |
|---|---|---|
| `fleetmind-proposal-deck.pdf` | ③ 完整提案簡報 | 16 頁。**表單若收 PDF 用這個** |
| `fleetmind-proposal-deck.pptx` | ③ 完整提案簡報 | 同上，**若收 PPTX 用這個**。含 16 頁講者備忘稿 |
| `fleetmind-aws-architecture.pdf` | ③ 附錄／被追問架構時 | 18 頁架構深水區 |
| `fleetmind-aws-architecture.pptx` | 同上 | |
| `submission-predictions.csv` | ⑦ 預測結果檔（陽明組限定） | 102 列。**上傳前先讀下面那段** |

字體已驗：`pdffonts` 兩份 PDF 皆 **HiraginoSans-W6/W3 + PingFangTC**，0 個 fallback 壞字體、0 個未嵌入。

## 連結類的三項（不在這個資料夾，填網址）

| 項 | 值 |
|---|---|
| ④ GitHub | https://github.com/wsx5031060310guy/fleetmind-yang-ming-hackathon ⚠️ **目前 private，評審點開會 404**——交件前要轉 public 或加協作者 |
| ⑤ Live Demo | http://fleetmind-alb-330672315.us-east-1.elb.amazonaws.com |
| ⑥ Demo 影片 | http://fleetmind-alb-330672315.us-east-1.elb.amazonaws.com/demo/fleetmind-demo.mp4 |

①團隊基本資料、②提案大綱 直接在表單填。

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
