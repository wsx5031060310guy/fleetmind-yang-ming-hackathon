#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ALLOW_DIRTY=false
ALLOW_NON_MAIN=false
SKIP_REMOTE_BRANCHES=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --allow-dirty)
      ALLOW_DIRTY=true
      shift
      ;;
    --allow-non-main)
      ALLOW_NON_MAIN=true
      shift
      ;;
    --skip-remote-branches)
      SKIP_REMOTE_BRANCHES=true
      shift
      ;;
    -h|--help)
      cat <<'EOF'
Usage:
  scripts/submission-audit.sh [--allow-dirty] [--allow-non-main] [--skip-remote-branches]

Default mode is for Day3 final upload: clean main branch, only origin/main as
remote branch, no raw enterprise data, no common secret patterns, and all
submission deliverable source files present.

During development, run:
  scripts/submission-audit.sh --allow-dirty --allow-non-main --skip-remote-branches
EOF
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

cd "$ROOT_DIR"

PASS=0
FAIL=0

pass() {
  echo "PASS $*"
  PASS=$((PASS + 1))
}

fail() {
  echo "FAIL $*" >&2
  FAIL=$((FAIL + 1))
}

check_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    pass "file exists: $file"
  else
    fail "missing file: $file"
  fi
}

check_executable() {
  local file="$1"
  if [[ -x "$file" ]]; then
    pass "executable: $file"
  else
    fail "not executable: $file"
  fi
}

check_markdown_links() {
  if ruby -e '
    bad = []
    Dir.glob("**/*.md").each do |file|
      text = File.read(file)
      text.scan(/\[[^\]]+\]\(([^)]+)\)/).flatten.each do |href|
        next if href =~ /\A(https?:|mailto:|#)/
        path = href.split("#", 2)[0]
        next if path.empty?
        next unless path.end_with?(".md")
        full = File.expand_path(path, File.dirname(file))
        bad << [file, href] unless File.exist?(full)
      end
    end
    bad.each { |file, href| puts "#{file}: #{href}" }
    exit(bad.empty? ? 0 : 1)
  ' >/tmp/fleetmind-md-link-check.txt; then
    pass "markdown .md links"
  else
    fail "markdown .md links"
    cat /tmp/fleetmind-md-link-check.txt >&2
  fi
}

required_files=(
  README.md
  docs/09-architecture-and-execution-plan.md
  docs/12-requirements-fit-and-final-architecture.md
  docs/15-presentation-readiness-pack.md
  docs/16-day1-ops-runbook.md
  docs/17-enterprise-data-application.md
  docs/18-submission-control-sheet.md
  docs/19-technical-architecture-submission.md
  docs/20-day1-schema-inventory.md
  docs/21-day2-stretch-gate.md
  samples/schema-map.template.csv
  presentation/fleetmind-proposal-deck.pptx
  presentation/fleetmind-proposal-deck-preview.webp
)

for file in "${required_files[@]}"; do
  check_file "$file"
done

for file in \
  scripts/test-core-calc.sh \
  scripts/demo-local.sh \
  scripts/api-smoke.sh \
  scripts/probe.sh \
  scripts/bedrock-models.sh \
  scripts/cleanup-event-data.sh \
  scripts/schema-inventory.sh \
  scripts/freeze-demo-snapshot.sh \
  scripts/validate-fuel-consump.sh \
  scripts/warmup-live-demo.sh; do
  check_executable "$file"
done

if [[ "$ALLOW_DIRTY" == "true" ]]; then
  pass "working tree may be dirty"
else
  if [[ -z "$(git status --porcelain)" ]]; then
    pass "working tree clean"
  else
    fail "working tree is dirty"
    git status --short >&2
  fi
fi

branch="$(git branch --show-current)"
if [[ "$ALLOW_NON_MAIN" == "true" || "$branch" == "main" ]]; then
  pass "branch check: $branch"
else
  fail "not on main branch: $branch"
fi

tracked_raw="$(git ls-files 'data/raw/*' 'data/private/*' ':!data/raw/.gitkeep' ':!data/private/.gitkeep')"
if [[ -z "$tracked_raw" ]]; then
  pass "no tracked data/raw or data/private files"
else
  fail "tracked raw/private data files found"
  echo "$tracked_raw" >&2
fi

tracked_sensitive_names="$(git ls-files | grep -E '(^|/)(\.env|\.env\..+|credentials|.*_rsa|.*_ed25519|.*\.pem|.*\.key)$' || true)"
if [[ -z "$tracked_sensitive_names" ]]; then
  pass "no tracked sensitive-looking filenames"
else
  fail "tracked sensitive-looking filenames found"
  echo "$tracked_sensitive_names" >&2
fi

secret_re='AKIA[0-9A-Z]{16}|aws_secret_access_key|BEGIN (RSA |OPENSSH |PRIVATE )?KEY|xox[baprs]-|ghp_[A-Za-z0-9_]{30,}'
if git grep -nE "$secret_re" -- . ':!scripts/submission-audit.sh' >/tmp/fleetmind-secret-scan.txt; then
  fail "possible secret patterns found"
  sed 's/^/  /' /tmp/fleetmind-secret-scan.txt >&2
else
  pass "no common secret patterns found"
fi

if [[ "$SKIP_REMOTE_BRANCHES" == "true" ]]; then
  pass "remote branch check skipped"
else
  remote_branches="$(git branch -r | sed 's/^[ *]*//' | grep -vE '^(origin/HEAD -> origin/main|origin/main)$' || true)"
  if [[ -z "$remote_branches" ]]; then
    pass "only origin/main remote branch remains"
  else
    fail "extra remote branches found"
    echo "$remote_branches" >&2
  fi
fi

check_markdown_links

if git diff --check >/tmp/fleetmind-diff-check.txt && git diff --cached --check >>/tmp/fleetmind-diff-check.txt; then
  pass "git diff --check and git diff --cached --check"
else
  fail "git diff --check and git diff --cached --check"
  cat /tmp/fleetmind-diff-check.txt >&2
fi

echo "SUMMARY pass=$PASS fail=$FAIL"
[[ "$FAIL" -eq 0 ]]
