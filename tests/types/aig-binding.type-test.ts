// Compile-time guard: the AI Gateway adapter still accepts a plain Worker binding.
//
// The gateway adapters are configured either with a binding (`env.AI.gateway(id)`) or with
// account credentials. This project uses binding mode, which needs no Cloudflare API key —
// so if a dependency upgrade narrowed or renamed that config shape, every call site would
// break at once. Asserting assignability here fails the typecheck in this inert scaffold
// instead of surfacing later, in the middle of wiring real traffic through the gateway.
//
// Types only: nothing here is imported by the app, and no Vitest include glob matches
// `tests/types/`, so this file is executed exclusively by `tsc --noEmit`.

import type { OpenRouterGatewayConfig } from "@cloudflare/tanstack-ai/adapters/openrouter";

/** What the app will pass: the object returned by `env.AI.gateway(env.AIG_GATEWAY_ID)`. */
type BindingModeConfig = { binding: ReturnType<Ai["gateway"]> };

/** `false` — and therefore a type error on the annotation — if binding mode stops fitting. */
export const bindingModeIsAcceptedByAdapter: BindingModeConfig extends OpenRouterGatewayConfig
  ? true
  : false = true;
