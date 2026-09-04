// @vitest-environment node
/**
 * The tags that make the AI Gateway dashboard sliceable, and the two things that can
 * quietly ruin them.
 *
 * The first is shape. Cloudflare keeps at most five metadata entries per request and
 * silently drops the rest, so a builder that can emit six loses an arbitrary field
 * rather than failing — which is why the key count and the value types are asserted
 * directly rather than inferred from "it looked right".
 *
 * The second is the null journey. `String(null)` is `"null"`, and a dashboard grouped
 * by `journey_id` would render that as a perfectly ordinary journey bucket belonging
 * to no journey at all. Two defences are proven here: the builder omits the key, and
 * the grading path derives the journey from the ownership JOIN it already runs instead
 * of trusting the client's optional input.
 *
 * The correlation cases are the reason `request_id` exists: an operator who finds an
 * expensive generation in the gateway log must be able to `SELECT * FROM usage_events
 * WHERE id = ?` and land on the row that was billed for it. That only holds if the id
 * on the wire and the id in the ledger are the same value, so both entry points are
 * driven and both are compared against the id actually bound into the INSERT.
 *
 * Node environment. The model call and the adapter factory are the only mocked seams;
 * the metadata, the routing decision and the metering statement are all real, and the
 * grading query runs against a real SQL engine over the real migrations.
 */

import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createD1, seedSchema } from "./_helpers/d1-sqlite";
import { createFakeD1 } from "./_fixtures/fake-d1";

vi.mock("@tanstack/ai", () => ({
  chat: vi.fn(),
  toolDefinition: vi.fn((t: unknown) => t),
}));

// Only the factory is replaced; `isAigRouted` stays the real switch, so the routed and
// unrouted cases below exercise the same decision production makes.
vi.mock("#/lib/ai/adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/lib/ai/adapter")>();
  return { ...actual, createTextAdapter: vi.fn(async () => ({ __adapter: true })) };
});

// `#/server/quiz` reads `env` from `cloudflare:workers` at module scope and pulls in the
// auth guard; neither is exercised by `loadGradableQuestion`, which takes its database
// as an argument.
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("#/lib/auth-guard", () => ({
  requireAuth: async () => ({ user: { id: "learner-1" } }),
  requireOwnership: () => {},
}));

import { chat } from "@tanstack/ai";
import { createTextAdapter } from "#/lib/ai/adapter";
import { buildAigMetadata, aigMetadataHeaders } from "#/lib/ai/aig-metadata";
import { callGateway, callGatewayStream } from "#/lib/ai/gateway";
import { loadGradableQuestion } from "#/server/quiz";
import type { GenerationType } from "#/lib/ai/tiers";

// ── Fakes ──────────────────────────────────────────────────────────────────

interface DbHandle {
  db: D1Database;
  /** Every `usage_events` INSERT that actually executed, in order. */
  usageWrites: unknown[][];
}

function makeDb(): DbHandle {
  const usageWrites: unknown[][] = [];
  const record = (sql: string, args: unknown[]): void => {
    if (sql.includes("INSERT INTO usage_events")) usageWrites.push(args);
  };

  const fake = createFakeD1({
    first: () => ({ used: 0 }),
    run: (sql, args) => {
      record(sql, args);
      return { success: true, meta: { changes: 1 }, results: [] };
    },
    batch: async (statements) => {
      for (const s of statements) record(s.__sql, s.__args);
      return [];
    },
  });

  return { db: fake.db, usageWrites };
}

function routedEnv(db: D1Database) {
  return {
    DB: db,
    OPENROUTER_API_KEY: "test-key",
    AI: { gateway: () => ({ run: async () => new Response("{}") }) } as unknown as Ai,
    AIG_ENABLED: "true",
    AIG_GATEWAY_ID: "waypoint-test",
  };
}

/** A completed generation: one delta, then the usage the ledger is written from. */
function completedEnvelope(): AsyncIterable<Record<string, unknown>> {
  return (async function* () {
    yield { type: "TEXT_MESSAGE_CONTENT", delta: "answer" };
    yield {
      type: "RUN_FINISHED",
      usage: { promptTokens: 11, completionTokens: 22, total_cost: 0.004 },
    };
  })();
}

/** The `cf-aig-*` header map handed to the adapter factory on the Nth attempt. */
function adapterHeaders(callIndex = 0): Record<string, string> | undefined {
  return vi.mocked(createTextAdapter).mock.calls[callIndex]?.[2];
}

/** The metadata the gateway put on the wire, parsed back out of the header. */
function sentMetadata(callIndex = 0): Record<string, unknown> {
  const raw = adapterHeaders(callIndex)?.["cf-aig-metadata"];
  expect(raw, "cf-aig-metadata header").toBeTypeOf("string");
  return JSON.parse(raw!) as Record<string, unknown>;
}

/** `usage_events.id` — the first bound argument of the INSERT. */
function ledgerId(writes: unknown[][]): unknown {
  expect(writes).toHaveLength(1);
  return writes[0]![0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── AC-3 (a): the builder ──────────────────────────────────────────────────

describe("the metadata object", () => {
  const FULL = {
    userId: "user-123",
    journeyId: "journey-abc",
    type: "lesson" as const,
    requestId: "req-1",
  };

  test("carries exactly the five dashboard dimensions", () => {
    const metadata = buildAigMetadata(FULL);

    expect(metadata).toEqual({
      user_id: "user-123",
      journey_id: "journey-abc",
      generation_type: "lesson",
      tier: "lesson",
      request_id: "req-1",
    });
    // Cloudflare keeps the first five entries and drops the rest silently, so a sixth
    // field would not fail loudly — it would lose an arbitrary one of these.
    expect(Object.keys(metadata).length).toBeLessThanOrEqual(5);
  });

  test("emits scalars only — objects are unsupported by the platform", () => {
    for (const value of Object.values(buildAigMetadata(FULL))) {
      expect(["string", "number", "boolean"]).toContain(typeof value);
    }
  });

  test.each([
    ["null", null],
    ["undefined", undefined],
  ])("omits journey_id entirely when the journey is %s", (_label, journeyId) => {
    const metadata = buildAigMetadata({ ...FULL, journeyId });

    // Key-absent, not the string "null" — which would render as a legitimate-looking
    // journey bucket that no journey owns.
    expect(metadata).not.toHaveProperty("journey_id");
    expect(Object.keys(metadata)).toHaveLength(4);
    expect(JSON.stringify(metadata)).not.toContain("null");
  });

  test("serializes into exactly one gateway header", () => {
    const headers = aigMetadataHeaders(buildAigMetadata(FULL));

    expect(Object.keys(headers)).toEqual(["cf-aig-metadata"]);
    expect(JSON.parse(headers["cf-aig-metadata"]!)).toEqual(buildAigMetadata(FULL));
  });
});

// ── AC-3 (b): the wiring, one case per generation type ─────────────────────

describe("every routed generation reaches the gateway tagged", () => {
  test.each<[GenerationType]>([["interview"], ["quiz"], ["roadmap"]])(
    "a buffered %s generation carries its type and tier",
    async (type) => {
      const { db } = makeDb();
      vi.mocked(chat).mockReturnValueOnce(completedEnvelope() as never);

      await callGateway({
        env: routedEnv(db),
        userId: "user-123",
        journeyId: "journey-abc",
        type,
        messages: [{ role: "user", content: "Hello" }],
      });

      const metadata = sentMetadata();
      expect(metadata["generation_type"]).toBe(type);
      expect(metadata["tier"]).toBe(type);
      expect(metadata["user_id"]).toBe("user-123");
      expect(metadata["journey_id"]).toBe("journey-abc");
    },
  );

  test("a streamed lesson generation carries the same five fields", async () => {
    const { db } = makeDb();
    vi.mocked(chat).mockReturnValueOnce(completedEnvelope() as never);

    const handle = await callGatewayStream({
      env: routedEnv(db),
      userId: "user-123",
      journeyId: "journey-abc",
      type: "lesson",
    });
    await handle.run(
      [{ role: "user", content: "Teach me recursion" }],
      { onTextDelta: () => {} },
      () => ({
        kind: "commit",
        statements: [],
      }),
    );

    const metadata = sentMetadata();
    expect(metadata["generation_type"]).toBe("lesson");
    expect(metadata["tier"]).toBe("lesson");
    expect(Object.keys(metadata)).toHaveLength(5);
  });

  test("an unrouted generation builds no cf-aig-* header at all", async () => {
    const { db, usageWrites } = makeDb();
    vi.mocked(chat).mockReturnValueOnce(completedEnvelope() as never);

    await callGateway({
      env: { DB: db, OPENROUTER_API_KEY: "test-key", AIG_ENABLED: "false" },
      userId: "user-123",
      journeyId: "journey-abc",
      type: "interview",
      messages: [{ role: "user", content: "Hello" }],
    });

    // The kill switch means "do not involve the gateway", so there is nothing to tag —
    // and the direct path stays byte-identical to what it was before tagging existed.
    expect(adapterHeaders()).toBeUndefined();
    expect(usageWrites).toHaveLength(1);
  });
});

// ── AC-3 (c): the correlation id ───────────────────────────────────────────

describe("request_id resolves to the ledger row it was billed on", () => {
  test("the buffered path writes the usage row under the id it put on the wire", async () => {
    const { db, usageWrites } = makeDb();
    vi.mocked(chat).mockReturnValueOnce(completedEnvelope() as never);

    await callGateway({
      env: routedEnv(db),
      userId: "user-123",
      journeyId: "journey-abc",
      type: "quiz",
      messages: [{ role: "user", content: "Grade this" }],
    });

    expect(sentMetadata()["request_id"]).toBe(ledgerId(usageWrites));
  });

  test("the streaming path does too, through the caller's batch", async () => {
    const { db, usageWrites } = makeDb();
    vi.mocked(chat).mockReturnValueOnce(completedEnvelope() as never);

    const handle = await callGatewayStream({
      env: routedEnv(db),
      userId: "user-123",
      journeyId: "journey-abc",
      type: "lesson",
    });
    await handle.run(
      [{ role: "user", content: "Teach me recursion" }],
      { onTextDelta: () => {} },
      () => ({
        kind: "commit",
        statements: [],
      }),
    );

    expect(sentMetadata()["request_id"]).toBe(ledgerId(usageWrites));
  });

  test("every attempt in a fallback chain shares the generation's id", async () => {
    const { db, usageWrites } = makeDb();
    vi.mocked(chat)
      .mockImplementationOnce(
        () =>
          (async function* () {
            yield { type: "RUN_ERROR", message: "upstream 502" };
          })() as never,
      )
      .mockReturnValueOnce(completedEnvelope() as never);

    await callGateway({
      env: routedEnv(db),
      userId: "user-123",
      journeyId: "journey-abc",
      type: "interview",
      messages: [{ role: "user", content: "Hello" }],
    });

    // The id names the generation, not the attempt: two gateway log entries, one
    // ledger row, one id that ties them together.
    expect(vi.mocked(createTextAdapter).mock.calls.length).toBeGreaterThan(1);
    expect(sentMetadata(1)["request_id"]).toBe(sentMetadata(0)["request_id"]);
    expect(sentMetadata(0)["request_id"]).toBe(ledgerId(usageWrites));
  });
});

// ── AC-4: journey_id comes from the source, not the client ─────────────────

describe("the graded generation's journey is derived, never declared", () => {
  let sqlite: DatabaseSync;
  let db: D1Database;

  beforeEach(() => {
    sqlite = new DatabaseSync(":memory:");
    seedSchema(sqlite);
    sqlite.exec(`
      INSERT INTO \`user\` (id, name, email, emailVerified, createdAt, updatedAt)
        VALUES ('learner-1', 'Lee', 'lee@example.com', 1, 0, 0);
      INSERT INTO \`user\` (id, name, email, emailVerified, createdAt, updatedAt)
        VALUES ('learner-2', 'Sam', 'sam@example.com', 1, 0, 0);
      INSERT INTO journeys (id, user_id, title, status, created_at, updated_at)
        VALUES ('journey-real', 'learner-1', 'Recursion', 'active', 0, 0);
      INSERT INTO waypoints (id, journey_id, position, title, goal, concepts)
        VALUES ('wp-1', 'journey-real', 0, 'Base cases', 'Understand them', '["recursion"]');
      INSERT INTO quiz_questions (id, waypoint_id, type, question, options, correct_answer, concept_id, rubric)
        VALUES ('q-1', 'wp-1', 'frq', 'Why does recursion need a base case?', '[]', NULL, NULL, 'Mentions termination');
    `);
    db = createD1(sqlite);
  });

  afterEach(() => {
    sqlite.close();
  });

  test("the ownership JOIN yields the real journey id alongside the question", async () => {
    const gradable = await loadGradableQuestion(db, "q-1", "learner-1");

    expect(gradable?.journeyId).toBe("journey-real");
    expect(gradable?.question.id).toBe("q-1");
    // The journey column is unwrapped into its own field rather than left on the row,
    // so the question object still matches the `quiz_questions` shape callers expect.
    expect(gradable?.question).not.toHaveProperty("journey_id");
  });

  test('the derived id is what reaches the metadata — never the string "null"', async () => {
    const gradable = await loadGradableQuestion(db, "q-1", "learner-1");
    const metadata = buildAigMetadata({
      userId: "learner-1",
      journeyId: gradable?.journeyId,
      type: "quiz",
      requestId: "req-1",
    });

    expect(metadata["journey_id"]).toBe("journey-real");
    expect(metadata["journey_id"]).not.toBe("null");
  });

  test("another learner's question is still not gradable", async () => {
    // The JOIN is an authorization check first and a data source second; widening it to
    // select the journey must not widen what it returns.
    expect(await loadGradableQuestion(db, "q-1", "learner-2")).toBeNull();
  });
});
