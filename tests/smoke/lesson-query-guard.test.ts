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

  it("allows `FROM lessons` inside the allowlisted call sites", () => {
    const root = makeFixture({
      "src/server/lessons.ts": 'const sql = "SELECT * FROM lessons WHERE id = ?";',
      "src/routes/api/journey/$journeyId/lesson.ts":
        'const sql = "SELECT id FROM lessons WHERE waypoint_id = ?";',
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
});
