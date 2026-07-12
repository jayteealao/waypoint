---
schema: sdlc/v1
type: pipeline-compliance
created-at: "2026-07-12T10:30:01Z"
updated-at: "2026-07-12T10:30:01Z"
plan-version-at-run: 2
ship-meaning: deploy-immutable
ecosystem: Node.js (pnpm 10, node 22, Cloudflare Workers)
files-created:
  - .github/workflows/deploy.yml
  - .github/workflows/release-cut.yml
  - .github/workflows/codeql.yml
  - .github/workflows/pr-title.yml
  - .github/workflows/rollback.yml
  - commitlint.config.js
  - lefthook.yml
  - .editorconfig
  - .nvmrc
  - CONTRIBUTING.md
  - .github/PULL_REQUEST_TEMPLATE.md
  - docs/runbooks/cloudflare-token-401.md
  - docs/runbooks/d1-migration-failed.md
  - docs/runbooks/deploy-size-limit.md
files-patched:
  - .github/workflows/ci.yml
files-compliant:
  - .npmrc (save-exact=true)
  - package.json (task-runner targets, pinned deps, packageManager)
audits:
  A-pre-merge-checks: fixed
  B-release-trigger: fixed
  C-release-jobs: fixed
  D-dry-run-cmd: fixed
  E-publish-cmd: fixed
  F-required-secrets: fixed
  G-version-bump: fixed
  H-post-publish: fixed
  I-rollback: fixed
  J-runbooks: fixed
  K-quality-gates: fixed
  L-commit-pr-title: fixed
  M-git-hooks: fixed
  N-dx-files: fixed
  O-governance: fixed
  P-security: fixed
  Q-env-protection: fixed
  R-merge-controls: fixed
  S-ci-ergonomics: fixed
branch-protection-applied: yes
environment-protection-applied: yes
merge-settings-applied: yes
secrets-to-set-manually:
  - { name: "CLOUDFLARE_API_TOKEN", purpose: "Deploy the Worker and apply D1 migrations (needs Workers:Edit + D1:Edit).", command: "gh secret set CLOUDFLARE_API_TOKEN" }
  - { name: "CLOUDFLARE_ACCOUNT_ID", purpose: "Target Cloudflare account for wrangler deploy.", command: "gh secret set CLOUDFLARE_ACCOUNT_ID" }
deps-to-install:
  - { name: "gitleaks", reason: "pre-commit secret-scan hook (system binary, not on npm; CI uses gitleaks-action instead)", command: "winget install gitleaks  # or: scoop install gitleaks" }
validation:
  yaml-syntax: pass
  actionlint: skipped
  config-syntax: pass
---

# Pipeline Compliance — Waypoint

## Files created

- `.github/workflows/deploy.yml` — CD: build → d1-migrate → deploy → post-publish; merge to `main` → staging, tag `vX.Y.Z` → production (gated by the `production` Environment); `workflow_dispatch` fallback for tag deploys; `concurrency` block, pnpm cache.
- `.github/workflows/release-cut.yml` — `workflow_dispatch` on `main`: git-cliff bump → sync `package.json` → regenerate `CHANGELOG.md` → commit → tag `vX.Y.Z` → push.
- `.github/workflows/codeql.yml` — SAST on PR + weekly schedule (job/context `codeql`).
- `.github/workflows/pr-title.yml` — semantic PR-title lint (job/context `semantic-pull-request`).
- `.github/workflows/rollback.yml` — `workflow_dispatch`: `wrangler rollback` per env (env-gated for production), code-only per the expand-contract migration policy.
- `commitlint.config.js` — conventional config, **ESM export** (repo is `"type": "module"`).
- `lefthook.yml` — pre-commit (oxlint, oxfmt check, gitleaks staged), commit-msg (commitlint), pre-push (tsc, vitest).
- `.editorconfig`, `.nvmrc` (node 22), `CONTRIBUTING.md`, `.github/PULL_REQUEST_TEMPLATE.md`.
- `docs/runbooks/{cloudflare-token-401,d1-migration-failed,deploy-size-limit}.md` — seeded from plan Block F.

## Files patched

- `.github/workflows/ci.yml` — in-place extension per Block C (no job fan-out): `fetch-depth: 0` on checkout (commitlint range), `Format check` step (`oxfmt --check .`), `Commit lint` step (PR-only), `Publish dry-run` step (`pnpm run build && pnpm exec wrangler deploy --dry-run --outdir dist`), sibling `gitleaks` job.

## Secrets requiring manual configuration

| Secret | Purpose | Command |
|---|---|---|
| CLOUDFLARE_API_TOKEN | Deploy Worker + apply D1 migrations (Workers:Edit + D1:Edit) | `gh secret set CLOUDFLARE_API_TOKEN` |
| CLOUDFLARE_ACCOUNT_ID | Target Cloudflare account (`de4b5da923deecf6e2cc1eb5e61ff635`) | `gh secret set CLOUDFLARE_ACCOUNT_ID` |

Worker runtime secrets (`OPENROUTER_API_KEY`, `BETTER_AUTH_*`, `GOOGLE_/GITHUB_CLIENT_*`) are set via `wrangler secret put <NAME> --env <env>`, not GitHub Actions — required before the first production deploy.

## Dev dependencies to install

All npm-side tools are already pinned devDependencies (lefthook, commitlint, git-cliff, oxfmt, oxlint, wrangler) — nothing to add. One system binary:

| Package | For | Command |
|---|---|---|
| gitleaks | pre-commit secret-scan hook | `winget install gitleaks` (or `scoop install gitleaks`) |

## Remote settings (gated)

- **Branch protection:** `yes` — applied to `main`: required checks `ci`, `codeql`, `gitleaks`, `semantic-pull-request`; 0 approvals; conversation resolution + linear history required; force-pushes/deletions blocked; admins not enforced.
- **Environment protection:** `yes` — `production` environment created: required reviewer @jayteealao (id 5901851), wait-timer 0, **custom deployment policy allowing tag pattern `v*`** (deviation: plan says `protected`, which would block tag-triggered production deploys — update Block A via `/wf ship-plan edit`).
- **Merge settings:** `yes` — rebase-and-merge only (squash + merge-commit disabled, auto-merge off).

## Warnings

1. **Hooks are inert until wired**: run `pnpm exec lefthook install` once (or any fresh `pnpm install`) to write `.git/hooks`. The pre-commit secret-scan also needs the gitleaks system binary installed locally.
2. **`<subdomain>` placeholder** in `deploy.yml` smoke tests — the step warns-and-skips until you fill the account's workers.dev subdomain (after the first deploy prints it) in both `deploy.yml` and ship-plan Block D.
3. **Release-cut tags don't auto-deploy**: tags pushed with `GITHUB_TOKEN` don't trigger workflows. After Release Cut, run Deploy via `workflow_dispatch` selecting the new `vX.Y.Z` tag as ref (documented in CONTRIBUTING.md).
4. **Repo default branch is `feat/waypoint-app`**, not `main` — protection targets `main` per the plan; consider `gh repo edit --default-branch main`.
5. **Deployment-policy deviation** (see above): applied `v*` tag policy instead of the plan's `protected` — reconcile the plan via `/wf ship-plan edit`.
6. `actionlint` not found — workflow linting skipped. Install via `go install github.com/rhysd/actionlint/cmd/actionlint@latest` to validate locally.
7. `pnpm exec` prefixes were used where the plan's literal commands invoke `wrangler`/`oxfmt`/`commitlint` bare — node_modules/.bin is not on PATH in `run:` steps.

## Validation

- YAML syntax: **pass** — ci.yml, deploy.yml, release-cut.yml, codeql.yml, pr-title.yml, rollback.yml, lefthook.yml all parse.
- actionlint: **skipped** (not installed).
- Config syntax: **pass** — commitlint.config.js is plain ESM; lefthook.yml valid YAML.

## Re-run compliance check

After setting secrets and pushing, re-run this command to verify full compliance:
```
/wf ship-plan build --dry-run
```
