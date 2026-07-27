# CW CI Integration Guide

Cyclewarden (CW) is designed to run in any CI environment that supports Node.js and Git. By integrating CW into your CI/CD pipeline, you can automatically verify that AI agents adhere to their task contracts before their changes are merged.

## GitHub Actions

CW provides a reusable composite action to easily integrate verification into your GitHub workflows.

### 1. Using the Reusable Workflow

You can call the reusable workflow directly from your own repository:

```yaml
name: Verify Task

on:
  pull_request:
    branches: [ main ]

jobs:
  verify-ai-task:
    uses: Thunderkill016/cw/.github/workflows/cw-verify.yml@main
    with:
      contract-path: .cw/tasks/my-task/contract.json
      # fail-on-inconclusive: true # Optional: Fail if verification requires human review
```

### 2. Using the Composite Action

For more control, you can use the composite action inside your own job:

```yaml
name: Verify Task

on:
  pull_request:
    branches: [ main ]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run CW Verification
        uses: Thunderkill016/cw/.github/actions/cw-verify@main
        with:
          contract-path: .cw/tasks/my-task/contract.json
```

This action automatically comments on the PR with the verification results.

---

## GitLab CI

For GitLab CI, you can use the generic `npx cw verify` command. Here is an example `.gitlab-ci.yml` snippet:

```yaml
image: node:20

stages:
  - verify

cw-verify:
  stage: verify
  rules:
    - if: $CI_PIPELINE_SOURCE == 'merge_request_event'
  script:
    - npm install -g cw
    - npx cw verify --contract .cw/tasks/my-task/contract.json --trusted-repository
```

*Note:* You must pass the `--trusted-repository` flag in CI to acknowledge that the verification may execute local commands specified in the contract.

---

## Generic CI (Node.js & Git)

If you are using Jenkins, CircleCI, Bitbucket Pipelines, or any other CI tool, the integration involves simply installing Node.js and running the CW CLI:

```bash
# 1. Ensure Node.js 20+ and Git are installed
node -v
git --version

# 2. Install CW globally (or use npx directly)
npm install -g cw

# 3. Run the verification command
npx cw verify --contract .cw/tasks/my-task/contract.json --trusted-repository
```

CW returns an exit code representing the verification verdict:
- `0`: Accepted (or Inconclusive, depending on your setup and wrapper script)
- `2`: Rejected
- `3`: Inconclusive

---

## Pre-commit Hook Integration

You can integrate CW into your local developer workflow using a pre-commit hook to prevent unverified code from being committed.

Run the following command to install the hook:

```bash
npx cw init --auto
```

*(You can also set up pre-commit manually or via your favorite tool like Husky by adding the verification command to the pre-commit script).*

For example, a generic pre-commit script `.git/hooks/pre-commit`:

```bash
#!/bin/bash

# Ensure all contracts pass verification
for contract in $(find .cw/tasks -name 'contract.json'); do
  echo "Verifying $contract..."
  if ! npx cw verify --contract "$contract" --trusted-repository; then
    echo "CW Verification failed for $contract. Commit aborted."
    exit 1
  fi
done
```
