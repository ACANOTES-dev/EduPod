# Implementation 11 — Behaviour Analytics URL Fix + Endpoint Reconnects

> **Wave:** 4 (**parallel-risky** — apply rules H1–H10)
> **Classification:** frontend
> **Depends on:** 02
> **Deploys:** Web restart only

---

## Goal

The `/behaviour/analytics` page calls 8 backend endpoints **without the `/api/v1` prefix** — the requests 307-redirect to localised paths and 404. The entire analytics module is unusable in production today. This impl fixes the URL prefix for every analytics call site and re-wires the new templates / recognition / stats endpoints (built in impl 02) into their consumers (`/behaviour/incidents/new` form, `/behaviour/recognition` page, `/behaviour` dashboard, `/behaviour/tasks` page).

Pure frontend rewiring. No new pages, no design changes.

## Shared files this impl touches

- `IMPLEMENTATION_LOG.md` — separate commit.

That's it. Per-page edits only; no nav-config, no translations, no shell.

Hot-zone severity: **none.**

## What to build

### 1. Analytics URL prefix audit

```bash
grep -rn "apiClient.*'/behaviour/analytics" apps/web/src/
```

Every match should use `/api/v1/behaviour/analytics/...` (or whatever the canonical absolute path is — verify by inspecting `apiClient` and the existing working calls in `/people/page.tsx`). Fix every one:

```ts
// Before
apiClient(`/behaviour/analytics/overview?from=...`);
// After
apiClient(`/api/v1/behaviour/analytics/overview?from=...`);
```

The 8 endpoints in question (per the audit):

- `pulse`
- `overview`
- `trends`
- `categories`
- `subjects`
- `heatmap`
- `comparisons`
- `staff`

Plus `/behaviour/analytics/ai-query/history` (impl 05 ships this; verify the call site is correct after the fix).

### 2. Reconnect impl 02's endpoints

#### `/behaviour/incidents/new` form — templates fetch

Locate the call to `/api/v1/behaviour/templates?pageSize=50` in the new-incident form. After impl 02 ships the endpoint, this should now return 200 with `data: []` (or the seeded templates if any). Remove any try/catch silencing the 404 — let success render a "no templates" hint when empty.

#### `/behaviour/recognition` — list fetch

Locate the call to `/api/v1/behaviour/recognition?pageSize=50&status=published`. After impl 02 ships, returns 200 with `data: []`. Render the empty state ("No recognition yet — log a positive incident") instead of the toast.

#### `/behaviour` (Behaviour Pulse) — stats fetch

Locate `/api/v1/behaviour/incidents/stats`. After impl 02 fixes the 400, the stats KPI tiles should render real numbers. Verify the response field names match the page's `PulseStats` interface; if impl 02 chose different names, align here.

#### `/behaviour/tasks` — task stats

Same pattern as the Behaviour Pulse stats. After impl 02 alignment, the "Validation failed" toast disappears.

### 3. Remove silent error-swallowing where it's now hiding a working response

Several places have `.catch((err) => { console.error(err); return setData([]); })` patterns that were defensive against the broken endpoints. Now that the endpoints work, these still suppress real errors. Replace with toast on user-triggered actions and console-log only on background fetches (per `.claude/rules/code-quality.md`'s error handling guidance).

### 4. Smoke each page after the fix

After every commit, hit the affected page on production. Each should render with real data (or an honest empty state).

## Tests

- Update the analytics page tests — assert each `apiClient` call uses the `/api/v1/...` path.
- Update the new-incident form tests — assert `templates` empty array renders the "no templates" hint, not an error toast.
- Update the recognition page tests — assert empty array renders the empty-state component, not the silent error.

## Watch out for

- **Coordinating with impl 02's deploy** — impl 11 only works after impl 02 ships its endpoint fixes. Per the wave model, both are in different waves (11 in Wave 4, 02 in Wave 2), so 02 is already complete by the time 11 starts. Verify this by reading 02's completion record before you begin.
- **Same-file edits with sibling impls** — impl 10 also edits `apps/web/src/app/[locale]/(school)/behaviour/page.tsx` if `/behaviour` was on its crash list; it isn't, but double-check after impl 10 completes. If they did edit the file, deep-merge.
- **Pre-deploy serialisation** with siblings 10 and 12 — first-come-first-served on `pm2 restart web`.

## Deployment notes

- Restart: web only.
- Smoke: visit `/en/behaviour/analytics` — charts render (with empty data on NHQS, but no toasts; status 200s in network tab); visit `/en/behaviour/incidents/new` — no template-404 toast; visit `/en/behaviour` — KPI tiles show real numbers; visit `/en/behaviour/recognition` — empty state instead of toast.
