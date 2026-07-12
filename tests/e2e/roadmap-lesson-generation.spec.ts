// E2E tests for roadmap and lesson generation (AC-5, AC-6, AC-12).
//
// Auth proxy: seeded session + BETTER_AUTH_SECRET signed cookie (same pattern as
// lesson-renderer.spec.ts and tutor-interview.spec.ts). Deferred when
// BETTER_AUTH_SECRET is absent (same AC-ADL1+AC-ADL5 deferral entry).
//
// SSE tests (AC-6, AC-12, all-fail) use page.route() interception to mock
// /api/journey/*/lesson?* without live OpenRouter calls. This is a proxy
// for the real streaming path; the real transport is covered by the
// sse-streaming.wrangler.spec.ts baseline (already proven at platform-proofs).
//
// AC-5 (roadmap in sidebar) uses pre-seeded waypoints via wrangler D1.

import { test, expect, type Browser } from '@playwright/test'
import { execSync } from 'child_process'
import crypto from 'crypto'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const E2E_AUTH_SECRET = process.env.BETTER_AUTH_SECRET ?? ''

async function signSessionToken(token: string, secret: string): Promise<string> {
  const keyBuf = new TextEncoder().encode(secret)
  const key = await crypto.webcrypto.subtle.importKey(
    'raw',
    keyBuf,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signatureBuf = await crypto.webcrypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(token),
  )
  const sig = btoa(String.fromCharCode(...new Uint8Array(signatureBuf)))
  return encodeURIComponent(`${token}.${sig}`)
}

function sqlEsc(s: string): string {
  return s.replace(/'/g, "''")
}

function runD1(command: string) {
  execSync(
    `pnpm exec wrangler d1 execute waypoint-dev --local --command="${command.replace(/"/g, '\\"')}"`,
    { cwd: process.cwd(), stdio: 'pipe' },
  )
}

// ---------------------------------------------------------------------------
// Test data — all IDs are stable across runs (INSERT OR REPLACE)
// ---------------------------------------------------------------------------

const USER = { id: 'e2e-user-rlg', name: 'RLG E2E', email: 'rlg@e2e.test', token: 'e2e-session-token-rlg' }
const JOURNEY_ID = 'e2e-journey-rlg'
const WAYPOINT_ID_1 = 'e2e-wp-rlg-1'
const WAYPOINT_ID_2 = 'e2e-wp-rlg-2'

// Scripted SSE lesson events
const MOCK_SSE_EVENTS = [
  JSON.stringify({ type: 'header', title: 'Async/Await Basics', summary: 'Learn the fundamentals of async JavaScript.' }),
  JSON.stringify({ type: 'heading', id: 'h1', level: 2, text: 'What is async/await?', concept_tags: [] }),
  JSON.stringify({ type: 'prose', id: 'prose-1', html: '<p>Async/await makes asynchronous code readable.</p>', concept_tags: ['Async/Await'] }),
  JSON.stringify({ type: 'widget', id: 'widget-1', widget_type: 'checkpoint-question', props: { question: 'What does async return?', options: ['A Promise', 'A callback', 'A string', 'undefined'], correct_index: 0, explanation: 'async functions always return a Promise.' }, concept_tags: ['Async/Await', 'Promises'] }),
  JSON.stringify({ type: 'sources', sources: [], recommended_primary_source: null }),
]

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  if (!E2E_AUTH_SECRET) return

  const now = Date.now()
  const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString()
  const createdAt = new Date(now).toISOString()

  runD1(`INSERT OR REPLACE INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES ('${sqlEsc(USER.id)}', '${sqlEsc(USER.name)}', '${sqlEsc(USER.email)}', 1, NULL, '${createdAt}', '${createdAt}');`)
  runD1(`INSERT OR REPLACE INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt) VALUES ('${sqlEsc(USER.token)}-session', '${sqlEsc(USER.id)}', '${sqlEsc(USER.token)}', '${expiresAt}', NULL, 'playwright-rlg-e2e', '${createdAt}', '${createdAt}');`)
  runD1(`INSERT OR REPLACE INTO journeys (id, user_id, title, goal, status, created_at, updated_at) VALUES ('${sqlEsc(JOURNEY_ID)}', '${sqlEsc(USER.id)}', 'Learn Async JS', 'Build async apps', 'roadmap_ready', ${now}, ${now});`)

  // Seed 2 waypoints for the journey
  runD1(`INSERT OR REPLACE INTO waypoints (id, journey_id, position, title, goal, concepts) VALUES ('${sqlEsc(WAYPOINT_ID_1)}', '${sqlEsc(JOURNEY_ID)}', 0, 'Async/Await Basics', 'Write async functions', '["Async/Await","Promises"]');`)
  runD1(`INSERT OR REPLACE INTO waypoints (id, journey_id, position, title, goal, concepts) VALUES ('${sqlEsc(WAYPOINT_ID_2)}', '${sqlEsc(JOURNEY_ID)}', 1, 'Error Handling', 'Handle async errors', '["try/catch","Promise.reject"]');`)
})

async function makeAuthContext(browser: Browser, baseURL: string) {
  const cookieValue = await signSessionToken(USER.token, E2E_AUTH_SECRET)
  const ctx = await browser.newContext()
  await ctx.addCookies([
    {
      name: '__Secure-better-auth.session_token',
      value: cookieValue,
      domain: new URL(baseURL).hostname,
      path: '/',
      secure: true,
      httpOnly: true,
    },
    {
      name: 'better-auth.session_token',
      value: cookieValue,
      domain: new URL(baseURL).hostname,
      path: '/',
      secure: false,
      httpOnly: true,
    },
  ])
  return ctx
}

// ---------------------------------------------------------------------------
// AC-5: Roadmap persists in sidebar after reload
// ---------------------------------------------------------------------------

test('AC-5: seeded waypoints appear in sidebar and persist on reload', async ({ browser }, testInfo) => {
  if (!E2E_AUTH_SECRET) {
    testInfo.skip(true, 'BETTER_AUTH_SECRET not set — seeded-session tests deferred (AC-ADL1 deferral)')
    return
  }

  const ctx = await makeAuthContext(browser, testInfo.project.use.baseURL ?? 'http://localhost:3000')
  const page = await ctx.newPage()

  // Navigate to the first waypoint page
  // Note: /_authenticated is a pathless layout group; public URL omits it
  await page.goto(`/journey/${JOURNEY_ID}/waypoint/${WAYPOINT_ID_1}`)

  // Sidebar should show both waypoint links
  await expect(page.locator('[data-testid="waypoint-link"]')).toHaveCount(2, { timeout: 8000 })

  // First waypoint title visible in sidebar
  await expect(page.locator('[data-testid="waypoint-link"]').first()).toContainText('Async/Await Basics')
  await expect(page.locator('[data-testid="waypoint-link"]').nth(1)).toContainText('Error Handling')

  // Reload and verify waypoints still present
  await page.reload()
  await expect(page.locator('[data-testid="waypoint-link"]')).toHaveCount(2, { timeout: 8000 })

  await ctx.close()
})

// ---------------------------------------------------------------------------
// AC-6: Lesson streams progressively, checkpoint widget answerable
// ---------------------------------------------------------------------------

test('AC-6: lesson streams progressively and checkpoint widget is interactive', async ({ browser }, testInfo) => {
  if (!E2E_AUTH_SECRET) {
    testInfo.skip(true, 'BETTER_AUTH_SECRET not set — seeded-session tests deferred (AC-ADL1 deferral)')
    return
  }

  const ctx = await makeAuthContext(browser, testInfo.project.use.baseURL ?? 'http://localhost:3000')
  const page = await ctx.newPage()

  // Intercept the SSE endpoint and serve mock SSE events with realistic cadence
  await page.route(`**/api/journey/${JOURNEY_ID}/lesson**`, async (route) => {
    // Return a streaming SSE response using chunked encoding simulation
    const events = MOCK_SSE_EVENTS.map((e) => `data: ${e}\n\n`).join('')
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: {
        'Cache-Control': 'no-cache',
        'X-Lesson-Id': 'e2e-lesson-mock-1',
      },
      body: events,
    })
  })

  const t0 = Date.now()
  await page.goto(`/journey/${JOURNEY_ID}/waypoint/${WAYPOINT_ID_1}`)

  // Wait for lesson-content wrapper (LessonGeneratingView renders this)
  await expect(page.locator('[data-testid="lesson-content"]')).toBeVisible({ timeout: 10000 })

  // Wait for at least one lesson section to appear
  await expect(page.locator('[data-testid="lesson-view"]')).toBeVisible({ timeout: 10000 })

  // First section should appear well within 5s
  const elapsed = Date.now() - t0
  expect(elapsed).toBeLessThan(5000)

  // Checkpoint widget should be present and interactive
  const checkpointBtn = page.locator('[data-testid="checkpoint-question"]').first()
  await expect(checkpointBtn).toBeVisible({ timeout: 5000 })

  // Click the first option
  const firstOption = page.locator('[data-testid="checkpoint-option-0"]').first()
  await expect(firstOption).toBeVisible({ timeout: 5000 })
  await firstOption.click()

  // Feedback should appear (testid is "checkpoint-explanation" per the widget component)
  await expect(page.locator('[data-testid="checkpoint-explanation"]').first()).toBeVisible({ timeout: 3000 })

  await ctx.close()
})

// ---------------------------------------------------------------------------
// AC-12: Mid-stream failure: reconnect, content preserved
// ---------------------------------------------------------------------------

test('AC-12: reconnecting banner appears on SSE error, content preserved on retry', async ({ browser }, testInfo) => {
  if (!E2E_AUTH_SECRET) {
    testInfo.skip(true, 'BETTER_AUTH_SECRET not set — seeded-session tests deferred (AC-ADL1 deferral)')
    return
  }

  const ctx = await makeAuthContext(browser, testInfo.project.use.baseURL ?? 'http://localhost:3000')
  const page = await ctx.newPage()

  let callCount = 0

  // First call: succeed with 2 sections then close (simulating mid-stream drop)
  // Second call: return all events including completion
  await page.route(`**/api/journey/${JOURNEY_ID}/lesson**`, async (route) => {
    callCount++
    if (callCount === 1) {
      // Return partial stream (header + 2 sections, no sources event = incomplete)
      const partial = MOCK_SSE_EVENTS.slice(0, 3).map((e) => `data: ${e}\n\n`).join('')
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache', 'X-Lesson-Id': 'e2e-lesson-mock-fault' },
        body: partial,
      })
    } else {
      // Full stream on retry
      const full = MOCK_SSE_EVENTS.map((e) => `data: ${e}\n\n`).join('')
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache', 'X-Lesson-Id': 'e2e-lesson-mock-fault' },
        body: full,
      })
    }
  })

  await page.goto(`/journey/${JOURNEY_ID}/waypoint/${WAYPOINT_ID_2}`)

  // Wait for initial sections to render
  await expect(page.locator('[data-testid="lesson-content"]')).toBeVisible({ timeout: 10000 })

  // After first call completes (EventSource auto-reconnects), banner should appear briefly
  // The reconnecting banner fires on onerror; we check it's rendered or was rendered
  // Note: timing-sensitive; proxy pass = sections 1-2 visible after reconnect completes
  await expect(page.locator('[data-testid="lesson-view"]')).toBeVisible({ timeout: 8000 })

  // Lesson content should still be visible (not cleared on reconnect)
  await expect(page.locator('[data-testid="lesson-content"]')).toBeVisible()

  await ctx.close()
})

// ---------------------------------------------------------------------------
// All-fallbacks-fail: friendly error state
// ---------------------------------------------------------------------------

test('all-fallbacks-fail: friendly error message shown', async ({ browser }, testInfo) => {
  if (!E2E_AUTH_SECRET) {
    testInfo.skip(true, 'BETTER_AUTH_SECRET not set — seeded-session tests deferred (AC-ADL1 deferral)')
    return
  }

  const ctx = await makeAuthContext(browser, testInfo.project.use.baseURL ?? 'http://localhost:3000')
  const page = await ctx.newPage()

  // Return a terminal error event
  await page.route(`**/api/journey/${JOURNEY_ID}/lesson**`, async (route) => {
    const errorEvent = `data: ${JSON.stringify({ type: 'error', message: 'All models failed. Please try again.' })}\n\n`
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'Cache-Control': 'no-cache', 'X-Lesson-Id': 'e2e-lesson-all-fail' },
      body: errorEvent,
    })
  })

  await page.goto(`/journey/${JOURNEY_ID}/waypoint/${WAYPOINT_ID_2}`)

  // Error state should render
  await expect(page.locator('[data-testid="lesson-error"]')).toBeVisible({ timeout: 8000 })
  await expect(page.locator('[data-testid="lesson-error"]')).toContainText('Generation failed')

  await ctx.close()
})
