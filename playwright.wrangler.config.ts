import { defineConfig, devices } from '@playwright/test'

// Playwright config for proof tests that must run under wrangler dev (workerd runtime).
// Uses port 8787 (wrangler default) to isolate from the Vite dev server (port 3000).
// See playwright.config.ts for the pnpm-dev-based test suite.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/*.wrangler.spec.ts'],
  fullyParallel: false, // wrangler dev is a single process; run proofs sequentially
  forbidOnly: !!process.env['CI'],
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8787',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium-wrangler',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm exec wrangler dev --port 8787',
    url: 'http://localhost:8787',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
})
