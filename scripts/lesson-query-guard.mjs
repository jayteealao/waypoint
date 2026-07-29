// Mechanical guard for the lesson ownership gate (RV-6). `resolveOwnedWaypoint` /
// `resolveOwnedWaypointScoped` (src/server/lesson-access.ts) is the only place a raw
// `FROM lessons` query is allowed to appear preceded by an ownership check — nothing
// short of this script enforces that ordering, so a new lesson-reading path (or a
// reorder inside an existing file) can silently reintroduce the cross-user lesson
// disclosure this workflow exists to fix.
//
// Two checks, because file-level allowlisting alone was not a guarantee:
//
//   1. MEMBERSHIP — a `FROM lessons` occurrence in any file outside ALLOWLIST fails.
//      Matching is done on normalized whole-file content, not line by line, so
//      `FROM\n  lessons` and quoted forms (`FROM "lessons"`, [lessons], `lessons`)
//      cannot slip past by splitting the keyword across a line break.
//
//   2. ORDERING — inside an allowlisted file, each occurrence must sit in a function
//      that has already called resolveOwnedWaypoint()/resolveOwnedWaypointScoped()
//      before it (in that function or an enclosing one). Membership alone permitted a
//      future query placed *before* the ownership check, or in an unrelated function
//      in the same file; the header comments promised same-function ordering but
//      nothing verified it. This walks the real TypeScript AST rather than guessing at
//      brace depth, so "the enclosing function" means what the compiler says it means.
//
//   node scripts/lesson-query-guard.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
// oxc-parser, not typescript: this repo's `typescript` 7.0.2 is the native port, whose
// package exposes only { version, versionMajorMinor } — no createSourceFile, no
// ScriptTarget (verified by importing node_modules/typescript directly; its lib/ ships
// tsc.js and getExePath.js only). oxc-parser is the parser oxlint already runs on this
// tree and returns ESTree nodes with start/end offsets, which is all this check needs.
import { parseSync } from "oxc-parser";

// `FROM` + any whitespace (including newlines) + optionally-quoted `lessons`.
// The global flag is required: findViolations relies on lastIndex to walk every match.
const FROM_LESSONS_GLOBAL = /from\s+(["'`\[])?lessons\b\1?/gi;

/** Single-match form for callers that only need a boolean. */
const FROM_LESSONS = new RegExp(FROM_LESSONS_GLOBAL.source, "i");

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".ai", ".scratch"]);

/** Ownership helpers that satisfy the ordering check. */
const OWNERSHIP_CALLS = new Set(["resolveOwnedWaypoint", "resolveOwnedWaypointScoped"]);

// Known call sites. Membership is necessary but no longer sufficient — every occurrence
// inside these files is still ordering-checked against an ownership call. lesson-access.ts
// is the module that DEFINES the ownership helpers, so its own queries are the primitive
// the check is built on and are exempt from ordering (they are reviewed by hand).
const ALLOWLIST = new Set(
  [
    "src/server/lesson-access.ts",
    "src/routes/api/journey/$journeyId/lesson.ts",
    "src/server/lessons.ts",
  ].map((p) => p.split("/").join(sep)),
);

/** Files whose queries define the gate rather than consume it — membership only. */
const ORDERING_EXEMPT = new Set(["src/server/lesson-access.ts"].map((p) => p.split("/").join(sep)));

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

/** Every match offset of `FROM lessons` in `content`. */
function matchOffsets(content) {
  const offsets = [];
  FROM_LESSONS_GLOBAL.lastIndex = 0;
  let m;
  while ((m = FROM_LESSONS_GLOBAL.exec(content)) !== null) {
    offsets.push({ index: m.index, text: m[0] });
    if (m.index === FROM_LESSONS_GLOBAL.lastIndex) FROM_LESSONS_GLOBAL.lastIndex++;
  }
  return offsets;
}

/** 1-based line number for a character offset, and the trimmed source line. */
function locate(content, offset) {
  const before = content.slice(0, offset);
  const line = before.split("\n").length;
  const lineStart = before.lastIndexOf("\n") + 1;
  const lineEnd = content.indexOf("\n", offset);
  const text = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd).trim();
  return { line, text };
}

/**
 * Offsets of ownership-helper calls, and the function-like nodes that contain each
 * `FROM lessons` occurrence. Returns the AST facts the ordering check needs.
 */
function analyzeOrdering(content, filePath, offsets) {
  const { program } = parseSync(filePath, content);

  const FN_TYPES = new Set([
    "FunctionDeclaration",
    "FunctionExpression",
    "ArrowFunctionExpression",
    "MethodDefinition",
  ]);

  /** All ownership call sites, as { start, fns } where fns are the enclosing fn nodes. */
  const ownershipCalls = [];
  /** For each target offset, the chain of enclosing function-like nodes. */
  const enclosing = new Map();

  const fnStack = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (typeof node.type !== "string") return;

    const isFn = FN_TYPES.has(node.type);
    if (isFn) {
      fnStack.push(node);
      // Any target offset inside this function records the chain, innermost last.
      for (const { index } of offsets) {
        if (index >= node.start && index < node.end) enclosing.set(index, [...fnStack]);
      }
    }

    if (node.type === "CallExpression") {
      const callee = node.callee;
      const name =
        callee?.type === "Identifier"
          ? callee.name
          : callee?.type === "MemberExpression" && callee.property?.type === "Identifier"
            ? callee.property.name
            : null;
      if (name && OWNERSHIP_CALLS.has(name)) {
        ownershipCalls.push({ start: node.start, fns: [...fnStack] });
      }
    }

    for (const key of Object.keys(node)) {
      if (key === "type" || key === "start" || key === "end") continue;
      visit(node[key]);
    }

    if (isFn) fnStack.pop();
  }
  visit(program);

  return { ownershipCalls, enclosing };
}

/**
 * Returns every `FROM lessons` occurrence that breaks either rule.
 *
 * Each violation carries a `kind`: `membership` (file not allowlisted) or `ordering`
 * (allowlisted, but not preceded by an ownership call in an enclosing function).
 */
export function findViolations(rootDir) {
  const srcDir = join(rootDir, "src");
  const violations = [];

  for (const file of walk(srcDir)) {
    const rel = relative(rootDir, file);
    const content = readFileSync(file, "utf8");
    const offsets = matchOffsets(content);
    if (offsets.length === 0) continue;

    if (!ALLOWLIST.has(rel)) {
      for (const { index } of offsets) {
        const { line, text } = locate(content, index);
        violations.push({ file: rel, line, text, kind: "membership" });
      }
      continue;
    }

    if (ORDERING_EXEMPT.has(rel)) continue;

    const { ownershipCalls, enclosing } = analyzeOrdering(content, rel, offsets);
    for (const { index } of offsets) {
      const fns = enclosing.get(index) ?? [];
      // Satisfied when some ownership call starts earlier in the file AND shares a
      // function with this occurrence (same function, or one that encloses it).
      const guarded = ownershipCalls.some(
        (call) => call.start < index && call.fns.some((fn) => fns.includes(fn)),
      );
      if (!guarded) {
        const { line, text } = locate(content, index);
        violations.push({ file: rel, line, text, kind: "ordering" });
      }
    }
  }

  return violations;
}

export function runGuard(rootDir = process.cwd(), log = console.error) {
  const violations = findViolations(rootDir);
  if (violations.length === 0) return 0;

  const membership = violations.filter((v) => v.kind === "membership");
  const ordering = violations.filter((v) => v.kind === "ordering");

  if (membership.length > 0) {
    log("lesson-query-guard: `FROM lessons` outside the allowlisted lesson-access call sites:");
    for (const v of membership) log(`  ${v.file}:${v.line}: ${v.text}`);
  }
  if (ordering.length > 0) {
    log("lesson-query-guard: `FROM lessons` not preceded by an ownership check in its function:");
    for (const v of ordering) log(`  ${v.file}:${v.line}: ${v.text}`);
  }

  log(
    "\nEvery lesson read must go through resolveOwnedWaypoint() / resolveOwnedWaypointScoped() " +
      "(src/server/lesson-access.ts) before querying the `lessons` table — a raw query anywhere " +
      "else, or one that runs before the gate, can leak another user's lesson data, which is the " +
      "exact disclosure this gate exists to prevent. If this is a genuinely new, already-gated " +
      "call site, add its path to the ALLOWLIST in scripts/lesson-query-guard.mjs (and get that " +
      "addition reviewed).",
  );
  return 1;
}

export { FROM_LESSONS };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(runGuard());
}
