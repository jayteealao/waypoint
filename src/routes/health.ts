import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { runHealthCheck } from "#/lib/health";

// Public, unauthenticated deep liveness check — the post-publish deploy-gate
// smoke target. Lives OUTSIDE the `_authenticated` tree so the CD smoke can
// reach it with no cookie. 200 {"status":"ok"} when the DB probe and every
// required secret pass; 503 {"status":"degraded"} on any failure. Failing
// component names go to the logs only — the body is deliberately opaque.
export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async () => {
        const { ok } = await runHealthCheck(env);
        return new Response(JSON.stringify({ status: ok ? "ok" : "degraded" }), {
          status: ok ? 200 : 503,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
