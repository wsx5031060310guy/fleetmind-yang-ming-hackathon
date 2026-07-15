#!/usr/bin/env -S uv run --with boto3 --script
"""One-shot deploy of the current build to the workshop account.

    AWS_PROFILE=workshop uv run --with boto3 scripts/deploy-aws.py [--skip-build]

Workshop STS credentials are short-lived, so this does the whole run unattended:
guard -> login -> build -> push -> new task-def revision -> update service ->
wait -> verify what is actually being served.

Notes that cost real time to learn, kept here so the next run does not re-learn them:

* The local `aws` CLI is broken in this environment (ModuleNotFoundError:
  _cffi_backend) and a shell hook rewrites bare `aws`, so everything goes
  through boto3.
* Never `docker tag "$REPO:latest"` from a shell variable that already ends in a
  colon-ish expansion -- an earlier run produced `fleetmind-apiatest` because the
  `:l` was eaten. Tags here are built as explicit literals.
* The task definition is read and re-registered with only the image swapped.
  Do not hand-write a fresh one: revision 5 carries FLEETMIND_SES_RECIPIENTS,
  which SES needs (it rejects the whole batch if any recipient is unverified).
* Verification compares the sha256 of a served asset against the local file.
  An HTTP 200 only proves the old task is alive, which is exactly the failure
  this is meant to catch.
"""

import argparse
import base64
import hashlib
import pathlib
import subprocess
import sys
import time
import urllib.request

import boto3

WORKSHOP_ACCOUNT = "516665228894"  # never the personal account (710271938872)
REGION = "us-east-1"
REPO = f"{WORKSHOP_ACCOUNT}.dkr.ecr.{REGION}.amazonaws.com/fleetmind-api"
CLUSTER = "fleetmind"
FAMILY = "fleetmind-api"
BASE_URL = "http://fleetmind-alb-330672315.us-east-1.elb.amazonaws.com"
ROOT = pathlib.Path(__file__).resolve().parent.parent
# A slide is the sharpest probe available: it changes whenever the deck is
# regenerated, so a stale byte-for-byte match means the rollout did not land.
PROBE = "deck/slide-05.jpg"
PROBE_FILE = ROOT / "apps/api/src/main/resources/static" / PROBE


def sh(cmd, **kw):
    print(f"  $ {' '.join(cmd)}", flush=True)
    return subprocess.run(cmd, check=True, **kw)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-build", action="store_true", help="reuse the local fleetmind-deck-build image")
    args = ap.parse_args()

    # --- guard: right account, live credentials -----------------------------
    try:
        ident = boto3.client("sts", region_name=REGION).get_caller_identity()
    except Exception as e:
        sys.exit(f"FAIL: no usable credentials ({type(e).__name__}).\n"
                 f"Workshop STS credentials are ephemeral -- refresh [workshop] in ~/.aws/credentials.")
    if ident["Account"] != WORKSHOP_ACCOUNT:
        sys.exit(f"REFUSING: credentials are for account {ident['Account']}, "
                 f"expected the workshop account {WORKSHOP_ACCOUNT}.")
    print(f"account {ident['Account']} OK")

    # --- ecr login ----------------------------------------------------------
    tok = boto3.client("ecr", region_name=REGION).get_authorization_token()
    user, pwd = base64.b64decode(tok["authorizationData"][0]["authorizationToken"]).decode().split(":", 1)
    subprocess.run(["docker", "login", "-u", user, "--password-stdin", REPO.split("/")[0]],
                   input=pwd.encode(), check=True, stdout=subprocess.DEVNULL)
    print("ecr login OK")

    # --- build + push -------------------------------------------------------
    local_tag = "fleetmind-deck-build"
    if not args.skip_build:
        sh(["docker", "build", "--platform", "linux/arm64",
            "-f", str(ROOT / "apps/api/Dockerfile"), "-t", local_tag, str(ROOT)])
    remote_tag = REPO + ":latest"  # built as a literal; see module docstring
    sh(["docker", "tag", local_tag, remote_tag])
    sh(["docker", "push", remote_tag])

    ecr = boto3.client("ecr", region_name=REGION)
    digest = ecr.describe_images(repositoryName="fleetmind-api",
                                 imageIds=[{"imageTag": "latest"}])["imageDetails"][0]["imageDigest"]
    pinned = f"{REPO}@{digest}"
    print(f"pushed {digest}")

    # --- new task-def revision, image swapped, everything else preserved ----
    ecs = boto3.client("ecs", region_name=REGION)
    cur = ecs.describe_task_definition(taskDefinition=FAMILY)["taskDefinition"]
    for c in cur["containerDefinitions"]:
        c["image"] = pinned
    new = ecs.register_task_definition(**{
        k: cur[k] for k in ("family", "taskRoleArn", "executionRoleArn", "networkMode",
                            "containerDefinitions", "requiresCompatibilities", "cpu",
                            "memory", "runtimePlatform") if k in cur
    })["taskDefinition"]
    rev = f"{FAMILY}:{new['revision']}"
    print(f"registered {rev}")

    # --- roll it out --------------------------------------------------------
    svc = ecs.list_services(cluster=CLUSTER)["serviceArns"][0].split("/")[-1]
    ecs.update_service(cluster=CLUSTER, service=svc, taskDefinition=rev, forceNewDeployment=True)
    print(f"updating service {svc} -> {rev}; waiting for the old task to drain")
    for _ in range(60):
        time.sleep(10)
        d = ecs.describe_services(cluster=CLUSTER, services=[svc])["services"][0]["deployments"]
        # One deployment left means the old task is gone. Sampling before that
        # can hit either task, so any check now would be a coin flip.
        print(f"  deployments={len(d)} running={sum(x['runningCount'] for x in d)}")
        if len(d) == 1 and d[0]["runningCount"] >= 1 and d[0]["rolloutState"] == "COMPLETED":
            break
    else:
        sys.exit("FAIL: rollout did not converge in 10 minutes")

    # --- verify what is actually served -------------------------------------
    want = hashlib.sha256(PROBE_FILE.read_bytes()).hexdigest()
    for attempt in range(10):
        time.sleep(5)
        try:
            got = hashlib.sha256(urllib.request.urlopen(f"{BASE_URL}/{PROBE}", timeout=10).read()).hexdigest()
        except Exception as e:
            print(f"  probe {attempt}: {type(e).__name__}")
            continue
        if got == want:
            print(f"\nOK: {BASE_URL} is serving the new build ({PROBE} sha256 matches local)")
            return
        print(f"  probe {attempt}: served sha {got[:12]} != local {want[:12]}")
    sys.exit(f"FAIL: {PROBE} served by the ALB never matched the local file -- "
             f"the rollout reported success but stale content is live.")


if __name__ == "__main__":
    main()
