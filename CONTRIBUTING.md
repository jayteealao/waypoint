<!-- Added by wf ship-plan build — plan v2, 2026-07-12 -->
# Contributing to Waypoint

## Bootstrap

```sh
pnpm install
```

That's it — `pnpm install` also wires the git hooks (lefthook is a pinned devDependency, allow-listed to run its install hook). Node 22 is pinned in `.nvmrc`; pnpm is pinned via `packageManager` in `package.json`.

One extra system tool: **gitleaks** (secret scanning in the pre-commit hook) is not an npm package — install it with `winget install gitleaks` or `scoop install gitleaks`. If gitleaks is absent the local pre-commit secret scan skips with a warning instead of blocking the commit; CI runs its own gitleaks gate regardless, so the scan is always enforced before merge.

## Running the gates locally

The same checks CI runs:

| Gate | Command |
|---|---|
| Type check | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Format check | `pnpm exec oxfmt --check .` (fix with `pnpm format`) |
| Unit tests | `pnpm test` |
| E2E tests | `pnpm test:e2e` |
| Coverage (measured, not gated) | `pnpm test:coverage` |
| Dependency audit | `pnpm audit --audit-level=high` |

Git hooks run a subset automatically: `pre-commit` → oxlint + oxfmt check + gitleaks (staged); `commit-msg` → commitlint; `pre-push` → tsc + vitest.

## Commit convention

[Conventional Commits](https://www.conventionalcommits.org/) — enforced locally (commit-msg hook) and in CI. Examples: `feat(quiz): add FSRS scheduling`, `fix: correct streak label`, `chore(ci): pin action versions`. PR titles follow the same convention (checked by the `semantic-pull-request` workflow).

Dependencies must be **exactly pinned** — no `^`, `~`, or `latest` (`.npmrc` sets `save-exact=true`; CI fails on floating ranges).

## PR process

1. Branch from `main`, keep history linear (the repo merges via **Rebase and merge**).
2. Open a PR against `main`; fill in the template.
3. Required checks: `ci`, `codeql`, `gitleaks`, `semantic-pull-request`. Conversations must be resolved before merge.

## Releases

Merging to `main` deploys **staging** automatically. Production is cut by tag:

1. Run the **Release Cut** workflow on `main` (derives the next version from Conventional Commits via git-cliff, syncs `package.json`, regenerates `CHANGELOG.md`, tags `vX.Y.Z`).
2. Run the **Deploy** workflow manually with the new `vX.Y.Z` tag as the ref (tags pushed by Actions don't auto-trigger workflows). The `production` environment approval gates the deploy.

Rollback: the **Rollback** workflow redeploys the prior immutable Worker version (code only — D1 schema is expand-contract and never rolled back).
