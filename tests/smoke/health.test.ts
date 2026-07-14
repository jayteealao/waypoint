// @vitest-environment node
// runHealthCheck takes `env` as a parameter and touches no Workers runtime, so a
// node environment with fabricated env objects is sufficient. This is the harness
// that makes the degraded paths (AC-HE2/HE3/HE4) deterministic off-runtime.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { REQUIRED_SECRETS, checkSecrets, runHealthCheck, type HealthEnv } from '#/lib/health'

// A DB stub whose `SELECT 1` resolves — the healthy binding.
function okDb(): HealthEnv['DB'] {
  return {
    prepare: () =>
      ({ first: async () => ({ 1: 1 }) }) as unknown as ReturnType<
        NonNullable<HealthEnv['DB']>['prepare']
      >,
  }
}

// A fully-configured, healthy env: DB bound + all 8 secrets non-empty.
function healthyEnv(): HealthEnv {
  const env: HealthEnv = { DB: okDb() }
  for (const name of REQUIRED_SECRETS) {
    env[name] = `value-for-${name}`
  }
  return env
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('runHealthCheck — healthy path', () => {
  it('returns { ok: true, failures: [] } when DB is bound and every secret is set', async () => {
    const result = await runHealthCheck(healthyEnv())
    expect(result).toEqual({ ok: true, failures: [] })
  })
})

describe('runHealthCheck — DB degraded (AC-HE2)', () => {
  it('is degraded when the DB binding is undefined, logging the failure', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const env = healthyEnv()
    env.DB = undefined
    const result = await runHealthCheck(env)
    expect(result.ok).toBe(false)
    expect(result.failures).toContain('db')
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0][0]).toContain('health.degraded')
  })

  it('is degraded when the DB binding is present but SELECT 1 throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const env = healthyEnv()
    env.DB = {
      prepare: () =>
        ({
          first: async () => {
            throw new Error('D1_ERROR: no such table')
          },
        }) as unknown as ReturnType<NonNullable<HealthEnv['DB']>['prepare']>,
    }
    const result = await runHealthCheck(env)
    expect(result.ok).toBe(false)
    expect(result.failures).toContain('db')
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })
})

describe('runHealthCheck — secret degraded (AC-HE3)', () => {
  it.each(REQUIRED_SECRETS)(
    'is degraded with only %s named in failures + logs when that secret is absent',
    async (missing) => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const env = healthyEnv()
      delete env[missing]
      const result = await runHealthCheck(env)
      expect(result.ok).toBe(false)
      expect(result.failures).toEqual([`secret:${missing}`])
      // The missing secret name is logged exactly once...
      const loggedNames = logSpy.mock.calls
        .map((c) => String(c[0]))
        .filter((line) => line.includes(missing))
      expect(loggedNames).toHaveLength(1)
      // ...and no OTHER required secret name appears in the logs.
      for (const other of REQUIRED_SECRETS) {
        if (other === missing) continue
        expect(logSpy.mock.calls.some((c) => String(c[0]).includes(other))).toBe(false)
      }
    },
  )

  it('treats a present-but-empty-string secret as absent', () => {
    const env = healthyEnv()
    env.BETTER_AUTH_SECRET = ''
    expect(checkSecrets(env)).toEqual(['BETTER_AUTH_SECRET'])
  })
})

describe('runHealthCheck — opaque boundary (AC-HE4)', () => {
  it('never surfaces a secret VALUE in the returned result', async () => {
    const env = healthyEnv()
    env.OPENROUTER_API_KEY = 'sk-super-secret-value-1234'
    env.BETTER_AUTH_SECRET = '' // force a degraded result so failures is populated
    const result = await runHealthCheck(env)
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('sk-super-secret-value-1234')
    expect(serialized).not.toContain('value-for-') // no fabricated secret values leak
  })

  it('returns exactly the ok + failures shape — no secret inventory field', async () => {
    const result = await runHealthCheck(healthyEnv())
    expect(Object.keys(result).sort()).toEqual(['failures', 'ok'])
  })
})
