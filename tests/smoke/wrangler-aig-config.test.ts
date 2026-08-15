// @vitest-environment node
// Deploy-correctness guard for the AI Gateway wiring in wrangler.jsonc.
//
// Cloudflare does not inherit `ai` bindings or `vars` from the top-level config into a
// named environment (wrangler's own config schema says so for both fields), so a block
// that is present at the top level but missing from env.staging / env.production deploys
// a Worker without the binding — and nothing fails until the first gateway call in
// production. CI's `wrangler deploy --dry-run` runs without `--env`, so it only ever
// validates the top-level scope; this file covers the other two.
//
// The assertions run through wrangler's own config resolution (`unstable_readConfig`),
// which is the same path a real deploy takes, rather than pattern-matching the JSONC text.

import { describe, test, expect } from "vitest";
import { unstable_readConfig } from "wrangler";

const CONFIG_PATH = "wrangler.jsonc";

/** Resolve wrangler.jsonc exactly as a deploy would, for one deploy scope. */
function readScope(env: string | undefined) {
  return unstable_readConfig({ config: CONFIG_PATH, env });
}

/** Top-level (local dev) plus every named deploy target. */
const SCOPES: Array<{ label: string; env: string | undefined; gatewayId: string }> = [
  { label: "top level (local dev)", env: undefined, gatewayId: "waypoint-dev" },
  { label: "env.staging", env: "staging", gatewayId: "waypoint-staging" },
  { label: "env.production", env: "production", gatewayId: "waypoint-prod" },
];

describe("wrangler.jsonc AI Gateway configuration", () => {
  test.each(SCOPES)("$label declares the AI binding and gateway vars", ({ env, gatewayId }) => {
    const config = readScope(env);

    expect(config.ai?.binding).toBe("AI");
    expect(config.vars.AIG_GATEWAY_ID).toBe(gatewayId);
    expect(config.vars.AIG_ENABLED).toBe("true");
  });

  test("each environment routes through its own gateway", () => {
    const ids = SCOPES.map(({ env }) => readScope(env).vars.AIG_GATEWAY_ID);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
