// @vitest-environment node
// Live freshness check for MODEL_PRICING — CO-2 / MT-2 / AC-F1 / AC-F2.
//
// MODEL_PRICING is a hand-captured snapshot (see the doc comment in tiers.ts) holding
// the MAXIMUM price across each model's live OpenRouter endpoints, taken field by
// field. Nothing else in the repo ever compares those figures against live prices, so a
// stored price can drift silently — and drift is only safe in one direction. The
// module's stated policy is that a stored figure sits at or above every endpoint that
// could serve the call; an under-charge is the failure this test exists to catch.
//
// This reads GET /api/v1/models/<id>/endpoints, one call per priced model — NOT the
// catalog route GET /api/v1/models. The catalog reports one number per model and that
// number is one endpoint's price: it is the number the table used to be copied from, so
// comparing the table against it compared the table against itself and could not fail.
// Only the per-endpoint route carries the distribution this table claims to bound.
//
// Default-off, same idiom as tests/e2e/lesson-live-stream.spec.ts: a live network call
// against a third-party API has no place in the ordinary, offline, hermetic suite. Run
// it deliberately:
//
//   RUN_LIVE_PRICING=1 pnpm exec vitest run tests/smoke/model-pricing-freshness.test.ts
//
// Requires OPENROUTER_API_KEY in the environment (e.g. via `.dev.vars`, sourced manually —
// this file is plain vitest, not the Cloudflare-bound test runner, so it does not load
// `.dev.vars` itself). The route answers unauthenticated, but the key is still sent as a
// rate-limit identity and the gate is left exactly as it was.
//
// The comparator itself is exported and driven by an OFFLINE negative control below, so
// "the pre-fix table must fail this test" is a standing assertion rather than a manual
// stash somebody has to remember to perform.

import { describe, expect, test } from "vitest";
import { MODEL_PRICING } from "#/lib/ai/tiers";
import type { ModelPricing } from "#/lib/ai/tiers";

const RUN_LIVE = process.env["RUN_LIVE_PRICING"] === "1";
const API_KEY = process.env["OPENROUTER_API_KEY"];

/** One endpoint from GET https://openrouter.ai/api/v1/models/<id>/endpoints. */
export interface LiveEndpoint {
  /** Display name, e.g. "Baidu | z-ai/glm-5.2-20260616". */
  name: string;
  /** Routing tag, e.g. "baidu/fp4". Present on every endpoint the route returns. */
  tag?: string;
  pricing: {
    prompt: string;
    completion: string;
    overrides?: Array<{ min_prompt_tokens: number; prompt: string; completion: string }>;
  };
}

/**
 * OpenRouter prices per-token as decimal strings; MODEL_PRICING is per-1M-tokens.
 *
 * Rounded to 9 decimals to undo binary floating-point noise: `0.00000788 * 1e6` is
 * 7.880000000000001, which would put a stored 7.88 "below live" by 1e-15 of a dollar
 * per million tokens. Nine decimals is far finer than any price OpenRouter publishes
 * (its dearest field here has three significant decimals per million), so this cannot
 * mask real drift.
 */
export function perMillion(perToken: string): number {
  return Number((Number(perToken) * 1_000_000).toFixed(9));
}

/** A stored figure an endpoint can exceed, or a live step nothing stored covers. */
export interface PricingViolation {
  kind: "under-priced" | "missing-step";
  modelId: string;
  field: "input" | "output";
  /** Prompt-token threshold the comparison was made at; 0 is the base pair. */
  threshold: number;
  stored: number;
  live: number;
  /** The endpoint whose price exceeds the stored figure. */
  endpoint: string;
}

/** Price pair in effect at `threshold` prompt tokens, per 1M tokens. */
function effectiveLive(
  endpoint: LiveEndpoint,
  threshold: number,
): { input: number; output: number } {
  // An endpoint that publishes no override still charges its base rate above every
  // threshold, so it counts at every threshold too — comparing a stored step only
  // against endpoints publishing that exact threshold would miss a dearer flat one.
  const step = (endpoint.pricing.overrides ?? [])
    .filter((o) => o.min_prompt_tokens <= threshold)
    .sort((a, b) => b.min_prompt_tokens - a.min_prompt_tokens)[0];
  return step
    ? { input: perMillion(step.prompt), output: perMillion(step.completion) }
    : {
        input: perMillion(endpoint.pricing.prompt),
        output: perMillion(endpoint.pricing.completion),
      };
}

/** Stored price pair in effect at `threshold` prompt tokens — mirrors `computeCost`. */
function effectiveStored(
  stored: ModelPricing,
  threshold: number,
): { input: number; output: number } {
  const step = (stored.overrides ?? [])
    .filter((o) => o.minPromptTokens <= threshold)
    .sort((a, b) => b.minPromptTokens - a.minPromptTokens)[0];
  return step
    ? { input: step.input, output: step.output }
    : { input: stored.input, output: stored.output };
}

/**
 * Compare one model's stored figures against every live endpoint that could serve it.
 *
 * Pure and offline by construction — the live case feeds it a fetched payload, the
 * negative control feeds it a frozen one, and both grade by the same rule.
 *
 * Both directions of the original catalog check survive:
 *  - under-priced — some endpoint's effective price at a threshold is above the stored
 *    figure in effect at that threshold. This is the under-charge the table exists to
 *    prevent, and it is checked per FIELD, because the dearest prompt price and the
 *    dearest completion price can sit on different endpoints.
 *  - missing-step — an endpoint publishes a long-prompt threshold no stored `overrides`
 *    entry covers. Reported by name even when it happens to be cheaper: an uncaptured
 *    step is a table that has stopped tracking the shape of live pricing.
 */
export function findPricingViolations(
  modelId: string,
  stored: ModelPricing,
  endpoints: LiveEndpoint[],
): PricingViolation[] {
  const violations: PricingViolation[] = [];

  const thresholds = new Set<number>([0]);
  for (const step of stored.overrides ?? []) thresholds.add(step.minPromptTokens);
  for (const endpoint of endpoints) {
    for (const step of endpoint.pricing.overrides ?? []) thresholds.add(step.min_prompt_tokens);
  }

  for (const threshold of [...thresholds].sort((a, b) => a - b)) {
    const mine = effectiveStored(stored, threshold);
    for (const endpoint of endpoints) {
      const live = effectiveLive(endpoint, threshold);
      const where = endpoint.tag ?? endpoint.name;
      for (const field of ["input", "output"] as const) {
        if (live[field] > mine[field]) {
          violations.push({
            kind: "under-priced",
            modelId,
            field,
            threshold,
            stored: mine[field],
            live: live[field],
            endpoint: where,
          });
        }
      }
    }
  }

  for (const endpoint of endpoints) {
    for (const step of endpoint.pricing.overrides ?? []) {
      const covered = (stored.overrides ?? []).some(
        (o) => o.minPromptTokens === step.min_prompt_tokens,
      );
      if (covered) continue;
      violations.push({
        kind: "missing-step",
        modelId,
        field: "input",
        threshold: step.min_prompt_tokens,
        stored: effectiveStored(stored, step.min_prompt_tokens).input,
        live: perMillion(step.prompt),
        endpoint: endpoint.tag ?? endpoint.name,
      });
    }
  }

  return violations;
}

/** Human-readable failure text — names the model, field, threshold and endpoint. */
export function describeViolations(violations: PricingViolation[]): string {
  return violations
    .map((v) =>
      v.kind === "under-priced"
        ? `${v.modelId} ${v.field}@${v.threshold} stored ${v.stored} is below live endpoint ${v.endpoint} at ${v.live}`
        : `${v.modelId} has a live override at minPromptTokens=${v.threshold} on endpoint ${v.endpoint} with no stored counterpart in MODEL_PRICING — under-charging risk`,
    )
    .join("\n");
}

async function fetchEndpoints(modelId: string): Promise<LiveEndpoint[]> {
  const res = await fetch(`https://openrouter.ai/api/v1/models/${modelId}/endpoints`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) {
    throw new Error(
      `OpenRouter /models/${modelId}/endpoints returned ${res.status} ${res.statusText}`,
    );
  }
  const body = (await res.json()) as { data: { endpoints: LiveEndpoint[] } };
  return body.data.endpoints;
}

describe("MODEL_PRICING freshness (live)", () => {
  // Skipped whenever the gate is unset OR no credential is present — a developer with
  // no network, and CI, must both see this skip cleanly rather than fail or hang.
  test.skipIf(!RUN_LIVE || !API_KEY)(
    "AC-F1 every MODEL_PRICING figure is at or above every live endpoint that could serve it (requires RUN_LIVE_PRICING=1 and OPENROUTER_API_KEY)",
    async () => {
      const violations: PricingViolation[] = [];

      for (const [modelId, stored] of Object.entries(MODEL_PRICING)) {
        const endpoints = await fetchEndpoints(modelId);
        expect(endpoints.length, `${modelId} returned no live endpoints`).toBeGreaterThan(0);
        violations.push(...findPricingViolations(modelId, stored, endpoints));
      }

      expect(violations, describeViolations(violations)).toEqual([]);
    },
    60_000,
  );
});

// ── AC-F2 negative control — offline, hermetic, always runs ──────────────────
//
// The comparator has to be able to FAIL, or the live case above is decoration. These
// cases drive it against a frozen two-endpoint payload captured 2026-09-08 from
// GET /api/v1/models/z-ai/glm-5.2/endpoints: the dearest prompt price sits on Alibaba
// `alibaba/fast` and the dearest completion price on Baidu `baidu/fp4` — different
// endpoints, which is why the stored maximum is taken field by field.
const GLM_ENDPOINTS: LiveEndpoint[] = [
  {
    name: "Alibaba | z-ai/glm-5.2-20260616",
    tag: "alibaba/fast",
    pricing: { prompt: "0.00000231", completion: "0.00000726" },
  },
  {
    name: "Baidu | z-ai/glm-5.2-20260616",
    tag: "baidu/fp4",
    pricing: { prompt: "0.00000225", completion: "0.00000788" },
  },
];

describe("MODEL_PRICING freshness (comparator)", () => {
  test("AC-F2 the pre-fix catalog figures are reported as violations, by name", () => {
    // What MODEL_PRICING held before this slice: OpenRouter's catalog price, which is
    // one endpoint's price and is under every endpoint above.
    const preFix: ModelPricing = { input: 0.966, output: 3.036 };

    const violations = findPricingViolations("z-ai/glm-5.2", preFix, GLM_ENDPOINTS);

    const input = violations.filter((v) => v.field === "input");
    const output = violations.filter((v) => v.field === "output");
    expect(input.length, describeViolations(violations)).toBeGreaterThan(0);
    expect(output.length, describeViolations(violations)).toBeGreaterThan(0);
    // The dearest of each field is named, and they are different endpoints.
    expect(Math.max(...input.map((v) => v.live))).toBe(2.31);
    expect(input.find((v) => v.live === 2.31)?.endpoint).toBe("alibaba/fast");
    expect(Math.max(...output.map((v) => v.live))).toBe(7.88);
    expect(output.find((v) => v.live === 7.88)?.endpoint).toBe("baidu/fp4");
  });

  test("AC-F1 the stored figures clear the same payload with no violation", () => {
    // The field-by-field maximum {2.31, 7.88} is a pair no single endpoint charges —
    // that is the point: it bounds both endpoints at once.
    const violations = findPricingViolations(
      "z-ai/glm-5.2",
      MODEL_PRICING["z-ai/glm-5.2"]!,
      GLM_ENDPOINTS,
    );
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  test("a flat endpoint is compared at a stored long-prompt threshold too", () => {
    // grok-4.5's stored @200k step must clear an endpoint that publishes no override
    // and therefore charges its base rate all the way up.
    const stored: ModelPricing = {
      input: 4.0,
      output: 12.0,
      overrides: [{ minPromptTokens: 200_000, input: 8.0, output: 24.0 }],
    };
    const dearFlat: LiveEndpoint[] = [
      {
        name: "Flat | test",
        tag: "flat/test",
        pricing: { prompt: "0.00001", completion: "0.00002" },
      },
    ];

    const violations = findPricingViolations("x-ai/grok-4.5", stored, dearFlat);

    // $10/M prompt beats both the base 4.0 and the 8.0 step; $20/M completion beats
    // the base 12.0 but not the 24.0 step, so exactly three violations are expected.
    expect(violations.map((v) => `${v.field}@${v.threshold}`).sort()).toEqual([
      "input@0",
      "input@200000",
      "output@0",
    ]);
  });

  test("a live long-prompt step with no stored counterpart is reported by name", () => {
    const stored: ModelPricing = { input: 2.31, output: 7.88 };
    const stepped: LiveEndpoint[] = [
      {
        name: "Stepped | test",
        tag: "stepped/test",
        pricing: {
          prompt: "0.000001",
          completion: "0.000002",
          overrides: [{ min_prompt_tokens: 400_000, prompt: "0.000002", completion: "0.000004" }],
        },
      },
    ];

    const violations = findPricingViolations("z-ai/glm-5.2", stored, stepped);

    // Cheaper than the stored pair at every threshold, so the only complaint is that
    // the table has stopped tracking the shape of live pricing.
    expect(violations).toHaveLength(1);
    expect(violations[0]!.kind).toBe("missing-step");
    expect(violations[0]!.threshold).toBe(400_000);
    expect(describeViolations(violations)).toContain("stepped/test");
  });
});
