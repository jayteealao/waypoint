/**
 * AC-11 driver — one live generation of EACH of the four types, against a DEPLOYED
 * staging Worker, so the AI Gateway dashboard can be grouped by all four dimensions.
 *
 * This is the clearing act for the `aig-metadata` AC-11 runtime-evidence deferral. Every
 * other rung was already climbed: the metadata contract is asserted at the outbound binding
 * boundary, and a 2026-09-04 probe proved the four dimensions group at runtime — but from
 * ONE generation type (lesson) against dev. AC-11 names a staging deploy and one generation
 * of each type, which is what this spec produces.
 *
 * OPT-IN and OUTWARD-FACING. It drives a real deployed Worker, spends real provider money,
 * and writes rows to the staging database. It is gated on RUN_AC11_STAGING=1 so the ordinary
 * suite never touches it. Run it as:
 *
 *   RUN_AC11_STAGING=1 BASE_URL=https://waypoint-staging.jayteealao.workers.dev \
 *     pnpm exec playwright test tests/e2e/ac11-staging-dimensions.spec.ts
 *
 * The seeded user, session and journey must already exist in the STAGING database — this
 * spec deliberately does not seed a remote database itself, because a spec that can write to
 * a deployed environment on import is a footgun. Seeding is an explicit operator step.
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import crypto from "crypto";

const RUN = process.env.RUN_AC11_STAGING === "1";
const SECRET = process.env.BETTER_AUTH_SECRET ?? "";

const TOKEN = "ac11-staging-token";

/** Sign a better-auth session token the way the server verifies it. */
async function signSessionToken(token: string, secret: string): Promise<string> {
  const key = await crypto.webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.webcrypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  return encodeURIComponent(`${token}.${btoa(String.fromCharCode(...new Uint8Array(sig)))}`);
}

async function authContext(browser: Browser, baseURL: string) {
  const value = await signSessionToken(TOKEN, SECRET);
  const host = new URL(baseURL).hostname;
  const ctx = await browser.newContext({ baseURL });
  await ctx.addCookies([
    {
      name: "__Secure-better-auth.session_token",
      value,
      domain: host,
      path: "/",
      secure: true,
      httpOnly: true,
    },
    { name: "better-auth.session_token", value, domain: host, path: "/", httpOnly: true },
  ]);
  return ctx;
}

/**
 * Advance the interview one turn.
 *
 * Always type and press Send. A suggestion chip only fills the composer, so clicking one
 * without pressing Send advances nothing — an earlier revision of this driver did exactly
 * that and looped without ever calling sendTurn. `fill()` alone can also leave the Send
 * button disabled, because the composer enables it from real key events, so type the text
 * with pressSequentially and then wait for the button to become enabled.
 *
 * Returns false when no composer is present, which ends the loop rather than hanging.
 */
async function advanceInterview(page: Page, typed: string): Promise<boolean> {
  const input = page.getByTestId("chat-input");
  const submit = page.getByTestId("chat-submit");
  if (!(await input.isVisible().catch(() => false))) return false;
  await input.click();
  await input.pressSequentially(typed, { delay: 10 });
  await expect(submit).toBeEnabled({ timeout: 15_000 });
  await submit.click();
  return true;
}

test.describe.configure({ mode: "serial" });

test.skip(!RUN, "RUN_AC11_STAGING is not 1 — this spec drives a deployed Worker and spends money.");
test.skip(!SECRET, "BETTER_AUTH_SECRET absent — cannot mint a seeded session.");

test("AC-11: one live generation of each of the four types against staging", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(15 * 60 * 1000);
  expect(baseURL, "BASE_URL must point at the deployed staging Worker").toContain(
    "waypoint-staging",
  );

  const ctx = await authContext(browser, baseURL!);
  const page = await ctx.newPage();

  // ── journey creation + interview + roadmap ────────────────────────────────
  // Create the journey through the product's own route. new.tsx calls createJourney and
  // then startInterview, and startInterview is itself the first live gateway call, tagged
  // generation_type=interview. A hand-seeded journeys row has no interview_records row, and
  // sendTurn answers 404 for one — which is correct behaviour, not a defect.
  await page.goto("/journey/new");
  await page.getByTestId("goal-input").click();
  await page
    .getByTestId("goal-input")
    .pressSequentially("Learn to write and reason about recursive functions in Python", {
      delay: 10,
    });
  await expect(page.getByTestId("start-journey-submit")).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId("start-journey-submit").click();

  // new.tsx navigates here once startInterview resolves, so this wait covers that live call.
  await page.waitForURL(/\/journey\/[^/]+\/interview/, { timeout: 300_000 });
  await expect(page.getByTestId("interview-view")).toBeVisible({ timeout: 60_000 });
  const journeyId = page.url().match(/\/journey\/([^/]+)\/interview/)![1]!;
  // eslint-disable-next-line no-console
  console.log("journey created by the product:", journeyId);

  const answers = [
    "Yes, please ask me some questions",
    "I want to write and reason about recursive functions in Python by the end of the month",
    "Some experience — I write Python daily but avoid recursion",
    "A little — I know what a base case is but not how to reason about the stack",
    "No preferred sources, anything reputable is fine",
    "Yes, that sounds right",
  ];

  const completeCard = page.getByTestId("interview-complete-card");
  for (const answer of answers) {
    if (await completeCard.isVisible().catch(() => false)) break;
    if (!(await advanceInterview(page, answer))) break;
    // Each turn is a live model call, so allow generously for the reply to land.
    await page.waitForTimeout(8000);
  }

  // Roadmap generation starts when the interview completes and writes the waypoints.
  await expect(page.getByTestId("waypoint-link").first()).toBeVisible({ timeout: 300_000 });
  const waypointHref = await page.getByTestId("waypoint-link").first().getAttribute("href");
  expect(waypointHref, "the roadmap must have produced at least one waypoint").toBeTruthy();
  const waypointId = waypointHref!.split("/waypoint/")[1]!.split(/[/?#]/)[0]!;

  // ── lesson ────────────────────────────────────────────────────────────────
  await page.goto(`/journey/${journeyId}/waypoint/${waypointId}`);
  await expect(page.getByTestId("lesson-content")).toBeVisible({ timeout: 300_000 });

  // ── quiz ──────────────────────────────────────────────────────────────────
  await page.goto(`/journey/${journeyId}/waypoint/${waypointId}/quiz`);
  await expect(page.getByTestId("quiz-view")).toBeVisible({ timeout: 300_000 });

  await ctx.close();
});
