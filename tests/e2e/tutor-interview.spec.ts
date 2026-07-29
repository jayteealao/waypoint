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

import * as path from "path";
import * as fs from "fs";
import { test, expect, type Browser } from "@playwright/test";
import { execSync } from "child_process";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Helpers (shared pattern with lesson-renderer.spec.ts)
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

function runD1(command: string) {
  execSync(
    `pnpm exec wrangler d1 execute waypoint-dev --local --command="${command.replace(/"/g, '\\"')}"`,
    { cwd: process.cwd(), stdio: "pipe" },
  );
}

function seedUser(userId: string, name: string, email: string, sessionToken: string) {
  const now = Date.now();
  const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
  const createdAt = new Date(now).toISOString();
  const uId = sqlEsc(userId);
  const uName = sqlEsc(name);
  const uEmail = sqlEsc(email);
  const uToken = sqlEsc(sessionToken);
  runD1(
    `INSERT OR REPLACE INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES ('${uId}', '${uName}', '${uEmail}', 1, NULL, '${createdAt}', '${createdAt}');`,
  );
  runD1(
    `INSERT OR REPLACE INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt) VALUES ('${uToken}-session', '${uId}', '${uToken}', '${expiresAt}', NULL, 'playwright-ti-e2e', '${createdAt}', '${createdAt}');`,
  );
}

function seedJourney(journeyId: string, userId: string, goal: string) {
  const now = Date.now();
  const jId = sqlEsc(journeyId);
  const uId = sqlEsc(userId);
  const jGoal = sqlEsc(goal);
  runD1(
    `INSERT OR REPLACE INTO journeys (id, user_id, title, goal, status, created_at, updated_at) VALUES ('${jId}', '${uId}', '${jGoal}', '${jGoal}', 'active', ${now}, ${now});`,
  );
}

function seedInterviewRecord(
  recordId: string,
  journeyId: string,
  userId: string,
  stage: string,
  turns: unknown[],
) {
  const now = Date.now();
  const rId = sqlEsc(recordId);
  const jId = sqlEsc(journeyId);
  const uId = sqlEsc(userId);
  const st = sqlEsc(stage);
  const tsql = sqlEsc(JSON.stringify(turns));
  runD1(
    `INSERT OR REPLACE INTO interview_records (id, journey_id, user_id, status, stage, turns, captured_source_urls, best_effort, created_at, updated_at) VALUES ('${rId}', '${jId}', '${uId}', 'pending', '${st}', '${tsql}', '[]', 0, ${now}, ${now});`,
  );
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const USER_TI = {
  id: "e2e-user-ti",
  name: "TI E2E",
  email: "ti@e2e.test",
  token: "e2e-session-token-ti",
};

const JOURNEYS = {
  scripted: "e2e-journey-ti-scripted",
  resume: "e2e-journey-ti-resume",
  decline: "e2e-journey-ti-decline",
  hold: "e2e-journey-ti-hold",
};

// Mirrors COMPLETION_HOLD_MS in src/routes/_authenticated/journey/$journeyId/interview.tsx.
// The card's visible lifetime used to equal one server round-trip, so a fast reply meant the
// learner never saw the confirmation at all.
const COMPLETION_HOLD_MS = 1000;

const CONSENT_TURNS = [
  { role: "user", content: "My goal is: learn Rust for systems programming", stage: "consent" },
  {
    role: "assistant",
    content: "Welcome! May I ask a few questions to understand your goal better?",
    stage: "consent",
  },
];

const RESUME_TURNS = [
  { role: "user", content: "My goal is: learn Rust for systems programming", stage: "consent" },
  {
    role: "assistant",
    content: "Welcome! May I ask a few questions to understand your goal better?",
    stage: "consent",
  },
  { role: "user", content: "Yes, let's explore", stage: "consent" },
  {
    role: "assistant",
    content: "What specifically do you want to be able to build or do when you're done?",
    stage: "mission",
  },
];

// One chip away from the end: the sources question is pending, so a single click
// drives the interview to its terminal stage and starts the completion hold.
const SOURCES_TURNS = [
  ...RESUME_TURNS,
  { role: "user", content: "That's my goal", stage: "mission" },
  {
    role: "assistant",
    content: "Do you have any preferred learning resources or URLs to include?",
    stage: "sources",
  },
];

// ---------------------------------------------------------------------------
// Setup — seed once before all tests
// ---------------------------------------------------------------------------

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  if (!E2E_AUTH_SECRET) return;

  seedUser(USER_TI.id, USER_TI.name, USER_TI.email, USER_TI.token);

  // Scripted interview journey + consent-stage record
  seedJourney(JOURNEYS.scripted, USER_TI.id, "learn Rust for systems programming");
  seedInterviewRecord(
    "e2e-record-ti-scripted",
    JOURNEYS.scripted,
    USER_TI.id,
    "consent",
    CONSENT_TURNS,
  );

  // Resume journey + mid-interview record (scope stage, 4 turns in)
  seedJourney(JOURNEYS.resume, USER_TI.id, "learn Rust for systems programming");
  seedInterviewRecord("e2e-record-ti-resume", JOURNEYS.resume, USER_TI.id, "mission", RESUME_TURNS);

  // Decline-consent journey + consent-stage record
  seedJourney(JOURNEYS.decline, USER_TI.id, "learn Rust for systems programming");
  seedInterviewRecord(
    "e2e-record-ti-decline",
    JOURNEYS.decline,
    USER_TI.id,
    "consent",
    CONSENT_TURNS,
  );

  // Completion-hold journey — seeded one chip away from the terminal stage so the hold
  // can be timed from the click that ends the interview.
  seedJourney(JOURNEYS.hold, USER_TI.id, "learn Rust for systems programming");
  seedInterviewRecord("e2e-record-ti-hold", JOURNEYS.hold, USER_TI.id, "sources", SOURCES_TURNS);
});

// ---------------------------------------------------------------------------
// Shared helper — create authenticated browser context
// ---------------------------------------------------------------------------

async function makeAuthContext(browser: Browser, baseURL: string) {
  const cookieValue = await signSessionToken(USER_TI.token, E2E_AUTH_SECRET);
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

function screenshotDir(): string {
  const dir = "tests/e2e/screenshots";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// AC-TI1: Scripted interview — consent, one-Q-per-turn, chips, captured record
// ---------------------------------------------------------------------------

test("AC-TI1: scripted interview completes with chips at each stage", async ({
  browser,
  baseURL,
}) => {
  const ctx = await makeAuthContext(browser, baseURL!);
  const page = await ctx.newPage();

  await page.goto(`/journey/${JOURNEYS.scripted}/interview?mock=1`);
  await expect(page.getByTestId("interview-view")).toBeVisible();

  // Wait for client-side React hydration to complete before interacting.
  // TanStack Devtools button is client-rendered only — its presence confirms
  // React has mounted and attached synthetic event listeners to the root.
  await expect(page.getByRole("button", { name: "Open TanStack Devtools" })).toBeVisible({
    timeout: 10000,
  });

  // Consent question should be rendered from the seeded record
  await expect(page.getByTestId("chat-chips")).toBeVisible();

  // Screenshot at 375px (mobile) — captured before interaction; viewport reset to desktop after
  await page.setViewportSize({ width: 375, height: 667 });
  await page.screenshot({
    path: path.join(screenshotDir(), "interview-375px.png"),
    fullPage: false,
  });
  // Reset to desktop viewport before interacting — mobile viewport can cause pointer-event
  // issues when the chat input area is below the fold in the fixed-height shell layout.
  await page.setViewportSize({ width: 1280, height: 800 });

  // Click "Yes, let's explore" chip → sends user turn
  await page.getByRole("button", { name: "Yes, let's explore" }).click();

  // Typing indicator should appear then disappear
  // (may be too fast to catch; skip if already gone)
  // Index is 3: initial CONSENT_TURNS has user@0 + assistant@1; chip adds user@2 then server adds assistant@3
  await expect(page.getByTestId("chat-bubble-assistant-3")).toBeVisible({ timeout: 10000 });

  // Screenshot at 768px (tablet) — mission stage
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.screenshot({
    path: path.join(screenshotDir(), "interview-768px.png"),
    fullPage: false,
  });

  // Type a non-vague mission and submit
  const input = page.getByTestId("chat-input");
  await expect(input).toBeVisible();
  await input.fill("Build a CLI tool in Rust so I can replace my Python scripts by summer");
  await page.getByTestId("chat-submit").click();

  // Scope stage
  await expect(page.getByRole("button", { name: "Some experience" })).toBeVisible({
    timeout: 5000,
  });
  await page.getByRole("button", { name: "Some experience" }).click();

  // Prior knowledge stage
  await expect(page.getByRole("button", { name: "A little" })).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: "A little" }).click();

  // Sources stage
  await expect(page.getByRole("button", { name: "No preferred sources" })).toBeVisible({
    timeout: 5000,
  });
  await page.getByRole("button", { name: "No preferred sources" }).click();

  // Completion card should appear
  await expect(page.getByTestId("interview-complete-card")).toBeVisible({ timeout: 5000 });

  // Screenshot at 1280px (desktop) — completion state
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({
    path: path.join(screenshotDir(), "interview-complete-1280px.png"),
    fullPage: false,
  });

  await ctx.close();
});

// ---------------------------------------------------------------------------
// AC-TI3: Mid-interview resume — abandon and return restores pending question
// ---------------------------------------------------------------------------

test("AC-TI3: resume restores interview at the pending question", async ({ browser, baseURL }) => {
  const ctx = await makeAuthContext(browser, baseURL!);
  const page = await ctx.newPage();

  await page.goto(`/journey/${JOURNEYS.resume}/interview?mock=1`);
  await expect(page.getByTestId("interview-view")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open TanStack Devtools" })).toBeVisible({
    timeout: 10000,
  });

  // The seeded record has 4 turns, ending at the mission question.
  // The resume should show all 4 bubbles and present the mission chips.
  const missionBubble = page.getByTestId("chat-bubble-assistant-3");
  await expect(missionBubble).toBeVisible();
  await expect(missionBubble).toContainText("build");

  // Mission chips should be visible (resume at correct stage)
  await expect(page.getByRole("button", { name: "Help me refine it" })).toBeVisible();

  await ctx.close();
});

// ---------------------------------------------------------------------------
// AC-TI4: Decline-consent — best-effort journey completes gracefully
// ---------------------------------------------------------------------------

test("AC-TI4: declining consent shows best-effort completion card", async ({
  browser,
  baseURL,
}) => {
  const ctx = await makeAuthContext(browser, baseURL!);
  const page = await ctx.newPage();

  await page.goto(`/journey/${JOURNEYS.decline}/interview?mock=1`);
  await expect(page.getByTestId("interview-view")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open TanStack Devtools" })).toBeVisible({
    timeout: 10000,
  });

  // Chip "Just use my stated goal" should be present at consent stage
  await expect(page.getByRole("button", { name: "Just use my stated goal" })).toBeVisible();
  await page.getByRole("button", { name: "Just use my stated goal" }).click();

  // Completion card should show — the message confirms best-effort framing
  await expect(page.getByTestId("interview-complete-card")).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId("interview-complete-card")).toContainText("stated goal");

  await ctx.close();
});

// ---------------------------------------------------------------------------
// AC-P5: the completion confirmation is held long enough to be seen
// ---------------------------------------------------------------------------

/** Drive the pending sources question to the terminal stage and time the hold. */
async function driveCompletionHold(browser: Browser, baseURL: string, journeyId: string) {
  const ctx = await makeAuthContext(browser, baseURL);
  const page = await ctx.newPage();

  await page.goto(`/journey/${journeyId}/interview?mock=1`);
  await expect(page.getByTestId("interview-view")).toBeVisible();
  // Hydration barrier (same idiom as AC-TI3/AC-TI4): the devtools button only exists once
  // client JS has booted. Clicking a chip on server-rendered markup is a silent no-op.
  await expect(page.getByRole("button", { name: "Open TanStack Devtools" })).toBeVisible({
    timeout: 15000,
  });

  const chip = page.getByRole("button", { name: "No preferred sources" });
  await expect(chip).toBeVisible({ timeout: 10000 });

  const clickedAt = Date.now();
  await chip.click();

  return { ctx, page, clickedAt };
}

test("AC-P5: completion card is held with a working indicator before the roadmap view", async ({
  browser,
  baseURL,
}) => {
  // This spec waits up to 45s for the completion card and another 30s for the roadmap view,
  // but playwright.config.ts sets no top-level `timeout`, so the per-test budget is Playwright's
  // 30s default — both inner waits are unreachable the moment the interview drive is slow. On a
  // fast local machine the drive finishes in a second and it never bites; on CI it did, failing
  // in both directions (the roadmap card never appearing within the budget on one attempt, the
  // 1s hold expiring before the assertions caught up on the retry). Raise the budget past the
  // inner waits rather than shortening them: the hold is still measured and still asserted.
  test.setTimeout(120_000);

  const { ctx, page, clickedAt } = await driveCompletionHold(browser, baseURL!, JOURNEYS.hold);

  // The confirmation paints, and it carries the working affordance that makes the
  // held beat read as progress rather than a stall.
  // Generous: roadmap generation from an earlier drive can still be occupying the dev
  // server, and this assertion is about what renders, not how fast the turn returns.
  await expect(page.getByTestId("interview-complete-card")).toBeVisible({ timeout: 45000 });
  const cardShownAt = Date.now();
  await expect(page.getByTestId("interview-complete-working")).toBeVisible();
  await expect(page.getByTestId("interview-complete-working")).toContainText(
    "Building your roadmap",
  );

  // Motion is gated behind prefers-reduced-motion: no-preference. Under `reduce` the
  // spin stops but the affordance must stay — a suppressed animation must not take the
  // status line with it. Emulated in-page so this costs no second interview run.
  const spinnerAnimation = () =>
    page
      .locator(".wp-interview-complete-working__spinner")
      .evaluate((el) => getComputedStyle(el).animationName);

  expect(await spinnerAnimation()).not.toBe("none");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await spinnerAnimation()).toBe("none");
  await expect(page.getByTestId("interview-complete-working")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // It must still be on screen as the hold expires — server latency no longer decides
  // whether the learner ever sees it. Measured from the card, not from the click: the
  // defect was a card whose whole visible life was one server round-trip (~3 ms).
  const remaining = COMPLETION_HOLD_MS - 200 - (Date.now() - cardShownAt);
  if (remaining > 0) await page.waitForTimeout(remaining);
  await expect(page.getByTestId("interview-complete-card")).toBeVisible();
  await expect(page.getByTestId("roadmap-pending-card")).toBeHidden();

  // ...and only then does the roadmap view take over.
  await expect(page.getByTestId("roadmap-pending-card")).toBeVisible({ timeout: 30000 });
  expect(Date.now() - clickedAt).toBeGreaterThanOrEqual(COMPLETION_HOLD_MS);
  expect(Date.now() - cardShownAt).toBeGreaterThanOrEqual(COMPLETION_HOLD_MS - 200);

  await ctx.close();
});

// ---------------------------------------------------------------------------
// Unauthenticated guard (always-run — no secret required)
// ---------------------------------------------------------------------------

test("unauthenticated /journey/new redirects to /sign-in", async ({ page }) => {
  await page.goto("/journey/new");
  await expect(page).toHaveURL("/sign-in");
});
