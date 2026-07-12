# Runbook: cloudflare-token-401

## When this fires

CI logs matching any of the following patterns trigger this runbook:

- `(?i)authentication error`
- `(?i)unauthorized`
- `code: ?10000`

## Steps

1. Confirm CLOUDFLARE_API_TOKEN has Workers:Edit + D1:Edit scopes and is not expired.
2. Rotate the token in the Cloudflare dashboard and update the GitHub Actions secret.
3. Re-run the deploy job.

## Notes

_Seeded from ship plan `recovery-playbooks[cloudflare-token-401]`. Update this file as the playbook evolves._
_Last synced from plan version: 2_
