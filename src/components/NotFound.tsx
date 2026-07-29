/**
 * Unknown-route surface — wired as the router's `defaultNotFoundComponent`.
 *
 * Without it TanStack Router falls through to its built-in `DefaultGlobalNotFound`, which
 * renders a bare `Not Found` with no page chrome and no way back into the app. The status
 * code was already correct; the experience was a dead end.
 *
 * Layout follows the public `/about` page (paper background, page-wrap, card) and reuses the
 * dashboard's `wp-empty-state` vocabulary, so this introduces no new visual language.
 *
 * Verification seam: data-testid="not-found".
 */

import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";

export function NotFound() {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the heading on mount so keyboard/screen-reader users get a
  // perceivable signal that the navigation landed on a 404, not silence.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main
      className="min-h-screen bg-[var(--paper)] px-4 py-8"
      style={{ color: "var(--ink)" }}
      data-testid="not-found"
    >
      <div className="page-wrap">
        <section className="wp-card p-6 sm:p-8">
          <div className="wp-empty-state">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--ember)]">
                404
              </p>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="display-title m-0 text-2xl font-bold text-[var(--ink)]"
              >
                This page isn&rsquo;t on the map
              </h1>
              <p className="mt-2 m-0 text-sm leading-6 text-[var(--ink-muted)]">
                The link may be out of date, or the address may have a typo. Your journeys are all
                still where you left them.
              </p>
            </div>

            <Link
              to="/"
              className="btn-base btn-primary btn-md inline-flex items-center gap-2"
              data-testid="not-found-home-link"
            >
              Back to your journeys
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
