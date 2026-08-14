// Live end-to-end proof that a lesson still streams after the outbound path was unified.
//
// Every other lesson spec mocks the SSE endpoint with `page.route`, which proves the
// renderer but says nothing about the wiring behind it — and the wiring is precisely
// what changed when the route stopped calling the model itself and started going
// through the shared gateway. This spec makes a real request: no interception, a real
// model call, a real D1 write, and an assertion that content arrives *incrementally*
// rather than in one flush at the end.
//
// Default-off. A live model call costs money and takes tens of seconds, which the repo
// has already judged too slow and flaky for CI (see tests/smoke/lesson-persistence.test.ts).
// Run it deliberately:
//
//   RUN_LIVE_LESSON=1 pnpm exec playwright test tests/e2e/lesson-live-stream.spec.ts
//
// Requires `.dev.vars` to carry OPENROUTER_API_KEY and BETTER_AUTH_SECRET (playwright.config.ts
// loads that file into the runner's environment and starts the dev server itself).

import { test, expect, type Browser } from "@playwright/test";
import { execSync } from "child_process";
import crypto from "crypto";

const RUN_LIVE = process.env.RUN_LIVE_LESSON === "1";
const E2E_AUTH_SECRET = process.env.BETTER_AUTH_SECRET ?? "";
const HAS_MODEL_KEY = !!process.env.OPENROUTER_API_KEY;

// ---------------------------------------------------------------------------
// Helpers — same seeded-session pattern as roadmap-lesson-generation.spec.ts
// ---------------------------------------------------------------------------

async function signSessionToken(token: string, secret: string): Promise<string> {
  const key = await crypto.webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
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

function runD1(command: string): string {
  return execSync(
    `pnpm exec wrangler d1 execute waypoint-dev --local --command="${command.replace(/"/g, '\\"')}"`,
    { cwd: process.cwd(), stdio: "pipe" },
  ).toString();
}

/**
 * Count rows via the wrangler CLI.
 *
 * Wrangler prints the result set as JSON (`{"results":[{"n":1}], "meta":{"duration":0}}`),
 * so the count is read from the named column. The previous table-pipe scan never matched
 * that shape and fell through to "last integer in the output" — which is `meta.duration`,
 * not the count, and would have made this assertion pass or fail by coincidence.
 */
function countRows(sql: string): number {
  const out = runD1(sql);
  const json = out.match(/"n":\s*(\d+)/);
  if (json) return Number(json[1]);
  const table = out.match(/(?:│|\|)\s*(\d+)\s*(?:│|\|)/);
  if (table) return Number(table[1]);
  throw new Error(`could not read a row count from wrangler output:\n${out}`);
}

function countUsageRows(userId: string): number {
  return countRows(`SELECT COUNT(*) AS n FROM usage_events WHERE user_id = '${sqlEsc(userId)}';`);
}

/**
 * Persistence is the only completion signal that does not depend on what the model
 * happened to write. The generating view has no "done" element of its own, and the
 * sources block it *can* render is conditional on a non-empty sources array — a real
 * run returned `{"sources":[],"recommended_primary_source":null}` and rendered nothing.
 */
function countLessonRows(waypointId: string): number {
  return countRows(
    `SELECT COUNT(*) AS n FROM lessons WHERE waypoint_id = '${sqlEsc(waypointId)}' AND content IS NOT NULL;`,
  );
}

const USER = {
  id: "e2e-user-live-lesson",
  name: "Live Lesson E2E",
  email: "live-lesson@e2e.test",
  token: "e2e-session-token-live-lesson",
};
const JOURNEY_ID = "e2e-journey-live-lesson";
const WAYPOINT_ID = "e2e-wp-live-lesson";

async function makeAuthContext(browser: Browser, baseURL: string) {
  const cookieValue = await signSessionToken(USER.token, E2E_AUTH_SECRET);
  const ctx = await browser.newContext();
  await ctx.addCookies([
    {
      name: "__Secure-better-auth.session_token",
      value: cookieValue,
      domain: new URL(baseURL).hostname,
      path: "/",
      secure: true,
      httpOnly: true,
    },
    {
      name: "better-auth.session_token",
      value: cookieValue,
      domain: new URL(baseURL).hostname,
      path: "/",
      secure: false,
      httpOnly: true,
    },
  ]);
  return ctx;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  if (!RUN_LIVE || !E2E_AUTH_SECRET) return;

  const now = Date.now();
  const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
  const createdAt = new Date(now).toISOString();

  runD1(
    `INSERT OR REPLACE INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES ('${sqlEsc(USER.id)}', '${sqlEsc(USER.name)}', '${sqlEsc(USER.email)}', 1, NULL, '${createdAt}', '${createdAt}');`,
  );
  runD1(
    `INSERT OR REPLACE INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt) VALUES ('${sqlEsc(USER.token)}-session', '${sqlEsc(USER.id)}', '${sqlEsc(USER.token)}', '${expiresAt}', NULL, 'playwright-live-lesson', '${createdAt}', '${createdAt}');`,
  );
  runD1(
    `INSERT OR REPLACE INTO journeys (id, user_id, title, goal, status, created_at, updated_at) VALUES ('${sqlEsc(JOURNEY_ID)}', '${sqlEsc(USER.id)}', 'Learn Recursion', 'Understand recursion', 'roadmap_ready', ${now}, ${now});`,
  );
  runD1(
    `INSERT OR REPLACE INTO waypoints (id, journey_id, position, title, goal, concepts) VALUES ('${sqlEsc(WAYPOINT_ID)}', '${sqlEsc(JOURNEY_ID)}', 0, 'Recursion Basics', 'Write a recursive function', '["Recursion","Base case"]');`,
  );

  // Nothing to replay, and a clean ledger so "exactly one generation" is countable.
  runD1(`DELETE FROM lessons WHERE waypoint_id = '${sqlEsc(WAYPOINT_ID)}';`);
  runD1(`DELETE FROM usage_events WHERE user_id = '${sqlEsc(USER.id)}';`);
});

test("AC-U1: a lesson streams in token by token through the unified path, then replays from storage", async ({
  browser,
}, testInfo) => {
  test.skip(!RUN_LIVE, "Live model spec — set RUN_LIVE_LESSON=1 to run it.");
  test.skip(!E2E_AUTH_SECRET, "BETTER_AUTH_SECRET absent — cannot mint a seeded session.");
  test.skip(!HAS_MODEL_KEY, "OPENROUTER_API_KEY absent — cannot make a live model call.");

  // A live generation is slow by nature; this budget is the spec's, not the app's.
  test.setTimeout(300_000);

  const baseURL = testInfo.project.use.baseURL ?? "http://localhost:3000";
  const ctx = await makeAuthContext(browser, baseURL);
  const page = await ctx.newPage();

  // Deliberately NO page.route interception — this is the real endpoint, the real
  // gateway, and the real model.
  await page.goto(`/journey/${JOURNEY_ID}/waypoint/${WAYPOINT_ID}`);

  const content = page.locator('[data-testid="lesson-content"]');
  await expect(content).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-testid="lesson-error"]')).toHaveCount(0);

  // The sources block is an *early-exit hint* for the sampling loop below, not the
  // completion assertion: it only renders when the model returned a non-empty sources
  // array. The "Take Quiz" CTA is not the signal either — the route renders it from
  // *loader* data, so it can only appear on a later page load, never on this one.
  const sourcesBlock = content.locator(".wp-lesson-sources");

  // ── The assertion that only a live drive can make: content GREW while the stream
  //    was open. A single flush at the end would satisfy "the lesson appeared" and
  //    still mean the streaming path is broken.
  const samples: number[] = [];
  const deadline = Date.now() + 240_000;
  let firstSample = 0;
  while (Date.now() < deadline) {
    const text = await content.innerText().catch(() => "");
    const size = text.trim().length;
    if (size > 0) {
      if (firstSample === 0) {
        firstSample = size;
        samples.push(size);
      } else if (size > firstSample) {
        samples.push(size);
        break;
      }
    }
    if ((await sourcesBlock.count()) > 0) break;
    await page.waitForTimeout(250);
  }

  // eslint-disable-next-line no-console -- the samples ARE the evidence this run produces
  console.log(`[live-lesson] rendered-content samples: ${JSON.stringify(samples)}`);
  expect(samples.length, "expected two samples taken while the stream was open").toBeGreaterThan(1);
  expect(
    samples[1]!,
    "content must grow during the stream, not arrive in one flush",
  ).toBeGreaterThan(samples[0]!);

  // ── The generation completes and is persisted.
  await expect
    .poll(() => countLessonRows(WAYPOINT_ID), {
      message: "the stream must finish and persist its lesson",
      timeout: 240_000,
      intervals: [2_000],
    })
    .toBe(1);
  await expect(page.locator('[data-testid="lesson-error"]')).toHaveCount(0);
  expect(countUsageRows(USER.id), "exactly one metered generation").toBe(1);

  // ── Revisiting replays the stored lesson: no second generation, no second charge.
  //    This load is also where the completed-lesson CTA becomes reachable, because the
  //    route renders it from the persisted row the loader now finds.
  await page.reload();
  await expect(page.locator('[data-testid="lesson-view"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="quiz-cta"]')).toBeVisible({ timeout: 30_000 });
  expect(countUsageRows(USER.id), "a replay must not meter again").toBe(1);

  await ctx.close();
});
