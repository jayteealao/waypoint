// Mechanical guard for the lesson ownership gate (RV-6). `resolveOwnedWaypoint` /
// `resolveOwnedWaypointScoped` (src/server/lesson-access.ts) is the only place a raw
// `FROM lessons` query is allowed to appear preceded by an ownership check — nothing
// short of this script enforces that ordering, so a new lesson-reading path (or a
// reorder inside an existing file) can silently reintroduce the cross-user lesson
// disclosure this workflow exists to fix.
//
// Approach: explicit allowlist by file. Every file below is a KNOWN call site where a
// `FROM lessons` query is preceded, in the same function, by a resolveOwnedWaypoint()
// call — verified by code review, not by this script. A `FROM lessons` occurrence in any
// file NOT on this list fails the build, mechanically, regardless of ordering.
//
//   node scripts/lesson-query-guard.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

const FROM_LESSONS = /from\s+lessons\b/i;

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".ai", ".scratch"]);

// Known-safe call sites, each already gated by resolveOwnedWaypoint() in the same
// function. lesson-access.ts itself is included for completeness even though its own
// queries are against `waypoints`/`journeys`, not `lessons`.
const ALLOWLIST = new Set(
  [
    "src/server/lesson-access.ts",
    "src/routes/api/journey/$journeyId/lesson.ts",
    "src/server/lessons.ts",
  ].map((p) => p.split("/").join(sep)),
);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

/** Returns every `FROM lessons` occurrence found outside the allowlisted files. */
export function findViolations(rootDir) {
  const srcDir = join(rootDir, "src");
  const violations = [];
  for (const file of walk(srcDir)) {
    const rel = relative(rootDir, file);
    if (ALLOWLIST.has(rel)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, idx) => {
      if (FROM_LESSONS.test(line)) {
        violations.push({ file: rel, line: idx + 1, text: line.trim() });
      }
    });
  }
  return violations;
}

export function runGuard(rootDir = process.cwd(), log = console.error) {
  const violations = findViolations(rootDir);
  if (violations.length === 0) return 0;

  log("lesson-query-guard: found `FROM lessons` outside the allowlisted lesson-access call sites:");
  for (const v of violations) {
    log(`  ${v.file}:${v.line}: ${v.text}`);
  }
  log(
    "\nEvery lesson read must go through resolveOwnedWaypoint() / resolveOwnedWaypointScoped() " +
      "(src/server/lesson-access.ts) before querying the `lessons` table — a raw query anywhere " +
      "else can leak another user's lesson data, which is the exact disclosure this gate exists " +
      "to prevent. If this is a genuinely new, already-gated call site, add its path to the " +
      "ALLOWLIST in scripts/lesson-query-guard.mjs (and get that addition reviewed).",
  );
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(runGuard());
}
