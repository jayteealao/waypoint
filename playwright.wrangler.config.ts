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
    // @cloudflare/vite-plugin projects require a Vite build before wrangler dev
    // can serve the worker entry. The build outputs dist/server/wrangler.json with
    // main: "index.js". reuseExistingServer allows pre-starting manually in dev.
    command: 'pnpm build && pnpm exec wrangler dev --config dist/server/wrangler.json --port 8787',
    url: 'http://localhost:8787',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
})
