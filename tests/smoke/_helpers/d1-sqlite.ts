/**
 * A minimal `D1Database` over `node:sqlite`, for tests that need the real prepared
 * statements to hit a real SQL engine.
 *
 * Extracted from `tests/smoke/lesson-persistence.test.ts` (which drove statements only)
 * and widened with `.first()` / `.all()` so a whole route handler can run against it.
 * One adapter cannot drift from itself — that is why the statement-level test now points
 * here instead of keeping its own copy.
 *
 * `batch()` commits every statement in the array inside one transaction, matching D1's
 * documented all-or-nothing semantics for `D1Database.batch()`.
 *
 * Lives under `tests/` (not `src/`) so the `SELECT ... FROM lessons` text in its callers
 * needs no entry in `scripts/lesson-query-guard.mjs`'s ALLOWLIST — that guard walks `src/`
 * only, by design (see its header comment).
 */

import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "migrations",
);

// Every migration, in the order wrangler applies them — not just 0000. A route handler
// touches tables (interview_records) that later migrations add, so a partial schema
// fails as "no such table" rather than as the thing under test.
const MIGRATION_SQL = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
  .join(";\n");

/** Apply the real `migrations/*.sql`, in order, to an in-memory database. */
export function seedSchema(db: DatabaseSync): void {
  db.exec(MIGRATION_SQL);
}

/** Wrap a `node:sqlite` handle in the slice of the D1 surface this repo actually uses. */
export function createD1(db: DatabaseSync): D1Database {
  function prepare(sql: string) {
    const compiled = db.prepare(sql);
    let bound: unknown[] = [];
    const api = {
      bind(...args: unknown[]) {
        bound = args;
        return api;
      },
      run(): Promise<unknown> {
        compiled.run(...(bound as never[]));
        return Promise.resolve({ success: true });
      },
      first(): Promise<unknown> {
        return Promise.resolve(compiled.get(...(bound as never[])) ?? null);
      },
      all(): Promise<unknown> {
        return Promise.resolve({ results: compiled.all(...(bound as never[])), success: true });
      },
      _run(): unknown {
        return compiled.run(...(bound as never[]));
      },
    };
    return api;
  }

  return {
    prepare,
    async batch(statements: Array<ReturnType<typeof prepare>>) {
      db.exec("BEGIN");
      try {
        const results = statements.map((s) => (s as unknown as { _run(): unknown })._run());
        db.exec("COMMIT");
        return results;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  } as unknown as D1Database;
}
