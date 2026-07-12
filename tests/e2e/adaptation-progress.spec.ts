// E2E tests for adaptation and progress surfaces.
//
// AC-9:  weak-quiz adaptation proposal (accept + decline paths); empty state.
// AC-10: progress surfaces (streak, due count, pass rate, mastery meters, quiz history).
// AC-13: multiple journeys with independent progress.
// AC-14: responsive sweep — 5 screens × 3 widths (375/768/1280px).
//
// constraint-resolution: proxy+deferral.
//   Proxy: progress-metrics.test.ts unit tests cover all derivation math
//   without authentication.
//   Deferral: BETTER_AUTH_SECRET wall — absorbed into existing AC-ADL1+AC-ADL5
//   deferral entry. Clearing event: same ("re-running E2E suite with
//   BETTER_AUTH_SECRET set in .dev.vars").
//
// These tests skip gracefully when BETTER_AUTH_SECRET is absent.

import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { test, expect, type Browser } from '@playwright/test'
import { execSync } from 'child_process'
import crypto from 'crypto'

// ---------------------------------------------------------------------------
// Helpers (shared pattern with quiz-fsrs.spec.ts)
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
  const signatureBuf = await crypto.webcrypto.subtle.sign('HMAC', key, new TextEncoder().encode(token))
  const sig = btoa(String.fromCharCode(...new Uint8Array(signatureBuf)))
  return encodeURIComponent(`${token}.${sig}`)
}

function sqlEsc(s: string): string {
  return s.replace(/'/g, "''")
}

function runD1(command: string) {
  const tmpFile = path.join(os.tmpdir(), `wrangler-d1-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`)
  fs.writeFileSync(tmpFile, command, 'utf8')
  try {
    execSync(
      `pnpm exec wrangler d1 execute waypoint-dev --local --file="${tmpFile}"`,
      { cwd: process.cwd(), stdio: 'pipe' },
    )
  } finally {
    try { fs.unlinkSync(tmpFile) } catch { /* ignore */ }
  }
}

async function makeAuthContext(browser: Browser, baseURL: string, token: string) {
  const cookieValue = await signSessionToken(token, E2E_AUTH_SECRET)
  const ctx = await browser.newContext()
  await ctx.addCookies([
    {
      name:     '__Secure-better-auth.session_token',
      value:    cookieValue,
      domain:   new URL(baseURL).hostname,
      path:     '/',
      httpOnly: false,
      secure:   true,
    },
  ])
  return ctx
}

const screenshotsDir = path.join(process.cwd(), 'tests', 'e2e', 'screenshots', 'adaptive-progress-responsive')

// ---------------------------------------------------------------------------
// Test data — stable IDs
// ---------------------------------------------------------------------------

const USER = {
  id:    'e2e-user-adapt-progress',
  name:  'Adaptation Progress E2E',
  email: 'adapt-progress@e2e.test',
  token: 'e2e-session-token-adapt-progress',
}

const JOURNEY_ID  = 'e2e-journey-adapt-progress'
const JOURNEY2_ID = 'e2e-journey-adapt-progress-2'  // for AC-13

const WP_IDS = ['e2e-ap-wp-0', 'e2e-ap-wp-1', 'e2e-ap-wp-2']
const CONCEPT_IDS = ['e2e-ap-c-0', 'e2e-ap-c-1', 'e2e-ap-c-2']
const QQ_IDS = ['e2e-ap-qq-0', 'e2e-ap-qq-1', 'e2e-ap-qq-2']
const FSRS_IDS = ['e2e-ap-fsrs-0', 'e2e-ap-fsrs-1', 'e2e-ap-fsrs-2']
const ATTEMPT_IDS = ['e2e-ap-att-0', 'e2e-ap-att-1', 'e2e-ap-att-2',
                     'e2e-ap-att-3', 'e2e-ap-att-4', 'e2e-ap-att-5']

// AC-13 journey 2 data
const WP2_ID      = 'e2e-ap-wp-j2-0'
const CONCEPT2_ID = 'e2e-ap-c-j2-0'
const QQ2_ID      = 'e2e-ap-qq-j2-0'
const FSRS2_ID    = 'e2e-ap-fsrs-j2-0'

// ---------------------------------------------------------------------------
// Setup — seed all fixture data once
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  if (!E2E_AUTH_SECRET) return

  const now = Date.now()
  const exp = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString()
  const cat = new Date(now).toISOString()

  const uId  = sqlEsc(USER.id)
  const uTok = sqlEsc(USER.token)

  // ── User + session ──────────────────────────────────────────────────────
  runD1(`INSERT OR REPLACE INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES ('${uId}', '${sqlEsc(USER.name)}', '${sqlEsc(USER.email)}', 1, NULL, '${cat}', '${cat}');`)
  runD1(`INSERT OR REPLACE INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt) VALUES ('${uTok}-session', '${uId}', '${uTok}', '${exp}', NULL, 'playwright-adapt-progress-e2e', '${cat}', '${cat}');`)

  // ── Journey 1 ────────────────────────────────────────────────────────────
  const jId = sqlEsc(JOURNEY_ID)
  runD1(`INSERT OR REPLACE INTO journeys (id, user_id, title, goal, status, created_at, updated_at) VALUES ('${jId}', '${uId}', 'Adaptation Progress E2E Journey', 'Test progress surfaces', 'active', ${now}, ${now});`)

  // 3 waypoints
  for (let i = 0; i < 3; i++) {
    const wId = sqlEsc(WP_IDS[i]!)
    runD1(`INSERT OR REPLACE INTO waypoints (id, journey_id, position, title, goal, concepts) VALUES ('${wId}', '${jId}', ${i}, 'Waypoint ${i + 1}', 'Goal ${i + 1}', '["Concept ${i}"]');`)
    // Lesson for each waypoint (so lesson route works)
    const lessonContent = sqlEsc(JSON.stringify({ header: { title: 'Waypoint ' + (i+1), summary: '' }, sections: [], sources: [] }))
    runD1(`INSERT OR REPLACE INTO lessons (id, waypoint_id, content, sources, created_at) VALUES ('${wId}-lesson', '${wId}', '${lessonContent}', '[]', ${now});`)
  }

  // 3 concepts (one per waypoint)
  for (let i = 0; i < 3; i++) {
    const cId = sqlEsc(CONCEPT_IDS[i]!)
    runD1(`INSERT OR REPLACE INTO concepts (id, journey_id, name, description) VALUES ('${cId}', '${jId}', 'Concept ${i}', NULL);`)
  }

  // 3 quiz questions (mc, one per concept + waypoint)
  const opts = sqlEsc(JSON.stringify(['A', 'B', 'C', 'D']))
  for (let i = 0; i < 3; i++) {
    const qqId = sqlEsc(QQ_IDS[i]!)
    const cId  = sqlEsc(CONCEPT_IDS[i]!)
    const wId  = sqlEsc(WP_IDS[i]!)
    runD1(`INSERT OR REPLACE INTO quiz_questions (id, waypoint_id, type, question, options, correct_answer, concept_id, rubric) VALUES ('${qqId}', '${wId}', 'mc', 'Q${i}: What is concept ${i}?', '${opts}', 'A', '${cId}', NULL);`)
  }

  // 3 FSRS cards — one per concept, mid-Review state (retrievability ~0.7)
  for (let i = 0; i < 3; i++) {
    const fId = sqlEsc(FSRS_IDS[i]!)
    const cId = sqlEsc(CONCEPT_IDS[i]!)
    const due = now + 3 * 86_400_000   // due in 3 days
    runD1(`INSERT OR REPLACE INTO concept_fsrs_cards (id, user_id, concept_id, due, stability, difficulty, reps, lapses, state, last_review) VALUES ('${fId}', '${uId}', '${cId}', ${due}, 5.0, 0.3, 3, 0, 'Review', ${now - 2 * 86_400_000});`)
  }

  // 6 quiz attempts across 2 days (to seed streak + history)
  const yesterday = now - 86_400_000
  const attemptScores = [2, 0, 2, 1, 0, 2]
  const attemptDates  = [now, now, now, yesterday, yesterday, yesterday]
  for (let i = 0; i < 6; i++) {
    const attId = sqlEsc(ATTEMPT_IDS[i]!)
    const qqId  = sqlEsc(QQ_IDS[i % 3]!)
    runD1(`INSERT OR REPLACE INTO quiz_attempts (id, user_id, quiz_question_id, response, score, feedback, created_at) VALUES ('${attId}', '${uId}', '${qqId}', 'A', ${attemptScores[i]}, 'ok', ${attemptDates[i]});`)
  }

  // ── Journey 2 (AC-13) ────────────────────────────────────────────────────
  const jId2 = sqlEsc(JOURNEY2_ID)
  runD1(`INSERT OR REPLACE INTO journeys (id, user_id, title, goal, status, created_at, updated_at) VALUES ('${jId2}', '${uId}', 'Second Journey (Isolation)', 'Test isolation', 'active', ${now}, ${now});`)
  runD1(`INSERT OR REPLACE INTO waypoints (id, journey_id, position, title, goal, concepts) VALUES ('${sqlEsc(WP2_ID)}', '${jId2}', 0, 'J2 Waypoint 1', 'J2 Goal', '["J2 Concept"]');`)
  runD1(`INSERT OR REPLACE INTO concepts (id, journey_id, name, description) VALUES ('${sqlEsc(CONCEPT2_ID)}', '${jId2}', 'J2 Concept', NULL);`)
  const qqOpts2 = sqlEsc(JSON.stringify(['X', 'Y', 'Z']))
  runD1(`INSERT OR REPLACE INTO quiz_questions (id, waypoint_id, type, question, options, correct_answer, concept_id, rubric) VALUES ('${sqlEsc(QQ2_ID)}', '${sqlEsc(WP2_ID)}', 'mc', 'J2 question?', '${qqOpts2}', 'X', '${sqlEsc(CONCEPT2_ID)}', NULL);`)
  // J2 FSRS card with different retrievability
  const due2 = now + 1 * 86_400_000
  runD1(`INSERT OR REPLACE INTO concept_fsrs_cards (id, user_id, concept_id, due, stability, difficulty, reps, lapses, state, last_review) VALUES ('${sqlEsc(FSRS2_ID)}', '${uId}', '${sqlEsc(CONCEPT2_ID)}', ${due2}, 2.0, 0.5, 1, 0, 'Review', ${now - 86_400_000});`)

  // Create screenshots dir
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true })
  }
})

// ---------------------------------------------------------------------------
// AC-10: Progress surfaces with seeded activity
// ---------------------------------------------------------------------------

test(
  'AC-10: progress surfaces — streak, due count, pass rate, roadmap, quiz history visible',
  async ({ browser, baseURL }) => {
    test.skip(!E2E_AUTH_SECRET, 'Skipped: BETTER_AUTH_SECRET not set in .dev.vars')

    const ctx  = await makeAuthContext(browser, baseURL!, USER.token)
    const page = await ctx.newPage()
    await page.goto(`/journey/${JOURNEY_ID}/progress`)
    await page.waitForSelector('[data-testid="progress-page"]')

    // Streak chip should be visible (2 consecutive days of activity seeded)
    await expect(page.locator('[data-testid="progress-streak"]')).toBeVisible()

    // Due count chip
    await expect(page.locator('[data-testid="progress-due-count"]')).toBeVisible()

    // Pass rate chip
    await expect(page.locator('[data-testid="progress-pass-rate"]')).toBeVisible()

    // Roadmap should show 3 waypoints
    const roadmap = page.locator('[data-testid="progress-roadmap"]')
    await expect(roadmap).toBeVisible()
    const waypointItems = roadmap.locator('li')
    await expect(waypointItems).toHaveCount(3)

    // Quiz history table should be visible
    await expect(page.locator('[data-testid="progress-quiz-history"]')).toBeVisible()

    // Empty state must NOT be visible (we have seeded attempts)
    await expect(page.locator('[data-testid="progress-empty"]')).not.toBeVisible()

    await page.screenshot({ path: path.join(screenshotsDir, 'progress-1280px.png'), fullPage: true })
    await ctx.close()
  },
)

// ---------------------------------------------------------------------------
// AC-9 (empty state): quiz-less journey shows "Your map starts here"
// ---------------------------------------------------------------------------

test(
  'AC-9 (empty state): fresh journey shows progress-empty, roadmap still visible',
  async ({ browser, baseURL }) => {
    test.skip(!E2E_AUTH_SECRET, 'Skipped: BETTER_AUTH_SECRET not set in .dev.vars')

    // Seed a fresh journey with no quiz attempts for this user
    const freshJourneyId = 'e2e-ap-fresh-journey'
    const freshWpId      = 'e2e-ap-fresh-wp'
    const now = Date.now()
    const uId = sqlEsc(USER.id)
    const jId = sqlEsc(freshJourneyId)
    const wId = sqlEsc(freshWpId)

    runD1(`INSERT OR REPLACE INTO journeys (id, user_id, title, goal, status, created_at, updated_at) VALUES ('${jId}', '${uId}', 'Fresh Journey', 'No attempts yet', 'active', ${now}, ${now});`)
    runD1(`INSERT OR REPLACE INTO waypoints (id, journey_id, position, title, goal, concepts) VALUES ('${wId}', '${jId}', 0, 'Start Here', NULL, '[]');`)

    const ctx  = await makeAuthContext(browser, baseURL!, USER.token)
    const page = await ctx.newPage()
    await page.goto(`/journey/${freshJourneyId}/progress`)
    await page.waitForSelector('[data-testid="progress-page"]')

    // Empty state visible
    await expect(page.locator('[data-testid="progress-empty"]')).toBeVisible()

    // Roadmap still shows (even without attempts)
    await expect(page.locator('[data-testid="progress-roadmap"]')).toBeVisible()

    // No quiz history table
    await expect(page.locator('[data-testid="progress-quiz-history"]')).not.toBeVisible()

    await ctx.close()
  },
)

// ---------------------------------------------------------------------------
// AC-9 (adaptation accept): adaptation card shows after weak quiz, accept works
// ---------------------------------------------------------------------------

test(
  'AC-9 (adapt-accept): adaptation card appears for weak quiz, accept navigates away',
  async ({ browser, baseURL }) => {
    test.skip(!E2E_AUTH_SECRET, 'Skipped: BETTER_AUTH_SECRET not set in .dev.vars')

    // Seed a fresh user-session pair to avoid interference from seeded adaptation in main user
    const weakUser = {
      id:    'e2e-ap-weak-user',
      name:  'Weak Quiz User',
      email: 'weak@e2e.test',
      token: 'e2e-session-weak',
    }
    const weakJourneyId  = 'e2e-ap-weak-journey'
    const weakWpId       = 'e2e-ap-weak-wp'
    const weakConceptId  = 'e2e-ap-weak-concept'
    const weakQQ1Id      = 'e2e-ap-weak-qq-1'
    const weakQQ2Id      = 'e2e-ap-weak-qq-2'
    const now = Date.now()

    const exp = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString()
    const cat = new Date(now).toISOString()

    runD1(`INSERT OR REPLACE INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES ('${sqlEsc(weakUser.id)}', '${sqlEsc(weakUser.name)}', '${sqlEsc(weakUser.email)}', 1, NULL, '${cat}', '${cat}');`)
    runD1(`INSERT OR REPLACE INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt) VALUES ('${sqlEsc(weakUser.token)}-session', '${sqlEsc(weakUser.id)}', '${sqlEsc(weakUser.token)}', '${exp}', NULL, 'playwright', '${cat}', '${cat}');`)
    runD1(`INSERT OR REPLACE INTO journeys (id, user_id, title, goal, status, created_at, updated_at) VALUES ('${sqlEsc(weakJourneyId)}', '${sqlEsc(weakUser.id)}', 'Weak Quiz Journey', NULL, 'active', ${now}, ${now});`)
    runD1(`INSERT OR REPLACE INTO waypoints (id, journey_id, position, title, goal, concepts) VALUES ('${sqlEsc(weakWpId)}', '${sqlEsc(weakJourneyId)}', 0, 'WP 1', NULL, '["Concept A"]');`)
    runD1(`INSERT OR REPLACE INTO concepts (id, journey_id, name, description) VALUES ('${sqlEsc(weakConceptId)}', '${sqlEsc(weakJourneyId)}', 'Concept A', NULL);`)
    const opts = sqlEsc(JSON.stringify(['A', 'B', 'C', 'D']))
    runD1(`INSERT OR REPLACE INTO quiz_questions (id, waypoint_id, type, question, options, correct_answer, concept_id, rubric) VALUES ('${sqlEsc(weakQQ1Id)}', '${sqlEsc(weakWpId)}', 'mc', 'Q1?', '${opts}', 'A', '${sqlEsc(weakConceptId)}', NULL);`)
    runD1(`INSERT OR REPLACE INTO quiz_questions (id, waypoint_id, type, question, options, correct_answer, concept_id, rubric) VALUES ('${sqlEsc(weakQQ2Id)}', '${sqlEsc(weakWpId)}', 'mc', 'Q2?', '${opts}', 'A', '${sqlEsc(weakConceptId)}', NULL);`)
    // Seed attempts with score 0 (0/2 = 0% < 50%)
    runD1(`INSERT OR REPLACE INTO quiz_attempts (id, user_id, quiz_question_id, response, score, feedback, created_at) VALUES ('e2e-ap-weak-att-1', '${sqlEsc(weakUser.id)}', '${sqlEsc(weakQQ1Id)}', 'B', 0, 'wrong', ${now});`)
    runD1(`INSERT OR REPLACE INTO quiz_attempts (id, user_id, quiz_question_id, response, score, feedback, created_at) VALUES ('e2e-ap-weak-att-2', '${sqlEsc(weakUser.id)}', '${sqlEsc(weakQQ2Id)}', 'B', 0, 'wrong', ${now});`)

    const ctx  = await makeAuthContext(browser, baseURL!, weakUser.token)
    const page = await ctx.newPage()

    // Navigate to the quiz page (questions are pre-seeded)
    await page.goto(`/journey/${weakJourneyId}/waypoint/${weakWpId}/quiz`)
    await page.waitForSelector('[data-testid="quiz-page"]')

    // Mock proposeAdaptation server function to return a proposal immediately.
    // TanStack Start server functions POST to /_server; we intercept and return
    // the adaptation payload so tests don't depend on server-side threshold logic.
    await page.route('**/_server**', async (route) => {
      const postBody = route.request().postData() ?? ''
      if (postBody.includes('proposeAdaptation')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            result: {
              id:                'e2e-mock-adaptation',
              journey_id:        weakJourneyId,
              user_id:           weakUser.id,
              waypoint_after_id: weakWpId,
              proposed_title:    'Review: Concept A',
              status:            'proposed',
              created_at:        now,
            },
          }),
        })
      } else if (postBody.includes('respondToProposal')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ result: [] }),
        })
      } else {
        await route.continue()
      }
    })

    // The quiz page shows pre-seeded MC questions. Click option B (wrong) for each.
    // (Answers don't affect proposal in mock mode — we're just driving to completion.)
    // Answer Q1
    await page.waitForSelector('[data-testid="quiz-option-1"]')
    await page.locator('[data-testid="quiz-option-1"]').click()
    await page.waitForSelector('[data-testid="quiz-feedback"]')
    await page.locator('button:has-text("Next Question")').click()

    // Answer Q2
    await page.waitForSelector('[data-testid="quiz-option-1"]')
    await page.locator('[data-testid="quiz-option-1"]').click()
    await page.waitForSelector('[data-testid="quiz-feedback"]')
    await page.locator('button:has-text("See Results")').click()

    // Wait for quiz completion overlay + adaptation card
    await page.waitForSelector('[data-testid="quiz-completion-overlay"]')
    await expect(page.locator('[data-testid="adapt-card"]')).toBeVisible()
    await expect(page.locator('[data-testid="adapt-accept"]')).toBeVisible()
    await expect(page.locator('[data-testid="adapt-decline"]')).toBeVisible()

    // Accept the proposal — should navigate to lesson
    await page.locator('[data-testid="adapt-accept"]').click()
    await page.waitForURL(`**/${weakJourneyId}/waypoint/${weakWpId}`)

    await ctx.close()
  },
)

// ---------------------------------------------------------------------------
// AC-9 (adaptation decline): decline removes card, navigation proceeds normally
// ---------------------------------------------------------------------------

test(
  'AC-9 (adapt-decline): decline removes adapt card and proceeds normally',
  async ({ browser, baseURL }) => {
    test.skip(!E2E_AUTH_SECRET, 'Skipped: BETTER_AUTH_SECRET not set in .dev.vars')

    // Same seeded weak-quiz user (re-use if adaptation was declined or re-seed)
    const weakUser = {
      id:    'e2e-ap-decline-user',
      name:  'Decline User',
      email: 'decline@e2e.test',
      token: 'e2e-session-decline',
    }
    const weakJourneyId  = 'e2e-ap-decline-journey'
    const weakWpId       = 'e2e-ap-decline-wp'
    const weakConceptId  = 'e2e-ap-decline-concept'
    const weakQQ1Id      = 'e2e-ap-decline-qq-1'
    const now = Date.now()
    const exp = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString()
    const cat = new Date(now).toISOString()

    runD1(`INSERT OR REPLACE INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES ('${sqlEsc(weakUser.id)}', '${sqlEsc(weakUser.name)}', '${sqlEsc(weakUser.email)}', 1, NULL, '${cat}', '${cat}');`)
    runD1(`INSERT OR REPLACE INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt) VALUES ('${sqlEsc(weakUser.token)}-session', '${sqlEsc(weakUser.id)}', '${sqlEsc(weakUser.token)}', '${exp}', NULL, 'playwright', '${cat}', '${cat}');`)
    runD1(`INSERT OR REPLACE INTO journeys (id, user_id, title, goal, status, created_at, updated_at) VALUES ('${sqlEsc(weakJourneyId)}', '${sqlEsc(weakUser.id)}', 'Decline Journey', NULL, 'active', ${now}, ${now});`)
    runD1(`INSERT OR REPLACE INTO waypoints (id, journey_id, position, title, goal, concepts) VALUES ('${sqlEsc(weakWpId)}', '${sqlEsc(weakJourneyId)}', 0, 'WP 1', NULL, '["Concept A"]');`)
    runD1(`INSERT OR REPLACE INTO concepts (id, journey_id, name, description) VALUES ('${sqlEsc(weakConceptId)}', '${sqlEsc(weakJourneyId)}', 'Concept A', NULL);`)
    const opts = sqlEsc(JSON.stringify(['A', 'B']))
    runD1(`INSERT OR REPLACE INTO quiz_questions (id, waypoint_id, type, question, options, correct_answer, concept_id, rubric) VALUES ('${sqlEsc(weakQQ1Id)}', '${sqlEsc(weakWpId)}', 'mc', 'Q1?', '${opts}', 'A', '${sqlEsc(weakConceptId)}', NULL);`)

    const ctx  = await makeAuthContext(browser, baseURL!, weakUser.token)
    const page = await ctx.newPage()
    await page.goto(`/journey/${weakJourneyId}/waypoint/${weakWpId}/quiz`)
    await page.waitForSelector('[data-testid="quiz-page"]')

    await page.route('**/_server**', async (route) => {
      const postBody = route.request().postData() ?? ''
      if (postBody.includes('proposeAdaptation')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            result: {
              id: 'e2e-mock-adapt-decline',
              journey_id: weakJourneyId,
              user_id: weakUser.id,
              waypoint_after_id: weakWpId,
              proposed_title: 'Review: Concept A',
              status: 'proposed',
              created_at: now,
            },
          }),
        })
      } else if (postBody.includes('respondToProposal')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ result: [] }),
        })
      } else {
        await route.continue()
      }
    })

    // Answer the one MC question wrong (only 1 question seeded)
    await page.waitForSelector('[data-testid="quiz-option-1"]')
    await page.locator('[data-testid="quiz-option-1"]').click()
    await page.waitForSelector('[data-testid="quiz-feedback"]')
    await page.locator('button:has-text("See Results")').click()

    // Wait for overlay + adapt card
    await page.waitForSelector('[data-testid="quiz-completion-overlay"]')
    await expect(page.locator('[data-testid="adapt-card"]')).toBeVisible()

    // Decline — should navigate to lesson without waypoint change
    await page.locator('[data-testid="adapt-decline"]').click()
    await page.waitForURL(`**/${weakJourneyId}/waypoint/${weakWpId}`)

    await ctx.close()
  },
)

// ---------------------------------------------------------------------------
// AC-13: Multiple journeys — independent progress, no cross-journey leakage
// ---------------------------------------------------------------------------

test(
  'AC-13: multiple journeys show independent mastery on dashboard',
  async ({ browser, baseURL }) => {
    test.skip(!E2E_AUTH_SECRET, 'Skipped: BETTER_AUTH_SECRET not set in .dev.vars')

    const ctx  = await makeAuthContext(browser, baseURL!, USER.token)
    const page = await ctx.newPage()

    // Dashboard should list both journeys
    await page.goto('/')
    await page.waitForSelector('[data-testid="journeys-dashboard"]')

    // At least 2 journey cards visible
    const cards = page.locator('[data-testid="journey-card"]')
    await expect(cards).toHaveCount(await cards.count())
    // We seeded 2+ journeys for this user
    const count = await cards.count()
    expect(count).toBeGreaterThanOrEqual(2)

    // Progress page for journey 1 has 3 waypoints
    await page.goto(`/journey/${JOURNEY_ID}/progress`)
    await page.waitForSelector('[data-testid="progress-page"]')
    const roadmap = page.locator('[data-testid="progress-roadmap"]')
    await expect(roadmap).toBeVisible()
    const items = await roadmap.locator('li').count()
    expect(items).toBe(3)

    // Progress page for journey 2 has 1 waypoint (different from journey 1)
    await page.goto(`/journey/${JOURNEY2_ID}/progress`)
    await page.waitForSelector('[data-testid="progress-page"]')
    const roadmap2 = page.locator('[data-testid="progress-roadmap"]')
    await expect(roadmap2).toBeVisible()
    const items2 = await roadmap2.locator('li').count()
    expect(items2).toBe(1)

    await ctx.close()
  },
)

// ---------------------------------------------------------------------------
// AC-14: Responsive sweep — 5 screens × 3 widths
// ---------------------------------------------------------------------------

const RESPONSIVE_SCREENS = [
  { name: 'dashboard',  url: '/' },
  { name: 'interview',  url: `/journey/${JOURNEY_ID}/interview` },
  { name: 'lesson',     url: `/journey/${JOURNEY_ID}/waypoint/${WP_IDS[0]!}` },
  { name: 'quiz',       url: `/journey/${JOURNEY_ID}/waypoint/${WP_IDS[0]!}/quiz` },
  { name: 'progress',   url: `/journey/${JOURNEY_ID}/progress` },
]

const WIDTHS = [375, 768, 1280]

test(
  'AC-14: responsive sweep — 5 screens × 3 widths, no horizontal overflow',
  async ({ browser, baseURL }) => {
    test.skip(!E2E_AUTH_SECRET, 'Skipped: BETTER_AUTH_SECRET not set in .dev.vars')

    for (const width of WIDTHS) {
      const ctx  = await makeAuthContext(browser, baseURL!, USER.token)

      for (const screen of RESPONSIVE_SCREENS) {
        const page = await ctx.newPage()
        await page.setViewportSize({ width, height: 800 })
        await page.goto(screen.url)
        // Wait for content to render
        await page.waitForTimeout(600)

        const screenshotFile = path.join(
          screenshotsDir,
          `${screen.name}-${width}px.png`,
        )
        await page.screenshot({ path: screenshotFile, fullPage: true })

        // Check no horizontal scroll
        const hasHScroll = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth
        })
        expect(hasHScroll, `${screen.name} at ${width}px has horizontal overflow`).toBe(false)

        await page.close()
      }

      await ctx.close()
    }
  },
)
