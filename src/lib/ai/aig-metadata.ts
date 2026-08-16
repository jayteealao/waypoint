/**
 * The tags that make the AI Gateway dashboard sliceable.
 *
 * Cloudflare records custom metadata alongside every request that carries it, and
 * the dashboard groups and filters by those keys — which is the whole point of
 * routing through a gateway rather than calling the provider directly. This module
 * builds that object, and nothing else: it is a pure function so the exact payload
 * can be asserted without a gateway, a network, or a Worker runtime.
 *
 * Two constraints from the platform shape it, both from Cloudflare's *Custom
 * metadata* docs (https://developers.cloudflare.com/ai-gateway/observability/custom-metadata/,
 * read 2026-08-16):
 *
 *  1. **At most five entries per request.** Over-limit entries are dropped silently,
 *     and which five survive is not the caller's choice — so a builder that can emit
 *     six would lose an arbitrary field rather than fail. The field set here is fixed
 *     and literal: it is not possible for this function to return a sixth key.
 *  2. **Strings, numbers and booleans only** — objects are unsupported. Every value is
 *     coerced with `String()` at the boundary, so a non-scalar cannot reach the header
 *     even if a future caller hands one over.
 *
 * Keys beginning with `cf.` are reserved by Cloudflare and stripped; none of the five
 * below uses that prefix.
 *
 * `journey_id` is the only optional field, and it is **omitted entirely** when absent
 * rather than serialized — `String(null)` is `"null"`, which would render in the
 * dashboard as a legitimate-looking journey bucket that no journey owns.
 */

import type { GenerationType } from "./tiers";

/** The metadata object as the platform types it: scalar values only. */
export type AigMetadata = Record<string, string | number | boolean>;

export interface AigMetadataInput {
  /** Internal D1 user id — pseudonymous, never an email or a name. */
  userId: string;
  /** Journey the generation belongs to. Omitted from the payload when null/undefined. */
  journeyId?: string | null;
  /** Generation type; also the tier's identity (see `tier` below). */
  type: GenerationType;
  /** The `usage_events.id` this generation will be metered under — see `gateway.ts`. */
  requestId: string;
}

/**
 * Build the metadata for one generation: four fields always, five when the
 * generation belongs to a journey.
 *
 * `tier` carries the `TIERS` key, which today *is* the generation type (`TIERS` is
 * `Record<GenerationType, TierConfig>`, see `./tiers`) — the two fields therefore ship
 * the same value. Both are named in the ratified five-field contract, so both are
 * emitted; if a distinct subscription/plan tier ever exists, this is the one line that
 * changes.
 */
export function buildAigMetadata(input: AigMetadataInput): AigMetadata {
  const metadata: AigMetadata = {
    user_id: String(input.userId),
    generation_type: String(input.type),
    tier: String(input.type),
    request_id: String(input.requestId),
  };
  // Key-absent, not `"null"` — see the module note on the phantom journey bucket.
  if (input.journeyId != null) {
    metadata["journey_id"] = String(input.journeyId);
  }
  return metadata;
}

/**
 * Serialize the metadata into the gateway header slot.
 *
 * JSON in a header value is the documented form and the one Cloudflare's own package
 * uses (`headers["cf-aig-metadata"] = serializeMetadata(opts.metadata)`, source:
 * node_modules/@cloudflare/tanstack-ai/dist/create-fetcher-Cmmx6As3.mjs:65). Returning
 * a header *map* rather than a bare string keeps the header name in exactly one place
 * in the codebase, which is also where `scoped-caching`'s `cf-aig-cache-key` will land.
 */
export function aigMetadataHeaders(metadata: AigMetadata): Record<string, string> {
  return { "cf-aig-metadata": JSON.stringify(metadata) };
}
