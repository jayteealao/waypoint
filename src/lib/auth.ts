import { betterAuth } from 'better-auth'

/**
 * Per-request better-auth factory.
 *
 * Must be called inside a route handler on every request — never at module scope.
 * This is the architectural contract the platform-proofs spike verifies:
 * no module-scope D1 client leaks between requests.
 *
 * `db` is the D1Database binding from `cloudflare:workers` env.
 * Type is `unknown` here; the accounts-data-layer slice adds `wrangler types`
 * to generate a typed Env interface with `.DB: D1Database`.
 *
 * sdlc-debt: `db as any` cast — replace with typed Env once `wrangler types`
 * is wired in accounts-data-layer.
 */
export function createAuth(db: unknown) {
  return betterAuth({
    // D1Database is accepted directly; better-auth v1.6.23 detects it and
    // uses an internal Kysely D1 dialect under the hood.
    database: db as Parameters<typeof betterAuth>[0]['database'],
    // secret is required for session signing. In production, provide via
    // BETTER_AUTH_SECRET environment variable.
    secret: (process.env['BETTER_AUTH_SECRET'] as string | undefined) ?? 'dev-secret-replace-in-prod',
    // Minimal config for the spike — OAuth plugins added in accounts-data-layer.
  })
}
