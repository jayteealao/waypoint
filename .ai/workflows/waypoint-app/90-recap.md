---
schema: sdlc/v1
type: recap
slug: waypoint-app
scope: explain
slice: ""
focus: "slice"
generated-at: "2026-07-10T23:38:17Z"
current-stage: slice
stage-number: 3
status: active
refs:
  index: 00-index.md
---

# Explain: waypoint-app · planned dependencies

*(Asked as "what are the planned dependencies" — the workflow has two kinds worth separating: the **libraries and services** the shape committed to, and the **slice-to-slice dependencies** the decomposition just fixed. Both below.)*

## What it says — library & service dependencies

The shape's TanStack adoption matrix is the authoritative decision record. Committed for v1, all exact-pinned:

- **TanStack Start (RC)** + **Router (stable)** — the full-stack framework and routing, deployed to Cloudflare Workers via `@cloudflare/vite-plugin` (explicitly *not* the old Nitro preset).
- **TanStack Query (stable v5)** — the server-state layer sitting under DB.
- **TanStack DB (beta v0.6)** — client store: QueryCollections over server functions with browser persistence. Deliberately **no sync engine in v1**; the local-first *feel* comes from the client store, and the real-time upgrade path (Durable Objects persistence adapter) stays roadmap.
- **TanStack AI (beta)** — the LLM abstraction, via the **OpenRouter adapter** (`openRouterText`), with a proven fallback: the OpenAI adapter pointed at OpenRouter's baseURL, because the native adapter's tool calling broke as recently as May 2026.
- **TanStack Form (stable)** — interview inputs and quiz forms. **Devtools / CLI / Intent** as dev-time only.
- Explicitly **later**: Store, Pacer, Table, Virtual. Explicitly **not**: Config, Ranger, Hotkeys, Workflow, React Charts.

Outside TanStack: **better-auth ≥ 1.6.23** (OAuth-only, Google + GitHub), **ts-fsrs v5.x** (FSRS-6 learner model), **DOMPurify ≥ 3.4.7** (lesson sanitization), **Playwright + Vitest** (verification), **pnpm** as package manager. Services: **Cloudflare only** — Workers + D1 as system of record (a hard PO constraint: no Neon, no Electric, no third-party data services), and **OpenRouter** as the sole LLM endpoint, funded by the app's own key with per-user quotas.

Known-bad versions are part of the dependency plan too: avoid the compromised `@tanstack/react-start` 1.167.68/.71 and router 1.169.5/.8, and the 1.142.x Cloudflare middleware break — the `foundation` slice's pin gate enforces this in CI via `pnpm audit`.

## What it says — slice-to-slice dependencies

The 12 slices form a chain with three deliberate branch points:

1. `foundation` → 2. `platform-proofs` → 3. `accounts-data-layer` → 4. `design-system-shell` → 5. `lesson-renderer` → 6. `sample-journey` is strictly sequential — each consumes the previous slice's output.

Then the branches:

- **7. `ai-gateway` depends only on 2 + 3** (the adapter proof and the usage/quota tables) — it does *not* need the UI slices, so it can run **in parallel with 4–6** if you want to compress the schedule. It's sequenced after the milestone only to honor your visible-first ordering.
- **8. `tutor-interview` needs 7 + 4** (the gateway's interview tier; the shell for the chat surface).
- **9. `roadmap-lesson-generation` needs 8 + 5** (the interview's captured record; the proven lesson renderer). This is the risk peak — everything upstream exists to make its inputs verified before it starts.
- **10. `quiz-fsrs` needs 9 + 6** (concept-tagged lessons; the quiz surface born in sample-journey). Its FSRS engine core needs only slice 3, so pulling the ts-fsrs math forward in parallel with 8–9 is a sanctioned option.
- **11. `adaptation-progress` needs 10** (graded attempts and card states).
- **12. `source-grounding` needs 8 + 9 but nothing needs it** — the lowest-coupling slice; it can slip without blocking anything.

## What it locks in

The Cloudflare-only + OpenRouter-only service surface; exact pinning with the named version bans; the gateway-before-any-generation rule (no unmetered LLM path can ever exist); and the quiz surface preceding the quiz engine. The parallelization options (7 alongside 4–6; FSRS core early) and the sanctioned split of slice 9 (roadmap-gen, then lesson-streaming) are recorded escape valves, not improvisations.

## Why (where recorded)

The service constraints are PO answers (Round 5, po-answers.md: "only allowed backend is cloudflare options"; app-funded key with quotas from Round 4). The version bans come from the shape's freshness research (CVE-2026-45321 and the DOMPurify/better-auth advisories). The slice ordering comes from your slice-stage interview answers: visible milestone after the proofs, medium granularity, no walking skeleton.

## What it implies next

`plan foundation` should treat the pin list and the CI audit gate as first-class deliverables, not setup chores. Re-check the TanStack AI adapter's tool-calling status when planning slices 7–9 — it's the most volatile dependency fact in the set. And the three external prerequisites remain yours to provision: Google + GitHub OAuth app registrations (needed by slice 3's residual), the OpenRouter API key (live smokes from slice 2 on), and Cloudflare account access (first deploy in slice 9).
