// Cross-user lesson access regression (AC-P1, AC-P3, AC-P7).
//
// Replays the exact request that disclosed another user's lesson: an authenticated caller
// naming a journey they own together with a waypoint id they do not. The route verified
// journey ownership and then read the lesson by raw waypoint id, so the victim's lesson came
// back with HTTP 200 and their `x-lesson-id`.
//
// Three assertions, in the order that makes a failure legible:
//   (a) attacker's session + victim's waypoint  → 404, no lesson id, no lesson content
//   (b) attacker's session + their own waypoint → 200 with their own lesson id
//       (the control — without it, (a) could pass because the route is simply broken)
//   (c) the victim's lesson row is byte-identical afterwards — the write half of the defect,
//       which the original probe could only establish by reading code
//   (d) an unauthenticated caller with no params gets 401, not the 400 that used to spell out
//       the parameter contract before authentication ran (AC-P7)
//
// Seeded-session harness copied from auth-flow.spec.ts: user + session rows inserted into
// local D1 via the wrangler CLI, session cookie signed with the same HMAC-SHA-256 algorithm
// better-call uses. Requires BETTER_AUTH_SECRET — global-setup.ts fails the run if it is
// missing, so the per-test guards below can no longer fire.

import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Helpers (shared pattern with auth-flow.spec.ts / adaptation-progress.spec.ts)
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

/**
 * Execute SQL against local D1 via a temp .sql file.
 *
 * The file is the point: passing SQL as `--command="..."` means hand-escaping it into a shell
 * argument, and any such escape is one unhandled metacharacter away from being wrong (CodeQL
 * `js/incomplete-sanitization` caught exactly that here — quotes were escaped, backslashes were
 * not). `--file` carries the statement verbatim, so there is no quoting to get right.
 */
function execD1(sql: string, extraArgs = ""): string {
  const tmpFile = path.join(
    os.tmpdir(),
    `wrangler-d1-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`,
  );
  fs.writeFileSync(tmpFile, sql, "utf8");
  try {
    return execSync(
      `pnpm exec wrangler d1 execute waypoint-dev --local ${extraArgs} --file="${tmpFile}"`,
      { cwd: process.cwd(), stdio: "pipe", encoding: "utf8" },
    );
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

/** Run a statement against local D1. */
function runD1(command: string) {
  execD1(command);
}

/** Read rows out of local D1 as JSON. */
function queryD1<T>(sql: string): T[] {
  const out = execD1(sql, "--json");
  const parsed = JSON.parse(out) as Array<{ results: T[] }>;
  return parsed[0]?.results ?? [];
}

function seedUser(userId: string, name: string, email: string, sessionToken: string) {
  const now = Date.now();
  const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
  const createdAt = new Date(now).toISOString();

  runD1(
    `INSERT OR REPLACE INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES ('${sqlEsc(userId)}', '${sqlEsc(name)}', '${sqlEsc(email)}', 1, NULL, '${createdAt}', '${createdAt}');`,
  );
  runD1(
    `INSERT OR REPLACE INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt) VALUES ('${sqlEsc(sessionToken)}-session', '${sqlEsc(userId)}', '${sqlEsc(sessionToken)}', '${expiresAt}', NULL, 'playwright-lesson-access-e2e', '${createdAt}', '${createdAt}');`,
  );
}

function seedJourneyWithLesson(
  userId: string,
  journeyId: string,
  waypointId: string,
  lessonId: string,
  lessonBody: string,
) {
  const now = Date.now();
  runD1(
    `INSERT OR REPLACE INTO journeys (id, user_id, title, goal, status, created_at, updated_at) VALUES ('${sqlEsc(journeyId)}', '${sqlEsc(userId)}', 'Lesson Access E2E', 'Ownership regression', 'active', ${now}, ${now});`,
  );
  runD1(
    `INSERT OR REPLACE INTO waypoints (id, journey_id, position, title, goal, concepts) VALUES ('${sqlEsc(waypointId)}', '${sqlEsc(journeyId)}', 0, 'Access Control', 'Stay in your lane', '["Ownership"]');`,
  );
  const content = sqlEsc(JSON.stringify([{ id: "s1", type: "prose", text: lessonBody }]));
  runD1(
    `INSERT OR REPLACE INTO lessons (id, waypoint_id, content, sources, created_at) VALUES ('${sqlEsc(lessonId)}', '${sqlEsc(waypointId)}', '${content}', '[]', ${now});`,
  );
}

// ---------------------------------------------------------------------------
// Test data — two unrelated learners, each with their own journey and lesson.
// ---------------------------------------------------------------------------

const ATTACKER = {
  id: "e2e-user-lesson-access-a",
  name: "Access A",
  email: "access-a@e2e.test",
  token: "e2e-session-token-lesson-access-a",
  journeyId: "e2e-journey-lesson-access-a",
  waypointId: "e2e-wp-lesson-access-a",
  lessonId: "e2e-lesson-access-a",
  // Distinctive so it can be told apart from the victim's in a response body.
  body: "ATTACKER-OWN-LESSON-BODY",
};

const VICTIM = {
  id: "e2e-user-lesson-access-b",
  name: "Access B",
  email: "access-b@e2e.test",
  token: "e2e-session-token-lesson-access-b",
  journeyId: "e2e-journey-lesson-access-b",
  waypointId: "e2e-wp-lesson-access-b",
  lessonId: "e2e-lesson-access-b",
  body: "VICTIM-PRIVATE-LESSON-BODY",
};

interface LessonRow {
  id: string;
  content: string | null;
  sources: string;
}

function readVictimLesson(): LessonRow | undefined {
  return queryD1<LessonRow>(
    `SELECT id, content, sources FROM lessons WHERE id = '${sqlEsc(VICTIM.lessonId)}';`,
  )[0];
}

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  if (!E2E_AUTH_SECRET) return;

  seedUser(ATTACKER.id, ATTACKER.name, ATTACKER.email, ATTACKER.token);
  seedUser(VICTIM.id, VICTIM.name, VICTIM.email, VICTIM.token);
  seedJourneyWithLesson(
    ATTACKER.id,
    ATTACKER.journeyId,
    ATTACKER.waypointId,
    ATTACKER.lessonId,
    ATTACKER.body,
  );
  seedJourneyWithLesson(
    VICTIM.id,
    VICTIM.journeyId,
    VICTIM.waypointId,
    VICTIM.lessonId,
    VICTIM.body,
  );
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("cross-user lesson request is refused and leaves the victim's lesson untouched (AC-P1, AC-P3)", async ({
  playwright,
  baseURL,
}) => {
  const before = readVictimLesson();
  expect(before, "victim lesson must be seeded for this test to mean anything").toBeTruthy();

  const cookie = await signSessionToken(ATTACKER.token, E2E_AUTH_SECRET);
  const ctx = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { Cookie: `__Secure-better-auth.session_token=${cookie}` },
  });

  // (a) The attack: own journey, someone else's waypoint.
  const denied = await ctx.get(
    `/api/journey/${ATTACKER.journeyId}/lesson?waypointId=${VICTIM.waypointId}`,
  );

  expect(denied.status()).toBe(404);
  expect(denied.headers()["x-lesson-id"]).toBeUndefined();
  expect(await denied.text()).not.toContain(VICTIM.body);

  // (c) The write half: the denial must not have touched the victim's row.
  const after = readVictimLesson();
  expect(after).toEqual(before);

  await ctx.dispose();
});

test("a learner can still read their own lesson (AC-P1 control)", async ({ browser, baseURL }) => {
  const cookie = await signSessionToken(ATTACKER.token, E2E_AUTH_SECRET);
  const ctx = await browser.newContext();
  await ctx.addCookies([
    {
      name: "__Secure-better-auth.session_token",
      value: cookie,
      domain: new URL(baseURL!).hostname,
      path: "/",
      httpOnly: false,
      secure: true,
    },
  ]);
  const page = await ctx.newPage();
  await page.goto("/sign-in");

  // (b) Same caller, same journey, their OWN waypoint. Proves the 404 above is the gate
  // doing its job rather than the route being broken for everyone.
  //
  // Reads accumulate chunk-by-chunk until the owner's stored content shows up (or a
  // bounded timeout elapses), then the reader is cancelled — RV-21. A single
  // `reader.read()` call is NOT guaranteed by the Streams spec to return the entire
  // resume-section body in one chunk; that only ever held empirically. Accumulating
  // across reads makes the assertion robust to that chunking without reintroducing a
  // full-stream drain: this endpoint keeps the stream open while it generates the rest
  // of the lesson against the live model, and draining to completion is what once timed
  // out at 30s in a full-suite run. The stored lesson is replayed before generation
  // begins, so the owner's own content arrives within the first few chunks — well inside
  // the bounded wait below.
  const observed = await page.evaluate(
    async ({ url, marker, timeoutMs }) => {
      const res = await fetch(url);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      const deadline = Date.now() + timeoutMs;

      try {
        while (!accumulated.includes(marker) && Date.now() < deadline) {
          const { value, done } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
        }
      } finally {
        await reader.cancel();
      }

      return {
        status: res.status,
        lessonId: res.headers.get("x-lesson-id"),
        accumulated,
      };
    },
    {
      url: `/api/journey/${ATTACKER.journeyId}/lesson?waypointId=${ATTACKER.waypointId}`,
      marker: ATTACKER.body,
      timeoutMs: 10_000,
    },
  );

  expect(observed.status).toBe(200);
  expect(observed.lessonId).toBe(ATTACKER.lessonId);
  expect(observed.accumulated).toContain(ATTACKER.body);

  await ctx.close();
});

// AC-P7 — no secret required: this is the anonymous path.
test("an unauthenticated request is rejected before parameters are validated (AC-P7)", async ({
  request,
}) => {
  // No waypointId at all. The old ordering answered 400 "Missing journeyId or waypointId",
  // disclosing the parameter contract to anyone and distinguishing malformed from
  // unauthorized. Authentication now runs first.
  const res = await request.get(`/api/journey/${ATTACKER.journeyId}/lesson`);

  expect(res.status()).toBe(401);
  expect(await res.text()).not.toContain("waypointId");
});

// ---------------------------------------------------------------------------
// Resume-complete short-circuit (RV-5 / RV-21) — the direct regression test for
// this workflow's namesake BLOCKER: a waypoint whose lesson row already holds a
// complete document (sections + a persisted sources payload) must be replayed
// verbatim, with NO model call and NO additional usage_events row. Seeding the
// "already complete" row directly (rather than driving a real generation first)
// keeps this cheap and fast — it needs no model call at all — while still
// exercising the real route end-to-end over HTTP.
// ---------------------------------------------------------------------------

const RESUME = {
  id: "e2e-user-lesson-resume",
  name: "Resume User",
  email: "resume@e2e.test",
  token: "e2e-session-token-lesson-resume",
  journeyId: "e2e-journey-lesson-resume",
  waypointId: "e2e-wp-lesson-resume",
  lessonId: "e2e-lesson-resume",
};

function seedCompleteLesson() {
  const now = Date.now();
  runD1(
    `INSERT OR REPLACE INTO journeys (id, user_id, title, goal, status, created_at, updated_at) VALUES ('${sqlEsc(RESUME.journeyId)}', '${sqlEsc(RESUME.id)}', 'Resume E2E', 'Short-circuit regression', 'active', ${now}, ${now});`,
  );
  runD1(
    `INSERT OR REPLACE INTO waypoints (id, journey_id, position, title, goal, concepts) VALUES ('${sqlEsc(RESUME.waypointId)}', '${sqlEsc(RESUME.journeyId)}', 0, 'Resume Waypoint', 'Stay resumed', '["Resumption"]');`,
  );
  // A complete LessonDocumentV1 (sections present) PLUS a persisted `sources` object —
  // upsertLesson always writes both together, so this shape is exactly what a real
  // completed generation leaves behind. That combination is what the route's
  // isResumedLessonComplete check keys on.
  const content = sqlEsc(
    JSON.stringify({
      version: 1,
      title: "Stored Lesson Title",
      summary: "Stored summary",
      sections: [{ id: "s1", type: "prose", html: "<p>RESUME-STORED-SECTION</p>" }],
      sources: [],
      recommended_primary_source: null,
    }),
  );
  const sources = sqlEsc(JSON.stringify({ sources: [], recommended_primary_source: null }));
  runD1(
    `INSERT OR REPLACE INTO lessons (id, waypoint_id, content, sources, created_at) VALUES ('${sqlEsc(RESUME.lessonId)}', '${sqlEsc(RESUME.waypointId)}', '${content}', '${sources}', ${now});`,
  );
}

function countLessonUsageEvents(userId: string): number {
  const rows = queryD1<{ n: number }>(
    `SELECT COUNT(*) as n FROM usage_events WHERE user_id = '${sqlEsc(userId)}' AND type = 'lesson';`,
  );
  return Number(rows[0]?.n ?? 0);
}

test.describe("resume-complete short-circuit (RV-5, RV-21)", () => {
  test.beforeAll(() => {
    seedUser(RESUME.id, RESUME.name, RESUME.email, RESUME.token);
    seedCompleteLesson();
  });

  test("a waypoint with an already-complete lesson is replayed without calling the model or metering again", async ({
    playwright,
    baseURL,
  }) => {
    expect(countLessonUsageEvents(RESUME.id), "no generation has run for this user yet").toBe(0);

    const cookie = await signSessionToken(RESUME.token, E2E_AUTH_SECRET);
    const ctx = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Cookie: `__Secure-better-auth.session_token=${cookie}` },
    });

    // Safe to await the full body here (unlike the live-generation control test below):
    // the short-circuit path never calls the model, so the stream closes immediately.
    const res = await ctx.get(
      `/api/journey/${RESUME.journeyId}/lesson?waypointId=${RESUME.waypointId}`,
    );

    expect(res.status()).toBe(200);
    expect(res.headers()["x-lesson-id"]).toBe(RESUME.lessonId);
    const body = await res.text();
    expect(body).toContain("RESUME-STORED-SECTION");
    expect(body).toContain('"type":"sources"');

    // The direct regression assertion for the persistence/metering BLOCKER this round
    // fixed: replaying a stored-complete lesson must not add a second usage_events row.
    expect(countLessonUsageEvents(RESUME.id)).toBe(0);

    await ctx.dispose();
  });
});
