---
schema: sdlc/v1
type: ship-plan
slug: waypoint
plan-version: 3
created-at: "2026-07-12T09:25:48Z"
updated-at: "2026-07-12T10:32:00Z"
project-name: "Waypoint"
template-hint: none

# === Required core — read by /wf ship ===

# Block A — what ship means
ship-meaning: deploy-immutable          # Cloudflare Workers immutable versioned deploy via wrangler
ship-environments:
  - name: "staging"
    auto-promote: true                   # deploys automatically on merge to main
  - name: "production"
    auto-promote: false                  # promoted by pushing a vX.Y.Z tag, gated by Environment approval
    protection:
      required-reviewers: ["@jayteealao"]   # repo owner; adjust once a remote/team exists
      wait-timer-minutes: 0
      # custom tag policy, not "protected": production deploys are tag-triggered (vX.Y.Z), and
      # GitHub's protected-branches policy rejects tag refs. Applied live 2026-07-12 (plan v3).
      deployment-branch-policy: { custom-branch-policies: true, tag-patterns: ["v*"] }
ship-cadence: per-merge                  # staging on every merge; production on tag

# Block B — versioning contract
version-scheme: semver
version-source-of-truth:
  - { path: "git", field: "tag" }                 # canonical: annotated tag vX.Y.Z
  - { path: "package.json", field: "version" }    # kept in sync with the tag
version-bump-rule: git-cliff             # derive next version from Conventional Commits
# Derives the next version AND writes it into package.json so both sources of truth stay in sync.
version-bump-cmd: "NEW=$(pnpm exec git-cliff --bumped-version) && pnpm version --no-git-tag-version --allow-same-version \"${NEW#v}\""
prerelease-suffix: none
post-release-version: none
post-release-version-cmd: ""

# Block C — CI/CD contract
# CI shape: the checks below do NOT each get their own job. The existing single `ci` job in
# .github/workflows/ci.yml is extended in place with the missing steps (build must NOT create
# duplicate per-check jobs). Job/context mapping for branch protection:
#   ci                     → single job in ci.yml: typecheck, lint, format-check, unit-tests,
#                            e2e-tests, supply-chain-audit, pin-check, commit-lint (steps)
#   gitleaks               → sibling job `gitleaks` added to ci.yml
#   codeql                 → its own workflow (codeql.yml)
#   semantic-pull-request  → its own workflow (pr-title.yml), job named semantic-pull-request
ci-pipeline:
  pre-merge-checks:
    - typecheck            # tsc --noEmit                    (step in `ci` job — exists)
    - lint                 # oxlint                          (step in `ci` job — repoint from tsc)
    - format-check         # oxfmt --check .                 (step in `ci` job — add)
    - unit-tests           # vitest run                      (step in `ci` job — exists)
    - e2e-tests            # playwright (chromium)           (step in `ci` job — exists)
    - supply-chain-audit   # pnpm audit --audit-level=high   (step in `ci` job — exists)
    - pin-check            # custom: no floating ^/~/latest  (step in `ci` job — exists)
    - commit-lint          # commitlint on PR commits        (step in `ci` job — add)
    - secret-scan          # gitleaks                        (own job `gitleaks` in ci.yml — add)
    - codeql               # SAST on PR                      (own workflow — add)
    - pr-title-lint        # semantic PR title               (own workflow — add)
  release-trigger: "merge-to-main → staging; tag vX.Y.Z → production"
  release-workflow-file: ".github/workflows/deploy.yml"   # created by /wf ship-plan build
  release-jobs: [build, "d1-migrate", deploy, post-publish]
  publish-dry-run-cmd: "pnpm run build && wrangler deploy --dry-run --outdir dist"
  publish-cmd: "pnpm run build && wrangler deploy --env production"
  required-secrets:
    - { name: "CLOUDFLARE_API_TOKEN", purpose: "Deploy the Worker and apply D1 migrations (needs Workers:Edit + D1:Edit)." }
    - { name: "CLOUDFLARE_ACCOUNT_ID", purpose: "Target Cloudflare account for wrangler deploy." }
  secrets-staleness-threshold-days: 90
  ci-ergonomics:
    dep-cache: true
    matrix: { os: ["ubuntu-latest"], versions: ["22"] }
    release-concurrency: true
    path-filters: false

# Block D — post-publish verification contract
# Per-env smoke URLs. <subdomain> is the account's workers.dev subdomain — fill in after the
# first deploy prints it (both URLs share it). Staging worker: waypoint-staging; production: waypoint.
post-publish-checks:
  - { kind: smoke-test, env: staging, cmd: "curl -fsS https://waypoint-staging.<subdomain>.workers.dev/", expect: "HTTP 200" }
  - { kind: smoke-test, env: production, cmd: "curl -fsS https://waypoint.<subdomain>.workers.dev/", expect: "HTTP 200" }
  - { kind: wrangler-deployments, cmd: "wrangler deployments list --env <env>", expect: "newest deployment matches released version" }
propagation-window-min-minutes: 1
propagation-window-max-minutes: 5
poll-interval-seconds: 15

# Block E — rollout + rollback contract
rollout-strategy: immediate              # each Workers deploy is atomic + global
rollback-mechanism: redeploy-prior       # wrangler rollback to the previous immutable version
rollback-time-estimate-min: 2
db-migrations-reversible: true           # policy going forward; see irreversible note in prose
# rollback-cmd: wrangler rollback           (or: wrangler versions deploy <prior-version-id>)
# rollback-verify-cmd: reuse Block D smoke-test
# prior-artifact-retention: Cloudflare retains recent Worker versions (typically last ~10)
# irreversible-steps: migrations 0000–0003 are forward-only SQL; expand-contract required for future breaking schema changes

# Block F — recovery playbooks
recovery-playbooks:
  - id: cloudflare-token-401
    triggers: ["(?i)authentication error", "(?i)unauthorized", "code: ?10000"]
    steps:
      - "Confirm CLOUDFLARE_API_TOKEN has Workers:Edit + D1:Edit scopes and is not expired."
      - "Rotate the token in the Cloudflare dashboard and update the GitHub Actions secret."
      - "Re-run the deploy job."
  - id: d1-migration-failed
    triggers: ["(?i)d1_error", "(?i)migration", "(?i)sqlite"]
    steps:
      - "Read the failing migration in migrations/ and the wrangler d1 migrations apply output."
      - "Do NOT edit an already-applied migration; author a new forward migration that fixes state (expand-contract)."
      - "Apply to staging first (wrangler d1 migrations apply DB --env staging --remote), verify, then production."
  - id: deploy-size-limit
    triggers: ["(?i)exceeds.*(size|limit)", "(?i)script.*too large", "(?i)worker.*exceeded"]
    steps:
      - "Inspect the bundle (wrangler deploy --dry-run --outdir dist) and identify large deps."
      - "Trim or lazy-load; verify the Worker stays under the Cloudflare size limit."

# Block G — stakeholder + announcement contract
announcement:
  channels: []                           # none configured — solo project
  template-path: ""                      # none — set alongside the first channel if that changes

# === Inbound half — read by /wf ship-plan build (and the local gate in /wf handoff) ===

# Block H — code-quality gates
code-quality:
  format-check: { tool: "oxfmt", cmd: "oxfmt --check ." }        # oxfmt@0.58.0 — pinned devDependency, installed and verified
  lint:         { tool: "oxlint", cmd: "oxlint" }
  type-check:   { tool: "tsc", cmd: "tsc --noEmit" }
  test-coverage: { min-percent: null, cmd: "pnpm test:coverage" }  # measured, not gated
  commit-convention:   { spec: conventional, config-path: "commitlint.config.js", enforce: [local, ci] }
  pr-title-convention: { spec: conventional, enforce: [ci] }

# Block I — local developer experience
local-dx:
  git-hooks:
    framework: lefthook
    hooks:
      pre-commit: ["oxlint", "oxfmt --check .", "gitleaks protect --staged"]
      commit-msg: ["commitlint --edit"]
      pre-push:   ["tsc --noEmit", "vitest run"]
  editorconfig: true
  runtime-version-files: [".nvmrc"]      # node 22 (pnpm pinned via package.json packageManager)
  task-runner: { kind: npm-scripts, targets: { dev: "vite dev --port 3000", build: "vite build", test: "vitest run", "test:e2e": "playwright test", deploy: "pnpm run build && wrangler deploy --env staging" } }
  bootstrap-cmd: "pnpm install"
  contributing-doc: true

# Block J — repo governance
governance:
  branch-protection:
    base-branch: "main"
    mechanism: branch-protection
    required-checks: ["ci", "codeql", "gitleaks", "semantic-pull-request"]
    required-approvals: 0
    dismiss-stale-reviews: false
    require-up-to-date: false
    enforce-admins: false
    require-code-owner-reviews: false
    require-conversation-resolution: true
    require-linear-history: true
    allow-force-pushes: false
    allow-deletions: false
    apply-via: gh-api
  codeowners: []                         # solo repo — none
  pr-template: true
  issue-templates: false
  dependency-automation: { tool: none, ecosystems: [], schedule: "" }
  merge: { method: rebase, auto-merge: false, merge-queue: false }   # "Rebase and merge" button; linear history

# Block K — security & supply-chain gates
security:
  sast:             { tool: codeql, cmd: "", schedule: "weekly" }   # CodeQL workflow: on PR + weekly schedule
  dependency-audit: { tool: "pnpm-audit", cmd: "pnpm audit --audit-level=high", fail-on: high }
  secret-scanning:  { tool: gitleaks, cmd: "gitleaks detect --no-banner", pre-commit: true }
  sbom:             { tool: none, format: cyclonedx, publish-with-release: false }
  license-check:    { tool: "none", allow: [], deny: [] }

# === Extensions — open schema, not read by /wf ship unless a consumer opts in by id ===

additional-contracts:
  - id: data-migration
    purpose: "D1 schema migrations are applied as part of every deploy and must be written backward-compatible."
    fields:
      tool: wrangler-d1
      migrations-dir: migrations/
      binding: DB
      databases:
        staging:    { name: waypoint-staging, id: "0ea56221-8a9e-479f-b8f1-f59720eceb6c" }
        production: { name: waypoint-prod,    id: "9254f3af-c97c-4ade-a074-9117d22aaf52" }
      apply-cmd: "wrangler d1 migrations apply DB --env <env> --remote"
      apply-order: "before wrangler deploy, staging first then production"
      reversibility-policy: "expand-contract; no destructive change without a preceding compatible release"
      existing-forward-only: "0000_schema_v1, 0001_interview_state, 0002_adaptations, 0003_source_grounding"
    enforced-by: "CD d1-migrate job + PR review"
  - id: pin-check
    purpose: "Every dependency in package.json must be exactly pinned (no ^ / ~ / latest)."
    fields:
      policy: "save-exact=true (.npmrc); CI fails on any floating range"
      check: "node -e inline script in CI (see .github/workflows/ci.yml)"
    enforced-by: "CI pin-check step + .npmrc save-exact"
---

# Ship Plan — Waypoint

## What "ship" means here

Waypoint is a TanStack Start (React 19) application that runs on **Cloudflare Workers** with a **D1** database. "Ship" means an **immutable Worker deploy** via `wrangler deploy --env <staging|production>` — not a package publish. Each deploy is a content-addressed Cloudflare version that can be rolled back instantly. The pipeline promotes through two environments: merging to `main` deploys to **staging** (worker `waypoint-staging`, D1 `waypoint-staging`) automatically; pushing an annotated `vX.Y.Z` tag deploys to **production** (worker `waypoint`, D1 `waypoint-prod`), gated by a GitHub Environment approval whose deployment policy allows the `v*` tag pattern (a protected-branches policy would reject tag refs). Both env blocks exist in `wrangler.jsonc` with real D1 database ids; the top-level config is local-dev only (worker `waypoint-dev`, placeholder D1 id) so a bare `wrangler deploy` can never touch production — the local `deploy` script targets `--env staging`.

## Versioning

SemVer, sourced from an annotated git tag `vX.Y.Z` and mirrored into `package.json` `version` (the field exists, seeded at `0.0.0`). The bump command both derives and syncs: `git-cliff --bumped-version` computes the next version from Conventional Commits, and `pnpm version --no-git-tag-version` writes it into `package.json` in the same step — the release workflow commits that change before tagging, so the two sources of truth cannot drift. `git-cliff` (pinned devDependency 2.12.0) also generates the CHANGELOG. The repo already follows Conventional Commits by habit (`feat(scope):`, `fix:`, `chore:`); this plan makes that convention load-bearing. No prerelease or post-release suffix handling — production releases are the only tagged versions.

## CI/CD pipeline

The existing `.github/workflows/ci.yml` carries a **single job named `ci`** that today runs: route-gen → typecheck → lint → vitest → playwright (chromium) → `pnpm audit --audit-level=high` → pin-check. `/wf ship-plan build` extends it **in place** — no per-check job fan-out, no duplicated test runs: repoint the lint step to `oxlint` (the `lint` script now runs oxlint; `typecheck` stays `tsc --noEmit`), add `oxfmt --check .` and commitlint steps to the `ci` job, add a sibling `gitleaks` job in the same file, and author two new workflows — `codeql.yml` (PR + weekly schedule) and `pr-title.yml` (job `semantic-pull-request`). Those four contexts — `ci`, `gitleaks`, `codeql`, `semantic-pull-request` — are exactly Block J's required checks. A **new** `.github/workflows/deploy.yml` (authored by build) carries CD: build → `wrangler d1 migrations apply DB --env <env> --remote` → `wrangler deploy --env <env>` → post-publish smoke. Staging deploys on merge to `main`; production deploys on `vX.Y.Z` tag, behind the `production` Environment approval. Required Actions secrets: **CLOUDFLARE_API_TOKEN** (Workers:Edit + D1:Edit) and **CLOUDFLARE_ACCOUNT_ID** (`de4b5da923deecf6e2cc1eb5e61ff635`). Application runtime secrets — `OPENROUTER_API_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_API_KEY`, `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`, `BETTER_AUTH_BASE_URL` — are **not** GitHub Actions secrets; they are set on the Worker per-environment via `wrangler secret put <NAME> --env <env>` and must exist before the first production deploy (`BETTER_AUTH_BASE_URL` needs the real workers.dev URLs, known after the first deploy).

## Post-publish verification

After each deploy, smoke-test that environment's URL (`curl -fsS <url>/` expecting HTTP 200) and confirm `wrangler deployments list --env <env>` shows the released version as newest. The workers are `waypoint-staging` (staging) and `waypoint` (production); both URLs share the account's workers.dev subdomain, which the first deploy prints — **fill the `<subdomain>` placeholder in Block D then**. Cloudflare propagates globally in seconds, so the window is short: 1–5 minutes, polled every 15s.

## Rollout strategy

Immediate. A Workers deploy is atomic and global — there is no gradual traffic shift at the platform level. The staging→production promotion *is* the staged safety mechanism: staging exercises the new version (and migrations) before a tag promotes it to production.

## Rollback playbook

Detection: post-publish smoke-test fails, or errors spike in Cloudflare observability (`observability.enabled` is on in `wrangler.jsonc`). Rollback re-deploys the prior immutable version: `wrangler rollback` (or `wrangler versions deploy <prior-version-id>`), ~2 minutes, verified by re-running the Block D smoke-test. Cloudflare retains recent Worker versions (typically the last ~10), so the target must be within retention.

**Irreversible caveat — database migrations.** The policy going forward is **reversible/backward-compatible migrations** (expand-contract), so a code rollback stays safe. However, the *existing* migrations `0000_schema_v1`–`0003_source_grounding` are **forward-only SQL**: rolling code back past the schema they introduced is not automatically safe. A rollback covers the Worker code, not schema state — never author a destructive migration without a preceding compatible release.

## Recovery playbooks

- **cloudflare-token-401** — auth/`10000`/unauthorized errors in the deploy job → verify token scopes, rotate the token, update the Actions secret, re-run.
- **d1-migration-failed** — `D1_ERROR`/migration/SQLite failures → never edit an applied migration; author a new forward (expand-contract) migration; apply to staging first, then production.
- **deploy-size-limit** — Worker exceeds Cloudflare size limit → inspect the dry-run bundle, trim or lazy-load large deps.

## Stakeholder + announcement

No announcement channels configured (solo project). `announcement.channels` is empty and `template-path` is unset, so `/wf ship <slug> announce` has nothing to post; add a channel and a template together if that changes.

## Code-quality gates

- **Lint:** `oxlint` — pinned devDependency `oxlint@1.73.0`, and the `lint` script now runs it (`typecheck` stays the separate `tsc --noEmit`).
- **Type-check:** `tsc --noEmit`.
- **Format:** **`oxfmt --check .`** — pinned devDependency `oxfmt@0.58.0`, installed and verified runnable (`format` / `format:check` scripts exist). Still pre-1.0: if the pin proves unstable in practice, swap to Prettier/Biome via `/wf ship-plan edit`.
- **Coverage:** measured via `pnpm test:coverage` (vitest v8) but **not gated** — no `min-percent` threshold is imposed so CI won't break on current coverage. Set one later once a baseline is known.
- **Commit convention:** Conventional Commits, enforced both locally (lefthook `commit-msg` → commitlint) and in CI (commitlint on PR commits). Config `commitlint.config.js` is created by build.
- **PR-title convention:** Conventional, enforced in CI via a semantic-PR-title action.

Each enabled gate above feeds the `pre-merge-checks` list; Block H is the source of truth for the command behind each check.

## Local developer experience

Git hooks run through **lefthook** (pinned devDependency `lefthook@2.1.10`, allow-listed in `pnpm.onlyBuiltDependencies` so its install hook wires `.git/hooks` on `pnpm install`): `pre-commit` → oxlint + oxfmt check + gitleaks (staged), `commit-msg` → commitlint (`@commitlint/cli@21.2.1` + `@commitlint/config-conventional@21.2.0` installed), `pre-push` → `tsc --noEmit` + `vitest run`. **gitleaks itself is a system binary** (not on npm) — install locally via `winget install gitleaks` / `scoop install gitleaks`; CI uses the gitleaks action instead. The plan ships a `.editorconfig`, a `.nvmrc` pinning node 22 (pnpm is pinned as `packageManager: pnpm@10.33.2`), and a `CONTRIBUTING.md`. Task running stays on npm-scripts; a new contributor bootstraps with `pnpm install`.

## Repo governance

Branch protection on `main` (mechanism: branch-protection, applied via `gh api` behind build's confirm gate): required status checks (`ci`, `codeql`, `gitleaks`, `semantic-pull-request`), **0 required approvals**, require conversation resolution, **require linear history**, no force-pushes, no deletions, admins not enforced. The merge button is **Rebase and merge** (consistent with linear history); auto-merge and merge-queue off. No CODEOWNERS (solo repo). A `.github/PULL_REQUEST_TEMPLATE.md` is shipped; issue templates are not. **No dependency automation** (relying on manual updates + the CI `pnpm audit` gate). The existing exact-pin policy (`.npmrc save-exact=true` + CI pin-check) is retained.

> **Remote precondition — resolved.** The repo lives at **`github.com/jayteealao/waypoint`** (public — CodeQL runs free) with `main` and `feat/waypoint-app` pushed. `/wf ship-plan build` can apply the `gh-api` branch-protection, Environment, and merge settings directly (behind its confirm gate). The two Actions secrets still need to be set manually: `gh secret set CLOUDFLARE_API_TOKEN` (create the token in the Cloudflare dashboard with Workers:Edit + D1:Edit — the local wrangler OAuth login is not usable in CI) and `gh secret set CLOUDFLARE_ACCOUNT_ID`.

## Security & supply-chain gates

- **SAST:** CodeQL, as its own workflow — on PR and on a weekly schedule.
- **Dependency audit:** `pnpm audit --audit-level=high` (already in CI), failing on `high`.
- **Secret scanning:** gitleaks in CI (`gitleaks detect`) and as a lefthook `pre-commit` hook (`gitleaks protect --staged`).
- **SBOM:** none. **License policy:** none. Add via `/wf ship-plan edit` (Block K) if supply-chain requirements grow.

## Additional contracts

### data-migration
D1 schema migrations in `migrations/` (binding `DB`) are applied as part of every deploy — `wrangler d1 migrations apply DB --env <env> --remote`, staging (`waypoint-staging`, `0ea56221-…`) before production (`waypoint-prod`, `9254f3af-…`), in the CD `d1-migrate` job before `wrangler deploy --env <env>`. Both databases exist on the account (created 2026-07-12); all four migrations are pending on each until the first deploy. Policy: **expand-contract, backward-compatible** migrations only; no destructive change without a preceding compatible release. Existing `0000`–`0003` are forward-only and predate this policy. Enforced by the CD migrate job and PR review.

### pin-check
Every dependency in `package.json` must be exactly pinned — no `^`, `~`, or `latest`. Enforced by `.npmrc` `save-exact=true` and the CI `pin-check` step (inline node script in `.github/workflows/ci.yml`).
