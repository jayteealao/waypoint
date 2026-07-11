// E2E lesson renderer tests (AC-LR1, AC-LR2, AC-LR3).
//
// Seeded-session proxy: same pattern as auth-flow.spec.ts — wrangler CLI seeds
// a user+session, Playwright injects the signed cookie, fixture route renders.
//
// constraint-resolution: proxy+deferral — accepted into existing AC-ADL1+AC-ADL5
// deferral. Clearing event: re-running E2E suite with BETTER_AUTH_SECRET set in
// .dev.vars. AC-LR4 (security) is fully covered by lesson-widget-registry.test.ts.

import * as path from 'path'
import * as fs from 'fs'
import { test, expect } from '@playwright/test'
import { execSync } from 'child_process'
import crypto from 'crypto'

// ---------------------------------------------------------------------------
// Helpers (shared pattern with auth-flow.spec.ts)
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

function seedUser(userId: string, name: string, email: string, sessionToken: string) {
  const now = Date.now()
  const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString()
  const createdAt = new Date(now).toISOString()
  const uId = sqlEsc(userId)
  const uName = sqlEsc(name)
  const uEmail = sqlEsc(email)
  const uToken = sqlEsc(sessionToken)
  const userSql = `INSERT OR REPLACE INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES ('${uId}', '${uName}', '${uEmail}', 1, NULL, '${createdAt}', '${createdAt}');`
  const sessionSql = `INSERT OR REPLACE INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt) VALUES ('${uToken}-session', '${uId}', '${uToken}', '${expiresAt}', NULL, 'playwright-lr-e2e', '${createdAt}', '${createdAt}');`
  execSync(
    `pnpm exec wrangler d1 execute waypoint-dev --local --command="${userSql.replace(/"/g, '\\"')}"`,
    { cwd: process.cwd(), stdio: 'pipe' },
  )
  execSync(
    `pnpm exec wrangler d1 execute waypoint-dev --local --command="${sessionSql.replace(/"/g, '\\"')}"`,
    { cwd: process.cwd(), stdio: 'pipe' },
  )
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const USER_LR = {
  id: 'e2e-user-lr',
  name: 'LR E2E',
  email: 'lr@e2e.test',
  token: 'e2e-session-token-lr',
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.beforeAll(() => {
  if (!E2E_AUTH_SECRET) return
  seedUser(USER_LR.id, USER_LR.name, USER_LR.email, USER_LR.token)
})

// Shared helper: create a browser context with a seeded session cookie
async function makeAuthContext(browser: import('@playwright/test').Browser, baseURL: string) {
  const cookieValue = await signSessionToken(USER_LR.token, E2E_AUTH_SECRET)
  const ctx = await browser.newContext()
  await ctx.addCookies([
    {
      name: 'better-auth.session_token',
      value: cookieValue,
      domain: new URL(baseURL).hostname,
      path: '/',
      httpOnly: false,
      secure: false,
    },
  ])
  return ctx
}

// ---------------------------------------------------------------------------
// AC-LR1: Reading experience at 375 / 768 / 1280px — no horizontal overflow
// ---------------------------------------------------------------------------

const VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
]

for (const vp of VIEWPORTS) {
  test(
    `AC-LR1: lesson renders at ${vp.width}px with no horizontal overflow`,
    async ({ browser, baseURL }) => {
      test.skip(!E2E_AUTH_SECRET, 'Skipped: BETTER_AUTH_SECRET not set in .dev.vars')

      const ctx = await makeAuthContext(browser, baseURL!)
      const page = await ctx.newPage()
      await page.setViewportSize(vp)
      await page.goto('/lesson/fixture')

      await expect(page.getByTestId('lesson-view')).toBeVisible()

      // No horizontal overflow — scrollWidth must not exceed clientWidth
      const overflow = await page.evaluate(() => {
        const el = document.documentElement
        return el.scrollWidth > el.clientWidth
      })
      expect(overflow, `Horizontal overflow detected at ${vp.width}px`).toBe(false)

      // Screenshot evidence
      const screenshotDir = 'tests/e2e/screenshots'
      if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true })
      await page.screenshot({
        path: path.join(screenshotDir, `lesson-${vp.width}px.png`),
        fullPage: false,
      })

      await ctx.close()
    },
  )
}

// ---------------------------------------------------------------------------
// AC-LR2: Widget interaction — checkpoint records answer, flipcard flips
// ---------------------------------------------------------------------------

test(
  'AC-LR2: checkpoint records answer and flipcard toggles flipped class',
  async ({ browser, baseURL }) => {
    test.skip(!E2E_AUTH_SECRET, 'Skipped: BETTER_AUTH_SECRET not set in .dev.vars')

    const ctx = await makeAuthContext(browser, baseURL!)
    const page = await ctx.newPage()
    await page.goto('/lesson/fixture')
    await expect(page.getByTestId('lesson-view')).toBeVisible()

    // --- Checkpoint ---
    const option0 = page.getByTestId('checkpoint-option-0')
    await expect(option0).toBeVisible()
    await option0.click()

    // Explanation should appear after answering
    await expect(page.getByTestId('checkpoint-explanation')).toBeVisible()

    // Answer should be persisted to localStorage
    const storedAnswer = await page.evaluate(() =>
      localStorage.getItem('wp:checkpoint:wgt-checkpoint-1'),
    )
    expect(storedAnswer).toBe('0')

    // --- Flipcard ---
    const flipcard = page.getByTestId('flipcard')
    await expect(flipcard).toBeVisible()

    const inner = page.getByTestId('flipcard-inner')
    // Initially not flipped
    await expect(inner).not.toHaveClass(/flipped/)

    await flipcard.click()
    // After click, inner should have flipped class
    await expect(inner).toHaveClass(/flipped/)

    await ctx.close()
  },
)

// ---------------------------------------------------------------------------
// AC-LR3: Progressive rendering — skeleton → content fill
// ---------------------------------------------------------------------------

test(
  'AC-LR3: progressive rendering shows skeletons first then fills sections',
  async ({ browser, baseURL }) => {
    test.skip(!E2E_AUTH_SECRET, 'Skipped: BETTER_AUTH_SECRET not set in .dev.vars')

    const ctx = await makeAuthContext(browser, baseURL!)
    const page = await ctx.newPage()
    await page.goto('/lesson/fixture?stream=simulate')

    // t=0: At least one skeleton should be visible immediately
    await expect(page.getByTestId('lesson-section-skeleton').first()).toBeVisible()

    // t=600ms: At least one real section should have appeared
    await page.waitForTimeout(600)
    const realSections = page.locator('[data-testid^="lesson-section-"]:not([data-testid="lesson-section-skeleton"])')
    await expect(realSections.first()).toBeVisible()

    // t=1400ms: All skeletons should be gone (7 sections × 200ms = 1400ms)
    await page.waitForTimeout(800)  // additional 800ms → total ~1400ms
    await expect(page.getByTestId('lesson-section-skeleton')).toHaveCount(0)

    // Lesson view is fully rendered
    await expect(page.getByTestId('lesson-view')).toBeVisible()

    await ctx.close()
  },
)

// ---------------------------------------------------------------------------
// Unauthenticated guard (always-run, no secret required)
// ---------------------------------------------------------------------------

test('unauthenticated /lesson/fixture redirects to /sign-in', async ({ page }) => {
  await page.goto('/lesson/fixture')
  await expect(page).toHaveURL('/sign-in')
})
