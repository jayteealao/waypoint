import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import type { RouterContext } from "./routes/__root";

export function getRouter() {
  const router = createTanStackRouter({
    // Required now that the root context type is concrete: the root beforeLoad
    // overwrites this with the real session on every navigation (incl. SSR).
    context: { auth: null } satisfies RouterContext,
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    // Non-zero preload cache (F7 / AC-DLU4): `preload: 'intent'` no longer
    // refetches loaders on every hover. 30s is coherent with the localStorage
    // collection cache — long enough to make intent-preload cheap, short enough
    // that a returning navigation still re-seeds collections from fresh D1.
    defaultPreloadStaleTime: 30_000,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
