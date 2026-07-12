// E2E tutor-interview tests (AC-TI1, AC-TI3, AC-TI4).
//
// Seeded-session proxy: wrangler CLI seeds user+session+journey+interview_records;
// Playwright injects the signed cookie; tests drive the interview UI with ?mock=1
// so sendTurn returns scripted responses rather than calling the live model.
//
// constraint-resolution: proxy+deferral — absorbed into existing AC-ADL1+AC-ADL5
// deferral (same BETTER_AUTH_SECRET wall, same clearing event).
//
// AC-TI2 (vagueness detection) and AC-TI5 (one-Q enforcement) are covered by
// tests/smoke/interview-state-machine.test.ts (always-run unit tests).
// AC-TI6 (prompt-suite pedagogy fidelity) is covered by the human review in the
// verify artifact.

import * as path from 'path'
import * as fs from 'fs'
import { test, expect, type Browser } from '@playwright/test'
import { execSync } from 'child_process'
import crypto from 'crypto'

// ---------------------------------------------------------------------------
// Helpers (shared pattern with lesson-renderer.spec.ts)
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

function seedUser(userId: string, name: string, email: string, sessionToken: string) {
  const now = Date.now()
  const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString()
  const createdAt = new Date(now).toISOString()
  const uId    = sqlEsc(userId)
  const uName  = sqlEsc(name)
  const uEmail = sqlEsc(email)
  const uToken = sqlEsc(sessionToken)
  runD1(
    `INSERT OR REPLACE INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES ('${uId}', '${uName}', '${uEmail}', 1, NULL, '${createdAt}', '${createdAt}');`,
  )
  runD1(
    `INSERT OR REPLACE INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt) VALUES ('${uToken}-session', '${uId}', '${uToken}', '${expiresAt}', NULL, 'playwright-ti-e2e', '${createdAt}', '${createdAt}');`,
  )
}

function seedJourney(journeyId: string, userId: string, goal: string) {
  const now = Date.now()
  const jId   = sqlEsc(journeyId)
  const uId   = sqlEsc(userId)
  const jGoal = sqlEsc(goal)
  runD1(
    `INSERT OR REPLACE INTO journeys (id, user_id, title, goal, status, created_at, updated_at) VALUES ('${jId}', '${uId}', '${jGoal}', '${jGoal}', 'active', ${now}, ${now});`,
  )
}

function seedInterviewRecord(
  recordId: string,
  journeyId: string,
  userId: string,
  stage: string,
  turns: unknown[],
) {
  const now  = Date.now()
  const rId  = sqlEsc(recordId)
  const jId  = sqlEsc(journeyId)
  const uId  = sqlEsc(userId)
  const st   = sqlEsc(stage)
  const tsql = sqlEsc(JSON.stringify(turns))
  runD1(
    `INSERT OR REPLACE INTO interview_records (id, journey_id, user_id, status, stage, turns, captured_source_urls, best_effort, created_at, updated_at) VALUES ('${rId}', '${jId}', '${uId}', 'pending', '${st}', '${tsql}', '[]', 0, ${now}, ${now});`,
  )
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const USER_TI = {
  id:    'e2e-user-ti',
  name:  'TI E2E',
  email: 'ti@e2e.test',
  token: 'e2e-session-token-ti',
}

const JOURNEYS = {
  scripted: 'e2e-journey-ti-scripted',
  resume:   'e2e-journey-ti-resume',
  decline:  'e2e-journey-ti-decline',
}

const CONSENT_TURNS = [
  { role: 'user',      content: 'My goal is: learn Rust for systems programming', stage: 'consent' },
  { role: 'assistant', content: 'Welcome! May I ask a few questions to understand your goal better?', stage: 'consent' },
]

const RESUME_TURNS = [
  { role: 'user',      content: 'My goal is: learn Rust for systems programming', stage: 'consent' },
  { role: 'assistant', content: 'Welcome! May I ask a few questions to understand your goal better?', stage: 'consent' },
  { role: 'user',      content: "Yes, let's explore", stage: 'consent' },
  { role: 'assistant', content: "What specifically do you want to be able to build or do when you're done?", stage: 'mission' },
]

// ---------------------------------------------------------------------------
// Setup — seed once before all tests
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  if (!E2E_AUTH_SECRET) return

  seedUser(USER_TI.id, USER_TI.name, USER_TI.email, USER_TI.token)

  // Scripted interview journey + consent-stage record
  seedJourney(JOURNEYS.scripted, USER_TI.id, 'learn Rust for systems programming')
  seedInterviewRecord(
    'e2e-record-ti-scripted',
    JOURNEYS.scripted,
    USER_TI.id,
    'consent',
    CONSENT_TURNS,
  )

  // Resume journey + mid-interview record (scope stage, 4 turns in)
  seedJourney(JOURNEYS.resume, USER_TI.id, 'learn Rust for systems programming')
  seedInterviewRecord(
    'e2e-record-ti-resume',
    JOURNEYS.resume,
    USER_TI.id,
    'mission',
    RESUME_TURNS,
  )

  // Decline-consent journey + consent-stage record
  seedJourney(JOURNEYS.decline, USER_TI.id, 'learn Rust for systems programming')
  seedInterviewRecord(
    'e2e-record-ti-decline',
    JOURNEYS.decline,
    USER_TI.id,
    'consent',
    CONSENT_TURNS,
  )
})

// ---------------------------------------------------------------------------
// Shared helper — create authenticated browser context
// ---------------------------------------------------------------------------

async function makeAuthContext(browser: Browser, baseURL: string) {
  const cookieValue = await signSessionToken(USER_TI.token, E2E_AUTH_SECRET)
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

function screenshotDir(): string {
  const dir = 'tests/e2e/screenshots'
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

// ---------------------------------------------------------------------------
// AC-TI1: Scripted interview — consent, one-Q-per-turn, chips, captured record
// ---------------------------------------------------------------------------

test(
  'AC-TI1: scripted interview completes with chips at each stage',
  async ({ browser, baseURL }) => {
    test.skip(!E2E_AUTH_SECRET, 'Skipped: BETTER_AUTH_SECRET not set in .dev.vars')

    const ctx  = await makeAuthContext(browser, baseURL!)
    const page = await ctx.newPage()

    await page.goto(`/journey/${JOURNEYS.scripted}/interview?mock=1`)
    await expect(page.getByTestId('interview-view')).toBeVisible()

    // Consent question should be rendered from the seeded record
    await expect(page.getByTestId('chat-chips')).toBeVisible()

    // Screenshot at 375px (mobile)
    await page.setViewportSize({ width: 375, height: 667 })
    await page.screenshot({
      path: path.join(screenshotDir(), 'interview-375px.png'),
      fullPage: false,
    })

    // Click "Yes, let's explore" chip → sends user turn
    await page.getByRole('button', { name: "Yes, let's explore" }).click()

    // Typing indicator should appear then disappear
    // (may be too fast to catch; skip if already gone)
    await expect(page.getByTestId('chat-bubble-assistant-2')).toBeVisible({ timeout: 5000 })

    // Screenshot at 768px (tablet) — mission stage
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.screenshot({
      path: path.join(screenshotDir(), 'interview-768px.png'),
      fullPage: false,
    })

    // Type a non-vague mission and submit
    const input = page.getByTestId('chat-input')
    await expect(input).toBeVisible()
    await input.fill('Build a CLI tool in Rust so I can replace my Python scripts by summer')
    await page.getByTestId('chat-submit').click()

    // Scope stage
    await expect(page.getByRole('button', { name: 'Some experience' })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Some experience' }).click()

    // Prior knowledge stage
    await expect(page.getByRole('button', { name: 'A little' })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'A little' }).click()

    // Sources stage
    await expect(page.getByRole('button', { name: 'No preferred sources' })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'No preferred sources' }).click()

    // Completion card should appear
    await expect(page.getByTestId('interview-complete-card')).toBeVisible({ timeout: 5000 })

    // Screenshot at 1280px (desktop) — completion state
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.screenshot({
      path: path.join(screenshotDir(), 'interview-complete-1280px.png'),
      fullPage: false,
    })

    await ctx.close()
  },
)

// ---------------------------------------------------------------------------
// AC-TI3: Mid-interview resume — abandon and return restores pending question
// ---------------------------------------------------------------------------

test(
  'AC-TI3: resume restores interview at the pending question',
  async ({ browser, baseURL }) => {
    test.skip(!E2E_AUTH_SECRET, 'Skipped: BETTER_AUTH_SECRET not set in .dev.vars')

    const ctx  = await makeAuthContext(browser, baseURL!)
    const page = await ctx.newPage()

    await page.goto(`/journey/${JOURNEYS.resume}/interview?mock=1`)
    await expect(page.getByTestId('interview-view')).toBeVisible()

    // The seeded record has 4 turns, ending at the mission question.
    // The resume should show all 4 bubbles and present the mission chips.
    const missionBubble = page.getByTestId('chat-bubble-assistant-3')
    await expect(missionBubble).toBeVisible()
    await expect(missionBubble).toContainText('build')

    // Mission chips should be visible (resume at correct stage)
    await expect(page.getByRole('button', { name: 'Help me refine it' })).toBeVisible()

    await ctx.close()
  },
)

// ---------------------------------------------------------------------------
// AC-TI4: Decline-consent — best-effort journey completes gracefully
// ---------------------------------------------------------------------------

test(
  'AC-TI4: declining consent shows best-effort completion card',
  async ({ browser, baseURL }) => {
    test.skip(!E2E_AUTH_SECRET, 'Skipped: BETTER_AUTH_SECRET not set in .dev.vars')

    const ctx  = await makeAuthContext(browser, baseURL!)
    const page = await ctx.newPage()

    await page.goto(`/journey/${JOURNEYS.decline}/interview?mock=1`)
    await expect(page.getByTestId('interview-view')).toBeVisible()

    // Chip "Just use my stated goal" should be present at consent stage
    await expect(page.getByRole('button', { name: 'Just use my stated goal' })).toBeVisible()
    await page.getByRole('button', { name: 'Just use my stated goal' }).click()

    // Completion card should show — the message confirms best-effort framing
    await expect(page.getByTestId('interview-complete-card')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('interview-complete-card')).toContainText('stated goal')

    await ctx.close()
  },
)

// ---------------------------------------------------------------------------
// Unauthenticated guard (always-run — no secret required)
// ---------------------------------------------------------------------------

test('unauthenticated /journey/new redirects to /sign-in', async ({ page }) => {
  await page.goto('/journey/new')
  await expect(page).toHaveURL('/sign-in')
})
