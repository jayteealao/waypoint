// @vitest-environment node
/**
 * The billing invariant: a usage row is only ever recorded against a lesson a learner
 * can actually open.
 *
 * The SSE lesson route used to bill on an absence of exceptions — the model stream
 * ended, so persist and meter. An empty or truncated generation therefore got written
 * and charged, was judged incomplete by the waypoint loader on the next visit, and was
 * generated again on the learner's dime. These cases drive the REAL route handler
 * (`src/routes/api/journey/$journeyId/lesson.ts`) — not an extracted accumulator — over
 * a real SQL engine, with only the model stream scripted, and assert both halves of the
 * refusal: the client is told, and neither table is written.
 *
 * `tests/smoke/lesson-persistence.test.ts` covers the statement-level pairing; this file
 * covers the wiring that decides whether those statements run at all.
 *
 * Lives under tests/smoke/ so its `FROM lessons` assertions need no entry in
 * scripts/lesson-query-guard.mjs's ALLOWLIST — that guard walks src/ only.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createD1, seedSchema } from "./_helpers/d1-sqlite";

// A stable object whose `DB` is swapped per test — the route imports `env` once, at
// module scope, so the binding identity has to survive across cases.
const workers = vi.hoisted(() => ({
  env: { DB: null as unknown as D1Database, OPENROUTER_API_KEY: "test-key" },
}));
vi.mock("cloudflare:workers", () => ({
  env: workers.env,
  waitUntil: (_p: Promise<unknown>) => {},
}));

vi.mock("#/lib/auth-guard", () => ({
  requireAuth: async () => ({
    session: { id: "sess", userId: "carol", expiresAt: new Date() },
    user: { id: "carol", name: "Carol", email: "carol@example.com", image: null },
  }),
  requireOwnership: () => {},
}));

// Partial mock: `computeCost` and `recordUsageStatement` stay the shipped ones, so the
// metering statement under test is the real one. Only the model call is scripted.
vi.mock("#/lib/ai/model-stream", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/lib/ai/model-stream")>();
  return { ...actual, runModelWithFallback: vi.fn() };
});

import { runModelWithFallback } from "#/lib/ai/model-stream";
import { Route } from "#/routes/api/journey/$journeyId/lesson";

const handlers = Route.options.server?.handlers as unknown as {
  GET: (ctx: { request: Request }) => Promise<Response>;
};

const USAGE = { prompt_tokens: 100, completion_tokens: 200 };

/** Script one model attempt: feed each chunk to the route's `onTextDelta`, then return. */
function scriptStream(chunks: string[], model = "z-ai/glm-5.2") {
  vi.mocked(runModelWithFallback).mockImplementation(async (opts) => {
    for (const chunk of chunks) opts.handlers?.onTextDelta?.(chunk);
    return { model, usage: USAGE };
  });
}

const HEADER = `{"type":"header","title":"Recursion","summary":"How it works"}\n`;
const SECTION = `{"type":"prose","id":"s1","html":"<p>Hello</p>"}\n`;
const SOURCES = `{"type":"sources","sources":[],"recommended_primary_source":null}\n`;

async function callRoute(): Promise<string> {
  const res = await handlers.GET({
    request: new Request("http://localhost/api/journey/jrny-carol/lesson?waypointId=wp-carol"),
  });
  return await res.text();
}

function count(table: "lessons" | "usage_events"): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return row.n;
}

/** The `lesson.stream_incomplete` payload, if the route logged one. */
function incompleteLog(): Record<string, unknown> | undefined {
  for (const call of logSpy.mock.calls) {
    const arg = call[0];
    if (typeof arg !== "string" || !arg.includes("lesson.stream_incomplete")) continue;
    return JSON.parse(arg) as Record<string, unknown>;
  }
  return undefined;
}

let db: DatabaseSync;
let logSpy: ReturnType<typeof vi.spyOn>;

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
  workers.env.DB = createD1(db);
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  // vitest.config.ts sets neither `clearMocks` nor `restoreMocks`, so mock state would
  // otherwise leak between cases.
  vi.restoreAllMocks();
  db.close();
});

describe("lesson stream validation — AC-1: the last line is not lost", () => {
  it("parses a final line that has no trailing newline and persists its content", async () => {
    scriptStream([
      HEADER,
      SECTION,
      // No trailing "\n" — exactly what a model that stops cleanly at the last token
      // produces, and what the old line loop dropped on the floor.
      `{"type":"sources","sources":[{"title":"MDN","url":"https://mdn.example/recursion"}],"recommended_primary_source":null}`,
    ]);

    const body = await callRoute();

    expect(body).toContain('"type":"sources"');
    expect(count("lessons")).toBe(1);
    expect(count("usage_events")).toBe(1);
    const row = db
      .prepare("SELECT content, sources FROM lessons WHERE waypoint_id = ?")
      .get("wp-carol") as { content: string; sources: string };
    expect(row.sources).toContain("https://mdn.example/recursion");
    expect(row.content).toContain("https://mdn.example/recursion");
  });
});

describe("lesson stream validation — AC-2: an incomplete stream is neither saved nor billed", () => {
  const refusals: Array<{ name: string; chunks: string[]; reason: string }> = [
    { name: "zero sections", chunks: [HEADER, SOURCES], reason: "no_sections" },
    { name: "no header", chunks: [SECTION, SOURCES], reason: "missing_header" },
    { name: "no sources event", chunks: [HEADER, SECTION], reason: "missing_sources" },
    {
      // Saying "sources" is not being sources: this would have persisted a payload the
      // resume reader rejects, re-entering the double-bill loop from the other end.
      name: "a sources line carrying the wrong shape",
      chunks: [HEADER, SECTION, `{"type":"sources","sources":"nope"}\n`],
      reason: "missing_sources",
    },
    {
      // The route's catch-all branch treats any unrecognised `type` as a section, so a
      // single garbage line would otherwise make a fresh generation billable.
      name: "only a structurally garbage section",
      chunks: [HEADER, `{"type":"garbage"}\n`, SOURCES],
      reason: "no_sections",
    },
    {
      // End of stream is not permission to salvage malformed JSON: the flush runs the
      // residual through the same parser, which refuses it.
      name: "a truncated final line that is only partial JSON",
      chunks: [HEADER, SECTION, `{"type":"sources","sourc`],
      reason: "missing_sources",
    },
    {
      // Array.isArray alone accepts [null] — every element must actually be shaped
      // like a LessonSource, or LessonView's unconditional `source.url` throws on a
      // lesson that was persisted and billed.
      name: "a sources array containing a null element",
      chunks: [
        HEADER,
        SECTION,
        `{"type":"sources","sources":[null],"recommended_primary_source":null}\n`,
      ],
      reason: "missing_sources",
    },
    {
      name: "a sources array containing a non-object element",
      chunks: [
        HEADER,
        SECTION,
        `{"type":"sources","sources":[42],"recommended_primary_source":null}\n`,
      ],
      reason: "missing_sources",
    },
    {
      // A valid sources line is supposed to be the terminal record. A section arriving
      // after it means the stream did not actually end where it claimed to.
      name: "a valid sources line followed by a section event",
      chunks: [HEADER, SECTION, SOURCES, `{"type":"prose","id":"s2","html":"<p>Late</p>"}\n`],
      reason: "missing_sources",
    },
    {
      // Same idea, but the trailing content is a truncated line instead of a
      // well-formed section — the residual flush must still un-claim `sawSources`.
      name: "a valid sources line followed by a truncated JSON line",
      chunks: [HEADER, SECTION, SOURCES, `{"type":"prose","id":"s2`],
      reason: "missing_sources",
    },
  ];

  for (const { name, chunks, reason } of refusals) {
    it(`refuses to persist or meter: ${name}`, async () => {
      scriptStream(chunks);

      const body = await callRoute();

      expect(body).toContain('"type":"error"');
      expect(body).toContain("ended early and was not saved");
      expect(body).not.toContain('"type":"sources"');
      expect(count("lessons")).toBe(0);
      expect(count("usage_events")).toBe(0);
      expect(incompleteLog()?.["reason"]).toBe(reason);
    });
  }
});

describe("lesson stream validation — the legitimate paths still commit", () => {
  it("persists exactly once when a resume baseline is completed by a sources-only attempt", async () => {
    // A prior attempt left content but never a sources payload, so the row is incomplete
    // and the short-circuit does not fire. The current attempt sends only the terminal
    // line — which is legitimate, and is the case a naive "this attempt must send a
    // header" rule would have broken.
    db.prepare(
      "INSERT INTO lessons (id, waypoint_id, content, sources, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(
      "lesson-resume",
      "wp-carol",
      JSON.stringify({
        version: 1,
        title: "Recursion",
        summary: "Partial",
        sections: [{ id: "s1", type: "prose", html: "<p>Hello</p>" }],
        sources: [],
        recommended_primary_source: null,
      }),
      "[]",
      0,
    );
    scriptStream([SOURCES]);

    const body = await callRoute();

    expect(body).toContain('"type":"sources"');
    expect(count("lessons")).toBe(1);
    expect(count("usage_events")).toBe(1);
  });

  it("does not let a dead attempt's sources line authorise a fallback attempt's commit", async () => {
    // The primary completes the protocol and then dies; the fallback produces content but
    // never its terminal line. `resetPerModelState` must clear `sawSources`, or the
    // fallback's incomplete output would be committed on the primary's credit.
    vi.mocked(runModelWithFallback).mockImplementation(async (opts) => {
      opts.handlers?.onTextDelta?.(HEADER + SECTION + SOURCES);
      opts.onFallback?.("z-ai/glm-5.2", "google/gemini-3.5-flash", new Error("boom"));
      opts.handlers?.onTextDelta?.(HEADER + SECTION);
      return { model: "google/gemini-3.5-flash", usage: USAGE };
    });

    const body = await callRoute();

    expect(body).toContain('"type":"error"');
    expect(count("lessons")).toBe(0);
    expect(count("usage_events")).toBe(0);
    expect(incompleteLog()?.["reason"]).toBe("missing_sources");
  });

  it("still commits a well-formed generation (happy path regression)", async () => {
    scriptStream([HEADER, SECTION, SOURCES]);

    const body = await callRoute();

    expect(body).toContain('"type":"sources"');
    expect(count("lessons")).toBe(1);
    expect(count("usage_events")).toBe(1);
    expect(incompleteLog()).toBeUndefined();
  });

  it("does not over-refuse trailing whitespace-only content after a valid sources line", async () => {
    // Guard against the terminal-record check being too eager: blank/whitespace-only
    // residue after a valid sources line is not "more stream", so it must not
    // un-claim `sawSources`.
    scriptStream([HEADER, SECTION, SOURCES, "   \n"]);

    const body = await callRoute();

    expect(body).toContain('"type":"sources"');
    expect(count("lessons")).toBe(1);
    expect(count("usage_events")).toBe(1);
    expect(incompleteLog()).toBeUndefined();
  });
});
