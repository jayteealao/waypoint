/**
 * AI model tier configuration.
 *
 * Maps each generation type to a primary model and an ordered fallback chain.
 * Pricing lives beside it in `MODEL_PRICING`, keyed by model rather than by tier:
 * a tier holds a chain of models with genuinely different prices, so pricing a
 * generation by its tier charges a fallback answer at the primary's rate.
 *
 * The quiz and roadmap tiers produce JSON by instructing the model in their
 * system prompts (see interview/prompts.ts), not via a provider structured-output
 * parameter. Tier config carries no call-shape constraint — only model and chain.
 */

/** Generation types produced by AI calls in Waypoint. */
export type GenerationType = "interview" | "lesson" | "quiz" | "roadmap";

/** Per-tier model config with fallback chain and pricing. */
export interface TierConfig {
  /** Primary model identifier (OpenRouter format: provider/model). */
  primaryModel: string;
  /**
   * Ordered fallback chain. On primary failure the gateway tries each in order.
   * Empty means no fallback — the error propagates immediately.
   */
  fallbackChain: string[];
  /**
   * Reasoning effort for reasoning-capable primaries. Forwarded to OpenRouter as
   * `reasoning.effort` on every call for this tier. Leave unset to use the model's
   * own default (e.g. grok-4.5's mandatory `high`). Additive/optional — omitting it
   * sends no reasoning field at all.
   */
  reasoningEffort?: "low" | "medium" | "high";
}

/**
 * Canonical tier map. All generation features call `callGateway({ type })` and
 * the gateway resolves the model from here — no consumer hardcodes model IDs.
 *
 * Prices are NOT here — see `MODEL_PRICING` below. The gateway prefers
 * `usage.total_cost` (which includes OpenRouter's 5.5% credit fee) and only
 * reaches for a price when the provider omits it.
 */
export const TIERS: Record<GenerationType, TierConfig> = {
  /**
   * Interview tier: cheap/fast for conversational turns.
   * Target latency: < 3 s (NFR from shape). `reasoningEffort: 'low'` protects the
   * latency budget on the reasoning-capable primary.
   */
  interview: {
    primaryModel: "z-ai/glm-5.2",
    fallbackChain: ["openai/gpt-5.6-luna"],
    reasoningEffort: "low",
  },

  /**
   * Lesson tier: premium for long-form educational content.
   * Target latency: < 5 s for first meaningful token (NFR from shape).
   */
  lesson: {
    primaryModel: "z-ai/glm-5.2",
    fallbackChain: ["google/gemini-3.5-flash"],
    reasoningEffort: "low",
  },

  /**
   * Roadmap tier: JSON planning output (shape mandated by the system prompt).
   * Low-volume, latency-tolerant planning — grok-4.5's mandatory reasoning default
   * (`high`) is desired here, so `reasoningEffort` is intentionally left unset.
   */
  roadmap: {
    primaryModel: "x-ai/grok-4.5",
    fallbackChain: ["openai/gpt-5.6-luna"],
  },

  /**
   * Quiz tier: JSON question generation + grading (shape mandated by the system prompt).
   */
  quiz: {
    primaryModel: "z-ai/glm-5.2",
    fallbackChain: ["deepseek/deepseek-v4-pro"],
    reasoningEffort: "low",
  },
};

/** Per-1M-token USD pricing for one model, with any long-prompt price steps. */
export interface ModelPricing {
  /** Base price per 1M prompt tokens, USD. */
  input: number;
  /** Base price per 1M completion tokens, USD. */
  output: number;
  /**
   * Long-prompt price steps, as OpenRouter publishes them. A request is priced by
   * the highest-threshold entry whose `minPromptTokens` it meets; below every
   * threshold the base pair applies. Omit for a model with a flat price.
   */
  overrides?: Array<{ minPromptTokens: number; input: number; output: number }>;
}

/**
 * Published list price per model, USD per 1M tokens.
 *
 * This is a QUOTA POLICY PRICE, not a reconstruction of what a call was billed.
 * A model is served by one of dozens of provider endpoints at prices spanning
 * five to one, and nothing in the response says which — so `usage.total_cost`
 * stays strictly first and this map is only reached when the provider omits it.
 * The figures are the model's headline list price, which errs above what most
 * endpoints charge: a rare over-estimate is recoverable, a systematic
 * under-charge is not.
 *
 * Captured 2026-09-04 from live OpenRouter data. Reproduce with the OpenRouter
 * MCP `get-model` for each id below, reading `pricing.prompt`,
 * `pricing.completion`, and `pricing.overrides`.
 *
 * That reproduction is also automated, as an opt-in freshness check (default-off,
 * hermetic suite stays offline): tests/smoke/model-pricing-freshness.test.ts asserts
 * every entry below is still at or above OpenRouter's current list price. Run it with:
 *
 *   RUN_LIVE_PRICING=1 pnpm exec vitest run tests/smoke/model-pricing-freshness.test.ts
 *
 * (requires OPENROUTER_API_KEY in the environment).
 *
 * A model must be priced here before it may appear in any tier chain.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "z-ai/glm-5.2": { input: 0.966, output: 3.036 },
  "x-ai/grok-4.5": {
    input: 2.0,
    output: 6.0,
    overrides: [{ minPromptTokens: 200_000, input: 4.0, output: 12.0 }],
  },
  "openai/gpt-5.6-luna": {
    input: 0.2,
    output: 1.2,
    overrides: [{ minPromptTokens: 272_000, input: 0.4, output: 1.8 }],
  },
  "google/gemini-3.5-flash": { input: 1.5, output: 9.0 },
  "deepseek/deepseek-v4-pro": { input: 1.04226, output: 2.08452 },
};

/**
 * Price applied when the served model is absent from `MODEL_PRICING`.
 *
 * The served model is whatever the upstream response reported, so a gateway-side
 * fallback can serve a model that is in no chain of ours — a maximum over the
 * tier's own chain would not bound it. This ceiling is authored instead: it sits
 * at the most expensive rate in the map above (grok-4.5's long-prompt step), so
 * an unpriced model is charged at least as much as anything we do price.
 *
 * That invariant is enforced, not just asserted here: the "CO-1" test in
 * tests/smoke/model-stream.test.ts checks UNKNOWN_MODEL_PRICING against every
 * entry in `MODEL_PRICING`, including each entry's `overrides` steps — not just
 * the base pair — and fails the moment any priced entry moves above this
 * ceiling. Bump both figures here (together) if that test fails.
 *
 * sdlc-debt: hard-coded ceiling — an unpriced model is charged this rather than
 * its real price, which can be wrong in either direction. Visible rather than
 * silent: `generation.cost_recomputed` fires and the ledger's `model` column
 * names the model, so the map can be corrected from production data. Upgrade
 * path: price the model in `MODEL_PRICING`.
 */
export const UNKNOWN_MODEL_PRICING: ModelPricing = { input: 4.0, output: 12.0 };
