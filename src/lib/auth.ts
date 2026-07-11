import { betterAuth } from 'better-auth'

/**
 * Per-request better-auth factory.
 *
 * Called inside a route handler on every request — never at module scope.
 * This is the architectural contract proven in the platform-proofs spike:
 * no module-scope D1 client leaks between Workers invocations.
 *
 * @param env - Fully typed Worker environment bindings (from worker-configuration.d.ts +
 *              the Env augmentation in src/cloudflare-workers.d.ts).
 */
export function createAuth(env: Env) {
  return betterAuth({
    // D1Database is accepted directly; better-auth v1.6.23 uses an internal
    // Kysely D1 dialect. Pass env.DB (typed as D1Database by wrangler types).
    database: env.DB,

    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_BASE_URL ?? 'http://localhost:3000',

    // Restrict callbacks to same-origin and explicit trusted origins.
    // localhost variants cover local dev; production origins are set via the env var.
    trustedOrigins: [
      'http://localhost:3000',
      'http://localhost:8787',
      ...(env.BETTER_AUTH_BASE_URL ? [env.BETTER_AUTH_BASE_URL] : []),
    ],

    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
    },
  })
}

/** Type of the per-request auth instance — used by auth-guard.ts for session typing. */
export type AuthInstance = ReturnType<typeof createAuth>
