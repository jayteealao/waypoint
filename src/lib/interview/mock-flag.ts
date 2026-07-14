/**
 * Parse the interview route's `mock` search param.
 *
 * Kept as a standalone pure function (no heavy imports) so it is unit-testable
 * in isolation — the route module itself transitively imports `cloudflare:workers`
 * and cannot be loaded under the jsdom/node unit runner.
 *
 * MUST be idempotent across the router's parse→stringify round-trip. `?mock=1`
 * parses to the number `1` and validates to the boolean `true`, whose canonical
 * serialized form is `?mock=true`. The router re-parses that canonical URL and
 * re-validates with `mock === true`; if only `1`/`"1"` were accepted, the second
 * pass would drop the flag and the router's canonicalizing redirect would
 * silently strip `?mock` — so the scripted-response seam would never engage and
 * every interview turn would call the live model. Accepting the boolean and
 * `"true"` forms too closes the round-trip.
 */
export function parseMockFlag(raw: unknown): boolean {
  return raw === true || raw === "true" || raw === "1" || raw === 1;
}
