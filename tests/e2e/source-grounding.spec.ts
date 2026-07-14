// E2E source-grounding tests — citation rendering (AC) and unfetchable URL
// interview flow (AC).
//
// Seeded-session proxy: wrangler CLI seeds user+session+journey+interview_records;
// Playwright injects the signed cookie; test 1 uses the lesson fixture route
// (no SSE generation needed); test 2 seeds an interview record at sources stage
// and drives the interview UI to trigger the fetch-failure path.
//
// constraint-resolution: accepted into existing AC-ADL1+AC-ADL5 deferral.
// BETTER_AUTH_SECRET is now present in .dev.vars (cleared with AC-LR1-3).

import * as path from "path";
import * as fs from "fs";
import { test, expect, type Browser } from "@playwright/test";
import { execSync } from "child_process";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Helpers (shared pattern with tutor-interview.spec.ts)
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
    `INSERT OR REPLACE INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt) VALUES ('${uToken}-session', '${uId}', '${uToken}', '${expiresAt}', NULL, 'playwright-sg-e2e', '${createdAt}', '${createdAt}');`,
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

/** Seed an interview record with all turns through to the sources stage. */
function seedInterviewAtSources(recordId: string, journeyId: string, userId: string) {
  const now = Date.now();
  // Minimal turns that bring the interview to the sources stage
  const turns = [
    { role: "user", content: "My goal is: learn TypeScript for web development", stage: "consent" },
    {
      role: "assistant",
      content: "Welcome! May I ask a few questions to understand your goal better?",
      stage: "consent",
    },
    { role: "user", content: "Yes, let's explore", stage: "consent" },
    {
      role: "assistant",
      content: "What specifically do you want to build or do when you're done?",
      stage: "mission",
    },
    {
      role: "user",
      content: "Build a full-stack web app in TypeScript so I can launch my SaaS by Q4",
      stage: "mission",
    },
    {
      role: "assistant",
      content: "How much experience do you already have with this topic?",
      stage: "scope",
    },
    {
      role: "user",
      content: "Some experience — I know JavaScript but not TypeScript",
      stage: "scope",
    },
    {
      role: "assistant",
      content: "What related concepts or adjacent skills do you already know well?",
      stage: "prior_knowledge",
    },
    {
      role: "user",
      content: "JavaScript async/await, React basics, REST APIs",
      stage: "prior_knowledge",
    },
    {
      role: "assistant",
      content: "Do you have any preferred learning resources or URLs to include?",
      stage: "sources",
    },
  ];
  const rId = sqlEsc(recordId);
  const jId = sqlEsc(journeyId);
  const uId = sqlEsc(userId);
  const tsql = sqlEsc(JSON.stringify(turns));
  runD1(
    `INSERT OR REPLACE INTO interview_records (id, journey_id, user_id, status, stage, turns, captured_source_urls, captured_source_content, captured_mission, captured_scope, captured_prior_knowledge, best_effort, created_at, updated_at) VALUES ('${rId}', '${jId}', '${uId}', 'pending', 'sources', '${tsql}', '[]', '[]', 'Build a full-stack web app in TypeScript so I can launch my SaaS by Q4', 'Some experience — I know JavaScript but not TypeScript', 'JavaScript async/await, React basics, REST APIs', 0, ${now}, ${now});`,
  );
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const USER_SG = {
  id: "e2e-user-sg",
  name: "SG E2E",
  email: "sg@e2e.test",
  token: "e2e-session-token-sg",
};

const JOURNEY_SG = "e2e-journey-sg-sources";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  if (!E2E_AUTH_SECRET) return;

  seedUser(USER_SG.id, USER_SG.name, USER_SG.email, USER_SG.token);
  seedJourney(JOURNEY_SG, USER_SG.id, "learn TypeScript for web development");
  seedInterviewAtSources("e2e-record-sg-sources", JOURNEY_SG, USER_SG.id);
});

// ---------------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------------

async function makeAuthContext(browser: Browser, baseURL: string) {
  const cookieValue = await signSessionToken(USER_SG.token, E2E_AUTH_SECRET);
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
// AC: Citation rendering — fixture lesson shows citation section with URL
// ---------------------------------------------------------------------------

test("AC-SG-citation: lesson fixture renders citation section with source URL", async ({
  browser,
  baseURL,
}) => {
  test.skip(!E2E_AUTH_SECRET, "Skipped: BETTER_AUTH_SECRET not set in .dev.vars");

  const ctx = await makeAuthContext(browser, baseURL!);
  const page = await ctx.newPage();

  await page.goto("/lesson/fixture");
  await expect(page.getByTestId("lesson-view")).toBeVisible();

  // Wait for React hydration
  await expect(page.getByRole("button", { name: "Open TanStack Devtools" })).toBeVisible({
    timeout: 10000,
  });

  // Citation section must be visible — the fixture lesson includes a citation
  // with the MDN async function URL (cit-mdn in lesson-fixture.ts).
  // LessonSection renders citation as a blockquote with data-testid="lesson-section-{id}".
  const citationEl = page.getByTestId("lesson-section-cit-mdn");
  await expect(citationEl).toBeVisible({ timeout: 5000 });

  // The citation should display the source URL
  const citationLink = citationEl.locator('a[href*="developer.mozilla.org"]');
  await expect(citationLink).toBeVisible();

  await page.screenshot({
    path: path.join(screenshotDir(), "source-grounding-citation.png"),
    fullPage: false,
  });

  await ctx.close();
});

// ---------------------------------------------------------------------------
// AC: Unfetchable URL — acknowledged in-conversation, chips include Continue
// ---------------------------------------------------------------------------

test("AC-SG-fetch-failure: unfetchable URL is acknowledged in interview with failure chips", async ({
  browser,
  baseURL,
}) => {
  test.skip(!E2E_AUTH_SECRET, "Skipped: BETTER_AUTH_SECRET not set in .dev.vars");

  const ctx = await makeAuthContext(browser, baseURL!);
  const page = await ctx.newPage();

  // Navigate to the interview at the sources stage with mock=1
  // (mock mode: scripted responses for all non-fetch AI calls)
  await page.goto(`/journey/${JOURNEY_SG}/interview?mock=1`);
  await expect(page.getByTestId("interview-view")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open TanStack Devtools" })).toBeVisible({
    timeout: 10000,
  });

  // The seeded record is at the sources stage — the sources question should appear
  await expect(page.getByTestId("chat-chips")).toBeVisible({ timeout: 5000 });

  // Type a URL that will definitely fail (non-resolving domain)
  const input = page.getByTestId("chat-input");
  await expect(input).toBeVisible();
  await input.fill("https://definitely-unreachable-source.nonexistent.invalid/article");
  await page.getByTestId("chat-submit").click();

  // Wait for the server response — the fetch should fail quickly (DNS NXDOMAIN)
  // The assistant turn count: seeded turns has 10 entries (0-9), user adds +1=10,
  // assistant response is +1=11 (index 11)
  const responseBubble = page.getByTestId("chat-bubble-assistant-11");
  await expect(responseBubble).toBeVisible({ timeout: 15000 });

  // The response must contain the failure acknowledgment — not "Thank you, I've captured"
  await expect(responseBubble).toContainText("wasn't able to access");

  // Failure chips must include 'Continue without it'
  await expect(page.getByRole("button", { name: "Continue without it" })).toBeVisible();

  await page.screenshot({
    path: path.join(screenshotDir(), "source-grounding-fetch-failure.png"),
    fullPage: false,
  });

  await ctx.close();
});
