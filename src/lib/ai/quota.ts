/**
 * Per-user quota engine for AI generation.
 *
 * Quota unit: cost_usd (daily UTC window). Cost is the common denominator across
 * model tiers — interview model tokens are ~4× cheaper than lesson model tokens,
 * making a token-count limit unintuitive to communicate. The `usage_events` table
 * records prompt_tokens, completion_tokens, AND cost_usd so a future pivot to
 * token-based quotas requires no schema change.
 *
 * Daily window: resets at UTC midnight. Workers runtime clock is UTC; D1 `at`
 * column stores ISO-8601 UTC strings — consistent by design.
 */

import type { GenerationType } from './tiers'

/** Return value of checkQuota — caller uses `allowed` to gate the LLM call. */
export interface QuotaStatus {
  /** Whether the user is allowed to make a generation request. */
  allowed: boolean
  /** Cost consumed so far today (USD). */
  used: number
  /** Daily limit (USD). */
  limit: number
  /** Exact moment at which the daily window resets (start of next UTC day). */
  resetAt: Date
}

/** Default daily cost limit per user (USD). Operator adjusts by editing + deploying. */
// sdlc-debt: hard-coded constant; upgrade path: store in D1 operator_config table when
// per-user or per-tier limits are needed.
export const DAILY_LIMIT_USD = 0.5

/**
 * Check the authenticated user's daily quota.
 *
 * Runs a single SUM query over `usage_events` for the current UTC day.
 * The `usage_events_user_at` index on (user_id, at) covers this query.
 *
 * Emits `quota.rejected` log when the user is over limit.
 *
 * @param db   - D1Database binding (from Cloudflare Workers env)
 * @param userId - Authenticated user's D1 UUID (never an email or OAuth token)
 * @param requestType - Generation type being requested (for rejection log attribution)
 */
export async function checkQuota(
  db: D1Database,
  userId: string,
  requestType?: GenerationType,
): Promise<QuotaStatus> {
  // Compute the UTC day boundary strings. Workers runtime is UTC; no TZ conversion needed.
  const now = new Date()
  const todayStart = now.toISOString().slice(0, 10) + 'T00:00:00Z'
  const tomorrowStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  )).toISOString()

  const row = await db
    .prepare(
      'SELECT COALESCE(SUM(cost_usd), 0) AS used FROM usage_events WHERE user_id = ? AND at >= ?',
    )
    .bind(userId, todayStart)
    .first<{ used: number }>()

  const used = row?.used ?? 0
  const allowed = used < DAILY_LIMIT_USD
  const resetAt = new Date(tomorrowStart)

  if (!allowed) {
    // Emit structured rejection log — routed to Cloudflare Logpush via observability.
    console.log(
      JSON.stringify({
        event: 'quota.rejected',
        user_id: userId,
        quota_limit: DAILY_LIMIT_USD,
        quota_used: used,
        request_type: requestType ?? 'unknown',
        reset_at: resetAt.toISOString(),
      }),
    )
  }

  return { allowed, used, limit: DAILY_LIMIT_USD, resetAt }
}
