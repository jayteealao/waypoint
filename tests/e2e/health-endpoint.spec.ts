import { test, expect } from '@playwright/test'

// Drives the live `/health` route under `vite dev` (miniflare supplies local D1
// and all 8 `.dev.vars` secrets, so the all-pass path is genuinely reachable).

test('GET /health is publicly reachable and returns opaque 200 ok (AC-HE1, AC-HE4, AC-HE5)', async ({
  request,
}) => {
  // AC-HE5: no auth cookie, and no redirect to /sign-in (route is public, outside
  // the _authenticated tree). maxRedirects: 0 makes a would-be auth bounce fail loudly.
  const res = await request.get('/health', { maxRedirects: 0 })

  // AC-HE1: 200 + Cache-Control: no-store.
  expect(res.status()).toBe(200)
  expect(res.headers()['cache-control']).toBe('no-store')

  // AC-HE1: exact opaque body.
  const body = await res.json()
  expect(body).toEqual({ status: 'ok' })

  // AC-HE4: body discloses exactly one field — no secret name, no subsystem inventory.
  expect(Object.keys(body)).toEqual(['status'])
})
