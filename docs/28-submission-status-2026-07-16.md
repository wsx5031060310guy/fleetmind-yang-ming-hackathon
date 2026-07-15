# 繳交狀態 · 2026-07-16（死線 14:30）

> 官方 6 項在 `docs/22` §6。本檔只記**每一項現在到底在哪、驗過沒有**。
> 每一格的「驗證」欄寫的是**跑過的命令與它的輸出**，不是「應該沒問題」。

## 時程（`docs/22` §3）

11:00–11:30 報到 → 11:30 現場實作 → 13:00–**14:30 繳交死線** → 15:00–16:30 簡報（每組 12 分鐘）→ 16:45 頒獎。
**14:30 是繳交，不是上台。** 逾時未上傳視同放棄資格。繳交管道：航運物流組專屬 surveycake（連結在命題頁）。

## 六項

| # | 項目 | 在哪 | 狀態 |
|---|------|------|------|
| 1 | 團隊基本資料 | 表單直接填 | ⬜ **待填**：`docs/02-team.md` 有成員 |
| 2 | 提案大綱 | 表單直接填 | ⬜ **待填**：可濃縮 `/proposal.html` 第 1–3 頁 |
| 3 | 完整提案簡報（含企業數據應用＋技術架構） | `presentation/fleetmind-proposal-deck.pptx`（16 頁）<br>站上：`http://fleetmind-alb-330672315.us-east-1.elb.amazonaws.com/proposal/fleetmind-proposal-deck.pptx` | ✅ 內容完成、計分語言已清空<br>⬜ **未確認**：表單收 PPTX 還是 PDF、檔案大小上限（`docs/18` 列為 TBD） |
| 4 | GitHub 連結 | https://github.com/wsx5031060310guy/fleetmind-yang-ming-hackathon | ⚠️ **repo 目前 PRIVATE** —— 評審打不開。交件前要嘛轉 public，要嘛把評審加為協作者。**這是要決定的事。**<br>✅ 無 raw data：`git ls-files data/` = 0、`real-metrics.json` 未追蹤 |
| 5 | Live Demo 連結 | http://fleetmind-alb-330672315.us-east-1.elb.amazonaws.com | ✅ 免登入可開；`/api/health` 200 |
| 6 | Demo 錄製影片連結 | http://fleetmind-alb-330672315.us-east-1.elb.amazonaws.com/demo/fleetmind-demo.mp4 | ⚠️ **已提交進 repo，但要部署後 URL 才活**（憑證過期擋住）<br>118s · 1280×720 · H.264 · 5.3MB |
| **7** | 預測結果檔（陽明組限定） | `predict/output/submission.csv` | ⚠️ **格式對，數值無法在此驗證** —— 見下 |

## 第 7 項：唯一被程式客觀評分的 25%

```
$ wc -l predict/output/submission.csv        → 102 列（+header）✅ 規格要求恰 102
$ head -1                                    → ship_id,day,fuel_type,predicted_value ✅
$ awk -F, '$4==""||$4=="nan"' | wc -l        → 0 ✅
$ stat -f %Sm                                → 2026-07-14 13:09
```

**問題**：檔案是 7/14 13:09 產的，之後有一個 commit `a3ab9dd`（13:37）動了 `models.py`／`features.py`。
讀過那個 diff：改動是**加參數但預設維持舊行為**（`feature_columns=tuple(FEATURE_COLUMNS)`、
`external_feature_columns=()`），新能力 `--use-external` 是 opt-in。所以不帶該旗標跑，預測值**應該**一致。

**但那是推論，不是證明。** 這台機器沒有 `data/`（`vt_fd.csv`／`maintenance.csv` 是命題資料、gitignored、
賽後須刪），無法重跑比對。

→ **有 `data/` 的機器跑一次**：`cd predict && uv run python -m fleetpredict all`，
比對輸出與現檔是否相同。相同就直接交；不同代表現檔是舊模型產的，交新的。

## 已知擋點

1. **AWS workshop STS 憑證過期**（`ExpiredTokenException`）→ 無法部署。
   影響：第 6 項的 URL 還不會活；`dfba810`／`b0a4cd0` 的新架構圖也還沒上線。
   換發後：`cd <clean worktree at main> && AWS_PROFILE=workshop uv run --with boto3 python3 scripts/deploy-aws.py`
   ⚠️ 從**乾淨的 worktree** 部署——腳本的 build context 是 repo 根，髒工作區會一起送上 prod。
   ⚠️ 腳本內建的驗證探針是 `deck/slide-05.jpg`，對這次改動**證明不了任何事**；部署後自己比對改過的檔。

2. **repo 是 private**，而第 4 項要交 GitHub 連結。

3. **表單規格 TBD**（`docs/18`）：deck 收 PPTX 或 PDF？影片格式／長度／上傳位置？原始資料/錄影可否留在 repo？

## 部署後必跑

```bash
BASE_URL=http://fleetmind-alb-330672315.us-east-1.elb.amazonaws.com bash scripts/warmup-live-demo.sh --require-ai
```
預設已改成 **S11**（原本是 `YM-DEMO-01`，那艘船不在 `/api/fleet/summary` 的 15 艘裡，腳本會 exit 1 而且
永遠走不到它存在的目的：預熱 ai-brief）。
**預熱買的不是速度**——快取只在失敗時讀，成功一律現打 8 秒。它買的是「失敗時掉到中文簡報而非英文」。
