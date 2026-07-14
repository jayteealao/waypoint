// @vitest-environment jsdom
/**
 * LWW-by-`updated_at` reconciliation + optimistic-write rollback (AC-DLU8).
 *
 * `seedStorage` is the seam where the shape's named consistency mechanism lives:
 * "last-write-wins per row keyed by `updated_at`, D1 authoritative on refresh."
 * The rollback half proves the factory's optimistic-write path reverts the
 * collection when the D1 flush handler throws (the shape's mandated mitigation
 * for "optimistic write fails D1 flush").
 */
import { describe, it, expect, beforeEach } from "vitest";
import { defineDomainCollection, seedStorage } from "#/lib/db/collection-factory";
import { storageKey } from "#/lib/db/storage-keys";
import { journeySchema } from "#/lib/db/schemas";
import type { Journey, Waypoint } from "#/db/schema";

const mkJourney = (over: Partial<Journey> = {}): Journey => ({
  id: "j-1",
  user_id: "u-alice",
  title: "v1",
  goal: null,
  status: "active",
  created_at: 1_720_000_000_000,
  updated_at: 100,
  ...over,
});

beforeEach(() => localStorage.clear());

describe("seedStorage — LWW by updated_at", () => {
  const key = storageKey("u-alice", "journeys");
  const getKey = (j: Journey) => j.id;
  const versionOf = (j: Journey) => j.updated_at;

  function read(): Journey[] {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const blob = JSON.parse(raw) as Record<string, { data: Journey }>;
    return Object.values(blob).map((v) => v.data);
  }

  it("keeps the local row when its updated_at is newer than the server seed", () => {
    seedStorage(key, [mkJourney({ title: "local-new", updated_at: 200 })], getKey, versionOf);
    // Server refresh carries an OLDER version → local (200) must win over server (150).
    seedStorage(key, [mkJourney({ title: "server-old", updated_at: 150 })], getKey, versionOf);
    expect(read()[0]?.title).toBe("local-new");
  });

  it("takes the server row when its updated_at is newer (D1 authoritative)", () => {
    seedStorage(key, [mkJourney({ title: "local-old", updated_at: 100 })], getKey, versionOf);
    seedStorage(key, [mkJourney({ title: "server-new", updated_at: 300 })], getKey, versionOf);
    expect(read()[0]?.title).toBe("server-new");
  });

  it("never drops an unflushed local row absent from the server seed", () => {
    seedStorage(key, [mkJourney({ id: "j-local", updated_at: 100 })], getKey, versionOf);
    seedStorage(key, [mkJourney({ id: "j-server", updated_at: 100 })], getKey, versionOf);
    const ids = read()
      .map((j) => j.id)
      .sort();
    expect(ids).toEqual(["j-local", "j-server"]);
  });

  it("server always wins for entities with no version column (versionOf undefined)", () => {
    const wpKey = storageKey("u-alice", "waypoints");
    const wp = (title: string): Waypoint => ({
      id: "w-1",
      journey_id: "j-1",
      position: 0,
      title,
      goal: null,
      concepts: "[]",
    });
    seedStorage(wpKey, [wp("first")], (w) => w.id);
    seedStorage(wpKey, [wp("second")], (w) => w.id);
    const raw = JSON.parse(localStorage.getItem(wpKey) as string) as Record<
      string,
      { data: Waypoint }
    >;
    expect(Object.values(raw)[0]?.data.title).toBe("second");
  });
});

describe("optimistic write rollback on flush failure", () => {
  it("reverts the collection when the D1 flush handler throws", async () => {
    const handle = defineDomainCollection({
      entity: "journeys",
      schema: journeySchema,
      getKey: (j) => j.id,
      versionOf: (j) => j.updated_at,
      handlers: {
        onInsert: async () => {
          throw new Error("simulated D1 flush failure");
        },
      },
    });
    const col = handle.get("u-alice");
    await col.preload();

    const tx = col.insert(mkJourney({ id: "j-opt" }));
    await expect(tx.isPersisted.promise).rejects.toThrow("simulated D1 flush failure");

    // Optimistic row must be rolled back — the collection does not retain it.
    expect(col.has("j-opt")).toBe(false);
    expect(col.size).toBe(0);
  });
});
