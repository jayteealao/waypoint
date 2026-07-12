/**
 * AI model tier configuration.
 *
 * Maps each generation type to a primary model, ordered fallback chain, and
 * pricing metadata (per 1M tokens). Pricing is stored as config — not used in
 * arithmetic directly — so model swaps require a single constant update here
 * rather than scattered changes in gateway logic.
 *
 * Invariant: structured-output calls (quiz, roadmap) NEVER combine responseFormat
 * with tools in the same request. This is enforced at the gateway level via a
 * TypeScript discriminated union + runtime TypeError. Tier config does not need
 * to encode this — it is a call-shape constraint, not a model constraint.
 */

/** Generation types produced by AI calls in Waypoint. */
export type GenerationType = 'interview' | 'lesson' | 'quiz' | 'roadmap'

/** Per-tier model config with fallback chain and pricing. */
export interface TierConfig {
  /** Primary model identifier (OpenRouter format: provider/model). */
  primaryModel: string
  /**
   * Ordered fallback chain. On primary failure the gateway tries each in order.
   * Empty means no fallback — the error propagates immediately.
   */
  fallbackChain: string[]
  /** Per-1M-token pricing in USD. Used as fallback when total_cost absent. */
  pricingPer1MTokens: {
    input: number
    output: number
  }
}

/**
 * Canonical tier map. All generation features call `callGateway({ type })` and
 * the gateway resolves the model from here — no consumer hardcodes model IDs.
 *
 * Pricing figures are authoritative as of 2026-07-11 from OpenRouter's pricing
 * page. Update here when models change; the gateway prefers `usage.total_cost`
 * (which includes OpenRouter's 5.5% credit fee) over recomputed cost.
 */
export const TIERS: Record<GenerationType, TierConfig> = {
  /**
   * Interview tier: cheap/fast for conversational turns.
   * Target latency: < 3 s (NFR from shape).
   */
  interview: {
    primaryModel: 'openai/gpt-4o-mini',
    fallbackChain: ['google/gemini-2.5-flash'],
    pricingPer1MTokens: { input: 0.15, output: 0.60 },
  },

  /**
   * Lesson tier: premium for long-form educational content.
   * Target latency: < 5 s for first meaningful token (NFR from shape).
   */
  lesson: {
    primaryModel: 'anthropic/claude-haiku-4.5',
    fallbackChain: ['openai/gpt-4o'],
    pricingPer1MTokens: { input: 1.00, output: 5.00 },
  },

  /**
   * Structured tier: structured-output (JSON schema) for roadmap generation.
   * NOTE: responseFormat and tools are NEVER combined in one request — enforced
   * at the gateway call-shape level (TypeScript discriminated union + TypeError).
   */
  roadmap: {
    primaryModel: 'openai/gpt-4o-mini',
    fallbackChain: ['openai/gpt-4o'],
    pricingPer1MTokens: { input: 0.15, output: 0.60 },
  },

  /**
   * Quiz tier: structured-output grading. Same invariant as roadmap.
   */
  quiz: {
    primaryModel: 'openai/gpt-4o-mini',
    fallbackChain: ['anthropic/claude-haiku-4.5'],
    pricingPer1MTokens: { input: 0.15, output: 0.60 },
  },
}
