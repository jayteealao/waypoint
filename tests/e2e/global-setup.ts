/**
 * Playwright global setup — refuse to run a suite that cannot verify anything.
 *
 * The seeded-session specs sign their own `__Secure-better-auth.session_token` cookies with
 * BETTER_AUTH_SECRET. Without it they used to call `test.skip()` individually, so a run with
 * no secret reported 43 skipped / 10 passed and exit code 0 — a green build that had checked
 * almost nothing. A verification gate that cannot verify must be red, not green, so the
 * absence is a hard failure here instead of a per-spec skip.
 *
 * playwright.config.ts loads `.dev.vars` into process.env before this runs; the message below
 * is what an operator sees when that file is missing or the key is empty.
 */
export default function globalSetup(): void {
  if (process.env.BETTER_AUTH_SECRET) return;

  throw new Error(
    [
      "BETTER_AUTH_SECRET is not set, so every seeded-session spec would skip and the suite",
      "would pass without testing anything. Refusing to run.",
      "",
      "Fix: create `.dev.vars` at the repo root (gitignored) containing at minimum",
      "",
      "  BETTER_AUTH_SECRET=e2e-test-secret-local-only",
      "",
      "It must match the secret the dev server runs with — the same file provides it to both.",
      "Alternatively export BETTER_AUTH_SECRET in the shell before running `pnpm test:e2e`.",
    ].join("\n"),
  );
}
