// @vitest-environment jsdom
/**
 * Factory + persistence tests for the unified TanStack DB data layer.
 *
 * jsdom supplies `window` + `localStorage`, so these exercise the CLIENT path of
 * `defineDomainCollection`: schema typing (AC-DLU2), per-user namespaced
 * persistence (AC-DLU7), the loader seed populating the collection, and the
 * localStorage-quota fallback (shape edge case). The SSR in-memory fallback is
 * covered in the sibling node-env spec.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { defineDomainCollection, seedStorage } from "#/lib/db/collection-factory";
import { storageKey, purgeUserCache } from "#/lib/db/storage-keys";
import { journeySchema } from "#/lib/db/schemas";
import type { Journey } from "#/db/schema";

const mkJourney = (over: Partial<Journey> = {}): Journey => ({
  id: "j-1",
  user_id: "u-alice",
  title: "JS Fundamentals",
  goal: null,
  status: "active",
  created_at: 1_720_000_000_000,
  updated_at: 1_720_000_000_000,
  ...over,
});

function makeHandle() {
  return defineDomainCollection({
    entity: "journeys",
    schema: journeySchema,
    getKey: (j) => j.id,
    versionOf: (j) => j.updated_at,
  });
}

beforeEach(() => {
  localStorage.clear();
});

describe("defineDomainCollection — client path", () => {
  it("seeds the collection from a loader payload and reads it back schema-typed", async () => {
    const handle = makeHandle();
    const rows = [mkJourney({ id: "j-1" }), mkJourney({ id: "j-2", title: "React" })];

    const col = handle.get("u-alice", rows);
    await col.preload();

    expect(col.size).toBe(2);
    expect(col.has("j-1")).toBe(true);
    // Schema-typed: `.get` returns a Journey with no cast.
    const j: Journey | undefined = col.get("j-2");
    expect(j?.title).toBe("React");
  });

  it("namespaces persistence per user (wp:<userId>:<entity>) — no cross-user bleed", async () => {
    const handle = makeHandle();
    handle.get("u-alice", [mkJourney({ id: "j-a", user_id: "u-alice" })]);

    // Alice's key exists; Bob's does not.
    expect(localStorage.getItem(storageKey("u-alice", "journeys"))).not.toBeNull();
    expect(localStorage.getItem(storageKey("u-bob", "journeys"))).toBeNull();

    // Bob's collection (no seed) is empty even though Alice's is persisted.
    const bob = handle.get("u-bob");
    await bob.preload();
    expect(bob.size).toBe(0);
  });

  it("purgeUserCache removes every wp:* key (AC-DLU7 sign-out purge)", () => {
    const handle = makeHandle();
    handle.get("u-alice", [mkJourney()]);
    localStorage.setItem("theme", "dark"); // a non-cache key must survive

    purgeUserCache();

    expect(localStorage.getItem(storageKey("u-alice", "journeys"))).toBeNull();
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("degrades to a session-only cache when localStorage.setItem throws (quota)", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    // seedStorage must swallow the quota error, not propagate it.
    expect(() =>
      seedStorage(storageKey("u-alice", "journeys"), [mkJourney()], (j) => j.id),
    ).not.toThrow();
    spy.mockRestore();
  });
});
