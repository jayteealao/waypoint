# Runbook: d1-migration-failed

## When this fires

CI logs matching any of the following patterns trigger this runbook:

- `(?i)d1_error`
- `(?i)migration`
- `(?i)sqlite`

## Steps

1. Read the failing migration in migrations/ and the wrangler d1 migrations apply output.
2. Do NOT edit an already-applied migration; author a new forward migration that fixes state (expand-contract).
3. Apply to staging first (wrangler d1 migrations apply DB --env staging --remote), verify, then production.

## Notes

_Seeded from ship plan `recovery-playbooks[d1-migration-failed]`. Update this file as the playbook evolves._
_Last synced from plan version: 2_
