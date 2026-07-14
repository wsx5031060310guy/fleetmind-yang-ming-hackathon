# Day1 Ops Runbook

> Owner：Sunny。目的：Day1 拿到 AWS/event account 後，用 30 分鐘確認部署、Bedrock、資料清理三件事是否可用。
> 原則：先保住 demo URL 與 deterministic dashboard；Bedrock 是加分，不得阻塞 55% 主分數。
> **2026-07-14 官方環境更新**（docs/22 §1）：region 白名單 **us-east-1（預設）/ us-west-2**——`AWS_REGION=us-east-1`，遇 access denied 先查 region。**Kiro**（官方 AI 開發工具）每人有固定 credit，賽前裝好註冊。S3 一律 Block Public Access；不建 wide-open SG / public RDS/EMR；Bedrock 請求節流、模型申請最小化。官方資料包已下載至 repo 外（`data/` gitignored）；賽後帳號自動回收，需要的資料/程式自行備份。

## 1. 先跑本機健康檢查

```bash
./scripts/test-core-calc.sh
./scripts/demo-local.sh
mvn -pl apps/api -am package
java -jar apps/api/target/fleetmind-api-0.1.0-SNAPSHOT.jar
./scripts/api-smoke.sh
```

本機 Maven 若未安裝，交給 GitHub Actions；不要為了修本機工具耗掉 Day1。

### 本機容器驗證（上雲前硬門檻）

```bash
./scripts/deploy-verify.sh
```

`PASS` 後才發布同一 Dockerfile 產物。腳本有 `data/` 時烘入真 metrics，驗 S1–S23；無 `data/` 時驗 demo fallback。Apple Silicon 上雲 build 強制 `linux/amd64`。失敗切換依 §3 表。

```bash
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
export ECR_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/fleetmind-api"
aws ecr describe-repositories --repository-names fleetmind-api >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name fleetmind-api >/dev/null
aws ecr get-login-password | docker login --username AWS --password-stdin \
  "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
docker buildx build --platform linux/amd64 -f apps/api/Dockerfile \
  -t "$ECR_URI:day1" --push .
```

App Runner（僅既有 customer；`APP_RUNNER_ECR_ROLE_ARN` 須可讀 ECR）：

```bash
aws apprunner create-service --service-name fleetmind-api \
  --source-configuration "{\"ImageRepository\":{\"ImageIdentifier\":\"$ECR_URI:day1\",\"ImageRepositoryType\":\"ECR\",\"ImageConfiguration\":{\"Port\":\"8080\"}},\"AutoDeploymentsEnabled\":false,\"AuthenticationConfiguration\":{\"AccessRoleArn\":\"$APP_RUNNER_ECR_ROLE_ARN\"}}" \
  --health-check-configuration Protocol=HTTP,Path=/api/health \
  --region "$AWS_REGION"
```

ECS Express Mode（role 要求見 §3）：

```bash
aws ecs create-express-gateway-service --service-name fleetmind-api \
  --primary-container "{\"image\":\"$ECR_URI:day1\",\"containerPort\":8080,\"environment\":[{\"name\":\"PORT\",\"value\":\"8080\"}]}" \
  --execution-role-arn "$ECS_TASK_EXECUTION_ROLE_ARN" \
  --infrastructure-role-arn "$ECS_INFRASTRUCTURE_ROLE_ARN" \
  --health-check-path /api/health --monitor-resources --region "$AWS_REGION"
```

EC2 docker fallback（EC2 完成 ECR login 後）：

```bash
docker pull "$ECR_URI:day1"
docker run -d --restart unless-stopped --name fleetmind-api \
  -e PORT=8080 -p 8080:8080 "$ECR_URI:day1"
```

## 2. AWS 權限探測

可先複製 `.env.example` 到本機 `.env` 填值；不要提交填好的 `.env`。

```bash
export AWS_REGION=us-east-1
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

> 時間採相對制：**T+0 = 資料與 AWS 環境實際開放**（官方預告 Day1 13:00 才能動手；若上午開幕即可提問，提問類項目提早做，不佔 T 時間軸）。

| 時間 | 動作 | Owner |
| --- | --- | --- |
| 開幕時段（若可提問） | 問 challenge link、提交格式、錄影格式、資料保留規定 | P5 |
| T+0〜T+20 | 平台/帳號問題確認、AWS credentials 到手驗證（`aws sts get-caller-identity`） | Sunny + P5 |
| T+20〜T+50 | 平行：依 `20-day1-schema-inventory.md` 跑 schema inventory 填 mapping（Feng + Chen）；`probe.sh` + Bedrock 真 invoke 煙測（Sunny） | Feng + Chen + Sunny |
| T+50 | 鎖定部署路線：App Runner / ECS Express / EC2 | Sunny + Eddie |
| T+120 | 第一個雲端 health URL 上線 | Sunny |
| T+240 | sample→real 垂直切片跑通（真資料進 dashboard + export） | 全員 |
| Day1 收工前 | demo URL、repo URL、fallback recording plan 都寫入提交 checklist | P5 |
| Day3 錄影前 | `BASE_URL=<live-url> ./scripts/freeze-demo-snapshot.sh --out build/demo-freeze`，凍結 API/AI/export 輸出 | Sunny + Feng |
| Day3 上台前 | `BASE_URL=<live-url> ./scripts/warmup-live-demo.sh --repeat 3`，暖機 dashboard/API/AI/export | Sunny |
| Day3 上傳前 | `./scripts/day3-final-check.sh`，確認 repo 安全、demo export、schema smoke 與 branch 狀態 | Sunny + P5 |

## 7. Stop rules

- 30 分鐘內沒有 App Runner create-service 路徑：立刻轉 ECS Express / EC2。
- 30 分鐘內 Bedrock invoke 不通：保留 fallback，不再追 model access；請主辦方協助。
- 任何部署路線影響 core-calc/FUEL_CONSUMP：砍部署路線，回本機/EC2。
