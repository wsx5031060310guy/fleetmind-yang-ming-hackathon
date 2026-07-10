# Rental Mac Setup Checklist

Rental Mac target: macOS BSD userland, zsh, `/bin/bash` 3.2. Use event-only credentials. Remove repo and credentials before returning machine.

## 1. Base tools

Install Xcode Command Line Tools first:

```bash
xcode-select --install
```

If Homebrew is absent, install it from [brew.sh](https://brew.sh/). Then install required tools:

```bash
brew install openjdk@21 maven gh awscli
```

Add JDK 21 to zsh PATH and current shell:

```bash
echo 'export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"' >> ~/.zshrc
export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
```

Intel Mac Homebrew path is `/usr/local/opt/openjdk@21/bin`; replace `/opt/homebrew` when needed.

Ruby normally ships with macOS. Verify it; if missing, run `brew install ruby` and add Homebrew's printed PATH line.

```bash
git --version
gh --version
java -version
mvn -version
ruby --version
aws --version
```

## 2. Event credentials and clone

Authenticate GitHub, configure temporary event AWS credentials, then verify identity:

```bash
gh auth login
aws configure
aws sts get-caller-identity
gh repo clone OWNER/REPOSITORY fleetmind
cd fleetmind
```

Use AWS region `ap-northeast-1` unless event account specifies another. Never commit `.env`, access keys, session tokens, or raw Yang Ming data.

## 3. Four pre-event smoke commands

```bash
./scripts/test-core-calc.sh
./scripts/demo-local.sh
./scripts/submission-audit.sh --allow-non-main
./scripts/day3-final-check.sh --dev
```

All four must finish before event day. `submission-audit` may prominently warn about tracked `inputs/screenshots/`; strict Day3 mode turns this into failure via `--check-inputs`.
