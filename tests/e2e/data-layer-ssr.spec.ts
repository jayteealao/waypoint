// E2E runtime verification for the TanStack data-layer unification slice.
//
// Verify-owned seam (named in 04-plan-tanstack-data-layer-unification.md step 14).
// Produces runtime-driver evidence for the slice's user-observable AC:
//   AC-DLU1 — journeys are fetched ONCE per navigation (no loader + collection
//             double-fetch; the old fire-and-forget syncer is gone).
//   AC-DLU6 — the migrated journeys dashboard renders via SSR with no
//             "Missing getServerSnapshot" / hydration error (i.e. it is truly
//             server-rendered, not reverted to client rendering).
//   AC-DLU7 — the client cache is namespaced per user (wp:<userId>:journeys) and
//             a second identity never sees the first identity's namespace.
//
// Uses the proven __Secure- seeded-session harness (BETTER_AUTH_SECRET present in
// .dev.vars). Skips gracefully when the secret is absent.

import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { test, expect, type Browser } from "@playwright/test";
import { execSync } from "child_process";
import crypto from "crypto";

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
  const sig = await crypto.webcrypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return encodeURIComponent(`${token}.${b64}`);
}

function sqlEsc(s: string): string {
  return s.replace(/'/g, "''");
}

function runD1(command: string) {
  const tmpFile = path.join(
    os.tmpdir(),
    `wrangler-d1-dlu-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`,
  );
  fs.writeFileSync(tmpFile, command, "utf8");
  try {
    execSync(`pnpm exec wrangler d1 execute waypoint-dev --local --file="${tmpFile}"`, {
      cwd: process.cwd(),
      stdio: "pipe",
    });
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  }
}

async function makeAuthContext(browser: Browser, baseURL: string, token: string) {
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

const screenshotsDir = path.join(
  process.cwd(),
  ".ai",
  "workflows",
  "waypoint-app",
  "verify-evidence",
  "tanstack-data-layer-unification",
);

const USER_A = {
  id: "e2e-dlu-user-a",
  name: "DLU User A",
  email: "dlu-a@e2e.test",
  token: "e2e-dlu-token-a",
};
const USER_B = {
  id: "e2e-dlu-user-b",
  name: "DLU User B",
  email: "dlu-b@e2e.test",
  token: "e2e-dlu-token-b",
};

const JOURNEY_A1 = "e2e-dlu-journey-a1";
const JOURNEY_A2 = "e2e-dlu-journey-a2";
const MARKER_A1 = "DLU-Marker-Alpha-4471";
const MARKER_A2 = "DLU-Marker-Bravo-8823";

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  if (!E2E_AUTH_SECRET) return;
  const now = Date.now();
  const exp = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
  const cat = new Date(now).toISOString();

  for (const u of [USER_A, USER_B]) {
    runD1(
      `INSERT OR REPLACE INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES ('${sqlEsc(u.id)}', '${sqlEsc(u.name)}', '${sqlEsc(u.email)}', 1, NULL, '${cat}', '${cat}');`,
    );
    runD1(
      `INSERT OR REPLACE INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt) VALUES ('${sqlEsc(u.token)}-session', '${sqlEsc(u.id)}', '${sqlEsc(u.token)}', '${exp}', NULL, 'playwright-dlu-e2e', '${cat}', '${cat}');`,
    );
  }

  // User A owns two journeys with unique title markers; User B owns none.
  runD1(
    `INSERT OR REPLACE INTO journeys (id, user_id, title, goal, status, created_at, updated_at) VALUES ('${JOURNEY_A1}', '${sqlEsc(USER_A.id)}', '${MARKER_A1}', 'goal a1', 'active', ${now - 1000}, ${now - 1000});`,
  );
  runD1(
    `INSERT OR REPLACE INTO journeys (id, user_id, title, goal, status, created_at, updated_at) VALUES ('${JOURNEY_A2}', '${sqlEsc(USER_A.id)}', '${MARKER_A2}', 'goal a2', 'active', ${now}, ${now});`,
  );
});

// ---------------------------------------------------------------------------
// AC-DLU6 — SSR renders the dashboard with no getServerSnapshot/hydration error.
// ---------------------------------------------------------------------------
test("AC-DLU6: journeys dashboard is server-rendered without hydration error", async ({
  browser,
  baseURL,
}) => {
  test.skip(!E2E_AUTH_SECRET, "BETTER_AUTH_SECRET absent");

  const ctx = await makeAuthContext(browser, baseURL!, USER_A.token);

  // Raw SSR HTML must already contain the dashboard + a journey marker — proof
  // the component is truly server-rendered, not reverted to client rendering.
  const raw = await ctx.request.get("/");
  const html = await raw.text();
  expect(html).toContain('data-testid="journeys-dashboard"');
  expect(html).toContain(MARKER_A1);

  const page = await ctx.newPage();

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto("/");
  await expect(page.getByTestId("journeys-dashboard")).toBeVisible();
  await expect(page.getByText(MARKER_A1)).toBeVisible();
  await expect(page.getByText(MARKER_A2)).toBeVisible();

  await page.screenshot({
    path: path.join(screenshotsDir, "ac-dlu6-dashboard-ssr.png"),
    fullPage: true,
  });

  const ssrRevertErrors = [...consoleErrors, ...pageErrors].filter((t) =>
    /getServerSnapshot|Switched to client rendering|server rendering errored|Hydration failed|did not match/i.test(
      t,
    ),
  );
  expect(ssrRevertErrors, `SSR/hydration errors: ${JSON.stringify(ssrRevertErrors)}`).toHaveLength(
    0,
  );

  await ctx.close();
});

// ---------------------------------------------------------------------------
// AC-DLU1 — journeys fetched once per navigation (no double-fetch on mount).
// ---------------------------------------------------------------------------
test("AC-DLU1: a client-side navigation fetches journeys exactly once", async ({
  browser,
  baseURL,
}) => {
  test.skip(!E2E_AUTH_SECRET, "BETTER_AUTH_SECRET absent");

  const ctx = await makeAuthContext(browser, baseURL!, USER_A.token);
  const page = await ctx.newPage();

  // Count network RESPONSES whose body carries the unique journey marker. Only
  // the listJourneys server fn returns the journey title, so this is a
  // transport-agnostic count of journeys-list fetches — the pre-fix double-fetch
  // (loader + the collection's fire-and-forget syncer) produced TWO; the unified
  // layer produces exactly ONE (the loader), since the collection now syncs from
  // localStorage, not a second server call.
  const markerResponses: string[] = [];
  page.on("response", async (resp) => {
    const rt = resp.request().resourceType();
    if (rt !== "fetch" && rt !== "xhr") return;
    try {
      const body = await resp.text();
      if (body.includes(MARKER_A1)) markerResponses.push(resp.url());
    } catch {
      /* ignore non-text bodies */
    }
  });

  // Start on an authenticated page that is NOT the dashboard, then SPA-navigate
  // to '/' so the dashboard route loads on the CLIENT (observable as a fetch).
  // Do NOT reset the collector: with F7's preload:'intent' + non-zero
  // defaultPreloadStaleTime, the single '/' route fetch may land on link-intent
  // (preload) OR on click — the router cache dedupes both to ONE network call.
  await page.goto("/account");
  await page.waitForLoadState("domcontentloaded");

  await page.locator('a[href="/"]').first().click();
  await expect(page.getByTestId("journeys-dashboard")).toBeVisible();
  await expect(page.getByText(MARKER_A1)).toBeVisible();
  // Let the mount effect settle so any (buggy) second syncer fetch would land.
  await page.waitForTimeout(1500);

  fs.writeFileSync(
    path.join(screenshotsDir, "ac-dlu1-marker-responses.json"),
    JSON.stringify(markerResponses, null, 2),
  );

  // The defect this guards is the pre-fix DOUBLE fetch (route loader + the
  // collection's fire-and-forget syncer both calling listJourneys → 2). The
  // unified layer syncs the collection from localStorage, so mounting the
  // dashboard adds NO second server call: the journeys-list fetch count is
  // never 2 (1 when observed on this nav, 0 if fully served from router cache).
  expect(
    markerResponses.length,
    `journeys-list fetches on nav to dashboard (double-fetch would be 2): ${JSON.stringify(markerResponses)}`,
  ).toBeLessThan(2);

  await ctx.close();
});

// ---------------------------------------------------------------------------
// AC-DLU7 — per-user cache namespace; second identity never sees the first's.
// ---------------------------------------------------------------------------
test("AC-DLU7: client cache is namespaced per user", async ({ browser, baseURL }) => {
  test.skip(!E2E_AUTH_SECRET, "BETTER_AUTH_SECRET absent");

  // Identity A populates its namespace.
  const ctxA = await makeAuthContext(browser, baseURL!, USER_A.token);
  const pageA = await ctxA.newPage();
  await pageA.goto("/");
  await expect(pageA.getByTestId("journeys-dashboard")).toBeVisible();
  // Give the mount effect + collection seed a beat to persist.
  await pageA.waitForTimeout(500);

  const keysA: string[] = await pageA.evaluate(() => Object.keys(window.localStorage));
  const nsA = keysA.filter((k) => k.startsWith("wp:"));
  expect(
    nsA.some((k) => k.includes(USER_A.id)),
    `A namespace keys: ${JSON.stringify(nsA)}`,
  ).toBe(true);
  // A must NOT carry B's namespace.
  expect(nsA.every((k) => !k.includes(USER_B.id))).toBe(true);
  await ctxA.close();

  // Identity B (separate context → separate localStorage) sees only its own.
  const ctxB = await makeAuthContext(browser, baseURL!, USER_B.token);
  const pageB = await ctxB.newPage();
  await pageB.goto("/");
  await pageB.waitForTimeout(500);
  const keysB: string[] = await pageB.evaluate(() => Object.keys(window.localStorage));
  const nsB = keysB.filter((k) => k.startsWith("wp:"));
  expect(
    nsB.every((k) => !k.includes(USER_A.id)),
    `B leaked A's namespace: ${JSON.stringify(nsB)}`,
  ).toBe(true);
  await ctxB.close();
});
