# 26 · AWS live demo 部署 recipe（Day1 已實測上線）

> Owner：Sunny / Eddie。目的：把單服務 Spring Boot 容器部署到主辦 workshop 帳號，取得 **Live demo URL**（提交物 #5）。
> **2026-07-14 Day1 已實測**：映像已上 ECR、ECS Fargate 已跑起、真資料 dashboard + 真 Bedrock AI 簡報皆通。本檔記錄可重跑的步驟；賽場憑證/IP 為臨時，Day3 重跑即可。

## 0. 環境現實（實測發現）

- **憑證**：workshop 由 Workshop Studio「AWS CLI」面板發 STS 臨時金鑰（`AWS_ACCESS_KEY_ID`/`SECRET`/`SESSION_TOKEN`），數小時到期。帳號 `516665228894`、角色 `WSParticipantRole`、region `us-east-1`。
- **能力**（實測 probe）：S3 / Bedrock（list + invoke）/ ECR / ECS / EC2 / Lambda / DynamoDB / IAM(CreateRole) 皆 OK；**App Runner 拒絕（AccessDenied）** → 部署走 **ECS Fargate**。
- **本機 `aws` CLI 可能壞**（bundled Python 缺 cffi）＋ RTK hook 干擾 → 用 **boto3**（`AWS_PROFILE=workshop`）或 docker `amazon/aws-cli` 走 AWS API。
- **架構**：本機 Apple Silicon build 出 **arm64** 映像 → Fargate 預設 x86_64 會 `exec format error`。**task def 必設 `runtimePlatform.cpuArchitecture=ARM64`**（或改 `docker buildx --platform linux/amd64` build）。
- **Bedrock 模型**：裸 model id 會 `ValidationException`，要用 **inference profile id**：`us.anthropic.claude-haiku-4-5-20251001-v1:0`（`us.` 前綴）。

## 1. 本機先驗容器（docker 開著）

```bash
./scripts/deploy-verify.sh          # build 映像 + demo/real 兩模式 + api-smoke + 清理
```

過關即代表映像 OK（含烤入的 `real-metrics.json`）。

## 2. 產真 metrics + build 映像

```bash
export AWS_REGION=us-east-1
MAIN_CLASSES="$(./scripts/compile-core-calc.sh)"
java -cp "$MAIN_CLASSES" com.fleetmind.corecalc.MetricsExportCli --data-dir data --out core-calc/target/real-metrics.json
# 映像烤入 metrics（Dockerfile 會在 build context 有檔時 COPY）；用絕對路徑 context 避免 cwd 問題
docker build -f apps/api/Dockerfile -t fleetmind-api:latest "$(pwd)"
```

## 3. 推 ECR

```bash
# 建 repo（一次）
aws ecr create-repository --repository-name fleetmind-api   # 或 boto3
# 登入 + 推
REPO=516665228894.dkr.ecr.us-east-1.amazonaws.com/fleetmind-api
aws ecr get-login-password | docker login --username AWS --password-stdin "${REPO%/*}"
docker tag fleetmind-api:latest "$REPO:latest"
docker push "$REPO:latest"
```

## 4. IAM（一次）

- **執行角色** `fleetmind-ecs-exec`：trust `ecs-tasks.amazonaws.com`，附 `arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy`（ECR pull + logs）。
- **task 角色** `fleetmind-ecs-task`：trust `ecs-tasks`，inline 允許 `bedrock:InvokeModel` + `bedrock:InvokeModelWithResponseStream`（`Resource:"*"`）——AI 簡報用。
- CloudWatch log group `/fleetmind/api`。

## 5. ECS Fargate task

- cluster `fleetmind`；task def `fleetmind-api`：Fargate、`cpu 512 / memory 1024`、**`runtimePlatform ARM64/LINUX`**、上述兩角色、container port 8080、awslogs → `/fleetmind/api`。
- **env**：`PORT=8080`、`AWS_REGION=us-east-1`、`FLEETMIND_BEDROCK_MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0`（映像已烤 metrics，故 `FLEETMIND_METRICS_FILE` 由 entrypoint 預設）。
- 網路：預設 VPC 的 public subnet、SG 開 inbound `tcp/8080`（`0.0.0.0/0`，評審要開得了）、`assignPublicIp=ENABLED`。
- `run_task` 後等 `RUNNING`，從 task attachment 的 ENI 取 **public IP** → `http://<ip>:8080`。

## 6. 驗證（實測全過）

```bash
curl http://<ip>:8080/api/health                                  # {"status":"ok"}
curl http://<ip>:8080/api/fleet/summary                           # 15 真船 S1..S23
curl -X POST http://<ip>:8080/api/vessels/S23/ai-brief            # mode=bedrock, guardrail passed=true
```

Day1 實測：15 船、S23 ai-brief 走真 Bedrock（Claude），每個數字帶 `[metric_id]` 引用、過 guardrail。

## 7. 注意事項

- **IP 是臨時的**：task 重啟就換 IP。Day3 收官時重跑 task 取新 IP，更新提交的 live demo 連結（`build/submission-links.txt`，gitignored）。
- 若要穩定 URL：可加 ALB（需更多 IAM/VPC）或用 Elastic IP + EC2；hackathon demo 以 Fargate public IP 為最省路徑。
- **Bedrock guardrail**：system prompt 已要求「除 cited 數值外不得出現任何數字、不用編號清單」，否則 Claude 的年份/清單序號會被 guardrail 判 uncited 而 fallback（見 `AiBriefPrompt`）。
- 賽後帳號自動回收；不需手動清 ECS/ECR（但可 `stop_task` + 刪 repo 收尾）。
