import { useEffect, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import type { Journey } from "#/db/schema";
import { getJourneysCollection, useJourneys } from "#/lib/store/journeys";
import { JourneyCard } from "./JourneyCard";
import { Compass } from "lucide-react";
import { SAMPLE_JOURNEY_VISITED_KEY } from "#/fixtures/sample-journey";

/** Compass waypoint illustration for the empty state. */
function EmptyIllustration() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Outer ring */}
      <circle cx="40" cy="40" r="36" stroke="var(--border)" strokeWidth="2" />
      {/* Inner ring */}
      <circle
        cx="40"
        cy="40"
        r="24"
        stroke="var(--ember-subtle)"
        strokeWidth="1.5"
        fill="var(--ember-subtle)"
      />
      {/* Compass needle — ember pointing up */}
      <polygon points="40,18 43,38 40,36 37,38" fill="var(--ember)" />
      {/* Compass needle — ink pointing down */}
      <polygon points="40,62 43,42 40,44 37,42" fill="var(--ink-faint)" />
      {/* Centre dot */}
      <circle cx="40" cy="40" r="3" fill="var(--ink)" />
    </svg>
  );
}

/** Empty state — shown when the signed-in user has no journeys yet. */
function EmptyState() {
  return (
    <div className="wp-empty-state" data-testid="empty-state">
      <EmptyIllustration />

      <div>
        <h2 className="display-title m-0 text-xl font-bold text-[var(--ink)]">
          Your first journey starts here
        </h2>
        <p className="mt-2 m-0 text-sm text-[var(--ink-muted)] leading-6">
          A journey is a learning goal you work through step by step. Waypoint guides you with
          AI-generated lessons, spaced-review, and a roadmap that adapts as you grow.
        </p>
      </div>

      <Link
        to="/journey/new"
        className="btn-base btn-primary btn-md inline-flex items-center gap-2"
        data-testid="create-journey-cta"
      >
        <Compass size={16} aria-hidden="true" />
        Start a journey
      </Link>
    </div>
  );
}

export interface JourneysDashboardProps {
  /** Journeys from the route loader (D1). Seeds the collection and is the SSR /
   *  first-paint render source so hydration matches the server exactly. */
  journeys: Journey[];
  /** Per-journey mastery percentages (0–100) from the route loader. */
  masteryByJourneyId?: Record<string, number>;
  /** Signed-in user id — namespaces the client collection (AC-DLU7). */
  userId: string;
}

/** Presentational shell — pure render of a journeys list, no data-layer hooks.
 *  Safe to render on the server (no `useLiveQuery`/`useSyncExternalStore`). */
function DashboardView({
  journeys,
  masteryByJourneyId,
}: {
  journeys: Journey[];
  masteryByJourneyId: Record<string, number>;
}) {
  return (
    <section
      className="wp-dashboard"
      data-testid="journeys-dashboard"
      aria-label="Your learning journeys"
    >
      <header className="mb-6">
        <h1 className="display-title m-0 text-2xl font-bold text-[var(--ink)]">Journeys</h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Pick up where you left off, or start something new.
        </p>
      </header>

      {journeys.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="wp-journey-grid">
          {journeys.map((journey) => (
            <JourneyCard
              key={journey.id}
              journey={journey}
              masteryPct={masteryByJourneyId[journey.id] ?? 0}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Client-only reactive view. Mounts ONLY after hydration, so `useJourneys`
 * (→ `useLiveQuery` → `useSyncExternalStore`, which has no server snapshot) never
 * runs during SSR — the source of the "Missing getServerSnapshot / reverted to
 * client rendering" SSR error this component previously produced (AC-DLU6).
 */
function LiveJourneysDashboard({
  seed,
  masteryByJourneyId,
  userId,
}: {
  seed: Journey[];
  masteryByJourneyId: Record<string, number>;
  userId: string;
}) {
  const navigate = useNavigate();

  const collection = getJourneysCollection(userId, seed);
  const live = useJourneys(collection);

  // Prefer the reactive collection once it is ready; the seed until then keeps
  // this first (post-hydration) render identical to the server markup.
  const journeys: Journey[] = collection.isReady()
    ? [...live.data].sort((a, b) => b.created_at - a.created_at)
    : seed;

  // First-login redirect: new users with no journeys land in the sample journey.
  // Returning users who already visited the sample stay on the dashboard.
  useEffect(() => {
    if (journeys.length !== 0) return;
    if (typeof localStorage === "undefined") return;
    if (localStorage.getItem(SAMPLE_JOURNEY_VISITED_KEY) === "true") return;
    void navigate({ to: "/sample" });
  }, [journeys.length, navigate]);

  return <DashboardView journeys={journeys} masteryByJourneyId={masteryByJourneyId} />;
}

/**
 * Journeys dashboard — the returning learner's "where was I?" surface.
 *
 * SSR / hydration (AC-DLU6): the server (and the first client paint, before the
 * mount effect flips `hydrated`) renders the loader `journeys` prop through
 * `DashboardView`, which touches no data-layer hook — so SSR produces real
 * dashboard HTML with no `getServerSnapshot` error and hydration is
 * byte-identical. Only after mount does the client-only `LiveJourneysDashboard`
 * take over the seeded, reactive collection read (F3 readiness via
 * `collection.isReady()`, no `requestAnimationFrame` proxy, no `as any`).
 */
export function JourneysDashboard({
  journeys: seed,
  masteryByJourneyId = {},
  userId,
}: JourneysDashboardProps) {
  // Render loader data until hydrated so SSR and first client paint agree, and
  // so the reactive collection hook stays off the server render path entirely.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return <DashboardView journeys={seed} masteryByJourneyId={masteryByJourneyId} />;
  }

  return (
    <LiveJourneysDashboard seed={seed} masteryByJourneyId={masteryByJourneyId} userId={userId} />
  );
}
