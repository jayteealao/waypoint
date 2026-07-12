# Runbook: deploy-size-limit

## When this fires

CI logs matching any of the following patterns trigger this runbook:

- `(?i)exceeds.*(size|limit)`
- `(?i)script.*too large`
- `(?i)worker.*exceeded`

## Steps

1. Inspect the bundle (wrangler deploy --dry-run --outdir dist) and identify large deps.
2. Trim or lazy-load; verify the Worker stays under the Cloudflare size limit.

## Notes

_Seeded from ship plan `recovery-playbooks[deploy-size-limit]`. Update this file as the playbook evolves._
_Last synced from plan version: 2_
