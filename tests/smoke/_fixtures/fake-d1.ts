/**
 * Shared `D1Database` test doubles.
 *
 * Five smoke-test files each hand-rolled their own `.prepare().bind().first()/.run()`
 * (plus, in three of them, `.batch()`) — byte-different in the details every caller
 * actually depends on (whether the quota figure is configurable, whether an insert can
 * be made to reject, whether writes are recorded, whether `.batch()` can be broken).
 * `createFakeD1` factors out the mechanical prepare/bind/statement plumbing and leaves
 * every one of those differences to the caller, as hooks — nothing here decides what a
 * query returns or which write fails.
 *
 * `wrapD1` is a different kind of double: it does not fake anything, it observes and
 * optionally breaks a REAL `D1Database` (typically `createD1` from `./d1-sqlite`). It
 * exists for callers that need genuine SQL execution and only want to intercept
 * `.prepare()`/`.batch()` from the outside.
 */

/** A statement's SQL text and the arguments it was `.bind()`-ed with. */
export interface FakeD1Statement {
  __sql: string;
  __args: unknown[];
}

export interface FakeD1Options {
  /** Called synchronously inside `.bind()`, before `.first()/.run()` can resolve or throw. */
  onBind?: (sql: string, args: unknown[]) => void;
  /** Resolved value of the bound statement's `.first()`. Defaults to `undefined`. */
  first?: (sql: string, args: unknown[]) => unknown;
  /** Resolved value of the bound statement's `.run()` — throw to simulate a rejected write. */
  run?: (sql: string, args: unknown[]) => unknown;
  /** Handles `db.batch(statements)`. Defaults to resolving `[]` with no side effects. */
  batch?: (statements: FakeD1Statement[]) => unknown;
}

export interface FakeD1Handle {
  db: D1Database;
  /** SQL text of every `.prepare()` call, in order. */
  prepared: string[];
}

/** A synthetic `D1Database` — every table, every row, is whatever the given hooks say. */
export function createFakeD1(options: FakeD1Options = {}): FakeD1Handle {
  const prepared: string[] = [];

  const db = {
    prepare(sql: string) {
      prepared.push(sql);
      return {
        bind(...args: unknown[]) {
          options.onBind?.(sql, args);
          return {
            __sql: sql,
            __args: args,
            async first() {
              return options.first?.(sql, args);
            },
            async run() {
              return options.run
                ? options.run(sql, args)
                : { success: true, meta: { changes: 1 }, results: [] };
            },
            async all() {
              return { results: [] };
            },
          };
        },
      };
    },
    async batch(statements: FakeD1Statement[]) {
      return options.batch ? options.batch(statements) : [];
    },
  } as unknown as D1Database;

  return { db, prepared };
}

export interface WrapD1Options {
  /** Called with the SQL text of every `.prepare()` call, in order. */
  onPrepare?: (sql: string) => void;
  /** Handles `db.batch(statements)`. Defaults to delegating to `base.batch(statements)`. */
  batch?: (statements: unknown[], base: D1Database) => Promise<unknown>;
}

/** Observe (and optionally break) a real `D1Database` without faking its query engine. */
export function wrapD1(base: D1Database, options: WrapD1Options = {}): D1Database {
  return {
    prepare(sql: string) {
      options.onPrepare?.(sql);
      return base.prepare(sql);
    },
    batch(statements: unknown[]) {
      return options.batch
        ? options.batch(statements, base)
        : (base as unknown as { batch(s: unknown[]): Promise<unknown> }).batch(statements);
    },
  } as unknown as D1Database;
}
