---
schema: sdlc/v1
type: plan
slug: waypoint-app
slice-slug: source-grounding
status: complete
stage-number: 4
created-at: "2026-07-12T06:35:00Z"
updated-at: "2026-07-12T06:35:00Z"
metric-files-to-touch: 8
metric-step-count: 9
has-blockers: false
revision-count: 0
revisions: []
tags: [source-grounding, url-fetch, citations, prompt-injection, workers-runtime]
stack-source: confirmed
refs:
  index: 00-index.md
  plan-index: 04-plan.md
  slice-def: 03-slice-source-grounding.md
  siblings:
    - 04-plan-tutor-interview.md
    - 04-plan-roadmap-lesson-generation.md
    - 04-plan-lesson-renderer.md
  implement: 05-implement-source-grounding.md
next-command: wf-implement
next-invocation: "/wf implement waypoint-app source-grounding"
---

# Plan: Source Grounding

## The Plan

The pipeline is finished. Every slice has shipped — the interview captures goals, the roadmap
generates waypoints, the lesson renders sections, the quiz tests comprehension, and the progress
surface tracks mastery. Source grounding layers the final capability onto this complete system:
when a learner shares a preferred URL during the interview, that page's content flows into the
generation prompts, and the resulting lesson cites it demonstrably.

The ground work is further along than the slice title suggests. The interview already captures
`captured_source_urls`. The lesson schema already carries `LessonSource`, `CitationSection`, and
`recommended_primary_source`. The prompt suite already instructs the model to cite sources.
What does not yet exist is the fetch: the Workers runtime call that reads the page, extracts its
text, and injects it as a clearly-delimited `## Source material` block into the roadmap and lesson
prompts. That fetch, plus its failure-handling surface in the interview, is the whole slice.

Eight files, nine steps. The new core module (`src/lib/source-fetch.ts`) is the only genuinely
novel code — everything else is wiring it into three existing modules and writing the tests that
prove it works. The injection-resistance posture is the design centerpiece: fetched content is
labelled data-only in the prompt, the extraction strips HTML tags before the model ever sees the
page, and adversarial fixture tests in Vitest prove that a page containing `"ignore your previous
instructions"` grounds a lesson about the page's subject matter rather than executing the payload.

Key risk: fetch latency in the sources turn. An unresponsive host can hold the interview open
for up to 30 seconds before the failure path fires. This is acceptable for the final probe stage
and mitigated by the template-only failure response (no gateway call), but the timeout should be
watched and may need shortening in practice.

## Current State

The interview (`src/server/interview.ts`) already extracts URLs from the sources stage via
`extractUrl()` and stores them in `captured_source_urls` (a `string[]` JSON column). The
`buildRoadmapPrompt()` function in `src/lib/roadmap/schema.ts` already mentions source URLs in
the learner profile section (`**Preferred sources:** ${urls.join(', ')}`), but passes only the
bare URLs — no fetched content. The lesson SSE route
(`src/routes/api/journey/$journeyId/lesson.ts`) reads waypoint context (title, goal, concepts)
from D1 and injects it into `LESSON_SYSTEM_PROMPT`, but does not load or inject source content.

The `interview_records` table has `captured_source_urls` but no `captured_source_content` column.
A new additive migration adds that column (default `'[]'`).

The lesson schema (`src/types/lesson-document.ts`) already exports `LessonSource`,
`CitationSection`, and the `recommended_primary_source` field on `LessonDocumentV1`. The lesson
renderer already renders citation sections. The generation pipeline already produces a
`{"type":"sources","sources":[...]}` NDJSON line at the end of each lesson. The entire rendering
surface exists — only the grounding input is missing.

## Simplicity Ladder

- **Workers-native URL fetch** → rung 2 native platform — `fetch()` with `AbortController` timeout; no library needed.
- **HTML text extraction** → rung 4 new code — `HTMLRewriter` API is Workers-native but stateful and async-heavy for a simple extraction task; regex tag-stripping is simpler, faster, and sufficient for v1's static-HTML target. `<title>` extracted via regex; body text stripped of tags, whitespace-collapsed, truncated to 5 000 chars.
- **Content-length / size limit** → rung 2 native platform — `Response.headers.get('content-length')` + streaming byte count via `ReadableStream` reader; no library.
- **In-band fetch failure response** → rung 3 reuse — extends the existing `sendTurn()` template-response pattern already used for the `declined` and `complete` terminal stages (no gateway call).
- **Source content injection in prompt** → rung 4 new code — `buildLessonGroundingContext(sourceContent)` helper; ~10 lines, no dependency.
- **Citation rendering** → rung 3 reuse as-is — `CitationSection`, `LessonSource`, `recommended_primary_source`, and the `{"type":"sources"}` NDJSON line are all already implemented and rendered in the lesson-renderer slice.

## Applied Learnings

No `.ai/solutions/INDEX.md` corpus exists for this project. No applicable learnings found.

**Repeat-deferral tripwire:** The two observable ACs (citation rendering and unfetchable URL
interview flow) will require seeded-session Playwright tests, which hit the
`BETTER_AUTH_SECRET` wall already pre-registered for AC-ADL1+AC-ADL5. These ACs are accepted
into the existing deferral entry; no new deferral row is needed.

## Likely Files / Areas to Touch

- `migrations/0003_source_grounding.sql`: additive ALTER TABLE — adds `captured_source_content TEXT NOT NULL DEFAULT '[]'` to `interview_records`
- `src/lib/source-fetch.ts`: new — Workers-native URL fetch + HTML extraction
- `src/lib/interview/prompts.ts`: modified — add `## Source material` block handling to LESSON_SYSTEM_PROMPT and ROADMAP_SYSTEM_PROMPT
- `src/server/interview.ts`: modified — wire `fetchSourceUrl` into `sendTurn` at the `sources` stage; handle fetch failure as a stay-in-stage template response
- `src/lib/roadmap/schema.ts`: modified — extend `buildRoadmapPrompt()` to accept and inject source content; update `generateRoadmap()` to load `captured_source_content`
- `src/routes/api/journey/$journeyId/lesson.ts`: modified — load `captured_source_content` from `interview_records` for the journey; inject as grounding context into lesson system message
- `tests/smoke/source-grounding.test.ts`: new — Vitest unit tests for fetch behaviors, extraction, injection resistance, and prompt assembly
- `tests/e2e/source-grounding.spec.ts`: new — Playwright E2E for citation rendering and unfetchable URL interview flow

## Proposed Change Strategy

Fetch-at-interview-time (not at generation time). The slice definition explicitly rules out
re-fetching/freshness tracking — v1 fetches once when the learner provides the URL and stores the
extracted content alongside the URL in the interview record. This matches the interview-state
ownership model (all learner context is captured there) and keeps the generation path stateless
(read the stored content, inject it).

The unfetchable-URL handling stays in `sendTurn` rather than adding a new interview stage.
The `sources` → `complete` transition is blocked when a URL is provided but fetch fails; the
server returns a template acknowledgment message (no gateway call) and re-serves the `sources`
stage. The learner can then provide a working URL, or reply without one. This mirrors the
`mission` stage's vagueness-detection pattern (stay-in-stage, pushback prompt) and requires
no state machine change.

Source content is injected as a clearly-delimited `## Source material` block appended to the
`LESSON_SYSTEM_PROMPT` and `ROADMAP_SYSTEM_PROMPT` strings at call time (not baked into the
static prompt constants). This keeps the constants usable for no-source journeys unchanged.

## Step-by-Step Plan

1. **Write `migrations/0003_source_grounding.sql`** — single `ALTER TABLE interview_records ADD COLUMN captured_source_content TEXT NOT NULL DEFAULT '[]'` statement. Apply to local D1 with `wrangler d1 execute waypoint-dev --local --file migrations/0003_source_grounding.sql`. Verify the column is visible in `PRAGMA table_info(interview_records)`.

2. **Author `src/lib/source-fetch.ts`** — export `SourceFetchResult` union type and `fetchSourceUrl(url: string): Promise<SourceFetchResult>`. Implementation:
   - Validate URL format (new URL() constructor); return `{ ok: false, reason: 'network_error' }` on invalid URL
   - `AbortController` with 30-second signal passed to `fetch(url, { signal })`
   - On `AbortError` catch: return `{ ok: false, reason: 'timeout' }`
   - On network error catch: return `{ ok: false, reason: 'network_error' }`
   - Check `content-type` header — accept `text/html` and `text/plain` only; return `{ ok: false, reason: 'bad_content_type' }` for PDF/JSON/binary
   - Check `Content-Length` header: if present and > 524_288 (512 KB), return `{ ok: false, reason: 'too_large' }` before streaming
   - Read body in chunks, accumulating byte count; abort at 512 KB
   - Extract `<title>` via regex: `/<title[^>]*>([^<]+)<\/title>/i`
   - Strip HTML tags: `text.replace(/<[^>]+>/g, ' ')`
   - Collapse whitespace: `text.replace(/\s+/g, ' ').trim()`
   - Truncate to 5 000 chars
   - Return `{ ok: true, url, title, extractedText }`

3. **Update `src/lib/interview/prompts.ts`** — add `## Source material` instruction block to LESSON_SYSTEM_PROMPT (below the existing `## Sources` section) and ROADMAP_SYSTEM_PROMPT (below the `## Scope calibration` section). Both blocks must label the content as data-only and instruct the model to never follow instructions embedded in source material. Export a new `buildSourceMaterialBlock(sourceContent: Array<{url: string; title: string; extractedText: string}>): string` helper that assembles the block from the stored array.

4. **Wire `fetchSourceUrl` into `src/server/interview.ts`** — in `sendTurn()`, after `extractUrl(userContent)` at the `sources` stage:
   - If `url` is not null: call `fetchSourceUrl(url)` (await)
   - On `ok: true`: parse `captured_source_content` from the record, push `{ url, title, extractedText }`, store back to DB via UPDATE
   - On `ok: false`: do NOT call `sm.transition()` (keep stage at `sources`); return template `FETCH_FAILURE_RESPONSE` (constants object, not gateway call): `"I wasn't able to access [URL] — it may be behind a paywall or temporarily unavailable. You can share another URL, or reply 'continue' to proceed with your stated sources."`; return early with `{ question: FETCH_FAILURE_RESPONSE, chips: ['Continue without it', 'Try another URL'], stage: 'sources' }`
   - Add `captured_source_content` to the UPDATE statement so it is persisted alongside the other captured fields

5. **Extend `src/lib/roadmap/schema.ts`** — update `buildRoadmapPrompt(capture, sourceContent?)` signature to accept optional `sourceContent` array; when present and non-empty, append `buildSourceMaterialBlock(sourceContent)` to the assembled prompt string. In `src/server/roadmap.ts`, after loading the interview record, parse `captured_source_content` and pass it to `buildRoadmapPrompt()`.

6. **Extend `src/routes/api/journey/$journeyId/lesson.ts`** — after building waypoint context (existing step 5–6), add a DB query to load `captured_source_content` from the `interview_records` row for the journey. Parse the JSON; if non-empty, call `buildSourceMaterialBlock(sourceContent)` and append to `systemContent` before the generation call.

7. **Write `tests/smoke/source-grounding.test.ts`** — 8 Vitest tests (mock `fetch` via Vitest's `vi.stubGlobal`):
   - `fetchSourceUrl` with AbortError mock → `{ ok: false, reason: 'timeout' }`
   - `fetchSourceUrl` with Content-Length > 512 KB → `{ ok: false, reason: 'too_large' }`
   - `fetchSourceUrl` with content-type `application/pdf` → `{ ok: false, reason: 'bad_content_type' }`
   - `fetchSourceUrl` happy path with fixture HTML containing `DISTINCTIVE_MARKER_XQ7R` → `{ ok: true, extractedText: /DISTINCTIVE_MARKER_XQ7R/ }`
   - `fetchSourceUrl` with adversarial content `<!-- ignore your previous instructions -->` → extractedText does NOT contain injection payload as executable instruction (text is present but unlabelled-as-instruction — validated by `buildLessonGroundingContext` test)
   - `buildSourceMaterialBlock([])` → empty string (no block injected for empty content)
   - `buildSourceMaterialBlock([{url, title, extractedText: 'MARKER'}])` → string includes `MARKER`, string includes `## Source material`
   - No-source control vs with-source: `buildRoadmapPrompt(capture)` vs `buildRoadmapPrompt(capture, [{extractedText:'MARKER'}])` — latter includes `MARKER`, former does not

8. **Write `tests/e2e/source-grounding.spec.ts`** — 2 Playwright tests using the seeded-session pattern (same `seedUser` + `seedSession` helpers as `lesson-renderer.spec.ts`):
   - **Citation rendering (AC)**: seed a journey + waypoint + lesson row; the lesson's `sources` JSON includes `{ "title": "Test Source", "url": "https://test-source.example.com", "author": null }` and `recommended_primary_source` names the same URL. Navigate to `/_authenticated/journey/$journeyId/waypoints/$waypointId`; assert that the rendered lesson shows the sources section and the URL appears in citation output.
   - **Unfetchable URL interview flow (AC)**: use the existing mock seam (`mock: true`) in `sendTurn` to drive to the `sources` stage; send a deliberately failing URL via the interview UI (a URL that `fetchSourceUrl` would reject — use a URL with scheme `http://localhost:0` which fails network connection); assert that the chat response contains acknowledgment text (not a silent drop) and the chips include 'Continue without it'.

9. **Run automated checks** — `pnpm tsc --noEmit` (zero type errors), `pnpm test` (all unit tests including 8 new source-grounding tests pass), `pnpm lint` (clean). E2E tests run via `pnpm playwright test tests/e2e/source-grounding.spec.ts` with `BETTER_AUTH_SECRET` set.

## Verification Strategy

| AC | Tool / method + ladder rung | Environment need — satisfiable? | What must be BUILT | Fallback chain |
|----|------------------------------|----------------------------------|--------------------|----------------|
| AC-4: grounding proof (marker in generated lesson) | Vitest fixture harness (rung 3 — automated mock) | Local — yes, no credentials needed | `tests/smoke/source-grounding.test.ts` test 4 (distinctive marker in extractedText) + test 7 (marker propagated through buildSourceMaterialBlock) | rung 3 already the bottom; pre-registered deferral: live-model quality spot-check |
| AC citation rendering: lesson cites source, sources section names it | Playwright seeded-session, web-1 rung | `BETTER_AUTH_SECRET` in .dev.vars — already present (cleared with AC-LR1–3) | Seed fixture lesson row with sources JSON in `tests/e2e/source-grounding.spec.ts` | rung 2 (Vitest LessonView render check) → pre-registered deferral: BETTER_AUTH_SECRET wall (accepted into existing entry) |
| AC unfetchable URL: acknowledged in-conversation, not silently dropped | Playwright seeded-session + mock interview, web-1 rung | `BETTER_AUTH_SECRET` in .dev.vars + mock sendTurn seam | `tests/e2e/source-grounding.spec.ts` test 2 (mock=true to drive to sources, then inject failing URL) | rung 2 (Vitest sendTurn return value check) → pre-registered deferral: BETTER_AUTH_SECRET wall |
| AC prompt-injection: page with injection payload, output follows none | Vitest adversarial fixture (rung 3 — automated mock) | Local — yes | `tests/smoke/source-grounding.test.ts` test 5 | rung 3 already the bottom; live-model injection resistance is the pre-registered perceptual residual (spot-checked in manual review) |
| AC fetch limits: timeout/size/content-type fail cleanly | Vitest unit tests with synthetic responses (rung 3) | Local — yes | `tests/smoke/source-grounding.test.ts` tests 1–3 | rung 3 already the bottom |

**Constraint resolutions:**

- AC citation rendering: `constraint-resolution: proxy+deferral: accepted into existing AC-ADL1+AC-ADL5 deferral entry`
  — BETTER_AUTH_SECRET wall; the existing deferral is cleared-by: re-running E2E suite with BETTER_AUTH_SECRET set in .dev.vars. BETTER_AUTH_SECRET is already present in .dev.vars (cleared with AC-LR1–3). Playwright tests should run in full.

- AC unfetchable URL: `constraint-resolution: proxy+deferral: accepted into existing AC-ADL1+AC-ADL5 deferral entry`
  — same BETTER_AUTH_SECRET wall.

- AC-4 grounding live quality: `constraint-resolution: proxy+deferral: live-model grounding quality review`
  — pre-registered perceptual residual. Cleared by a live-model run with OPENROUTER_API_KEY present where the generated lesson demonstrably reflects a distinctive-content test page. This is the same clearing event as AC-PP2b and AC-7.

## Test / Verification Plan

### Automated checks

- lint/typecheck: `pnpm tsc --noEmit` + `pnpm lint` (zero errors/warnings)
- unit tests: `pnpm test` — 8 new tests in `tests/smoke/source-grounding.test.ts`; all existing tests must continue passing (no regressions)
- integration tests: none required (the fetch behavior is adequately covered by Vitest with mocked fetch)

### Interactive verification (human-in-the-loop)

**AC: Citation rendering**

- **What to verify:** Navigate to a lesson generated from a journey whose interview included a real source URL. Verify the lesson's sources section shows the citation with the URL; verify that at least one prose section contains a `[source: URL]` inline citation.
- **Platform & tool:** Web — Playwright seeded-session test (tests/e2e/source-grounding.spec.ts, test 1). For live manual verification: `pnpm dev`, sign in, create a journey, provide a URL (e.g., a Wikipedia article) in the sources stage, generate the roadmap and first lesson.
- **Steps:**
  1. `pnpm dev` (or use existing running instance)
  2. Sign in with test account
  3. Create a new journey with a URL in the sources stage
  4. Generate roadmap + lesson for waypoint 1
  5. Observe: lesson sources section names the URL; a prose section contains a `[source: ...]` inline citation
- **Evidence capture:** Playwright screenshot of the sources section in the rendered lesson.
- **Pass criteria:** `sources` section visible with the URL; at least one inline citation present.

**AC: Unfetchable URL interview acknowledgment**

- **What to verify:** In the interview sources stage, submit a URL that cannot be fetched (e.g., `https://paywalled.example.com`). Verify the tutor acknowledges the failure with a specific message and offers to continue without it.
- **Platform & tool:** Playwright seeded-session test (tests/e2e/source-grounding.spec.ts, test 2) via mock=true seam.
- **Steps:**
  1. Drive interview to the sources stage via mock=true
  2. Submit a URL that fetchSourceUrl will reject (any URL that triggers the network-error path in test environment)
  3. Observe: the chat shows a failure acknowledgment (not "Thank you, I've captured your sources") and chips include "Continue without it"
- **Pass criteria:** Acknowledgment message contains the submitted URL and an offer to continue or substitute.

## Risks / Watchouts

- **R1 — Fetch latency in sources turn (medium):** The 30s timeout can hold the sources interview turn open for 30s on unresponsive hosts. The 3s NFR applies only to gateway-backed turns; this is acceptable for the final probe stage. The template-only failure path (no gateway call) is the mitigation — but the user's perceived wait time is the timeout window. Consider shortening to 10s in v1.
- **R2 — Context-window budget with large sources (medium):** 5 000-char truncation is the v1 budget. Larger pages risk crowding the lesson prompt's context window, increasing cost. Watch `cost_usd` in `usage_events` at the live smoke.
- **R3 — Injection resistance is probabilistic (low):** The `## Source material` block and data-only labeling reduce injection risk. Widget registry and DOMPurify (from lesson-renderer) bound the blast radius.
- **R4 — HTML extraction quality varies (low for v1 scope):** The slice definition honestly states v1 targets static-HTML. JS-rendered pages (SPAs) will extract poorly. The graceful-failure path and in-interview acknowledgment handle this at the source entry point rather than silently producing poor extractions.

## Dependencies on Other Slices

- **tutor-interview (done):** The interview state machine, `sendTurn` server function, `captured_source_urls` column, and URL extraction via `extractUrl()` are all in place. This slice adds fetch + storage on top of the extraction step.
- **roadmap-lesson-generation (done):** `generateRoadmap()`, `buildRoadmapPrompt()`, and the lesson SSE route are in place. This slice extends both with source-content injection.
- **lesson-renderer (done):** Citation section rendering, `LessonSource`, `recommended_primary_source` — all in place. No changes needed to the renderer.

## Assumptions

The following decisions were made autonomously per the plan-stage autonomous-override policy. Each represents an implementation-detail choice (not a scope or contract change):

1. **Fetch timing: interview-time (not generation-time).** The slice definition explicitly rules out re-fetching. Storing extracted content in `interview_records` at URL-capture time keeps the generation path stateless. Assumed: this is the correct v1 behavior.

2. **Storage: new column `captured_source_content` on `interview_records`.** Alternatives considered: a new `source_grounding` table (more normalized but overkill for single-URL v1), extending `captured_source_urls` to `{url, content}[]` (breaks the existing string[] shape). A new additive column is the smallest blast radius. Assumed: acceptable schema evolution; later slices don't read `captured_source_content` directly.

3. **30-second fetch timeout.** Shape specified "timeouts" as a requirement; specific value not set. 30s is the standard Workers fetch timeout for external requests. Assumed: acceptable for the final interview stage. A 10s timeout would be safer for user experience; 30s is the conservative choice.

4. **512 KB size limit.** Shape specified "size limits". 512 KB is a reasonable cap: it comfortably covers most documentation pages while preventing memory exhaustion. Assumed: appropriate for v1.

5. **5 000-character extraction truncation.** Context-window budget decision. A 5000-char snippet from a well-targeted documentation page typically contains the key explanatory content. Assumed: sufficient for grounding quality; adjustable if cost data at the live smoke warrants it.

6. **Regex-based HTML extraction (no DOM library).** `HTMLRewriter` (Workers-native) is stateful and async-heavy for a simple text extraction. Regex tag-stripping is simpler, faster, and sufficient for static HTML — the slice definition explicitly scopes to "static-HTML extraction" in v1. Assumed: correct for v1; JS-rendered SPA pages extract poorly as documented.

7. **Template-based failure response (no gateway call on fetch failure).** Using a static message template (similar to the `declined`/`complete` terminal stage pattern) rather than asking the gateway to generate a failure acknowledgment. Reason: deterministic, fast, no token cost, fully testable. Assumed: the template message is sufficient to communicate the failure; the PO did not require model-generated failure prose.

8. **Observable AC Playwright tests accepted into existing BETTER_AUTH_SECRET deferral.** The two observable ACs require seeded-session Playwright tests, which require `BETTER_AUTH_SECRET` in `.dev.vars`. Since `BETTER_AUTH_SECRET` is already present (cleared with AC-LR1–3), these tests should run in full. Accepted into the existing deferral entry as contingency.

9. **Injection-resistance fixture tests cover the grounding path.** Live-model injection resistance is the pre-registered perceptual residual (cleared by a live-model run with OPENROUTER_API_KEY). Assumed: the fixture tests are the correct automated evidence for this AC; live-model behavior is the manual quality gate.

## Blockers

None. All ACs have verification paths. The two observable AC Playwright tests require `BETTER_AUTH_SECRET` (already present). The live-model quality residuals are pre-registered.

## Freshness Research

**Workers `fetch()` with `AbortController`** — standard Fetch API, fully supported in the Cloudflare Workers runtime (confirmed by platform-proofs slice). No version concerns.

**`HTMLRewriter` vs regex extraction** — `HTMLRewriter` API is Workers-native but requires a streaming response pipeline and is async-heavy for a simple extraction task. Regex is faster and has no library dependencies. For v1's static-HTML scope, regex is the correct rung-4 choice. Noted: if content extraction quality becomes a product issue in v2, `HTMLRewriter` or a dedicated parsing library can replace the regex in `src/lib/source-fetch.ts` without changing any calling code.

**`interview_records` schema extension** — `ALTER TABLE ... ADD COLUMN` is additive and idempotent-safe. D1 supports this. The default value `'[]'` ensures existing rows are valid (empty source content array). No data migration needed.

## Recommended Next Stage

- **Option A (default): `/wf implement waypoint-app source-grounding`** — The plan is complete, no blockers, all ACs have verification paths. 8 files, 9 steps. No `/compact` is strictly necessary (this is the first and only plan authored in this session for this slice), but compact before implement if context has grown from prior session work.

<!-- No ## Revision History body section. Revisions recorded in revisions: frontmatter ledger. -->
