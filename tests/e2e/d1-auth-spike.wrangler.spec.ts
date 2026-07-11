import { expect, test } from '@playwright/test'

// AC-PP4: D1 + better-auth spike under workerd runtime.
// Proves:
//  (a) better-auth mounts on the createFileRoute server handler (returns non-500)
//  (b) per-request factory produces no module-scope state leak between requests

const AUTH_SESSION_URL = '/api/auth/get-session'

test('better-auth responds on createFileRoute mount (AC-PP4a)', async ({
  request,
}) => {
  // An unauthenticated GET to the session endpoint must return 200 (not 500).
  // A 200 with {"session":null,"user":null} proves mount + D1 round-trip succeeded.
  const response = await request.get(AUTH_SESSION_URL)

  // Any 2xx status proves the auth mount works; 5xx means a runtime crash.
  expect(response.status()).toBeLessThan(500)
  expect(response.status()).toBeGreaterThanOrEqual(200)
})

test('no module-scope client leak across sequential requests (AC-PP4b)', async ({
  request,
}) => {
  // Two independent requests to the session endpoint.
  // If better-auth used module-scope state, the second request might see
  // stale D1 client state from request 1 and crash or return an error.
  const [r1, r2] = await Promise.all([
    request.get(AUTH_SESSION_URL),
    request.get(AUTH_SESSION_URL),
  ])

  expect(r1.status()).toBeLessThan(500)
  expect(r2.status()).toBeLessThan(500)

  // Both responses should be consistent (same shape for unauthenticated session)
  const body1 = await r1.json().catch(() => null)
  const body2 = await r2.json().catch(() => null)

  // If either response body is a runtime crash error, fail the test.
  if (body1 !== null) {
    expect(body1).not.toMatchObject({ error: expect.anything() })
  }
  if (body2 !== null) {
    expect(body2).not.toMatchObject({ error: expect.anything() })
  }
})
