// @vitest-environment node
/**
 * The lesson route after it stopped keeping its own copy of the outbound path.
 *
 * Folding the route onto the shared gateway moved three things that are easy to get
 * subtly wrong and invisible when they are: *when* the quota query runs, *whether* a
 * replay still avoids it entirely, and *what* the learner is told when the write
 * fails. Those are exactly what this file drives — the real GET handler, over a real
 * SQL engine, with only the model call scripted.
 *
 * `lesson-stream-validation.test.ts` covers what makes a stream committable;
 * this file covers the route's boundary with the gateway.
 *
 * Lives under tests/smoke/ so its `FROM lessons` assertions need no entry in
 * scripts/lesson-query-guard.mjs's ALLOWLIST — that guard walks src/ only.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createD1, seedSchema } from "./_helpers/d1-sqlite";
import { wrapD1 } from "./_fixtures/fake-d1";

const workers = vi.hoisted(() => ({
  env: { DB: null as unknown as D1Database, OPENROUTER_API_KEY: "test-key" },
  waited: [] as Promise<unknown>[],
}));
vi.mock("cloudflare:workers", () => ({
  env: workers.env,
  waitUntil: (p: Promise<unknown>) => {
    workers.waited.push(p);
  },
}));

vi.mock("#/lib/auth-guard", () => ({
  requireAuth: async () => ({
    session: { id: "sess", userId: "carol", expiresAt: new Date() },
    user: { id: "carol", name: "Carol", email: "carol@example.com", image: null },
  }),
  requireOwnership: () => {},
}));

// Only the model call is scripted; cost computation and the metering statement stay real.
vi.mock("#/lib/ai/model-stream", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/lib/ai/model-stream")>();
  return { ...actual, runModelWithFallback: vi.fn() };
});

import { runModelWithFallback } from "#/lib/ai/model-stream";
import { DAILY_LIMIT_USD } from "#/lib/ai/quota";
import { Route } from "#/routes/api/journey/$journeyId/lesson";

const handlers = Route.options.server?.handlers as unknown as {
  GET: (ctx: { request: Request }) => Promise<Response>;
};

const HEADER = `{"type":"header","title":"Recursion","summary":"How it works"}\n`;
const SECTION = `{"type":"prose","id":"s1","html":"<p>Hello</p>"}\n`;
const SOURCES = `{"type":"sources","sources":[],"recommended_primary_source":null}\n`;

function scriptStream(chunks: string[]) {
  vi.mocked(runModelWithFallback).mockImplementation(async (opts) => {
    for (const chunk of chunks) opts.handlers?.onTextDelta?.(chunk);
    return {
      model: "z-ai/glm-5.2",
      usage: { prompt_tokens: 100, completion_tokens: 200 },
    };
  });
}

/** Label a SQL string by the table it reads, so read ORDER is assertable. */
function label(sql: string): string | null {
  if (sql.includes("SUM(cost_usd)")) return "quota";
  if (sql.includes("FROM journeys")) return "journeys";
  if (sql.includes("FROM waypoints")) return "waypoints";
  if (sql.includes("FROM lessons")) return "lessons";
  if (sql.includes("FROM interview_records")) return "interview_records";
  return null;
}

let db: DatabaseSync;
let queries: string[];
let batchFails = false;

/** The shipped D1 adapter, wrapped so queries are observable and batch can be broken. */
function instrumentedD1(base: D1Database): D1Database {
  return wrapD1(base, {
    onPrepare: (sql) => queries.push(sql),
    batch: (statements, realBase) => {
      if (batchFails) return Promise.reject(new Error("D1_ERROR: batch failed"));
      return (realBase as unknown as { batch(s: unknown[]): Promise<unknown> }).batch(statements);
    },
  });
}

async function callRoute(): Promise<Response> {
  return await handlers.GET({
    request: new Request("http://localhost/api/journey/jrny-carol/lesson?waypointId=wp-carol"),
  });
}

function count(table: "lessons" | "usage_events"): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return row.n;
}

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  seedSchema(db);
  db.exec(`
    INSERT INTO \`user\` (id, name, email, emailVerified, createdAt, updatedAt)
      VALUES ('carol', 'Carol', 'carol@example.com', 1, 0, 0);
    INSERT INTO journeys (id, user_id, title, status, created_at, updated_at)
      VALUES ('jrny-carol', 'carol', 'Carol J1', 'active', 0, 0);
    INSERT INTO waypoints (id, journey_id, position, title, goal, concepts)
      VALUES ('wp-carol', 'jrny-carol', 0, 'Recursion', 'Understand it', '["recursion"]');
  `);
  queries = [];
  batchFails = false;
  workers.waited = [];
  workers.env.DB = instrumentedD1(createD1(db));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  db.close();
});

describe("lesson route — a replay never enters the gateway", () => {
  it("makes no quota query and no model call, and reads the same tables in the same order", async () => {
    db.prepare(
      "INSERT INTO lessons (id, waypoint_id, content, sources, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(
      "lesson-done",
      "wp-carol",
      JSON.stringify({
        version: 1,
        title: "Recursion",
        summary: "Complete",
        sections: [{ id: "s1", type: "prose", html: "<p>Hello</p>" }],
        sources: [],
        recommended_primary_source: null,
      }),
      JSON.stringify({ sources: [], recommended_primary_source: null }),
      0,
    );

    const res = await callRoute();
    const body = await res.text();

    expect(body).toContain('"type":"sources"');
    expect(vi.mocked(runModelWithFallback)).not.toHaveBeenCalled();
    // The quota gate moved inside the gateway; a replay must still never reach it,
    // or an exhausted quota would retroactively revoke access to finished work.
    expect(queries.map(label).filter(Boolean)).toEqual([
      "journeys",
      "waypoints",
      "lessons",
      "interview_records",
    ]);
    expect(count("usage_events")).toBe(0);
  });
});

describe("lesson route — an exhausted quota is refused before the stream opens", () => {
  it("answers 429 with the existing JSON body and never calls the model", async () => {
    db.prepare(
      `INSERT INTO usage_events
         (id, user_id, journey_id, model, type, prompt_tokens, completion_tokens, cost_usd, duration_ms, outcome, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'success', ?)`,
    ).run(
      "usage-over",
      "carol",
      "jrny-carol",
      "z-ai/glm-5.2",
      "lesson",
      1,
      1,
      DAILY_LIMIT_USD + 0.01,
      1,
      new Date().toISOString(),
    );
    scriptStream([HEADER, SECTION, SOURCES]);

    const res = await callRoute();

    expect(res.status).toBe(429);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(await res.text()).toBe(JSON.stringify({ error: "Daily generation quota exhausted" }));
    expect(vi.mocked(runModelWithFallback)).not.toHaveBeenCalled();
    // The gate fires before the prompt is assembled, so an over-quota request still
    // does not pay for the source-grounding read.
    expect(queries.map(label).filter(Boolean)).toEqual([
      "journeys",
      "waypoints",
      "lessons",
      "quota",
    ]);
  });
});

describe("lesson route — a failed write is reported, not swallowed", () => {
  it("tells the learner the lesson could not be saved when the batch rejects", async () => {
    scriptStream([HEADER, SECTION, SOURCES]);
    batchFails = true;

    const res = await callRoute();
    const body = await res.text();

    expect(body).toContain('"type":"error"');
    expect(body).toContain("finished but could not be saved");
    expect(body).not.toContain('"type":"sources"');
    expect(count("lessons")).toBe(0);
    expect(count("usage_events")).toBe(0);
    // The rejecting write was still handed to the platform, and in a form that does
    // not surface as an unhandled rejection.
    expect(workers.waited).toHaveLength(1);
    await expect(workers.waited[0]).resolves.toBeUndefined();
  });

  it("commits the lesson and its usage row together on the happy path", async () => {
    scriptStream([HEADER, SECTION, SOURCES]);

    const res = await callRoute();
    const body = await res.text();

    expect(body).toContain('"type":"sources"');
    expect(count("lessons")).toBe(1);
    expect(count("usage_events")).toBe(1);
    const usage = db
      .prepare("SELECT type, model, prompt_tokens, completion_tokens FROM usage_events")
      .get() as { type: string; model: string; prompt_tokens: number; completion_tokens: number };
    expect(usage.type).toBe("lesson");
    expect(usage.model).toBe("z-ai/glm-5.2");
    expect(usage.prompt_tokens).toBe(100);
    expect(usage.completion_tokens).toBe(200);
  });
});
