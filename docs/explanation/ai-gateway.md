# About the Cloudflare AI Gateway in Waypoint

Audience: maintainers. This page explains why LLM traffic is routed through Cloudflare's
AI Gateway, how the pieces relate, and which trade-offs were accepted. It carries no setup
steps and no field-by-field contract. Those live in
[the AI Gateway reference](../reference/ai-gateway.md).

## Why this matters

Waypoint calls a language model on every interview turn, every lesson, every quiz, and every
roadmap. Before the gateway, each call left the Worker straight for OpenRouter. Nothing outside
the D1 ledger recorded that a call had happened, so a question as ordinary as "which users are
driving cost this week" could only be answered by querying our own database and trusting it. A
metering bug and a billing surprise looked identical from the outside.

The gateway is a second, independent observer of the same traffic. It sits between the Worker and
the provider, records each request, and groups the records by dimensions we choose.

## Core idea

Every generation carries five tags, and those tags make the dashboard sliceable.

The Worker sends each request through `env.AI.gateway(<id>)` with a `cf-aig-metadata` header
holding `user_id`, `journey_id`, `generation_type`, `tier`, and `request_id`. `request_id` is the
`usage_events` row id the generation will be metered under, so a gateway record and a ledger row
can be joined by that one value. The other four are the dimensions the dashboard groups by.

Two independent records of the same event, joinable by id, is the whole design. Everything else
serves it.

## Context and background

Cloudflare ships a wrapper package for this, and Waypoint tried it first. The wrapper's fetcher
reads the request body from an `init` argument the OpenRouter SDK never passes, so requests
arrived at the gateway with an empty payload. The routed path was carrying no prompt at all.

Waypoint therefore hand-rolls the gateway envelope. `src/lib/ai/aig-gateway-fetch.ts` reads the
body off the `Request` object and calls `env.AI.gateway(id).run({provider, endpoint, headers,
query})` directly. This keeps the AI binding, keeps the kill switch, needs no Cloudflare API
token, and keeps the OpenRouter adapter and its stream vocabulary. The cost is that Waypoint owns
one more piece of transport code.

A second piece of background explains a shape that otherwise looks redundant. `generation_type`
and `tier` carry the same value today, because the tier table is keyed by generation type. Both
fields are named in the ratified contract, so both are emitted. If a subscription tier ever
becomes distinct from a generation type, one line changes.

## How the pieces relate

Five modules do the work, and each owns one concern.

- `src/lib/ai/adapter.ts` decides whether the gateway is used at all. It reads `AIG_ENABLED` and
  compares it to the exact string `"true"`.
- `src/lib/ai/aig-metadata.ts` builds the five-field tag object. It is a pure function, so the
  exact payload is asserted in tests without a gateway, a network, or a Worker runtime.
- `src/lib/ai/aig-cache.ts` composes the per-user cache key and classifies the gateway's cache
  verdict.
- `src/lib/ai/aig-gateway-fetch.ts` assembles the outbound envelope and reads
  `cf-aig-cache-status` off the response. It is the only place that header exists before the SDK
  layers hide it.
- `src/lib/ai/gateway.ts` is the single request path. Lessons stream through the same function
  that interviews, quizzes, roadmaps, and grading use, so analytics cannot diverge between them.

The single request path is not decoration. Before unification, the lesson route had its own copy
of the adapter, the fallback chain, the quota check, the ledger insert, and the stream parser.
Two copies drift, and a tag added to one is missing from the other.

## Trade-offs

**Body logging is on in every environment.** The gateway records full prompt and response
payloads. This is a second retention surface for user content, inside Cloudflare, in addition to
D1. It was accepted deliberately: replaying a real generation is the fastest way to diagnose a
bad lesson, and access is controlled by an authenticated gateway. Retention runs at the Cloudflare
plan default.

**Caching is scoped to the user or it does not happen.** The cache key is
`${userId}:sha256("v1\n<provider>\n<endpoint>\n<body>")`. Waypoint's key replaces Cloudflare's own,
so provider and endpoint must sit inside the digest; on the platform's side they no longer
distinguish entries. When there is no principal to scope to, the request sends
`cf-aig-skip-cache: true` rather than fall through to the gateway's default key, which does not
segment by user. The cost is a modest hit rate on a personalized workload. The alternative was
replaying one learner's answer to another.

**The extra network hop is unguarded.** Worker to gateway to provider is one hop more than
before, and there is no per-request latency guard. The mitigation is the kill switch, not a
timeout: `AIG_ENABLED="false"` routes straight to the provider with no redeploy.

**Routing is fail-closed.** When `AIG_ENABLED` is `"true"` but the AI binding or the gateway id is
missing, the Worker refuses the generation. It does not quietly call the provider direct. The
reason is that "is the gateway on?" must have exactly one answer; a silent fallback would make the
dashboard's gaps indistinguishable from quiet periods.

## Common misconceptions

**"The gateway's cost column and the ledger's `cost_usd` disagree, so one is wrong."** They are
different numbers by design. The gateway prices the token counts it saw at OpenRouter's published
catalog rate. The ledger stores OpenRouter's own `total_cost`, the amount actually billed, which
depends on which endpoint served the request. Reconciliation between the two records is by
`request_id` only, never by cost.

**"`MODEL_PRICING` is the list price."** It is not, and it stopped being so deliberately. Each
entry holds the maximum price across that model's live OpenRouter endpoints, taken field by field.
The table is a ceiling for the quota gate, not a description of what a call costs. It is consulted
only when the provider omits `total_cost`.

**"A cache hit still costs quota."** A hit zeroes the cost and writes no ledger row, so quota never
advances without a second mechanism.

**"`AIG_ENABLED=TRUE` turns routing on."** Only the exact lowercase string `"true"` does. Every
other value, including `"TRUE"` and unset, bypasses the gateway.

## Practical implications

The gateway named in `AIG_GATEWAY_ID` must exist in Cloudflare before a scope is deployed with
routing enabled, because the Worker refuses rather than degrades. The three gateways are
per-environment and are not inherited between them.

When a dashboard grouping shows a `null` bucket, suspect the metadata builder rather than the
data. `journey_id` is omitted when absent rather than serialized, precisely because `String(null)`
renders as a legitimate-looking journey that no journey owns.

## Further reading

- [AI Gateway reference](../reference/ai-gateway.md) — bindings, variables, the metadata field
  contract, cache-key composition, and the required configuration per environment.
- Cloudflare's own
  [custom metadata documentation](https://developers.cloudflare.com/ai-gateway/observability/custom-metadata/)
  for the platform limits the metadata builder is shaped by.
