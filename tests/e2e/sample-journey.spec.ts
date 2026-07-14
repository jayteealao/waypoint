// E2E sample journey tests (AC-SJ1 through AC-SJ4).
//
// Seeded-session proxy: same pattern as auth-flow.spec.ts — wrangler CLI seeds
// a user+session, Playwright injects the signed cookie, sample routes render.
//
// constraint-resolution: proxy+deferral — accepted into existing AC-ADL1+AC-ADL5
// deferral. Clearing event: re-running E2E suite with BETTER_AUTH_SECRET set in
// .dev.vars. Quiz scoring + equal-length-options unit tests are the proxy evidence
// while the clearing event is pending.

import * as path from "path";
import * as fs from "fs";
import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import crypto from "crypto";

// Run tests sequentially in one worker so the beforeAll seeding calls
// do not conflict on the shared local D1 database (SQLITE_BUSY_RECOVERY).
test.describe.configure({ mode: "serial" });

// ---------------------------------------------------------------------------
// Helpers (shared pattern with auth-flow.spec.ts and lesson-renderer.spec.ts)
// ---------------------------------------------------------------------------

const E2E_AUTH_SECRET = process.env.BETTER_AUTH_SECRET ?? "";

async function signSessionToken(token: string, secret: string): Promise<string> {
  const keyBuf = new TextEncoder().encode(secret);
  const key = await crypto.webcrypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBuf = await crypto.webcrypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(token),
  );
  const sig = btoa(String.fromCharCode(...new Uint8Array(signatureBuf)));
  return encodeURIComponent(`${token}.${sig}`);
}

function sqlEsc(s: string): string {
  return s.replace(/'/g, "''");
}

function seedUser(userId: string, name: string, email: string, sessionToken: string) {
  const now = Date.now();
  const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
  const createdAt = new Date(now).toISOString();
  const uId = sqlEsc(userId);
  const uName = sqlEsc(name);
  const uEmail = sqlEsc(email);
  const uToken = sqlEsc(sessionToken);
  const userSql = `INSERT OR REPLACE INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES ('${uId}', '${uName}', '${uEmail}', 1, NULL, '${createdAt}', '${createdAt}');`;
  const sessionSql = `INSERT OR REPLACE INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt) VALUES ('${uToken}-session', '${uId}', '${uToken}', '${expiresAt}', NULL, 'playwright-sj-e2e', '${createdAt}', '${createdAt}');`;
  execSync(
    `pnpm exec wrangler d1 execute waypoint-dev --local --command="${userSql.replace(/"/g, '\\"')}"`,
    { cwd: process.cwd(), stdio: "pipe" },
  );
  execSync(
    `pnpm exec wrangler d1 execute waypoint-dev --local --command="${sessionSql.replace(/"/g, '\\"')}"`,
    { cwd: process.cwd(), stdio: "pipe" },
  );
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

// Fresh user — used for AC-SJ1 (first-login redirect)
const USER_FRESH = {
  id: "e2e-user-sj-fresh",
  name: "SJ Fresh User",
  email: "sj-fresh@e2e.test",
  token: "e2e-session-token-sj-fresh",
};

// Returning user — used for AC-SJ4 (no redirect after sample visited)
const USER_RETURN = {
  id: "e2e-user-sj-return",
  name: "SJ Return User",
  email: "sj-return@e2e.test",
  token: "e2e-session-token-sj-return",
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.beforeAll(() => {
  if (!E2E_AUTH_SECRET) return;
  seedUser(USER_FRESH.id, USER_FRESH.name, USER_FRESH.email, USER_FRESH.token);
  seedUser(USER_RETURN.id, USER_RETURN.name, USER_RETURN.email, USER_RETURN.token);
});

async function makeAuthContext(
  browser: import("@playwright/test").Browser,
  baseURL: string,
  token: string,
) {
  const cookieValue = await signSessionToken(token, E2E_AUTH_SECRET);
  const ctx = await browser.newContext();
  await ctx.addCookies([
    {
      name: "__Secure-better-auth.session_token",
      value: cookieValue,
      domain: new URL(baseURL).hostname,
      path: "/",
      httpOnly: false,
      secure: true,
    },
  ]);
  return ctx;
}

const screenshotsDir = path.join(process.cwd(), "tests", "e2e", "screenshots");

// ---------------------------------------------------------------------------
// AC-SJ1: First login redirects to /sample with zero outbound LLM calls
// ---------------------------------------------------------------------------

test("AC-SJ1: first-ever login redirects to /sample, zero LLM calls", async ({
  browser,
  baseURL,
}) => {
  test.skip(!E2E_AUTH_SECRET, "Skipped: BETTER_AUTH_SECRET not set in .dev.vars");

  const ctx = await makeAuthContext(browser, baseURL!, USER_FRESH.token);
  const page = await ctx.newPage();

  // Track any outbound OpenRouter calls
  const llmCalls: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("openrouter.ai") || req.url().includes("openai.com")) {
      llmCalls.push(req.url());
    }
  });

  // Fresh user — no wp:sample-visited in localStorage yet
  // Navigate to root; expect redirect to /sample
  await page.goto("/");
  await page.waitForURL("/sample", { timeout: 8000 });
  await expect(page.getByTestId("sample-overview")).toBeVisible();

  // Assert zero outbound LLM requests
  expect(llmCalls).toHaveLength(0);

  // Screenshot
  fs.mkdirSync(screenshotsDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotsDir, "sample-overview.png") });

  await ctx.close();
});

// ---------------------------------------------------------------------------
// AC-SJ2: Lessons render with lesson-view at all 3 breakpoints
// ---------------------------------------------------------------------------

test("AC-SJ2: lessons render correctly at 3 breakpoints", async ({ browser, baseURL }) => {
  test.skip(!E2E_AUTH_SECRET, "Skipped: BETTER_AUTH_SECRET not set in .dev.vars");

  const ctx = await makeAuthContext(browser, baseURL!, USER_FRESH.token);
  const page = await ctx.newPage();

  for (const [width, height, label] of [
    [375, 812, "375px"],
    [768, 1024, "768px"],
    [1280, 800, "1280px"],
  ] as [number, number, string][]) {
    await page.setViewportSize({ width, height });

    // Lesson 1
    await page.goto("/sample/lesson-1");
    await expect(page.getByTestId("lesson-view")).toBeVisible();
    fs.mkdirSync(screenshotsDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotsDir, `sample-lesson-1-${label}.png`) });

    // Lesson 2
    await page.goto("/sample/lesson-2");
    await expect(page.getByTestId("lesson-view")).toBeVisible();
    await page.screenshot({ path: path.join(screenshotsDir, `sample-lesson-2-${label}.png`) });
  }

  await ctx.close();
});

// ---------------------------------------------------------------------------
// AC-SJ3: Quiz interaction — feedback, results, reload persistence
// ---------------------------------------------------------------------------

test("AC-SJ3: quiz feedback appears immediately; results persist across reload", async ({
  browser,
  baseURL,
}) => {
  test.skip(!E2E_AUTH_SECRET, "Skipped: BETTER_AUTH_SECRET not set in .dev.vars");

  const ctx = await makeAuthContext(browser, baseURL!, USER_FRESH.token);
  const page = await ctx.newPage();

  await page.goto("/sample/quiz");
  await expect(page.getByTestId("quiz-view")).toBeVisible();
  // Wait for the sample layout's setWaypoints effect to settle so React
  // finishes processing all pending state updates before we interact.
  // The sidebar showing the 'sw-quiz' waypoint proves effects have run.
  await page.locator('[data-waypoint="sw-quiz"]').first().waitFor({ state: "visible" });

  // Walk through all 4 questions, selecting option 0 each time
  for (let i = 0; i < 4; i++) {
    // Select an option
    await page.getByTestId("quiz-option-0").click();

    // Feedback must appear immediately
    await expect(page.getByTestId("quiz-feedback")).toBeVisible();
    fs.mkdirSync(screenshotsDir, { recursive: true });
    if (i === 0) {
      await page.screenshot({ path: path.join(screenshotsDir, "sample-quiz-feedback.png") });
    }

    // Advance
    const nextBtn = page.getByRole("button", { name: /Next Question|See Results/i });
    await nextBtn.click();
  }

  // Results screen
  await expect(page.getByTestId("quiz-results")).toBeVisible();
  await expect(page.getByTestId("quiz-score")).toBeVisible();
  await page.screenshot({ path: path.join(screenshotsDir, "sample-quiz-results.png") });

  // localStorage attempt should be set
  const attempt = await page.evaluate(() => localStorage.getItem("wp:sample-quiz:attempt"));
  expect(attempt).not.toBeNull();
  const parsed = JSON.parse(attempt!);
  expect(typeof parsed.score).toBe("number");
  expect(Array.isArray(parsed.answers)).toBe(true);

  // Reload — results screen must be restored
  await page.reload();
  await expect(page.getByTestId("quiz-results")).toBeVisible();

  await ctx.close();
});

// ---------------------------------------------------------------------------
// AC-SJ3b: Sidebar shows completion indicator after completing lesson
// ---------------------------------------------------------------------------

test("AC-SJ3b: sidebar shows completion state after visiting a lesson", async ({
  browser,
  baseURL,
}) => {
  test.skip(!E2E_AUTH_SECRET, "Skipped: BETTER_AUTH_SECRET not set in .dev.vars");

  // Use 1280px viewport so the sidebar is visible (desktop)
  const ctx = await makeAuthContext(browser, baseURL!, USER_FRESH.token);
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  // Navigate to lesson 1 — marks it visited
  await page.goto("/sample/lesson-1");
  await expect(page.getByTestId("lesson-view")).toBeVisible();

  // Give the progress event a moment to fire and the sidebar to update
  await page.waitForTimeout(200);

  // Sidebar should show sw-lesson-1 as completed (scope to sidebar to avoid
  // strict-mode violation — DrawerNav also renders the same waypoint element)
  const waypointEl = page.getByTestId("sidebar").locator('[data-waypoint="sw-lesson-1"]');
  await expect(waypointEl).toBeVisible();
  await expect(waypointEl).toHaveAttribute("data-completed", "true");

  await page.screenshot({ path: path.join(screenshotsDir, "sample-lesson-sidebar.png") });

  await ctx.close();
});

// ---------------------------------------------------------------------------
// AC-SJ4: Returning user — no redirect; sample journey accessible from dashboard
// ---------------------------------------------------------------------------

test("AC-SJ4: returning user (visited) lands on dashboard, not redirected to /sample", async ({
  browser,
  baseURL,
}) => {
  test.skip(!E2E_AUTH_SECRET, "Skipped: BETTER_AUTH_SECRET not set in .dev.vars");

  const ctx = await makeAuthContext(browser, baseURL!, USER_RETURN.token);
  const page = await ctx.newPage();

  // Simulate a returning user: set wp:sample-visited in localStorage before navigating
  await page.goto("/sign-in"); // any page so we can eval localStorage
  await page.evaluate(() => {
    localStorage.setItem("wp:sample-visited", "true");
  });

  // Navigate to root — should NOT redirect to /sample
  await page.goto("/");
  // Allow a moment for any redirect to fire
  await page.waitForTimeout(500);
  await expect(page).toHaveURL("/");
  await expect(page.getByTestId("journeys-dashboard")).toBeVisible();

  await page.screenshot({ path: path.join(screenshotsDir, "sample-returning-user.png") });

  // Sample journey must still be accessible via the CTA
  await expect(page.getByTestId("create-journey-cta")).toBeVisible();

  await ctx.close();
});
