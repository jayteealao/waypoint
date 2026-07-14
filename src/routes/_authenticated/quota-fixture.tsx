/**
 * Dev/test fixture route: /_authenticated/quota-fixture
 *
 * Renders the quota-exhausted card (QuotaCard) when the seeded user's daily
 * allowance is exhausted, or a "quota available" confirmation with remaining
 * budget when it is not.
 *
 * This route is intentionally behind the `_authenticated` layout so the
 * seeded-session helper pattern (same as lesson/fixture, auth-flow, and
 * design-system tests) covers the Playwright AC verifications.
 *
 * Seeded fixture: the E2E helper inserts a usage_events row with cost_usd
 * exceeding DAILY_LIMIT_USD for the test user. After the test run the row is
 * cleaned up by the seeding helper's teardown.
 *
 * Not exposed in the Sidebar nav — for dev and E2E use only.
 */

import { createFileRoute } from "@tanstack/react-router";
import { getQuotaStatus } from "#/server/ai";
import QuotaCard from "#/components/quota/QuotaCard";
import type { QuotaStatus } from "#/lib/ai/quota";

export const Route = createFileRoute("/_authenticated/quota-fixture")({
  loader: async () => {
    // Call the server function; the middleware handles auth.
    const raw = await getQuotaStatus();
    // Deserialize resetAt string back to Date for the component.
    return {
      ...raw,
      resetAt: new Date(raw.resetAt),
    } satisfies QuotaStatus;
  },
  head: () => ({
    meta: [{ title: "Waypoint — Quota Fixture" }],
  }),
  component: QuotaFixturePage,
});

function QuotaFixturePage() {
  const status = Route.useLoaderData();

  if (!status.allowed) {
    return (
      <div data-testid="quota-fixture-page" style={{ padding: "2rem" }}>
        <QuotaCard status={status} />
      </div>
    );
  }

  const remaining = status.limit - status.used;
  return (
    <div data-testid="quota-fixture-page" style={{ padding: "2rem" }}>
      <p data-testid="quota-ok">Quota available: ${remaining.toFixed(4)} remaining</p>
    </div>
  );
}
