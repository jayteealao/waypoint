import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error — .mjs script has no type declarations; it is plain ESM JS.
import { findViolations, runGuard } from "../../scripts/lesson-query-guard.mjs";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../..");

/** Builds a throwaway fixture project under a temp dir: { "src/foo.ts": "content" }. */
function makeFixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "lesson-query-guard-"));
  for (const [relPath, content] of Object.entries(files)) {
    const full = join(root, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

describe("lesson-query-guard", () => {
  it("passes on the real tree: every `FROM lessons` query is in the allowlisted files", () => {
    expect(findViolations(REPO_ROOT)).toEqual([]);
    expect(runGuard(REPO_ROOT, () => {})).toBe(0);
  });

  // Allowlist membership alone is no longer sufficient — the occurrence must also follow an
  // ownership check in its function, so these fixtures carry one. (They previously did not:
  // bare top-level string constants passed when the guard only checked the file path.)
  it("allows `FROM lessons` inside the allowlisted call sites", () => {
    const root = makeFixture({
      "src/server/lessons.ts": `
        export async function read(db, ids) {
          const wp = await resolveOwnedWaypoint(db, ids);
          return db.prepare("SELECT * FROM lessons WHERE id = ?").bind(wp.id);
        }
      `,
      "src/routes/api/journey/$journeyId/lesson.ts": `
        export async function handler(db, ids) {
          const wp = await resolveOwnedWaypoint(db, ids);
          return db.prepare("SELECT id FROM lessons WHERE waypoint_id = ?").bind(wp.id);
        }
      `,
    });
    try {
      expect(findViolations(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails when a NEW file outside the allowlist contains a raw `FROM lessons` query", () => {
    const root = makeFixture({
      "src/routes/api/some-new-route.ts": 'const sql = "SELECT * FROM lessons WHERE id = ?";',
    });
    try {
      const violations = findViolations(root);
      expect(violations).toHaveLength(1);
      expect(violations[0]!.file).toMatch(/some-new-route\.ts$/);

      const log: string[] = [];
      expect(runGuard(root, (msg: string) => log.push(msg))).toBe(1);
      expect(log.join("\n")).toMatch(/resolveOwnedWaypoint/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("is case-insensitive and matches whitespace variants of the keyword", () => {
    const root = makeFixture({
      "src/routes/api/another-route.ts": "const sql = `select * from   lessons where id = ?`;",
    });
    try {
      expect(findViolations(root)).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ── Bypass forms the line-at-a-time matcher used to miss ────────────────────

  it("catches `FROM lessons` split across a line break", () => {
    const root = makeFixture({
      "src/routes/api/sneaky.ts": ["const sql = `SELECT *", "  FROM", "  lessons", "`;"].join("\n"),
    });
    try {
      const violations = findViolations(root);
      expect(violations).toHaveLength(1);
      expect(violations[0]!.kind).toBe("membership");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ["double-quoted", "const sql = 'SELECT * FROM \"lessons\" WHERE id = ?';"],
    ["bracketed", "const sql = 'SELECT * FROM [lessons] WHERE id = ?';"],
    ["backticked", 'const sql = "SELECT * FROM `lessons` WHERE id = ?";'],
  ])("catches a quoted table identifier (%s)", (_label, source) => {
    const root = makeFixture({ "src/routes/api/quoted.ts": source });
    try {
      expect(findViolations(root)).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ── Ordering: allowlist membership is necessary but not sufficient ──────────

  it("allows a query that follows an ownership check in the same function", () => {
    const root = makeFixture({
      "src/server/lessons.ts": `
        export async function readLesson(db, ids) {
          const wp = await resolveOwnedWaypoint(db, ids);
          if (!wp) return null;
          return db.prepare("SELECT * FROM lessons WHERE waypoint_id = ?").bind(ids.waypointId);
        }
      `,
    });
    try {
      expect(findViolations(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("catches a query placed BEFORE the ownership check in an allowlisted file", () => {
    const root = makeFixture({
      "src/server/lessons.ts": `
        export async function readLesson(db, ids) {
          const row = await db.prepare("SELECT * FROM lessons WHERE waypoint_id = ?").first();
          const wp = await resolveOwnedWaypoint(db, ids);
          return wp ? row : null;
        }
      `,
    });
    try {
      const violations = findViolations(root);
      expect(violations).toHaveLength(1);
      expect(violations[0]!.kind).toBe("ordering");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("catches a query in an UNGATED function of an allowlisted file", () => {
    const root = makeFixture({
      "src/server/lessons.ts": `
        export async function gated(db, ids) {
          const wp = await resolveOwnedWaypoint(db, ids);
          return db.prepare("SELECT * FROM lessons WHERE waypoint_id = ?").bind(wp.id);
        }
        export async function ungated(db, waypointId) {
          return db.prepare("SELECT * FROM lessons WHERE waypoint_id = ?").bind(waypointId);
        }
      `,
    });
    try {
      const violations = findViolations(root);
      expect(violations).toHaveLength(1);
      expect(violations[0]!.kind).toBe("ordering");
      expect(violations[0]!.text).toContain("SELECT");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts an ownership check in an ENCLOSING function", () => {
    const root = makeFixture({
      "src/server/lessons.ts": `
        export async function outer(db, ids) {
          const wp = await resolveOwnedWaypointScoped(db, ids);
          const run = async () =>
            db.prepare("SELECT * FROM lessons WHERE waypoint_id = ?").bind(wp.id);
          return run();
        }
      `,
    });
    try {
      expect(findViolations(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
