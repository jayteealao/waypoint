/**
 * Unit coverage for the interview route's `?mock` search-param parsing.
 *
 * Regression guard for the AC-TI1 defect: the original validator accepted only
 * `1`/`"1"`, but the router canonicalizes `?mock=1` to the boolean `?mock=true`
 * and re-validates it. The boolean form was rejected, so the canonicalizing
 * redirect stripped the flag and the scripted mock seam never engaged — every
 * interview turn silently called the live model. `parseMockFlag` must be
 * idempotent across the parse→stringify round-trip.
 */
import { describe, it, expect } from "vitest";
import { parseMockFlag } from "#/lib/interview/mock-flag";

describe("parseMockFlag", () => {
  it("accepts the raw URL query form (?mock=1 → number 1)", () => {
    expect(parseMockFlag(1)).toBe(true);
    expect(parseMockFlag("1")).toBe(true);
  });

  it("accepts the canonical serialized form the router round-trips to (?mock=true)", () => {
    // This is the case the original validator missed. The router serializes the
    // boolean `true` (validator output) back to `?mock=true`, then re-parses and
    // re-validates it; rejecting it here is what stripped the flag.
    expect(parseMockFlag(true)).toBe(true);
    expect(parseMockFlag("true")).toBe(true);
  });

  it("is idempotent across the parse→validate→stringify→parse round-trip", () => {
    // Model the router's loop: input `1` validates to `true`; the canonical
    // `true` must also validate to `true` (a stable fixed point), otherwise the
    // param is dropped on the second pass.
    const firstPass = parseMockFlag(1); // ?mock=1
    expect(firstPass).toBe(true);
    const canonical = firstPass; // stringified back as ?mock=true → boolean true
    expect(parseMockFlag(canonical)).toBe(true);
  });

  it("rejects absent, falsey, and unrelated values", () => {
    expect(parseMockFlag(undefined)).toBe(false);
    expect(parseMockFlag(null)).toBe(false);
    expect(parseMockFlag(false)).toBe(false);
    expect(parseMockFlag(0)).toBe(false);
    expect(parseMockFlag("0")).toBe(false);
    expect(parseMockFlag("false")).toBe(false);
    expect(parseMockFlag("yes")).toBe(false);
  });
});
