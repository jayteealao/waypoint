import { defineConfig, devices } from "@playwright/test";

// Load the project's runtime secrets into the test runner's own environment.
//
// `.dev.vars` is what @cloudflare/vite-plugin feeds the Worker; nothing fed it to
// Playwright, so every seeded-session spec found BETTER_AUTH_SECRET absent and skipped
// itself while the suite still exited zero. `process.loadEnvFile` is Node stdlib (>= 20.12;
// this repo and CI both pin 22), so no dependency is added to read one file.
//
// The catch is deliberately silent: a missing file is not this config's error to report.
// tests/e2e/global-setup.ts owns the loud failure, so the two never fight over the message.
try {
  process.loadEnvFile(".dev.vars");
} catch {
  // No .dev.vars — global setup reports it.
}

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
const devPort = new URL(baseURL).port || "3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Local D1 (SQLite file) cannot handle concurrent wrangler CLI writes from
  // multiple spec files. Run with 1 worker to avoid SQLITE_BUSY errors from
  // parallel beforeAll seeds. Increase if D1 contention is resolved.
  workers: 1,
  reporter: "html",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm vite dev --port ${devPort}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
