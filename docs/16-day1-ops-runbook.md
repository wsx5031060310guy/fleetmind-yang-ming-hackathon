# Day1 Ops Runbook

> Owner：Sunny。目的：Day1 拿到 AWS/event account 後，用 30 分鐘確認部署、Bedrock、資料清理三件事是否可用。
> 原則：先保住 demo URL 與 deterministic dashboard；Bedrock 是加分，不得阻塞 55% 主分數。

## 1. 先跑本機健康檢查

```bash
./scripts/test-core-calc.sh
./scripts/demo-local.sh
mvn -pl apps/api -am package
java -jar apps/api/target/fleetmind-api-0.1.0-SNAPSHOT.jar
./scripts/api-smoke.sh
```

本機 Maven 若未安裝，交給 GitHub Actions；不要為了修本機工具耗掉 Day1。

## 2. AWS 權限探測

可先複製 `.env.example` 到本機 `.env` 填值；不要提交填好的 `.env`。

```bash
export AWS_REGION=ap-northeast-1
./scripts/probe.sh --region "$AWS_REGION"
./scripts/bedrock-models.sh --region "$AWS_REGION"
```

若已有可用 Claude model 或 inference profile：

```bash
export FLEETMIND_BEDROCK_MODEL_ID=<model-id-or-inference-profile-id>
./scripts/probe.sh --region "$AWS_REGION" --bedrock-model-id "$FLEETMIND_BEDROCK_MODEL_ID"
```

判讀：

| 結果 | 決策 |
| --- | --- |
| S3 + DynamoDB + one container deployment path 綠 | 可以上主線。 |
| Bedrock list 綠但 invoke 紅 | 保留 deterministic fallback，請主辦方確認 model access/EULA。 |
| Bedrock 全紅 | demo 仍可跑；AI brief 顯示 deterministic fallback。 |
| App Runner 紅 | 不追，轉 ECS Express Mode 或 EC2 docker。 |

## 3. 部署路線裁決

AWS App Runner 2026 已不再開放新客戶；若 event account 不是既有 App Runner customer，`apprunner list-services` 可能可列但 create service 仍不可用。官方建議遷移方向是 ECS Express Mode；App Runner 只當「帳號已開通時的快路」。來源：[AWS App Runner availability change](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html)、[App Runner architecture](https://docs.aws.amazon.com/apprunner/latest/dg/architecture.html)。

| 優先序 | 路線 | 用法 |
| --- | --- | --- |
| 1 | Existing App Runner | 只有帳號已開通 App Runner 時用，最快拿 HTTPS service URL。 |
| 2 | ECS Express Mode | 需要 ECR image + `ecsTaskExecutionRole` + `ecsInfrastructureRoleForExpressServices`；官方說會建立 ECS/Fargate/ALB/autoscaling/default URL。 |
| 3 | EC2 docker | 最小 fallback：`docker build -f apps/api/Dockerfile -t fleetmind-api .` + `docker run -p 8080:8080 fleetmind-api`。 |
| 4 | Local recording | 只救上台，不救 official live demo link；Day1 必問主辦方是否接受錄影替代。 |

## 4. Bedrock model policy

- 不在程式裡 hard-code model id。
- Day1 以 `scripts/bedrock-models.sh` 列出 event account 實際可用 models / inference profiles。
- `FLEETMIND_BEDROCK_MODEL_ID` 是唯一 runtime switch。
- 若使用 inference profile，`invoke-model` 的 `model-id` 可填 inference profile ID/ARN。AWS CLI 文件明示 inference profile 可作為 `invoke-model` 的 model id：[invoke-model CLI](https://docs.aws.amazon.com/cli/latest/reference/bedrock-runtime/invoke-model.html)。
- Inference profile 清單用 AWS CLI `bedrock list-inference-profiles` 查：[list-inference-profiles CLI](https://docs.aws.amazon.com/cli/latest/reference/bedrock/list-inference-profiles.html)。
- 支援區域/模型會變，賽前只維持預期清單；Day1 實測結果才是準。

## 5. 資料清理

Dry-run：

```bash
./scripts/cleanup-event-data.sh \
  --region "$AWS_REGION" \
  --bucket "$FLEETMIND_DATA_BUCKET" \
  --table "$FLEETMIND_DDB_TABLE" \
  --local-snapshot-dir "$PWD/work/local-snapshots"
```

Execute：

```bash
./scripts/cleanup-event-data.sh \
  --region "$AWS_REGION" \
  --bucket "$FLEETMIND_DATA_BUCKET" \
  --table "$FLEETMIND_DDB_TABLE" \
  --local-snapshot-dir "$PWD/work/local-snapshots" \
  --execute --yes
```

只在官方確認「需刪除/封存競賽資料」後執行。Repo 不放 raw enterprise data。

## 6. Day1 交付物核對

Day3 七項提交物的完整管制表見 `18-submission-control-sheet.md`。

| 時間 | 動作 | Owner |
| --- | --- | --- |
| 09:40-10:00 | 問 challenge link、提交格式、錄影格式、資料保留規定 | P5 |
| 10:00-10:40 | 依 `20-day1-schema-inventory.md` 跑 schema inventory，填私有欄位 mapping | Feng + Chen + P5 |
| 10:40-11:00 | `probe.sh` + `bedrock-models.sh` | Sunny |
| 13:00 | 選部署路線：App Runner / ECS Express / EC2 | Sunny + Eddie |
| 14:00 | API skeleton live URL 或 EC2 URL 有 health check | Sunny |
| 17:00 | demo URL、repo URL、fallback recording plan 都寫入提交 checklist | P5 |
| Day3 錄影前 | `BASE_URL=<live-url> ./scripts/freeze-demo-snapshot.sh --out build/demo-freeze`，凍結 API/AI/export 輸出 | Sunny + Feng |
| Day3 上台前 | `BASE_URL=<live-url> ./scripts/warmup-live-demo.sh --repeat 3`，暖機 dashboard/API/AI/export | Sunny |
| Day3 上傳前 | `./scripts/day3-final-check.sh`，確認 repo 安全、demo export、schema smoke 與 branch 狀態 | Sunny + P5 |

## 7. Stop rules

- 30 分鐘內沒有 App Runner create-service 路徑：立刻轉 ECS Express / EC2。
- 30 分鐘內 Bedrock invoke 不通：保留 fallback，不再追 model access；請主辦方協助。
- 任何部署路線影響 core-calc/FUEL_CONSUMP：砍部署路線，回本機/EC2。
