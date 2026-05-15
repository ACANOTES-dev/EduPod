# Session 0 — Stealth Subdomain (`dua.edupod.app`)

**Session:** 0 (prerequisite for all Layer 1/2/3 work)
**Layer:** 1 (Operational Foundation) — runs before 1A
**Dependencies:** none — pure infrastructure
**Estimated effort:** Single session
**Builds on:** §1 + new §3.12 of `docs/superpowers/specs/2026-04-01-platform-admin-dashboard-design.md`

---

## 1. Objective

Move the platform admin console from `edupod.app/[locale]/admin/*` (which any visitor can navigate to and see a login form) to a dedicated stealth subdomain `dua.edupod.app`. After this ships:

- The operator visits `dua.edupod.app` and gets either the dashboard (if authenticated as `platform_owner` / `platform_support`) or a plain 404 (if not).
- The login form at `dua.edupod.app/login` accepts ONLY platform-tier credentials (rejects tenant users even with valid passwords).
- Every other path on `dua.edupod.app` returns 404 — indistinguishable from a non-existent host. No nav, no marketing, no robots.txt clues.
- Tenant subdomains (`edupod.app`, `nhqs.edupod.app`, etc.) return 404 for `/admin/*` paths going forward — the old access route is retired.
- JWT cookies are domain-locked to `dua.edupod.app` so platform sessions don't bleed into tenant tabs and vice versa.

The subdomain "dua" is operator-chosen (delta–umbrella–alpha) — short, memorable across devices, doesn't appear in any "/admin /panel /console /dashboard" wordlist that automated bots scan.

---

## 2. Critical safety constraints

- **The login form at `dua.edupod.app/login` is the ONE public endpoint.** Everything else is 404. This includes `/`, `/_next/...` for assets if not authenticated (the page that 404s should reference its own assets via the same 404-by-default rules — Next.js handles this if we use a custom 404 component that doesn't load the full app shell).
- **Login MUST reject non-platform users at this subdomain.** Even if a tenant `school_owner` tries `dua.edupod.app/login` with valid credentials, response is 403 (or 404 — see decision below) regardless. Backend gate, not frontend gate.
- **JWT cookie scope is `dua.edupod.app` only.** Setting `Domain=.edupod.app` would let the platform JWT bleed into tenant tabs (security smell + confusing UX). Use the explicit subdomain.
- **No HTTP→HTTPS redirect for `dua.edupod.app` at port 80.** A 301 redirect on port 80 confirms the host exists. Either drop port 80 entirely (Cloudflare upgrades automatically) OR return 444 (close connection) to mirror the existing `00-default-reject` pattern. Pick whichever fits the existing nginx posture.
- **404 latency must match a real 404.** Don't do an auth check that takes 80ms then return 404 — scanners can use timing differences to detect "this is actually a guarded page." Either short-circuit at the middleware before any DB/Redis call, or run a no-op delay so unauth and missing-route both return in the same time band.
- **Cloudflare WAF rate limit on `/login`** at this subdomain. 5 attempts per 15 min per IP (or whatever the existing tenant-side login rate is — match it). Brute-force lockout at the auth service layer also applies.
- **DO NOT expose `dua.edupod.app` in any sitemap, robots.txt, marketing copy, public docs, or repo README.** It stays in `Module Gating/admin-console-handoff.md`, the operations runbook, and team-internal docs only.

### Decision: 403 vs 404 for non-platform user login attempts

Two reasonable answers:

- **403 Forbidden**: tells the (already-authenticated-elsewhere) tenant user "you have credentials but not the right role." Honest UX; small information leak (confirms they have an account).
- **404 / "Invalid email or password"**: identical to wrong-credentials response. No information leak. Less honest.

**Recommendation: 404 / "Invalid email or password."** The user knowing they're "not a platform user" provides them no value (they shouldn't be at this URL). Information minimisation wins.

---

## 3. Infrastructure

### 3.1 DNS (Cloudflare)

Add `dua.edupod.app` as a CNAME (or A record) pointing at the same Cloudflare origin entry as `*.edupod.app`. Proxy: orange cloud (proxied) so the existing CF WAF + DDoS + IP allowlist apply.

**Wildcard cert**: the existing `edupod-origin.pem` should already cover `*.edupod.app`. Verify by inspecting the cert SANs; if not, add `dua.edupod.app` explicitly.

### 3.2 nginx (production server)

The existing `*.edupod.app` server block at `/etc/nginx/sites-enabled/edupod` already proxies any `*.edupod.app` Host through to ports 5551 (web) and 3001 (api). No nginx config change is strictly required for the routing — the host header reaches Next.js and Nest, which decide what to render.

**Optional hardening (recommended)**: add a dedicated server block `if ($host = "dua.edupod.app")` with stricter rate limits on `/login` and reduced `client_max_body_size`. Run a CF challenge on suspicious user-agents (do this in Cloudflare WAF rules, not nginx).

### 3.3 Next.js middleware (`apps/web/src/middleware.ts`)

Add host-based routing:

```typescript
const PLATFORM_HOST = 'dua.edupod.app';
const PLATFORM_HOST_DEV = 'dua.localhost'; // for local dev

export async function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  const isPlatformHost = host === PLATFORM_HOST || host === PLATFORM_HOST_DEV;
  const path = req.nextUrl.pathname;

  // Path A: dua subdomain.
  if (isPlatformHost) {
    // Only render (platform)/* routes here. Everything else: 404.
    // The existing [locale] path prefix still applies.
    const isPlatformRoute =
      /^\/[a-z]{2}\/(?:admin|login|disabled)(?:\/|$)/.test(path) || path === '/';

    if (!isPlatformRoute) {
      return new NextResponse(null, { status: 404 });
    }

    // Bare `/` redirects to `/en/login` if no session, `/en/admin` if session present.
    // Auth check runs at the page-level (admin layout) — middleware just routes.
    return NextResponse.next();
  }

  // Path B: tenant subdomains and root.
  // Block /admin/* on these — admin moved.
  if (/^\/[a-z]{2}\/admin(?:\/|$)/.test(path)) {
    return new NextResponse(null, { status: 404 });
  }

  // Otherwise: continue with the existing tenant middleware chain
  // (locale routing, tenant resolution, etc.).
  return existingTenantMiddleware(req);
}
```

The exact integration point depends on the current middleware structure (which already handles locale + Tier 2 route guard per the i18n work). Slot the host check at the **top** so it runs before locale/tier logic.

### 3.4 Backend auth (`apps/api/src/modules/auth/`)

Modify `AuthService.login` (or wherever credentials are verified):

1. Accept a new optional input `originHost: string` from the controller (read from `Host` header).
2. After password verification + user lookup:
   - If `originHost === 'dua.edupod.app'` AND user is NOT in `platform_users`: return the same `Invalid email or password` error as wrong-credentials.
   - If `originHost !== 'dua.edupod.app'` AND user IS in `platform_users` (and only platform_users): return the same wrong-credentials error.
   - Otherwise (tenant user on tenant host, or platform user on platform host): proceed.
3. JWT cookie: `Set-Cookie: refresh_token=...; Domain=dua.edupod.app; Secure; HttpOnly; SameSite=Strict` for platform sessions; existing per-tenant scoping for tenant sessions.

This makes credential reuse across host boundaries impossible without complete account-takeover at the role table level (which is a separate, harder attack surface).

### 3.5 Frontend (Next.js)

Two pages affected:

- **`apps/web/src/app/[locale]/(platform)/admin/page.tsx`** (and the layout) — already exists. Add a session-check at the top of the layout: if not authenticated as `platform_owner`/`platform_support`, return Next.js `notFound()` (renders the 404 page). Do NOT redirect to `/login` — that confirms the page exists.
- **`apps/web/src/app/[locale]/(platform)/login/page.tsx`** (new file) — minimal login form. No branding hint that this is "platform admin"; just an email/password form titled "Sign in." After successful login, redirect to `/[locale]/admin`.

The existing 404 page (`apps/web/src/app/[locale]/not-found.tsx` if present, or the default Next.js 404) is reused — no special "this page is hidden" copy.

---

## 4. Files to create / modify

### Create

- **`docs/runbooks/dua-stealth-subdomain.md`** — operations runbook: how to access, troubleshooting, what to do if the subdomain becomes public knowledge (rotation procedure: set up `<new-name>.edupod.app`, drop `dua` after grace period).
- **`apps/web/src/app/[locale]/(platform)/login/page.tsx`** — minimal login page (or move existing if it lives elsewhere).
- **`apps/web/src/app/[locale]/(platform)/login/_components/login-form.tsx`** — shadcn-styled email/password form.
- **`apps/web/src/__tests__/middleware/stealth-subdomain.spec.ts`** — middleware unit tests for host-based routing.
- **`apps/web/e2e/stealth-subdomain.spec.ts`** — Playwright e2e: requests to `dua.edupod.app/<random>` return 404; `/login` shows form; `/admin` returns 404 without session, dashboard with valid platform session.

### Modify

- **`apps/web/src/middleware.ts`** — add host-based routing per §3.3.
- **`apps/api/src/modules/auth/auth.service.ts`** — add the originHost check per §3.4.
- **`apps/api/src/modules/auth/auth.controller.ts`** — pass `Host` header into `AuthService.login`.
- **`apps/web/src/app/[locale]/(platform)/admin/layout.tsx`** — return `notFound()` when session role is not platform-tier.
- **`apps/web/src/lib/api/auth-client.ts`** (or wherever cookie domain is set) — explicit `Domain=dua.edupod.app` for platform sessions.

### NOT modified by this session

- Existing tenant-side auth flow at `edupod.app/login`, `nhqs.edupod.app/login`, etc. — untouched.
- The `(platform)/admin/*` page tree — untouched (just needs the layout-level session check).
- nginx config — works as-is via the `*.edupod.app` wildcard. Optional dedicated server block can land in a follow-up if rate-limiting tuning is needed.
- Cloudflare config beyond DNS — done via the Cloudflare dashboard, not committed code.

---

## 5. Acceptance

- [x] DNS: `dig dua.edupod.app` resolves; HTTPS works (cert valid).
- [x] `https://dua.edupod.app/` (no auth) → 404.
- [x] `https://dua.edupod.app/random-path` → 404.
- [x] `https://dua.edupod.app/en/login` → renders the login form. No external nav, no marketing.
- [x] Login as a tenant `school_owner` at `dua.edupod.app/login` → fails with "Invalid email or password" (NOT 403, NOT a "you don't have permission" message).
- [x] Login as a `platform_owner` at `dua.edupod.app/login` → succeeds, redirects to `/en/admin`, dashboard renders.
- [x] Login as a `platform_owner` at `nhqs.edupod.app/login` → fails with "Invalid email or password" (platform credentials don't work on tenant hosts).
- [x] After platform login: cookie inspector shows `Domain=dua.edupod.app` on the JWT/refresh cookies (NOT `.edupod.app`).
- [x] Open a tenant tab (`nhqs.edupod.app`) and a platform tab (`dua.edupod.app`) simultaneously: cookies don't bleed; logout in one doesn't affect the other.
- [x] `https://nhqs.edupod.app/en/admin` → 404. The old access route is retired.
- [x] `https://edupod.app/en/admin` → 404. Same.
- [x] Cloudflare WAF rate limit visible: 6th login attempt within 15 min from one IP → 429.
- [x] No mention of `dua.edupod.app` in `robots.txt`, `sitemap.xml`, public marketing pages, or repo README.
- [x] e2e + middleware unit tests pass.
- [x] Operations runbook (`docs/runbooks/dua-stealth-subdomain.md`) committed with: access instructions, the rotation procedure, and a note pointing at this spec.

---

## 6. Out of scope

- **Subdomain renaming / rotation** if `dua.edupod.app` becomes known. The runbook documents the procedure (add a new stealth subdomain, leave `dua` resolving for 7 days as grace, drop). Actual renaming is a future task.
- **IP allowlisting**. The operator (Ram) travels and works from variable networks; pinning to a list of trusted IPs would be too brittle. WAF rate limit + MFA + auth lockout are the security layers.
- **WebAuthn / passkey-only login**. Future hardening; out of scope. MFA via TOTP per the existing platform_owner config is sufficient for V1.
- **Audit logs for failed login attempts at `dua.edupod.app`** specifically. The existing `audit_logs.action = 'auth.login_failed'` covers this; no new schema needed.
- **Cloudflare bot management or paid-tier WAF rules**. Out of scope until evidence shows automated traffic is hitting the subdomain.
- **`platform_support` role provisioning workflow** (invites, role assignment UI). That's Layer 3 Session 3D; this session only ensures the login + routing works for users that already exist.

---

## 7. Notes

- **Why "dua"** (operator's choice): three letters (delta–umbrella–alpha), memorable cross-device, doesn't appear in any standard admin-path wordlist. The user wanted a short metaphor / personal handle that isn't "admin/console/panel/dashboard." If a future operator finds it too cryptic, the rotation procedure in the runbook documents how to swap to a different short name without losing access continuity.
- **Why not just no subdomain at all** (Option B from the brainstorm — log in via the main app, get redirected by role): it's slightly more secure (zero discoverability) but creates a confusing UX where the same login form serves wildly different audiences. The stealth subdomain approach gives the operator a clean separate browser-bookmark + window grouping while keeping discoverability low.
- **Interaction with the i18n Tier 2 guard (DZ-i18n-1)**: the platform admin shell is English-only (per the existing `(platform)` route group convention). The Tier 2 guard's redirect logic operates on tenant-side routes; it shouldn't fire on `dua.edupod.app` because that host is excluded from tenant resolution. Verify during implementation by visiting `dua.edupod.app/it/admin` — should 404, not redirect.
- **Local development**: contributors will need `dua.localhost` mapped to `127.0.0.1` in their `/etc/hosts`. Add a one-line setup note to the repo README's local-dev section. The Next.js middleware honours both `dua.edupod.app` (production) and `dua.localhost` (dev).

## 8. Commits / CI / Notes

- `d4bd4b30` — `feat(platform): add stealth admin subdomain gate`
  - CI: https://github.com/ACANOTES-dev/EduPod/actions/runs/25929084265
- `e3eb8a20` — `fix(auth): expose platform refresh cookie to stealth host`
  - CI: https://github.com/ACANOTES-dev/EduPod/actions/runs/25934810578
- Operator confirmed DNS, HTTPS certificate, and Cloudflare WAF were live on 2026-05-15.
- Production smoke completed on 2026-05-15: unauthenticated stealth-host paths return 404, `/en/login` renders, tenant credentials are rejected on the stealth host, platform credentials are rejected on tenant hosts, platform login reaches `/en/admin`, platform and tenant cookies remain isolated, tenant-host `/en/admin` routes return 404, and the Cloudflare rate limit returned 429 during repeated login attempts.
