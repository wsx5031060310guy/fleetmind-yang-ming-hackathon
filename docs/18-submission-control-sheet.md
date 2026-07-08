# Day3 Submission Control Sheet

> Owner：P5。目的：避免 2026-07-16 14:30 前七項官方提交物漏交。  
> 原則：12:00 開始上傳，14:00 前完成，不等 14:30 死線。  
> 狀態：可直接列印/貼到提交工作台；Day1 補平台欄位名稱與檔案限制。

## 1. 七項提交物總表

| # | 官方提交物 | Repo 起手素材 | Day3 最終值 | Owner | 驗證 |
| --- | --- | --- | --- | --- | --- |
| 1 | Complete proposal deck | `presentation/fleetmind-proposal-deck.pptx`、`docs/10`、`docs/15` | final PPTX/平台檔案 | P5 | 可開啟、9 頁正片 + backup、數字與 demo 一致 |
| 2 | Challenge link | Day1 09:40-10:00 向主辦方確認 | TBD | P5 | 連結格式符合平台要求 |
| 3 | Enterprise data and data application description | `docs/17-enterprise-data-application.md` | final doc/pdf/form text | Feng + P5 | 不含 raw data；schema/列數/檔名已補 |
| 4 | Technical architecture | `docs/19-technical-architecture-submission.md`；細節回查 `docs/09` §2、`docs/12` §4、`docs/16` | architecture doc/image/form text | Sunny + Eddie | 與實際部署路線一致：App Runner/ECS Express/EC2 |
| 5 | GitHub repository link | README、GitHub main branch | repo URL | Sunny + P5 | main 綠燈；無 raw data、無憑證、無未 merge branch |
| 6 | Live demo link | `docs/16` deployment route | HTTPS/URL | Sunny | `/api/health` OK；評審無登入即可開 |
| 7 | Demo recording video link | Day3 凍結快照錄影 | video URL | P5 + demo operator | 可播放、長度/格式符合平台限制 |

## 2. Day1 必問欄位

| 問題 | 用途 | 記錄 |
| --- | --- | --- |
| Challenge link 是題目頁、隊伍頁、demo challenge URL，還是平台自動產生？ | 提交物 #2 | TBD |
| Proposal deck 可上傳 PPTX、PDF，還是只能連結？大小限制？ | 提交物 #1 | TBD |
| 企業資料與資料應用說明是否有官方模板？字數/格式？ | 提交物 #3 | TBD |
| 技術架構是否需獨立檔，或 deck 內架構頁即可？ | 提交物 #4 | TBD |
| Live demo link 可否需要登入？若雲端故障可否以錄影替代？ | 提交物 #6 | TBD |
| Demo recording 格式、長度、上傳位置、是否可用雲端連結？ | 提交物 #7 | TBD |
| 原始資料、截圖、錄影是否可留在 repo/artifact/簡報？ | R19/security | TBD |

## 3. Day3 時間表

| 時間 | 動作 | Owner | Stop rule |
| --- | --- | --- | --- |
| 07:30-08:30 | 凍結 demo data snapshot；最終 FUEL_CONSUMP export | Feng + Chen | 數字一旦進 deck/錄影，不再重算除非 blocking bug |
| 08:30-09:30 | 預產 demo AI brief cache；錄影前 warm-up | Eddie + Sunny | Bedrock 不穩則改 deterministic fallback |
| 09:30-10:30 | 錄製 demo recording；P5 更新 deck 真截圖 | P5 + operator | 錄影失敗一次後先保 live demo，錄影用簡短 fallback |
| 10:30-11:00 | 彩排第 1 次，核對 deck/demo/recording 數字 | P5 | 超過 7:15 直接砍 backup/技術細節 |
| 11:30-12:00 | 現場網路與 live URL warm-up | Sunny | live link 不通 15 分鐘內轉 EC2/local fallback + 錄影方案 |
| 12:00-13:00 | 上傳七項提交物第一輪 | P5 | 不等所有檔完美；先有可用版本 |
| 13:00-13:30 | 逐項打開平台上傳後連結 | P5 + Sunny | 任一連結打不開，立即重傳或改備援連結 |
| 13:30-14:00 | 彩排第 2 次；最終 repo/security check | 全員 | 14:00 後只修提交阻塞問題 |
| 14:00-14:30 | 緩衝時間 | P5 | 不新增功能、不換故事線 |

## 4. 上傳前安全檢查

Run before uploading repo link:

```bash
./scripts/submission-audit.sh
BASE_URL=<live-demo-url> ./scripts/freeze-demo-snapshot.sh --out build/demo-freeze
BASE_URL=<live-demo-url> ./scripts/warmup-live-demo.sh --repeat 3
git status --short --branch
git branch -r
git log --oneline --decorate -5
git diff --check
./scripts/test-core-calc.sh
./scripts/demo-local.sh
./scripts/validate-fuel-consump.sh --input <final-fuel-consump.csv> --expected-rows <official-row-count>
```

Manual checks:

| 檢查 | 通過條件 |
| --- | --- |
| raw enterprise data | repo 不含 `data/raw/`、企業 CSV/PDF、可識別原始截圖 |
| schema mapping | `docs/17` 已用 `docs/20` 流程補檔名、row counts、欄位 mapping 與 FUEL_CONSUMP 格式 |
| credentials | repo 不含 `.env`、AWS keys、tokens、cookies |
| branches | 遠端只保留 `origin/main`，已 merge feature branch 全刪 |
| CI | main GitHub Actions `local-checks` green |
| submission audit | `./scripts/submission-audit.sh` exits with `fail=0` |
| demo freeze | `build/demo-freeze/manifest.txt` exists; deck/recording numbers match captured outputs |
| FUEL_CONSUMP | validator passes; row count matches official scope; precision/rounding matches Day1 answer |
| live warm-up | `scripts/warmup-live-demo.sh` passes against submitted live URL |
| deck | final deck 可開啟，money number 與 dashboard/recording 一致 |
| demo URL | 外部瀏覽器可打開，不依賴本機 session |
| video URL | 外部瀏覽器可播放 |

## 5. Fallback 決策

| 故障 | 立即做法 | 提交策略 |
| --- | --- | --- |
| Bedrock invoke 不通 | 使用 deterministic AI brief fallback；保留 prompt/guardrail 展示 | 不阻塞七項提交 |
| App Runner 不可建立 | 改 ECS Express Mode；仍不通改 EC2 docker | live demo link 填可用雲端 URL |
| 雲端 live URL 全掛 | 上台用本機/錄影；平台填錄影 link + 說明（Day1 需先問是否可接受） | P5 記錄主辦方答案 |
| FUEL_CONSUMP 格式未確認 | 同時產 full + filtered 版本，平台確認後擇一 | 不讓 dashboard filter 影響提交檔 |
| deck 真截圖來不及 | 用已生成 PPTX skeleton + 凍結數字；截圖改 demo 現場展示 | 不延誤上傳 |
| 錄影失敗 | 錄 90 秒最小 demo：health、fleet ranking、before-after、AI brief cache | 先保有可播放連結 |

## 6. 提交後驗證

上傳完成後，P5 逐項打勾：

| # | 提交物 | 已上傳 | 已由另一人打開驗證 | 備註 |
| --- | --- | --- | --- | --- |
| 1 | Complete proposal deck | [ ] | [ ] | |
| 2 | Challenge link | [ ] | [ ] | |
| 3 | Enterprise data and data application description | [ ] | [ ] | |
| 4 | Technical architecture | [ ] | [ ] | |
| 5 | GitHub repository link | [ ] | [ ] | |
| 6 | Live demo link | [ ] | [ ] | |
| 7 | Demo recording video link | [ ] | [ ] | |

Rule: 提交完成不代表結束；每個 link/file 都要由另一位隊員用不同瀏覽器或無痕視窗打開。

## 7. 最短口徑

若提交平台只能填短文字：

> FleetMind has seven deliverables prepared as one package: editable proposal deck, challenge link, enterprise data application description, technical architecture, GitHub repository, live demo URL, and demo recording URL. P5 owns platform upload, Sunny owns URL health and repo safety, Feng owns FUEL_CONSUMP/data description, Eddie owns API/AI brief checks, and Chen owns calculation correctness. Upload starts at 12:00, target complete by 14:00, with 30 minutes reserved for link verification before the 14:30 hard deadline.
