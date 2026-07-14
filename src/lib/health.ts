/**
 * Deep liveness check for the `/health` deploy gate.
 *
 * The logic is a pure `runHealthCheck(env)` that takes `env` as a parameter so
 * the degraded paths (unbound DB, missing secret) are deterministic Vitest unit
 * tests without a Workers runtime — they cannot be driven through the live
 * endpoint without breaking the dev server. The route handler (src/routes/health.ts)
 * is the only place that imports the real `env` from `cloudflare:workers`.
 *
 * Contract: failing component names go to the LOGS ONLY. The route body discloses
 * a single opaque `status` field — never a secret name, secret value, or subsystem
 * inventory (the config-probe boundary is a tested invariant, AC-HE4).
 */

/**
 * Single source of truth for the runtime secrets the app requires.
 *
 * DRIFT WARNING: if a future slice adds a required Worker secret, add it HERE.
 * A boot-time secret validator, if one is ever added, MUST import this constant
 * rather than re-listing secrets, so the required set is defined in exactly one
 * place. (RIM-E4 anti-drift mandate.)
 */
export const REQUIRED_SECRETS = [
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_API_KEY',
  'OPENROUTER_API_KEY',
  'BETTER_AUTH_BASE_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
] as const

type SecretKey = (typeof REQUIRED_SECRETS)[number]

/**
 * Compile-time anti-drift backstop: every entry in REQUIRED_SECRETS must be a
 * real key of the Worker `Env`. If a secret is renamed or removed from the Env
 * typing (src/cloudflare-workers.d.ts / worker-configuration.d.ts) without
 * updating REQUIRED_SECRETS, this line fails `tsc`.
 */
const _secretsAreEnvKeys: readonly (keyof Env)[] = REQUIRED_SECRETS
void _secretsAreEnvKeys

/**
 * Structural subset of the Worker env the health check reads. Kept lean (rather
 * than the full `Env`) so unit tests can fabricate env objects — including ones
 * with a missing/undefined `DB` or an absent secret — without constructing the
 * entire binding surface.
 */
export type HealthEnv = {
  DB: Pick<D1Database, 'prepare'> | undefined | null
} & Partial<Record<SecretKey, string | undefined>>

export interface HealthResult {
  /** True only when the D1 probe AND every required secret pass. */
  ok: boolean
  /**
   * Internal failure identifiers (`'db'`, `'secret:<NAME>'`). Diagnostic only —
   * callers MUST NOT place this in a response body (AC-HE4).
   */
  failures: string[]
}

/** Names of required secrets whose value is not a non-empty string. */
export function checkSecrets(env: HealthEnv): string[] {
  return REQUIRED_SECRETS.filter((name) => {
    const value = env[name]
    return typeof value !== 'string' || value.length === 0
  })
}

/**
 * One `SELECT 1` round-trip through the `DB` binding. Handles both unbound-binding
 * modes so AC-HE2 holds regardless of which one a real unbound binding takes:
 * a falsy / non-preparable `env.DB` short-circuits, and a bound-but-erroring
 * binding is caught.
 */
export async function checkDb(env: HealthEnv): Promise<{ ok: boolean; error?: unknown }> {
  const db = env.DB
  if (!db || typeof db.prepare !== 'function') {
    return { ok: false, error: 'DB binding is not available' }
  }
  try {
    await db.prepare('SELECT 1').first()
    return { ok: true }
  } catch (error) {
    return { ok: false, error }
  }
}

/**
 * Run the deep liveness check. Logs each failing component as structured JSON
 * (component names in logs only) and returns the pass/fail boolean plus the
 * internal failure list.
 */
export async function runHealthCheck(env: HealthEnv): Promise<HealthResult> {
  const failures: string[] = []

  const db = await checkDb(env)
  if (!db.ok) {
    failures.push('db')
    // Names/details to logs only, never the response body (AC-HE2/HE4).
    console.error(
      JSON.stringify({ event: 'health.degraded', component: 'db', error: String(db.error) }),
    )
  }

  for (const name of checkSecrets(env)) {
    failures.push(`secret:${name}`)
    // Secret NAME to logs only — never the value, never the body (AC-HE3/HE4).
    console.log(JSON.stringify({ event: 'health.degraded', component: 'secret', name }))
  }

  return { ok: failures.length === 0, failures }
}
