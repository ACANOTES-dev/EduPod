# Stealth Platform Subdomain Runbook

This runbook is the internal operating note for the platform admin subdomain introduced by `docs/features/platform-dashboard/Layer-1/Session-0-stealth-subdomain.md`.

## Access

- Production URL: `https://dua.edupod.app/en/login`
- Local URL: `http://dua.localhost:5551/en/login`
- Local setup: map `dua.localhost` to `127.0.0.1` if your resolver does not already handle `*.localhost`.
- Only platform-tier accounts are accepted on this host. Tenant accounts must receive the same "Invalid email or password" response as bad credentials.

## DNS And Certificate

Cloudflare DNS is managed manually by the operator.

1. Add `dua.edupod.app` as a proxied CNAME or A record pointing to the same origin as `*.edupod.app`.
2. Keep the orange-cloud proxy enabled so the existing Cloudflare protection applies.
3. Confirm HTTPS presents a certificate valid for `dua.edupod.app`. The wildcard origin certificate should cover this host.
4. Confirm the Cloudflare WAF rate limit on `/login` matches the tenant login rate limit target.

## Smoke Checks

Run these after CI deploys the commit and the operator confirms DNS plus HTTPS are live:

```bash
dig dua.edupod.app
curl -I https://dua.edupod.app/
curl -I https://dua.edupod.app/random-path
curl -I https://dua.edupod.app/en/login
curl -I https://nhqs.edupod.app/en/admin
curl -I https://edupod.app/en/admin
```

Expected results:

- `/` and `/random-path` on the stealth host return 404 without auth.
- `/en/login` on the stealth host renders the minimal sign-in form.
- `/en/admin` on tenant hosts returns 404.
- Tenant credentials fail on the stealth host with "Invalid email or password".
- Platform credentials fail on tenant hosts with "Invalid email or password".
- Platform refresh cookies are scoped to `dua.edupod.app`, never `.edupod.app`.

## Troubleshooting

- If `dig` does not resolve, check the Cloudflare DNS record and proxy status.
- If HTTPS fails, inspect the Cloudflare certificate status and the origin certificate SANs.
- If `/en/login` renders tenant branding or navigation, verify the request host reaches Next.js unchanged.
- If tenant users can authenticate on the stealth host, check the API Host or X-Forwarded-Host header reaching NestJS.
- If platform users can authenticate but the dashboard 403s, verify Redis contains the platform user id in `platform_owner_user_ids`.

## Rotation Procedure

If the subdomain becomes public knowledge:

1. Choose a new short non-admin hostname.
2. Add the new proxied Cloudflare DNS record and verify HTTPS.
3. Add the new hostname to the web middleware and API platform-host checks.
4. Deploy through the CI pipeline.
5. Keep `dua.edupod.app` resolving for a 7-day grace period for operator bookmarks.
6. Remove `dua.edupod.app` from Cloudflare DNS after the grace period.
7. Update this runbook and the Session 0 spec with the replacement host and deployment notes.
