// @vitest-environment node
// Live freshness check for MODEL_PRICING — CO-2 / MT-2.
//
// MODEL_PRICING is a hand-captured snapshot (see the doc comment in tiers.ts). Nothing
// else in the repo ever compares those figures against OpenRouter's current list price,
// so a stored price can drift silently — and drift is only safe in one direction. The
// module's stated policy is that stored figures err ABOVE list; an under-charge is the
// failure this test exists to catch.
//
// Default-off, same idiom as tests/e2e/lesson-live-stream.spec.ts: a live network call
// against a third-party API has no place in the ordinary, offline, hermetic suite. Run
// it deliberately:
//
//   RUN_LIVE_PRICING=1 pnpm exec vitest run tests/smoke/model-pricing-freshness.test.ts
//
// Requires OPENROUTER_API_KEY in the environment (e.g. via `.dev.vars`, sourced manually —
// this file is plain vitest, not the Cloudflare-bound test runner, so it does not load
// `.dev.vars` itself).

import { describe, expect, test } from "vitest";
import { MODEL_PRICING } from "#/lib/ai/tiers";

const RUN_LIVE = process.env["RUN_LIVE_PRICING"] === "1";
const API_KEY = process.env["OPENROUTER_API_KEY"];

/** Shape of one entry from GET https://openrouter.ai/api/v1/models. */
interface LiveModel {
  id: string;
  pricing: {
    prompt: string;
    completion: string;
    overrides?: Array<{ min_prompt_tokens: number; prompt: string; completion: string }>;
  };
}

/** OpenRouter prices per-token as decimal strings; MODEL_PRICING is per-1M-tokens. */
function perMillion(perToken: string): number {
  return Number(perToken) * 1_000_000;
}

async function fetchLiveModels(): Promise<Map<string, LiveModel>> {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`OpenRouter /models returned ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { data: LiveModel[] };
  return new Map(body.data.map((m) => [m.id, m]));
}

describe("MODEL_PRICING freshness (live)", () => {
  // Skipped whenever the gate is unset OR no credential is present — a developer with
  // no network, and CI, must both see this skip cleanly rather than fail or hang.
  test.skipIf(!RUN_LIVE || !API_KEY)(
    "CO-2 every MODEL_PRICING entry is at or above OpenRouter's current list price (requires RUN_LIVE_PRICING=1 and OPENROUTER_API_KEY)",
    async () => {
      const live = await fetchLiveModels();

      for (const [modelId, priced] of Object.entries(MODEL_PRICING)) {
        const current = live.get(modelId);
        expect(current, `${modelId} not found in live OpenRouter catalog`).toBeDefined();
        if (!current) continue;

        const liveInput = perMillion(current.pricing.prompt);
        const liveOutput = perMillion(current.pricing.completion);
        expect(
          priced.input,
          `${modelId} stored input price ${priced.input} is below live list price ${liveInput}`,
        ).toBeGreaterThanOrEqual(liveInput);
        expect(
          priced.output,
          `${modelId} stored output price ${priced.output} is below live list price ${liveOutput}`,
        ).toBeGreaterThanOrEqual(liveOutput);

        for (const step of priced.overrides ?? []) {
          const liveStep = current.pricing.overrides?.find(
            (o) => o.min_prompt_tokens === step.minPromptTokens,
          );
          expect(
            liveStep,
            `${modelId} has no live override at minPromptTokens=${step.minPromptTokens}`,
          ).toBeDefined();
          if (!liveStep) continue;

          const liveStepInput = perMillion(liveStep.prompt);
          const liveStepOutput = perMillion(liveStep.completion);
          expect(
            step.input,
            `${modelId} override@${step.minPromptTokens} stored input price ${step.input} is below live list price ${liveStepInput}`,
          ).toBeGreaterThanOrEqual(liveStepInput);
          expect(
            step.output,
            `${modelId} override@${step.minPromptTokens} stored output price ${step.output} is below live list price ${liveStepOutput}`,
          ).toBeGreaterThanOrEqual(liveStepOutput);
        }
      }
    },
    30_000,
  );
});
