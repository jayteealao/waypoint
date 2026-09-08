# AI Gateway reference

Audience: maintainers and operators. This page states the bindings, variables, header contracts,
and per-environment configuration that route Waypoint's LLM traffic through the Cloudflare AI
Gateway. It carries no rationale. For the reasoning and the accepted trade-offs, read
[About the Cloudflare AI Gateway in Waypoint](../explanation/ai-gateway.md).

## Binding

### `AI`

| | |
|---|---|
| Type | Cloudflare AI binding |
| Declared in | `wrangler.jsonc`, as `"ai": { "binding": "AI" }` |
| Required | Yes, in every deploy scope that sets `AIG_ENABLED="true"` |
| Effect | Exposes `env.AI.gateway(<id>)`, the client the outbound envelope is sent through |
| Constraints | Not inherited between environments. Each of the top level, `env.staging`, and `env.production` declares its own. The binding schema accepts only `{ binding, staging, remote }`, so the gateway id cannot travel inside it and is carried by `AIG_GATEWAY_ID` instead. |

## Variables

### `AIG_GATEWAY_ID`

| | |
|---|---|
| Type | string |
| Default | `waypoint-dev` (local and top-level) |
| Required | Yes, when `AIG_ENABLED` is `"true"` |
| Allowed values | The name of an AI Gateway that exists in the Cloudflare account |
| Effect | Names the gateway passed to `env.AI.gateway(...)` |
| Constraints | Per environment, never inherited. The gateway must exist in Cloudflare before a scope is deployed with routing enabled. |
| Example | `AIG_GATEWAY_ID=waypoint-staging` |

### `AIG_ENABLED`

| | |
|---|---|
| Type | string |
| Default | `"true"` in all three deploy scopes |
| Required | Yes |
| Allowed values | `"true"` routes through the gateway. Every other value, including `"false"`, `"TRUE"`, and unset, sends the request straight to the provider. |
| Effect | The kill switch. Read by `isAigRouted()` in `src/lib/ai/adapter.ts`, which compares against the exact string. |
| Constraints | A string, not a boolean, so `wrangler.jsonc` and the dotenv-format `.dev.vars` agree on the type. When the value is `"true"` and the `AI` binding or `AIG_GATEWAY_ID` is missing, the Worker refuses the generation rather than calling the provider direct. |
| Example | `AIG_ENABLED=false` |

Regenerate the environment types after changing either variable:

```bash
pnpm exec wrangler types --strict-vars=false
```

The flag keeps both values typed as `string` rather than as string literals.

## Required configuration per environment

| Scope | Worker name | `AIG_GATEWAY_ID` | `AIG_ENABLED` | `AI` binding |
|---|---|---|---|---|
| local / top level | `waypoint` | `waypoint-dev` | `"true"` | required |
| `env.staging` | `waypoint-staging` | `waypoint-staging` | `"true"` | required |
| `env.production` | `waypoint` | `waypoint-prod` | `"true"` | required |

Select the target before building, because `@cloudflare/vite-plugin` bakes the chosen environment
into `dist/server/wrangler.json`:

```bash
CLOUDFLARE_ENV=staging pnpm run build && pnpm exec wrangler deploy
```

## Header contract: `cf-aig-metadata`

Built by `buildAigMetadata()` in `src/lib/ai/aig-metadata.ts` and serialized as JSON into the
header slot.

| Field | Type | Required | Value |
|---|---|---|---|
| `user_id` | string | Yes | Internal D1 user id. Pseudonymous; never an email or a name. |
| `generation_type` | string | Yes | One of the generation types: interview, lesson, quiz, roadmap, grading. |
| `tier` | string | Yes | The tier table key. Carries the same value as `generation_type` today. |
| `request_id` | string | Yes | The `usage_events` row id the generation is metered under. The join key between a gateway record and a ledger row. |
| `journey_id` | string | No | The owning journey. **Omitted entirely** when null or undefined. |

Constraints, both from the platform:

1. At most five entries per request. Over-limit entries are dropped silently and the caller does
   not choose which five survive. The field set above is fixed and literal, so a sixth key is not
   reachable.
2. Strings, numbers, and booleans only. Objects are unsupported. Every value is coerced with
   `String()` at the boundary.

Keys beginning with `cf.` are reserved by Cloudflare and are stripped. None of the five uses that
prefix.

`journey_id` is omitted rather than serialized when absent. `String(null)` is `"null"`, which
renders in the dashboard as a journey bucket that no journey owns.

## Header contract: caching

Built by `src/lib/ai/aig-cache.ts`.

| Header | Value | Sent when |
|---|---|---|
| `cf-aig-cache-key` | `${userId}:<sha256 hex>` | A principal is present |
| `cf-aig-cache-ttl` | `600` | A principal is present |
| `cf-aig-skip-cache` | `"true"` | No principal is present |

### Cache-key composition

The digest covers a domain-separated tuple, newline joined:

```
v1
<provider>
<endpoint>
<body>
```

`provider` is `openrouter` and `endpoint` is derived from the request URL, for example
`chat/completions`. The SHA-256 hex digest of that tuple is prefixed with `${userId}:`.

| Element | Reason it is present |
|---|---|
| `v1` | A future change to the scheme becomes a cache miss, not a silent mismatch. |
| `provider`, `endpoint` | Waypoint's key replaces Cloudflare's, so these stop distinguishing entries on the platform's side and must sit inside the digest. |
| `body` | The exact outbound request body, as sent. |
| `${userId}:` prefix | Sits outside the digest. D1 user ids are UUIDs and contain no `:`, and the digest has fixed length, so no boundary ambiguity is possible. |

The gateway id is not in the tuple. Each deploy scope has its own gateway, so gateways are already
separate cache namespaces.

### TTL

`AIG_CACHE_TTL_SECONDS` in `src/lib/ai/aig-cache.ts` is `600`.

### Cache-outcome classification

`classifyCacheOutcome()` reads `cf-aig-cache-status` off the gateway response. A hit zeroes the
cost and writes no `usage_events` row. When the header is absent, the classifier falls back to
zeroed-usage detection and never invents a verdict.

## Cost fields

| Name | Where | Meaning |
|---|---|---|
| `usage_events.cost_usd` | D1 | OpenRouter's own `total_cost`, the amount actually billed, when the provider reports it. |
| `MODEL_PRICING` | `src/lib/ai/tiers.ts` | Per model, the **maximum** price across that model's live OpenRouter endpoints, taken field by field. Consulted only when the provider omits `total_cost`. |
| `UNKNOWN_MODEL_PRICING` | `src/lib/ai/tiers.ts` | `{ input: 8.0, output: 24.0 }` per million tokens. Charged when the served model is absent from `MODEL_PRICING`. At or above every stored step, including overrides. |

Both tables were captured on 2026-09-08 from `GET /api/v1/models/<id>/endpoints`. Re-check them
with the live freshness test:

```bash
RUN_LIVE_PRICING=1 pnpm exec vitest run tests/smoke/model-pricing-freshness.test.ts
```

The test is skipped unless `RUN_LIVE_PRICING=1` and `OPENROUTER_API_KEY` are both set.

## Related

- [About the Cloudflare AI Gateway in Waypoint](../explanation/ai-gateway.md)
- Cloudflare
  [custom metadata documentation](https://developers.cloudflare.com/ai-gateway/observability/custom-metadata/)
