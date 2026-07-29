// @vitest-environment node
/**
 * Unit coverage for the lesson access gate (AC-P2).
 *
 * Runs in the `node` environment (the project default is jsdom): this is server-only
 * code and jsdom's client resolver refuses to bundle Node built-ins.
 *
 * Driven against a REAL SQL engine (`node:sqlite`, Node stdlib — no new dependency)
 * executing the actual `migrations/0000_schema_v1.sql` file (RV-16) — not a hand-rolled
 * subset — so the JOIN that carries the ownership guarantee runs against the same schema
 * that ships to D1, and a future migration change that breaks the JOIN breaks this test
 * too instead of silently drifting out of sync. A thin adapter presents it through the
 * two D1 methods the helper uses (`prepare().bind().first()`).
 *
 * Adaptation: none needed. The migration file executes as-is under `node:sqlite`'s
 * `DatabaseSync.exec()` — it accepts a multi-statement script directly (D1 SQL is
 * SQLite, and `node:sqlite` is also SQLite under the hood), so no splitting on `;` or
 * statement-by-statement execution was required. Verified by running the migration file
 * standalone before wiring it in here.
 *
 * The cases below are the four ways a caller can miss, plus the one way they can hit.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveOwnedWaypoint } from "./lesson-access";

const MIGRATION_SQL = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations", "0000_schema_v1.sql"),
  "utf8",
);

/** Minimal D1 surface over node:sqlite. Cast at the call site — the helper only ever
 *  calls prepare/bind/first, so implementing the full D1Database interface would be
 *  dead code. */
function d1(db: DatabaseSync) {
  return {
    prepare(sql: string) {
      const stmt = db.prepare(sql);
      let bound: unknown[] = [];
      const api = {
        bind(...args: unknown[]) {
          bound = args;
          return api;
        },
        first<T>(): Promise<T | null> {
          return Promise.resolve((stmt.get(...(bound as never[])) as T | undefined) ?? null);
        },
      };
      return api;
    },
  } as unknown as D1Database;
}

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  // Real schema, not a hand-rolled subset (RV-16) — also creates `user`, `lessons`, and
  // every other domain table, so the journeys/waypoints FK references resolve exactly as
  // they do against D1.
  db.exec(MIGRATION_SQL);
  db.exec(`
    INSERT INTO \`user\` (id, name, email, emailVerified, createdAt, updatedAt)
      VALUES ('alice', 'Alice', 'alice@example.com', 1, 0, 0),
             ('bob',   'Bob',   'bob@example.com',   1, 0, 0);
    INSERT INTO journeys (id, user_id, title, status, created_at, updated_at)
      VALUES ('jrny-alice',   'alice', 'Alice J1', 'active', 0, 0),
             ('jrny-alice-2', 'alice', 'Alice J2', 'active', 0, 0),
             ('jrny-bob',     'bob',   'Bob J1',   'active', 0, 0);
    INSERT INTO waypoints (id, journey_id, position, title, goal, concepts)
      VALUES ('wp-alice', 'jrny-alice', 0, 'Ownership', 'Understand it', '["a"]'),
             ('wp-bob',   'jrny-bob',   0, 'Bob''s waypoint', NULL, '["b"]');
  `);
  // The helper logs a structured denial line on every miss; keep test output readable.
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("resolveOwnedWaypoint", () => {
  it("resolves a waypoint the caller owns, with the lesson-prompt context attached", async () => {
    const row = await resolveOwnedWaypoint(d1(db), { waypointId: "wp-alice", userId: "alice" });

    expect(row).toEqual({
      id: "wp-alice",
      journey_id: "jrny-alice",
      title: "Ownership",
      goal: "Understand it",
      concepts: '["a"]',
    });
  });

  it("refuses a waypoint owned by another user", async () => {
    // The exact shape of the disclosure the probe drove: a real session, a foreign waypoint.
    expect(
      await resolveOwnedWaypoint(d1(db), { waypointId: "wp-bob", userId: "alice" }),
    ).toBeNull();
  });

  it("refuses an owned waypoint reached through the wrong journey", async () => {
    expect(
      await resolveOwnedWaypoint(d1(db), {
        waypointId: "wp-alice",
        journeyId: "jrny-alice-2",
        userId: "alice",
      }),
    ).toBeNull();
  });

  it("resolves when the named journey is the waypoint's own", async () => {
    const row = await resolveOwnedWaypoint(d1(db), {
      waypointId: "wp-alice",
      journeyId: "jrny-alice",
      userId: "alice",
    });

    expect(row?.id).toBe("wp-alice");
  });

  it("returns null for an unknown waypoint id", async () => {
    expect(
      await resolveOwnedWaypoint(d1(db), { waypointId: "wp-nope", userId: "alice" }),
    ).toBeNull();
  });

  it("returns null without querying when the caller has no id", async () => {
    expect(await resolveOwnedWaypoint(d1(db), { waypointId: "wp-alice", userId: "" })).toBeNull();
    expect(await resolveOwnedWaypoint(d1(db), { waypointId: "", userId: "alice" })).toBeNull();
  });

  it("denies rather than opens when the database errors", async () => {
    const broken = {
      prepare() {
        throw new Error("D1_ERROR: connection lost");
      },
    } as unknown as D1Database;
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(
      await resolveOwnedWaypoint(broken, { waypointId: "wp-alice", userId: "alice" }),
    ).toBeNull();
  });

  it("logs a structured denial carrying user, journey and waypoint ids", async () => {
    const logged = vi.mocked(console.log);
    logged.mockClear();

    await resolveOwnedWaypoint(d1(db), {
      waypointId: "wp-bob",
      journeyId: "jrny-alice",
      userId: "alice",
    });

    expect(logged).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logged.mock.calls[0]![0] as string)).toEqual({
      event: "lesson.access_denied",
      user_id: "alice",
      journey_id: "jrny-alice",
      waypoint_id: "wp-bob",
    });
  });
});
