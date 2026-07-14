// E2E auth flow tests (AC-ADL1, AC-ADL5).
//
// Seeded-session proxy: we bypass real OAuth by:
//   1. Inserting user + session rows directly into local D1 via wrangler CLI (beforeAll).
//   2. Constructing a correctly signed `better-auth.session_token` cookie using Node.js
//      WebCrypto — same HMAC-SHA-256 / standard-base64 algorithm as better-call's
//      `signCookieValue`. The signature is: btoa(HMAC-SHA256(token, secret)).
//   3. Injecting the cookie via Playwright `context.addCookies()`.
//
// The BETTER_AUTH_SECRET used here must match what the dev server is using.
// For local E2E runs, set BETTER_AUTH_SECRET in `.dev.vars` (gitignored):
//   BETTER_AUTH_SECRET=e2e-test-secret-local-only
//
// constraint-resolution for AC-ADL1 + AC-ADL5:
//   proxy+deferral — seeded-session covers automated path; real OAuth on deployed env
//   clears the residual at first successful Google / GitHub sign-in.

import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Must match the BETTER_AUTH_SECRET in .dev.vars for the dev server.
// Defaults to empty string if not set — same behaviour as the server when the
// secret env var is absent.
const E2E_AUTH_SECRET = process.env.BETTER_AUTH_SECRET ?? "";

/** Sign a session token with the same algorithm used by better-call's signCookieValue. */
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
  // better-call's signCookieValue returns encodeURIComponent(`${value}.${sig}`)
  return encodeURIComponent(`${token}.${sig}`);
}

/** Escape single quotes for SQL string literals (SQLite convention: double the quote). */
function sqlEsc(s: string): string {
  return s.replace(/'/g, "''");
}

/** Seed a user and session row into local D1 using the wrangler CLI. */
function seedUser(userId: string, name: string, email: string, sessionToken: string) {
  const now = Date.now();
  const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
  const createdAt = new Date(now).toISOString();

  const uId = sqlEsc(userId);
  const uName = sqlEsc(name);
  const uEmail = sqlEsc(email);
  const uToken = sqlEsc(sessionToken);

  const userSql = `INSERT OR REPLACE INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES ('${uId}', '${uName}', '${uEmail}', 1, NULL, '${createdAt}', '${createdAt}');`;
  const sessionSql = `INSERT OR REPLACE INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt) VALUES ('${uToken}-session', '${uId}', '${uToken}', '${expiresAt}', NULL, 'playwright-e2e', '${createdAt}', '${createdAt}');`;

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

const USER_A = {
  id: "e2e-user-a",
  name: "Alice E2E",
  email: "alice@e2e.test",
  token: "e2e-session-token-alice",
};

const USER_B = {
  id: "e2e-user-b",
  name: "Bob E2E",
  email: "bob@e2e.test",
  token: "e2e-session-token-bob",
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.beforeAll(() => {
  // Seed both test users + sessions into local D1.
  // Guard: only run if we have a non-empty secret (guard against CI without .dev.vars).
  if (!E2E_AUTH_SECRET) {
    // Skip seeding — tests will be skipped individually.
    return;
  }
  seedUser(USER_A.id, USER_A.name, USER_A.email, USER_A.token);
  seedUser(USER_B.id, USER_B.name, USER_B.email, USER_B.token);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// AC-ADL5a: Sign-in page is accessible and shows OAuth buttons.
// This test does NOT require BETTER_AUTH_SECRET — it only checks the UI.
test("sign-in page loads with OAuth provider buttons (AC-ADL5)", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page).toHaveURL("/sign-in");
  await expect(page.getByRole("button", { name: /Google/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /GitHub/i })).toBeVisible();
});

// AC-ADL1 + AC-ADL5: Unauthenticated /account redirects to /sign-in.
test("unauthenticated /account redirects to /sign-in (AC-ADL1, AC-ADL5)", async ({ page }) => {
  await page.goto("/account");
  // The beforeLoad guard should redirect to /sign-in.
  await expect(page).toHaveURL("/sign-in");
});

// AC-ADL1 + AC-ADL5: Seeded-session proxy — account surface shows identity.
test("seeded session shows correct identity on /account (AC-ADL1, AC-ADL5)", async ({
  browser,
  baseURL,
}) => {
  test.skip(!E2E_AUTH_SECRET, "Skipped: BETTER_AUTH_SECRET not set in .dev.vars");

  const cookieValue = await signSessionToken(USER_A.token, E2E_AUTH_SECRET);
  const ctx = await browser.newContext();
  await ctx.addCookies([
    {
      name: "better-auth.session_token",
      value: cookieValue,
      domain: new URL(baseURL!).hostname,
      path: "/",
      httpOnly: false,
      secure: false,
    },
  ]);

  const page = await ctx.newPage();
  await page.goto("/account");

  await expect(page.getByTestId("account-panel")).toBeVisible();
  await expect(page.getByTestId("user-name")).toHaveText(USER_A.name);

  await ctx.close();
});

// AC-ADL1: Cross-context isolation — context-A and context-B see different identities.
test("two seeded sessions see separate identities (AC-ADL1 cross-user isolation)", async ({
  browser,
  baseURL,
}) => {
  test.skip(!E2E_AUTH_SECRET, "Skipped: BETTER_AUTH_SECRET not set in .dev.vars");

  const [cookieA, cookieB] = await Promise.all([
    signSessionToken(USER_A.token, E2E_AUTH_SECRET),
    signSessionToken(USER_B.token, E2E_AUTH_SECRET),
  ]);

  const hostname = new URL(baseURL!).hostname;

  const [ctxA, ctxB] = await Promise.all([browser.newContext(), browser.newContext()]);

  await Promise.all([
    ctxA.addCookies([
      {
        name: "better-auth.session_token",
        value: cookieA,
        domain: hostname,
        path: "/",
        httpOnly: false,
        secure: false,
      },
    ]),
    ctxB.addCookies([
      {
        name: "better-auth.session_token",
        value: cookieB,
        domain: hostname,
        path: "/",
        httpOnly: false,
        secure: false,
      },
    ]),
  ]);

  const [pageA, pageB] = await Promise.all([ctxA.newPage(), ctxB.newPage()]);

  await Promise.all([pageA.goto("/account"), pageB.goto("/account")]);

  const [nameA, nameB] = await Promise.all([
    pageA.getByTestId("user-name").textContent(),
    pageB.getByTestId("user-name").textContent(),
  ]);

  // Each context sees its own user, not the other's.
  expect(nameA).toBe(USER_A.name);
  expect(nameB).toBe(USER_B.name);
  expect(nameA).not.toBe(nameB);

  await Promise.all([ctxA.close(), ctxB.close()]);
});

// AC-ADL5: Sign-out redirects to /sign-in.
test("sign-out redirects to /sign-in (AC-ADL5)", async ({ browser, baseURL }) => {
  test.skip(!E2E_AUTH_SECRET, "Skipped: BETTER_AUTH_SECRET not set in .dev.vars");

  const cookieValue = await signSessionToken(USER_A.token, E2E_AUTH_SECRET);
  const ctx = await browser.newContext();
  await ctx.addCookies([
    {
      name: "better-auth.session_token",
      value: cookieValue,
      domain: new URL(baseURL!).hostname,
      path: "/",
      httpOnly: false,
      secure: false,
    },
  ]);

  const page = await ctx.newPage();
  await page.goto("/account");
  await expect(page.getByTestId("account-panel")).toBeVisible();

  await page.getByTestId("sign-out-button").click();

  // After sign-out, better-auth clears the session cookie and callbackURL '/'sign-in'
  // causes a redirect to /sign-in.
  await expect(page).toHaveURL("/sign-in");

  await ctx.close();
});
