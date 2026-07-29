// @vitest-environment node
/**
 * Regression coverage for RV-5 — the workflow's namesake fix: lesson generation must
 * persist a `lessons` row AND record a `usage_events` row of type='lesson' together,
 * atomically, via the same `D1Database.batch([...])` call the SSE route
 * (src/routes/api/journey/$journeyId/lesson.ts) uses.
 *
 * Level: unit/integration. This drives `upsertLessonStatement` (src/server/lessons.ts)
 * and `recordUsageStatement` (src/lib/ai/model-stream.ts) — the exact prepared
 * statements the route batches — through a real SQL engine (`node:sqlite`) executing
 * the actual `migrations/0000_schema_v1.sql`, via the minimal `D1Database.batch()`
 * adapter in `./_helpers/d1-sqlite.ts` that commits both statements inside one
 * transaction, mirroring how D1's batch API is documented to behave (all-or-nothing).
 *
 * What this DOES catch: a revert of the statement pairing (e.g. only the lesson
 * upsert being batched, or the usage insert being dropped), a broken SQL string in
 * either statement, or the batch not actually committing both writes together.
 *
 * What this does NOT catch: the route wiring itself — whether the SSE handler
 * actually calls `env.DB.batch([...])` and `await`s it before closing the stream, or
 * whether `waitUntil()` is still present as defense-in-depth. That is route-level
 * behavior exercised end-to-end by `tests/e2e/lesson-access.spec.ts`, which drives
 * the real handler over HTTP (see the resume-complete short-circuit case there for
 * the cheap, no-model-call regression test of the metering guarantee on the resume
 * path). Driving a full live model generation through the SSE route was judged too
 * slow/flaky for a spec, so this file covers the persistence/metering guarantee at
 * the statement level instead. `./lesson-stream-validation.test.ts` covers the other
 * half — it loads the route module itself and runs the real GET handler over this
 * same adapter with a scripted model stream.
 *
 * Lives under tests/smoke/ (not src/server/) so its `SELECT ... FROM lessons`
 * assertions don't need an entry in scripts/lesson-query-guard.mjs's ALLOWLIST — that
 * guard only walks src/, by design (see its header comment).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createD1 as d1, seedSchema } from "./_helpers/d1-sqlite";

// `#/server/lessons` imports `env` from `cloudflare:workers` at module scope (used
// only by its createServerFn handlers, which this file never calls) — that module
// only resolves inside an actual Worker/vite-plugin-cloudflare environment, not plain
// Node. Stub it so the module loads under vitest's node environment; the two
// statement builders under test (`upsertLessonStatement`, `recordUsageStatement`)
// take their DB handle as a parameter and never touch this binding.
vi.mock("cloudflare:workers", () => ({ env: {} }));

import { upsertLessonStatement } from "#/server/lessons";
import { recordUsageStatement } from "#/lib/ai/model-stream";
import type { LessonDocumentV1 } from "#/types/lesson-document";

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  seedSchema(db);
  db.exec(`
    INSERT INTO \`user\` (id, name, email, emailVerified, createdAt, updatedAt)
      VALUES ('carol', 'Carol', 'carol@example.com', 1, 0, 0);
    INSERT INTO journeys (id, user_id, title, status, created_at, updated_at)
      VALUES ('jrny-carol', 'carol', 'Carol J1', 'active', 0, 0);
    INSERT INTO waypoints (id, journey_id, position, title, goal, concepts)
      VALUES ('wp-carol', 'jrny-carol', 0, 'Persistence', 'Land the write', '["p"]');
  `);
});

describe("lesson persist + meter batch (RV-5)", () => {
  it("commits both a lessons row and a usage_events row of type='lesson' together", async () => {
    const database = d1(db);
    const lessonDoc: LessonDocumentV1 = {
      version: 1,
      title: "Persisted Lesson",
      summary: "A summary",
      sections: [{ id: "s1", type: "prose", html: "<p>Hello</p>" }],
      sources: [],
      recommended_primary_source: null,
    };
    const contentJson = JSON.stringify(lessonDoc);
    const sourcesJson = JSON.stringify({ sources: [], recommended_primary_source: null });

    await database.batch([
      upsertLessonStatement(database, "wp-carol", "lesson-carol-1", contentJson, sourcesJson),
      recordUsageStatement(database, {
        userId: "carol",
        journeyId: "jrny-carol",
        model: "z-ai/glm-5.2",
        type: "lesson",
        usage: { prompt_tokens: 100, completion_tokens: 200 },
        costUsd: 0.01,
        durationMs: 1500,
      }),
    ]);

    const lessonRow = db.prepare("SELECT * FROM lessons WHERE waypoint_id = ?").get("wp-carol") as
      | { id: string; content: string; sources: string }
      | undefined;
    expect(lessonRow).toBeTruthy();
    expect(lessonRow!.id).toBe("lesson-carol-1");
    expect(JSON.parse(lessonRow!.content)).toEqual(lessonDoc);

    const usageRows = db
      .prepare("SELECT * FROM usage_events WHERE user_id = ? AND type = 'lesson'")
      .all("carol") as Array<{
      journey_id: string;
      model: string;
      prompt_tokens: number;
      completion_tokens: number;
    }>;
    expect(usageRows).toHaveLength(1);
    expect(usageRows[0]!.journey_id).toBe("jrny-carol");
    expect(usageRows[0]!.model).toBe("z-ai/glm-5.2");
    expect(usageRows[0]!.prompt_tokens).toBe(100);
    expect(usageRows[0]!.completion_tokens).toBe(200);
  });

  it("rolls back the lesson upsert too when the paired usage insert fails (atomicity)", async () => {
    const database = d1(db);
    const contentJson = JSON.stringify({
      version: 1,
      title: "Should not persist",
      summary: "",
      sections: [],
      sources: [],
      recommended_primary_source: null,
    });

    // An invalid `type` violates the CHECK constraint on usage_events, so the whole
    // batch must fail and neither statement's effect should be visible — proving the
    // batch is atomic, not "best effort" (the exact guarantee RV-5 depends on).
    await expect(
      database.batch([
        upsertLessonStatement(database, "wp-carol", "lesson-carol-2", contentJson, "[]"),
        recordUsageStatement(database, {
          userId: "carol",
          journeyId: "jrny-carol",
          model: "z-ai/glm-5.2",
          // @ts-expect-error — deliberately invalid `type` to trigger the CHECK constraint
          type: "not-a-real-type",
          usage: { prompt_tokens: 1, completion_tokens: 1 },
          costUsd: 0,
          durationMs: 1,
        }),
      ]),
    ).rejects.toThrow();

    const lessonRow = db.prepare("SELECT * FROM lessons WHERE waypoint_id = ?").get("wp-carol");
    expect(lessonRow).toBeFalsy();
  });
});
