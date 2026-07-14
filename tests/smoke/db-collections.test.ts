// @vitest-environment node
// TanStack DB collection smoke tests run in Node; no Workers runtime needed.
// Tests the syncer-pattern contract (AC-ADL4) by creating a collection with
// a mock server function syncer and verifying the reactive data is available.

import { describe, it, expect, vi } from "vitest";
import { createCollection } from "@tanstack/db";
import type { Journey } from "#/db/schema";

const FIXTURE_JOURNEYS: Journey[] = [
  {
    id: "j-001",
    user_id: "u-alice",
    title: "JavaScript Fundamentals",
    goal: "Master ES2024",
    status: "active",
    created_at: 1_720_000_000_000,
    updated_at: 1_720_000_000_000,
  },
  {
    id: "j-002",
    user_id: "u-alice",
    title: "React Patterns",
    goal: null,
    status: "active",
    created_at: 1_720_100_000_000,
    updated_at: 1_720_100_000_000,
  },
];

describe("TanStack DB journey collection — server-function syncer (AC-ADL4)", () => {
  it("collection returns two fixture rows after the first sync", async () => {
    const mockListJourneys = vi.fn().mockResolvedValue(FIXTURE_JOURNEYS);

    const col = createCollection<Journey, string>({
      id: "test-journeys-ac-adl4",
      getKey: (j) => j.id,
      sync: {
        // TanStack DB@0.6.14: sync fn must return void (not Promise<void>).
        // Async work is launched fire-and-forget; markReady() signals completion.
        sync: ({ begin, write, commit, markReady }) => {
          void mockListJourneys().then((journeys: Journey[]) => {
            begin();
            for (const journey of journeys) {
              write({ type: "insert", value: journey });
            }
            commit();
            markReady();
          });
        },
      },
    });

    // preload() starts sync and resolves once markReady() is called.
    await col.preload();

    expect(mockListJourneys).toHaveBeenCalledOnce();
    expect(col.state.size).toBe(2);
    expect(col.state.has("j-001")).toBe(true);
    expect(col.state.has("j-002")).toBe(true);
    expect(col.state.get("j-001")?.title).toBe("JavaScript Fundamentals");
  });

  it("collection is empty before the first sync", () => {
    const col = createCollection<Journey, string>({
      id: "test-journeys-empty",
      getKey: (j) => j.id,
      sync: {
        // Never resolves in this test — we check state before sync completes.
        sync: () => {
          // intentionally blocking
        },
      },
    });

    expect(col.state.size).toBe(0);
  });
});
