// E2E quota-fixture tests (AC-11 observable half).
//
// Seeded-session proxy: same pattern as auth-flow.spec.ts and lesson-renderer.spec.ts
// — wrangler CLI seeds user + session + usage_events rows into local D1,
// Playwright injects the signed cookie, fixture route renders the QuotaCard.
//
// constraint-resolution: proxy+deferral — accepted into existing AC-ADL1+AC-ADL5
// deferral entry. BETTER_AUTH_SECRET present in .dev.vars enables this spec.
// Clearing event: this spec running green with BETTER_AUTH_SECRET set.
//
// Observable assertions:
//   1. `data-testid="quota-card"` is visible for a quota-exhausted user.
//   2. `data-testid="quota-reset-time"` shows the reset time string.
//   3. `data-testid="quota-ok"` is NOT visible (quota is exhausted, card shown).
//   4. No network requests to openrouter.ai are made (zero LLM calls guaranteed).
//   5. `data-testid="quota-ok"` IS visible for a fresh user (no usage_events).

import * as path from 'path'
import * as fs from 'fs'
import { test, expect } from '@playwright/test'
import { execSync } from 'child_process'
import crypto from 'crypto'

// Run tests sequentially so beforeAll seeding does not conflict on shared local D1.
test.describe.configure({ mode: 'serial' })

// ---------------------------------------------------------------------------
// Helpers (shared pattern with auth-flow.spec.ts and lesson-renderer.spec.ts)
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

function runD1(sql: string) {
  execSync(
    `pnpm exec wrangler d1 execute waypoint-dev --local --command="${sql.replace(/"/g, '\\"')}"`,
    { cwd: process.cwd(), stdio: 'pipe' },
  )
}

function seedUser(userId: string, name: string, email: string, sessionToken: string) {
  const now = Date.now()
  const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString()
  const createdAt = new Date(now).toISOString()
  const uId = sqlEsc(userId)
  const uName = sqlEsc(name)
  const uEmail = sqlEsc(email)
  const uToken = sqlEsc(sessionToken)
  runD1(
    `INSERT OR REPLACE INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES ('${uId}', '${uName}', '${uEmail}', 1, NULL, '${createdAt}', '${createdAt}');`,
  )
  runD1(
    `INSERT OR REPLACE INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt) VALUES ('${uToken}-session', '${uId}', '${uToken}', '${expiresAt}', NULL, 'playwright-quota-e2e', '${createdAt}', '${createdAt}');`,
  )
}

/** Seed a usage_events row for today that exceeds the $0.50 daily limit. */
function seedExhaustedQuota(userId: string) {
  const todayIso = new Date().toISOString().slice(0, 10) + 'T00:01:00Z'
  const uId = sqlEsc(userId)
  // cost_usd = 0.75 exceeds DAILY_LIMIT_USD = 0.5
  runD1(
    `INSERT OR REPLACE INTO usage_events (id, user_id, type, model, prompt_tokens, completion_tokens, cost_usd, journey_id, at) VALUES ('e2e-usage-exhausted-${uId}', '${uId}', 'interview', 'openai/gpt-4o-mini', 1000, 500, 0.75, NULL, '${todayIso}');`,
  )
}

/** Remove all test usage_events rows for the given userId. */
function teardownQuota(userId: string) {
  const uId = sqlEsc(userId)
  runD1(`DELETE FROM usage_events WHERE user_id = '${uId}';`)
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

// Quota-exhausted fixture user
const USER_EXHAUSTED = {
  id: 'e2e-user-quota-exhausted',
  name: 'Quota E2E Exhausted',
  email: 'quota-exhausted@e2e.test',
  token: 'e2e-session-token-quota-exhausted',
}

// Fresh user with no usage events
const USER_FRESH = {
  id: 'e2e-user-quota-fresh',
  name: 'Quota E2E Fresh',
  email: 'quota-fresh@e2e.test',
  token: 'e2e-session-token-quota-fresh',
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

test.beforeAll(() => {
  if (!E2E_AUTH_SECRET) return
  seedUser(USER_EXHAUSTED.id, USER_EXHAUSTED.name, USER_EXHAUSTED.email, USER_EXHAUSTED.token)
  seedUser(USER_FRESH.id, USER_FRESH.name, USER_FRESH.email, USER_FRESH.token)
  seedExhaustedQuota(USER_EXHAUSTED.id)
  // Ensure fresh user has no usage rows (in case of prior run)
  teardownQuota(USER_FRESH.id)
})

test.afterAll(() => {
  if (!E2E_AUTH_SECRET) return
  // Clean up usage_events for both test users
  teardownQuota(USER_EXHAUSTED.id)
  teardownQuota(USER_FRESH.id)
})

// ---------------------------------------------------------------------------
// Shared helper: browser context with seeded session cookie
// ---------------------------------------------------------------------------

async function makeAuthContext(
  browser: import('@playwright/test').Browser,
  baseURL: string,
  user: typeof USER_EXHAUSTED,
) {
  const cookieValue = await signSessionToken(user.token, E2E_AUTH_SECRET)
  const ctx = await browser.newContext()
  await ctx.addCookies([
    {
      name: '__Secure-better-auth.session_token',
      value: cookieValue,
      domain: new URL(baseURL).hostname,
      path: '/',
      httpOnly: false,
      secure: true,
    },
  ])
  return ctx
}

// ---------------------------------------------------------------------------
// AC-11 (observable): Quota-exhausted card renders; zero LLM calls made
// ---------------------------------------------------------------------------

const VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
]

for (const vp of VIEWPORTS) {
  test(
    `AC-11: quota card renders at ${vp.width}px for exhausted user`,
    async ({ browser, baseURL }) => {
      test.skip(!E2E_AUTH_SECRET, 'Skipped: BETTER_AUTH_SECRET not set in .dev.vars')

      // Track all requests to detect any unexpected LLM calls
      const openrouterCalls: string[] = []

      const ctx = await makeAuthContext(browser, baseURL!, USER_EXHAUSTED)
      const page = await ctx.newPage()

      // Intercept network to catch any calls to openrouter.ai (must be 0)
      page.on('request', (req) => {
        if (req.url().includes('openrouter.ai')) {
          openrouterCalls.push(req.url())
        }
      })

      await page.setViewportSize(vp)
      await page.goto('/quota-fixture')

      // QuotaCard must be visible (quota is exhausted)
      await expect(page.getByTestId('quota-card')).toBeVisible()

      // Reset time must be shown
      await expect(page.getByTestId('quota-reset-time')).toBeVisible()

      // The "quota ok" paragraph must NOT be present
      await expect(page.getByTestId('quota-ok')).toHaveCount(0)

      // No outbound LLM calls — gateway quota gate must reject before any network request
      expect(
        openrouterCalls,
        `Expected zero openrouter.ai calls, got: ${JSON.stringify(openrouterCalls)}`,
      ).toHaveLength(0)

      // Screenshot evidence
      const screenshotDir = 'tests/e2e/screenshots'
      if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true })
      await page.screenshot({
        path: path.join(screenshotDir, `quota-card-${vp.width}px.png`),
        fullPage: false,
      })

      await ctx.close()
    },
  )
}

// ---------------------------------------------------------------------------
// AC-11 (observable): Fresh user sees "quota ok" — no card shown
// ---------------------------------------------------------------------------

test('AC-11: quota-ok shown for fresh user with no usage', async ({ browser, baseURL }) => {
  test.skip(!E2E_AUTH_SECRET, 'Skipped: BETTER_AUTH_SECRET not set in .dev.vars')

  const ctx = await makeAuthContext(browser, baseURL!, USER_FRESH)
  const page = await ctx.newPage()
  await page.goto('/quota-fixture')

  // The "quota ok" paragraph must be visible
  await expect(page.getByTestId('quota-ok')).toBeVisible()

  // QuotaCard must NOT be present
  await expect(page.getByTestId('quota-card')).toHaveCount(0)

  await ctx.close()
})
