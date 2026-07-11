---
schema: sdlc/v1
type: plan
slug: waypoint-app
slice-slug: foundation
status: complete
stage-number: 4
created-at: "2026-07-11T00:13:07Z"
updated-at: "2026-07-11T00:13:07Z"
metric-files-to-touch: 20
metric-step-count: 18
has-blockers: false
revision-count: 0
revisions: []
tags: [bootstrap, ci, supply-chain, greenfield]
stack-source: confirmed
refs:
  index: 00-index.md
  plan-index: 04-plan.md
  slice-def: 03-slice-foundation.md
  siblings:
    - 04-plan-platform-proofs.md
  implement: 05-implement-foundation.md
next-command: wf-implement
next-invocation: "/wf implement waypoint-app foundation"
---

# Plan: Foundation

## The Plan

The Waypoint repo starts from a literal blank directory — no `package.json`, no scaffold, no
lockfile — so the first slice's job is to make every subsequent slice's plan a dependency problem
rather than a setup problem. Eighteen steps take the repo from `git init` (already done) to a
state where `pnpm install && pnpm dev` serves a rendered page, both test harnesses (Vitest and
Playwright) pass, and CI rejects a push that touches a compromised dependency.

The supply-chain discipline is the non-obvious work here. Three specific version ranges are banned
by name because real CVEs and platform breakages are associated with them, and "exact-pin everything
from commit one" is easier to enforce than to retro-fit. The plan makes this enforcement automatic:
`.npmrc` sets `save-exact=true`, the CI step runs `pnpm audit`, and a pin-check in CI catches any
`^` or `~` that the scaffold inadvertently emitted. The scaffold's output is treated as a starting
draft, not a finished artifact — Step 4 is entirely about auditing and correcting it.

Twenty files are created, spread across five modules: the package config and pins that govern
everything else, the TanStack Start scaffold (five app files), the Vite and Cloudflare Workers
config, the Vitest and Playwright harnesses with smoke tests, and the GitHub Actions CI workflow.
The `wrangler.jsonc` is seeded now with `observability: { enabled: true }` — this is the
zero-cost observability foundation the Augmentation Plan depends on; every later Worker log call
routes through Cloudflare's built-in telemetry pipeline from day one.

The top risk is the scaffold CLI's alpha status: if `@tanstack/cli create` fails or emits stale
output, Step 2 has a documented manual fallback. The second risk is that AC-F4 (CI gate) cannot
be confirmed until a GitHub remote exists; it carries a proxy+deferral cleared by the first push.

## Current State

Greenfield — the repository was initialized (`git init`) and is on `feat/waypoint-app` but has
zero commits and zero product files. Only `.ai/` (workflow artifacts) and `.scratch/` (read-only
pedagogy reference) exist. No `package.json`, no lockfile, no test harness, no CI. The exploration
sub-agents found:

- **Files & modules to touch:** all 20 are net-new; no modification of existing files.
- **Call graph / dependency chain:** N/A — greenfield; the chain is established by this slice.
- **Conventions in affected area:** none yet; this slice establishes them.
- **Integration surfaces:** none yet; the `.scratch/mattpocock-skills` reference is read-only
  input, not a runtime integration.

## Simplicity Ladder

- **`git init` / branch** → rung 1 (OS + git built-in): already done.
- **Project scaffold** → rung 4 (new): `@tanstack/cli create`; alpha CLI, fallback to manual
  composition per official TanStack Start + Cloudflare Workers docs. Rungs 1–3 do not apply —
  there is no stdlib, platform, or in-repo equivalent for a full-stack Start scaffold.
- **Exact pinning** → rung 2 (npm-config built-in): `.npmrc` `save-exact=true`; no custom
  tooling needed to enforce exact versions.
- **Supply-chain audit** → rung 2 (pnpm built-in): `pnpm audit`; no third-party auditing tool.
- **Cloudflare Workers adapter** → rung 4 (new): `@cloudflare/vite-plugin`. This is the
  recommended adapter in TanStack Start docs; the old Nitro preset is explicitly banned by the
  shape. No built-in covers this.
- **Test runner (Vitest)** → rung 4 (new): no stdlib alternative for a component test runner
  with jsdom + React.
- **E2E test runner (Playwright)** → rung 3 (already installed): browsers pre-installed globally
  at `%LOCALAPPDATA%\ms-playwright`. Add `@playwright/test` as a dev dep matching the pre-installed
  major version; no download needed.
- **CI workflow** → rung 4 (new): GitHub Actions YAML. No platform-built-in CI covers this.
- **TanStack Intent** → rung 4 (new, dev-time): meta-tooling; has no equivalent in any stdlib.

## Applied Learnings

No applicable learnings found. The `.ai/solutions/INDEX.md` does not exist — this is the first
workflow run in this project.

Repeat-deferral tripwire: `00-index.md` has no `runtime-evidence-deferrals` entries. No repeated
wall detected.

## Likely Files / Areas to Touch

- `.gitignore`: new — excludes `.env`, `wrangler.jsonc` local overrides, `node_modules`, dist
- `.npmrc`: new — enforces `save-exact=true`, `node-linker=hoisted`
- `package.json`: new — exact-pinned dependencies; pnpm scripts
- `pnpm-lock.yaml`: new — generated by `pnpm install`
- `tsconfig.json`: new — strict TypeScript; bundler module resolution
- `app.config.ts`: new — TanStack Start app config + `@cloudflare/vite-plugin` with Workers preset
- `wrangler.jsonc`: new — Workers name/compat/flags; `observability: { enabled: true }`
- `app/router.tsx`: new — TanStack Router `createRouter()`
- `app/routes/__root.tsx`: new — HTML shell, Outlet
- `app/routes/index.tsx`: new — placeholder index route
- `app/client.tsx`: new — `StartClient` hydration entry
- `app/ssr.tsx`: new — `StartServer` SSR entry + Cloudflare `fetch` handler
- `vitest.config.ts`: new — jsdom environment, React plugin, coverage
- `vitest.setup.ts`: new — `@testing-library/jest-dom` matchers
- `tests/smoke/app.test.ts`: new — Vitest render smoke
- `playwright.config.ts`: new — base URL, web server, chromium project
- `tests/e2e/smoke.spec.ts`: new — Playwright navigate + assert
- `.github/workflows/ci.yml`: new — full CI gate
- `.env.example`: new — three external prerequisite secrets documented
- `README.md`: new — stub; quick-start + env setup

## Proposed Change Strategy

**Scaffold-then-audit.** Use the official TanStack CLI to generate the scaffold, then treat its
output as a draft: audit every version in `package.json`, strip floating ranges, and verify no
banned version is present. Only then run `pnpm install` to produce the lockfile. The test harnesses
and CI are authored independently of the scaffold — they must exist even if the scaffold falls back
to manual composition.

**Observability foundation first.** `wrangler.jsonc` is seeded with `observability: { enabled: true }`
in this slice, not deferred. Cloudflare Workers' built-in logging routes all `console.log`/`console.error`
calls to Logpush at zero marginal cost; wiring it now means every later slice's structured log calls
have a collector from their first deploy without any plumbing change.

## Step-by-Step Plan

1. **Establish the first commit.** On `main`, create a minimal commit with `.gitignore` and the
   README stub. Then create (or stay on) `feat/waypoint-app`. This gives `main` a real root commit
   so the branch strategy from intake is satisfied.

2. **Scaffold via `@tanstack/cli create`.** Run `npx @tanstack/cli@latest create .` in the project
   root, selecting the React + Start + Cloudflare Workers preset if available. **Fallback (if the
   CLI fails or emits an incompatible template):** bootstrap manually per the official TanStack Start
   Cloudflare Workers guide — `npm create tsstack@latest` or hand-compose the five required scaffold
   files (`app/router.tsx`, `app/routes/__root.tsx`, `app/routes/index.tsx`, `app/client.tsx`,
   `app/ssr.tsx`) following the current Start docs.

3. **Set up pnpm and exact pinning.** Create `.npmrc` with `save-exact=true` and
   `node-linker=hoisted`. If the scaffold produced an `npm` lockfile, delete it; `pnpm-lock.yaml`
   is the only lockfile.

4. **Audit and pin all TanStack versions in `package.json`.** For every dependency and
   devDependency:
   - Remove any `^` or `~` prefix.
   - Verify `@tanstack/react-start` is not `1.167.68`, `1.167.71`, or any `1.142.x` version.
   - Verify `@tanstack/router` is not `1.169.5` or `1.169.8`.
   - If any exact version is absent (scaffold used a range), resolve it to the latest non-banned
     patch by checking the npm registry; pin it.

5. **Wire `@cloudflare/vite-plugin` in `app.config.ts`.** If the scaffold did not include it, add
   `@cloudflare/vite-plugin` to devDependencies and update `app.config.ts` (or `vite.config.ts`)
   to use the Cloudflare Workers preset. Do NOT use the old Nitro preset.

6. **Create `wrangler.jsonc`.** Minimal config:
   ```jsonc
   {
     "name": "waypoint",
     "compatibility_date": "2025-11-01",
     "compatibility_flags": ["nodejs_compat"],
     "main": ".output/server/index.js",
     "assets": { "directory": ".output/public" },
     "observability": { "enabled": true }
   }
   ```
   This is the instrumentation bootstrap (04b-instrument.md, signal: Workers logs → Logpush).

7. **Install Vitest and testing-library.**
   - Add to devDependencies (exact-pinned): `vitest`, `@vitest/coverage-v8`, `@testing-library/react`,
     `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`.
   - Create `vitest.config.ts`: environment `jsdom`, setupFiles `./vitest.setup.ts`, React plugin,
     coverage provider `v8`.
   - Create `vitest.setup.ts`: imports `@testing-library/jest-dom` matchers, adds afterEach cleanup.

8. **Create Vitest smoke test.** `tests/smoke/app.test.ts`: render a minimal React component,
   assert it mounts without throwing. No route rendering needed — the goal is "Vitest runs and
   reports a result."

9. **Install `@playwright/test` as a dev dependency.** Pin to the major version matching the
   pre-installed browsers at `%LOCALAPPDATA%\ms-playwright` (currently the latest stable; check
   with `npx playwright --version` if pre-installed version is unknown). Add `pnpm exec playwright install --dry-run`
   to verify no download is needed.

10. **Create Playwright config and smoke test.**
    - `playwright.config.ts`: `baseURL` = `http://localhost:3000`, `webServer` starts `pnpm dev`
      and waits for the URL, `projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }]`.
    - `tests/e2e/smoke.spec.ts`: `page.goto('/')`, assert page title is not empty, assert no
      uncaught console errors.

11. **Add scripts to `package.json`.**
    ```json
    {
      "scripts": {
        "dev": "vinxi dev",
        "build": "vinxi build",
        "start": "vinxi start",
        "typecheck": "tsc --noEmit",
        "lint": "eslint .",
        "test": "vitest run",
        "test:watch": "vitest",
        "test:coverage": "vitest run --coverage",
        "test:e2e": "playwright test",
        "audit": "pnpm audit --audit-level=high"
      }
    }
    ```

12. **Create `.github/workflows/ci.yml`.** Triggers: `push` and `pull_request` to `main`. Steps:
    - `actions/checkout@v4`
    - `actions/setup-node@v4` with `node-version: '22'` and `cache: 'pnpm'`
    - `pnpm/action-setup@v4`
    - `pnpm install --frozen-lockfile`
    - `pnpm typecheck`
    - `pnpm test`
    - `pnpm exec playwright install --with-deps chromium`
    - `pnpm test:e2e --project=chromium`
    - `pnpm audit --audit-level=high`
    - (Optional) Pin-check: `node -e "const p = require('./package.json'); const deps = {...p.dependencies,...p.devDependencies}; const hasDrift = Object.values(deps).some(v => v.startsWith('^') || v.startsWith('~')); if(hasDrift) process.exit(1);"` — fails the build if any floating range sneaked in.

13. **Create `.env.example`.** Document every secret required by later slices:
    ```
    # OAuth providers (accounts-data-layer slice)
    GOOGLE_CLIENT_ID=
    GOOGLE_CLIENT_SECRET=
    GITHUB_CLIENT_ID=
    GITHUB_CLIENT_SECRET=
    # AI gateway (ai-gateway slice)
    OPENROUTER_API_KEY=
    # Auth session signing (accounts-data-layer slice)
    BETTER_AUTH_SECRET=
    BETTER_AUTH_URL=http://localhost:3000
    # Cloudflare (platform-proofs / deploy)
    CLOUDFLARE_ACCOUNT_ID=
    CLOUDFLARE_API_TOKEN=
    ```

14. **Finalize `README.md` stub.** Sections: what Waypoint is (one paragraph), prerequisites
    (Node 22+, pnpm 10+), quick-start (`pnpm install && pnpm dev`), running tests (`pnpm test`,
    `pnpm test:e2e`), env setup (copy `.env.example` to `.env.local` and fill in the three
    external prerequisites), link to `docs/` (to be created by later slices).

15. **Install TanStack Intent.** Run `npx @tanstack/intent install`. If the command fails
    (alpha instability), record the failure in the commit message and proceed without it — it is
    dev-time DX tooling, not a runtime dependency.

16. **Run `pnpm install`.** Verify the lockfile is generated, no duplicate transitive versions
    of compromised packages appear, and the install completes cleanly.

17. **Verify all three ACs (local).**
    - `pnpm dev` → open Claude_Browser or Playwright at `http://localhost:3000`; assert a page
      renders with no console errors. Screenshot evidence.
    - `pnpm test` → Vitest smoke passes (exit 0).
    - `pnpm test:e2e --project=chromium` → Playwright smoke passes (exit 0).
    - `pnpm audit` → clean (or document any non-critical findings as triaged).

18. **Commit the foundation.** Stage all 20 new files. Commit to `feat/waypoint-app` with a
    message describing the toolchain setup, exact-pin policy, and test-harness bootstrap.
    (Message must use product language only — no workflow artifact references.)

## Verification Strategy

The four foundation ACs and their verification mapping:

| AC | Tool / method + ladder rung | Environment need — satisfiable in target env? | What must be BUILT to make it verifiable | Fallback chain |
|---|---|---|---|---|
| AC-F1: `pnpm dev` serves a page (observable) | Claude_Browser MCP drive OR `pnpm test:e2e --project=chromium` (rung: web-1, interactive) | Local Windows 11, Node 22.15.0, pnpm 10.26.2 — **yes, confirmed** | `tests/e2e/smoke.spec.ts` + `playwright.config.ts` webServer; `app/routes/index.tsx` placeholder | → Claude_Browser manual screenshot if Playwright config fails |
| AC-F2: pin-audit (not observable) | `pnpm audit --audit-level=high` + inline `package.json` version check (static, rung: unit) | Local + CI — **yes** | Pin-check script in CI step 12 | → Manual inspection of package.json |
| AC-F3: test harnesses run (not observable) | `pnpm test` (Vitest, exit 0) + `pnpm test:e2e` (Playwright, exit 0) — (rung: unit/integration) | Local Windows 11, pre-installed Playwright browsers — **yes** | `tests/smoke/app.test.ts` + `tests/e2e/smoke.spec.ts` | → Run individual commands manually |
| AC-F4: CI gates on push (not observable) | GitHub Actions run — green status (rung: integration) | Remote GitHub repo — **not yet (no remote exists)** | `.github/workflows/ci.yml` | → proxy+deferral |

**Constraint-resolutions:**

- **AC-F1:** `constraint-resolution: po-accepted: local dev environment confirmed available (Node 22.15.0, pnpm 10.26.2, Playwright browsers pre-installed globally at %LOCALAPPDATA%\ms-playwright on Windows 11)`
- **AC-F4:** `constraint-resolution: proxy+deferral: cleared-by: first push to GitHub remote (the proxy is AC-F3 — test harnesses passing locally proves the CI steps are correct; CI itself is deferred until the remote exists)`

## Test / Verification Plan

### Automated checks

- **lint/typecheck:** `pnpm typecheck` (tsc --noEmit) — zero errors required; `pnpm lint` (ESLint from scaffold) — zero errors
- **unit tests (Vitest):** `pnpm test` — Vitest smoke (`tests/smoke/app.test.ts`) must pass
- **E2E tests (Playwright):** `pnpm test:e2e --project=chromium` — Playwright smoke (`tests/e2e/smoke.spec.ts`) must pass
- **Supply-chain audit:** `pnpm audit --audit-level=high` — exit 0 (no high/critical findings unmitigated)
- **Pin-check:** inline CI script — exit non-zero if any `^` or `~` in package.json dependencies

### Interactive verification (human-in-the-loop)

**AC-F1 — Dev server serves a page**
- **What to verify:** Navigating to the dev server root renders a visible page (even the scaffold placeholder) with no browser console errors.
- **Platform & tool:** Web — Claude_Browser MCP (drive the dev server in the integrated browser) or `pnpm test:e2e --project=chromium` (Playwright headless confirm).
- **Steps:**
  1. Run `pnpm dev` in the Waypoint root (serves on `http://localhost:3000`).
  2. Open Claude_Browser to `http://localhost:3000` (or run `pnpm test:e2e`).
  3. Observe rendered page content; check browser console for errors.
- **Evidence capture:** Screenshot at 1280px; zero console errors assertion.
- **Pass criteria:** Page responds with HTTP 200; at least one visible text element renders; browser console shows no uncaught errors.

No other AC in this slice requires interactive verification — AC-F2, AC-F3, and AC-F4 are
automated assertions.

## Risks / Watchouts

- **`@tanstack/cli create` alpha**: May produce stale output, miss the Cloudflare preset, or fail.
  Mitigated by the manual fallback in Step 2. The scaffold output is audited regardless.
- **CI deferred until remote exists**: AC-F4 cannot be verified until a GitHub remote is
  established. Documented as a proxy+deferral — local test harnesses are the proxy evidence.
- **Exact-pinning and future security patches**: Accepted by the PO at intake. Any new CVE
  requires an explicit lockfile bump, which is the intended behavior. `pnpm audit` in CI catches
  newly-published advisories.
- **TanStack Intent alpha**: May fail silently or incompletely. It is dev-time DX tooling — a
  failure here does not block any AC and does not fail the slice.
- **Playwright version mismatch**: If the dev dep version doesn't match the globally pre-installed
  browsers, `playwright install` will download. The CI step always runs `playwright install --with-deps chromium`
  so it is not a CI problem. On the PO's machine, check with `npx playwright --version` first.
- **pnpm install on Windows**: Path-length limits can affect deep node_modules trees. Using
  `node-linker=hoisted` in `.npmrc` mitigates this by reducing nesting depth.

## Dependencies on Other Slices

None. This is the root slice — no other slice can begin without it.

## Assumptions

All resolved autonomously per the autonomous override policy. Each assumption records what was chosen and why.

1. **CI platform → GitHub Actions.** The shape and slice mention "CI workflow" but do not specify the platform. No remote CI URL exists yet. GitHub Actions is assumed because it is the most common choice for greenfield projects and the PO made no constraint against it. If the PO uses a different CI (GitLab CI, Bitbucket, etc.), the `.github/workflows/ci.yml` must be rewritten for that platform — this is the only externally-visible consequence.

2. **Linter → ESLint (scaffold default).** The shape mentions `lint` in the CI steps. No linter was specified. TanStack Start's scaffold ships ESLint config by default; that config is accepted as-is. Prettier is assumed to be installed alongside ESLint if the scaffold includes it.

3. **TypeScript strict mode → enabled.** The shape does not specify a TypeScript mode but names strict libraries (better-auth, TanStack) that benefit from strict mode. `tsconfig.json` will use `"strict": true`. This has no user-observable impact.

4. **Playwright browsers in CI → chromium only.** Pre-installed browsers on the PO's machine include chromium, Firefox, and WebKit, but installing all three in CI adds ~1 GB and 3–5 minutes. Chromium-only for CI is chosen to keep CI fast; the PO's machine runs all three for local E2E. If the PO wants cross-browser CI in v1, the CI YAML is a one-line add.

5. **Node.js linker → hoisted.** `node-linker=hoisted` is chosen in `.npmrc` to reduce path-length issues on Windows 11 and to match the behavior most Cloudflare Workers tooling expects. This is not a user-observable change.

6. **Wrangler `compatibility_date` → `2025-11-01`.** A recent but stable date; can be bumped later. No user-observable consequence.

7. **TanStack Intent → best-effort.** `npx @tanstack/intent install` is run but a failure is non-blocking. Recorded as a note in the commit if it fails.

8. **Instrumentation architecture → Cloudflare Workers native observability.** The 04b-instrument.md designs for `observability: { enabled: true }` in wrangler.jsonc as the signal collection layer (Logpush) plus a D1 `usage_events` table for cost attribution. No third-party observability vendor is introduced (Cloudflare-only constraint). This is a user-invisible implementation choice.

## Blockers

None. All AC environment dependencies are satisfied (local dev environment confirmed) or carry pre-registered constraint-resolutions. The only deferred AC (AC-F4: CI gate) has a documented proxy+deferral.

## Freshness Research

No dependency-specific web research was needed for the foundation slice — the shape already carried
a comprehensive freshness sweep (2026-07-10T22:10Z) covering TanStack Start RC, compromised version
lists, `@cloudflare/vite-plugin` vs. Nitro, pnpm audit CI integration, and the PWA plugin status.
All remain current as of this plan date (2026-07-11):

- **TanStack Start RC**: The shape pinned the compromised version ranges (`@tanstack/react-start`
  1.167.68/.71; router 1.169.5/.8; 1.142.x middleware break). These pins are stable — the CVE
  postmortem is published and the bad versions are known. No action beyond the version-audit step.
- **`@cloudflare/vite-plugin`**: The shape confirmed this is the correct adapter. No new breakage
  reported between shape and plan.
- **Playwright pre-installed globally**: The shape states Playwright browsers are already at
  `%LOCALAPPDATA%\ms-playwright`. This is treated as a confirmed fact; if it turns out to be stale,
  Step 9 detects it and the `playwright install` step will download as needed.
- **pnpm audit**: The shape mandates this in CI. The `pnpm audit --audit-level=high` invocation
  is the standard form; no research needed.

## Recommended Next Stage

- **Option A (default): implement** — The plan is complete, all ACs have verified resolution paths, and the foundation establishes everything the platform-proofs slice needs. Compact the session before implementing (`/compact` — state lives in the artifact files).
- **Option B: plan platform-proofs** — If you want all plans written before any implementation, plan the next slice now.
- **Option C: revisit slice** — Not indicated; no slice-boundary issues found during planning.
