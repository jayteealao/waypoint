import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { createAuth } from "#/lib/auth";

/**
 * Reads the better-auth session from the incoming request cookies.
 *
 * Returns `{ session, user }` when signed in, or `null` when not. Unlike
 * `requireAuth` (which throws 401 for API routes), this is non-throwing so the
 * root route's `beforeLoad` can populate `context.auth` for the `_authenticated`
 * layout guard. Without this the guard's `context.auth` is always undefined and
 * every signed-in user is bounced back to /sign-in.
 */
export const getSession = createServerFn().handler(async () => {
  const auth = createAuth(env);
  const result = await auth.api.getSession({ headers: getRequest().headers });
  return result ?? null;
});
