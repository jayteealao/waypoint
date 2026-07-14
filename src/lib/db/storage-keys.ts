/**
 * Per-user localStorage namespace for TanStack DB collections + sign-out purge.
 *
 * Every collection persists under `wp:<userId>:<entity>`, so user A's cached
 * rows are physically separate from user B's on a shared browser. Sign-out
 * purges every `wp:*` key, so account-switch on the same browser never leaks
 * A's rows into B's surfaces (privacy floor NFR — AC-DLU7, shape D4).
 *
 * Rungs 1–3 (stdlib / native / library reuse) do not cover a per-user privacy
 * boundary over a single shared `localStorage`, so this is minimal new code.
 */

/** Entities that get a client-read collection (usage_events is server-only). */
export type CollectionEntity =
  | "journeys"
  | "waypoints"
  | "lessons"
  | "quiz-questions"
  | "quiz-attempts"
  | "concepts"
  | "fsrs-cards"
  | "adaptations";

/** Shared prefix for every Waypoint client-cache localStorage key. */
export const CACHE_PREFIX = "wp:";

/** Build the namespaced storage key for a user's entity collection. */
export function storageKey(userId: string, entity: CollectionEntity): string {
  return `${CACHE_PREFIX}${userId}:${entity}`;
}

/**
 * Remove every Waypoint client-cache key (`wp:*`) from localStorage. Called on
 * sign-out before the redirect so the next user on this browser starts clean.
 * No-op when localStorage is unavailable (SSR / disabled storage).
 */
export function purgeUserCache(): void {
  if (typeof localStorage === "undefined") return;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null && key.startsWith(CACHE_PREFIX)) {
      toRemove.push(key);
    }
  }
  for (const key of toRemove) {
    localStorage.removeItem(key);
  }
}
