## [0.1.0] - 2026-07-18

### 🚀 Features

- Bootstrap TanStack Start + Cloudflare Workers workspace
- *(waypoint)* Add SSE streaming, AI adapter, and D1 auth platform verification
- *(waypoint-app)* Add OAuth authentication, full D1 schema, and data access layer
- *(ui)* Add ember design token set, app shell, and journeys dashboard
- *(waypoint)* Add lesson rendering pipeline with widget registry and progressive renderer
- *(waypoint-app)* Add sample journey, quiz surface, and first-login experience
- *(waypoint-app)* Add AI gateway with quota enforcement and instrumentation
- *(waypoint-app)* Add consent-gated learner interview with chat UI and pedagogy prompt suite
- *(waypoint-app)* Add roadmap generation and lesson streaming
- *(waypoint-app)* Add quiz engine, FSRS learner model, and AI grading
- *(progress)* Add adaptation proposals and per-journey progress surfaces
- *(source-grounding)* Fetch source URLs and wire lesson/roadmap citations
- *(ai)* Move generation tiers to current-generation models with per-tier reasoning effort
- *(data-layer)* Unify client data on TanStack DB collections
- *(health)* Add public GET /health deep liveness endpoint
- *(waypoint-app)* Implement fix-continue-button

### 🐛 Bug Fixes

- Support BASE_URL env override in Playwright config
- *(waypoint)* Derive e2e dev-server port from BASE_URL
- *(waypoint)* Correct wrangler dev command for Cloudflare Vite plugin projects
- *(waypoint)* Review-time fixes for platform-proofs slice
- *(waypoint-app)* Verify-time fixes for foundation
- *(waypoint-app)* Harden auth data layer error handling and test quality
- *(ui)* Replace sub-AA text token with accessible alternative
- *(auth)* Populate router context.auth so the _authenticated guard sees sessions
- *(lesson)* Resolve React 19 hydration mismatch and E2E session cookie name
- *(lesson)* Review-time fixes for lesson-renderer
- *(sample-journey)* Stabilize e2e test timing and selectors
- *(quiz)* Remove non-null assertion and incorrect aria-pressed from quiz options
- *(verify)* Restore button interaction and add E2E quota-gate tests
- *(ai-gateway)* Correct usage_events date format and add fallback-exhaustion test
- *(interview)* Resolve CSS cascade, hydration timing, and instrument signal
- *(interview)* Use container-scoped live region and guard field capture on stage advance
- *(tests)* Correct navigation URLs and widget testid in roadmap-lesson E2E tests
- *(lesson-sse)* Add ownership check, cap error leakage, add stream timeout, fix retry UX
- *(quiz)* Fix E2E test infra — Windows shell escaping and React hydration guard
- *(quiz)* Add ownership checks to gradeAnswer and getWaypointCompletionStatus
- *(tests)* Fix E2E hydration race and dashboard isolation for adaptation-progress
- *(progress)* Correct plural streak label and add accessible score labels in quiz history
- *(source-grounding)* Extend fetch timeout to cover body streaming phase
- *(ai)* Parse real model-stream events, restore token metering, fix stale model IDs
- *(dashboard)* Server-render journeys dashboard without client fallback
- *(hooks)* Degrade pre-commit secret scan gracefully when gitleaks is absent
- *(interview)* Make ?mock search-param validation round-trip stable
- *(ci)* Drop redundant pnpm version input across workflows, normalize formatting
- *(lesson)* Html-escape ssr sanitizer fallback to prevent xss before dompurify upgrade
- *(waypoint-app)* Route Continue to interview when journey lacks a roadmap

### 🚜 Refactor

- *(server)* Adopt framework getRequest() for request access
- *(ai)* Unify model streaming onto one helper; drop dead structured-output path
- *(router)* Type the router auth context end-to-end
- *(data-layer)* Harden per-user data cache, fail closed on missing user id

### 📚 Documentation

- *(workflow)* Add foundation slice review ledger — verdict SHIP
- *(quiz)* Add review ledger for quiz engine and FSRS learner model — verdict SHIP
- Record commit SHA in request-access implementation log

### 🧪 Testing

- *(e2e)* Align seeded session cookie with the app's secure cookie name
- *(ci)* Provision placeholder dev vars so /health e2e reaches its 200 path
- *(waypoint-app)* Verify fix-continue-button

### ⚙️ Miscellaneous Tasks

- Initialize repository with .gitignore and README stub
- Record commit SHA in implementation record
- Record verify-stage completion for foundation slice
- Install TanStack agent skills natively into .claude/skills
- Record verify re-run (run 4) for foundation slice
- Add explicit read-only permissions block to CI workflow
- *(waypoint)* Record commit SHA in platform proofs implementation record
- *(workflow)* Record verification results for platform-proofs slice
- *(workflow)* Record re-verification results for platform-proofs slice (run 2)
- *(workflow)* Record re-verification results for platform-proofs slice (run 3)
- *(workflow)* Add platform-proofs slice review ledger — verdict SHIP
- *(waypoint-app)* Record commit SHA in accounts-data-layer implementation record
- *(waypoint-app)* Verify accounts-data-layer slice — result partial, convergence not-needed
- *(waypoint-app)* Record review ledger for accounts-data-layer slice — verdict SHIP
- Record commit sha in design-system-shell implementation log
- *(waypoint-app)* Verify design-system-shell slice — result partial, convergence not-needed
- *(waypoint)* Add design-system-shell review ledger — verdict SHIP
- *(waypoint)* Record commit SHA in lesson renderer implementation log
- *(waypoint)* Record lesson renderer verification — all ACs met at full interactive level
- *(lesson-renderer)* Add code review ledger — verdict SHIP
- *(waypoint-app)* Record sample-journey implementation — commit SHA and slice status
- *(waypoint)* Add sample-journey verify record — verdict PASS
- *(waypoint-app)* Add sample-journey review ledger — verdict Ship
- *(waypoint-app)* Record commit SHA in ai-gateway implementation log
- *(waypoint-app)* Record ai-gateway verify — result partial, convergence converged
- *(waypoint-app)* Add review ledger for ai-gateway slice — verdict SHIP
- *(waypoint-app)* Record commit SHA in interview implementation log
- Record commit sha in tutor-interview verify artifact
- *(waypoint)* Add tutor-interview review ledger — verdict ship
- *(waypoint-app)* Record commit SHA in lesson generation implementation log
- *(waypoint-app)* Verify roadmap and lesson generation — result partial, convergence converged
- *(waypoint-app)* Record commit sha in quiz-fsrs implementation log
- Record commit sha in adaptation-progress implementation log
- *(waypoint-app)* Verify adaptation-progress slice — result partial, convergence converged
- Record commit sha in source-grounding implementation log
- *(source-grounding)* Add code-review ledger — verdict ship
- *(ci)* Implement ship-plan pipeline (CD, quality gates, hooks, governance)
- *(ci)* Wire workers.dev subdomain into deploy smoke tests
- *(format)* Apply oxfmt baseline
- *(quiz)* Record FSRS scheduler test wall-clock determinism
- Replace retired pnpm audit with advisory osv-scanner supply-chain scan
- Use osv-scanner composite action path for advisory supply-chain scan
- *(waypoint-app)* Record fix-continue-button review (ship; IF-1 fixed in-loop)
- Exclude SDLC scaffolding and test evidence from version control
