# Phase 10 — GDPR / Privacy Hub

**Goal:** consolidate four scattered compliance pages — DSAR list at `/regulatory/compliance`, DPA at `/regulatory/dpa`, data-retention at `/regulatory/data-retention`, privacy notices at `/regulatory/privacy-notices` — into a single coherent `/regulatory/gdpr` sub-hub with its own dashboard and four sub-pages. Fix all the envelope + API-path bugs on the way.

**Dependencies:** Phases 1, 2.

**Estimated effort:** 5–7 hours.

---

## Scope — in

- Create `/regulatory/gdpr` as a new sub-hub.
- Move the four existing pages under the new tree:
  - `/regulatory/compliance` → `/regulatory/gdpr/dsar` (rename: "Compliance" is confusing; the page is DSAR management).
  - `/regulatory/dpa` → `/regulatory/gdpr/dpa-policy`.
  - `/regulatory/data-retention` → `/regulatory/gdpr/data-retention`.
  - `/regulatory/privacy-notices` → `/regulatory/gdpr/privacy-notices`.
- Add `next.config.mjs` redirects for the old paths → new paths.
- Fix the DPA response-envelope crash.
- Fix the data-retention `/v1/...` vs `/api/v1/...` URL bug.
- The privacy-notices page is already clean — just port it, it does not need substantive rework.
- Rewrite the DSAR (was compliance) page to the list pattern.
- Rewrite the DPA page to the list / detail pattern (lists policy versions).

## Scope — out

- Backend GDPR / DSAR workflow changes — unchanged.
- New DSAR fulfillment features.

---

## Page composition

### `/regulatory/gdpr` (sub-hub)

```
PageHeader
  title: 'GDPR & Privacy'
  description: 'Data subject requests, privacy notices, retention, and DPA compliance.'
  back: { href: '/{locale}/regulatory' }

KPI strip (4 tiles)
  1. Open DSARs (warning tone)
  2. Overdue DSARs (danger tone)
  3. Privacy notice version in effect
  4. Data items past retention (danger tone if > 0)

HubTile grid (4 tiles, teal accent)
  1. Data Subject Requests  → /regulatory/gdpr/dsar
  2. Privacy Notices        → /regulatory/gdpr/privacy-notices
  3. Data Retention         → /regulatory/gdpr/data-retention
  4. DPA Compliance         → /regulatory/gdpr/dpa-policy

Recent DSAR activity section (rounded-2xl)
  Last 5 DSARs with status badge + link to detail.
```

### `/regulatory/gdpr/dsar` (list, was `/regulatory/compliance`)

- `PageHeader.back` → `/regulatory/gdpr`, actions: "New request".
- Filters: status, subject type, date range.
- Table: request type, subject type, subject ID, status badge, created, actions.
- Detail page at `/regulatory/gdpr/dsar/:id` — classification, approval, execution workflow preserved.

### `/regulatory/gdpr/dpa-policy` (list + detail)

- `PageHeader.back` → `/regulatory/gdpr`, actions: "New policy version".
- List of policy versions with adoption dates.
- Detail shows full policy text + signatures.

### `/regulatory/gdpr/data-retention` (list)

- `PageHeader.back` → `/regulatory/gdpr`, actions: "Preview impact".
- Table of retention categories with status.
- Legal holds section underneath.
- **Fix:** change `/v1/retention-policies` → `/api/v1/retention-policies`, same for `/v1/retention-holds`.

### `/regulatory/gdpr/privacy-notices` (list)

- Port existing page, only change header to use `back: { href: '/{locale}/regulatory/gdpr' }`.
- No other visual rework needed (it's the reference-quality page today).

---

## Concrete changes

### Files moved

- `apps/web/src/app/[locale]/(school)/regulatory/compliance/*` → `apps/web/src/app/[locale]/(school)/regulatory/gdpr/dsar/*`
- `apps/web/src/app/[locale]/(school)/regulatory/dpa/*` → `apps/web/src/app/[locale]/(school)/regulatory/gdpr/dpa-policy/*`
- `apps/web/src/app/[locale]/(school)/regulatory/data-retention/*` → `apps/web/src/app/[locale]/(school)/regulatory/gdpr/data-retention/*`
- `apps/web/src/app/[locale]/(school)/regulatory/privacy-notices/*` → `apps/web/src/app/[locale]/(school)/regulatory/gdpr/privacy-notices/*`
- Add redirects in `apps/web/next.config.mjs`:
  ```ts
  redirects: [
    {
      source: '/:locale/regulatory/compliance/:path*',
      destination: '/:locale/regulatory/gdpr/dsar/:path*',
      permanent: false,
    },
    {
      source: '/:locale/regulatory/compliance',
      destination: '/:locale/regulatory/gdpr/dsar',
      permanent: false,
    },
    {
      source: '/:locale/regulatory/dpa/:path*',
      destination: '/:locale/regulatory/gdpr/dpa-policy/:path*',
      permanent: false,
    },
    {
      source: '/:locale/regulatory/dpa',
      destination: '/:locale/regulatory/gdpr/dpa-policy',
      permanent: false,
    },
    {
      source: '/:locale/regulatory/data-retention/:path*',
      destination: '/:locale/regulatory/gdpr/data-retention/:path*',
      permanent: false,
    },
    {
      source: '/:locale/regulatory/data-retention',
      destination: '/:locale/regulatory/gdpr/data-retention',
      permanent: false,
    },
    {
      source: '/:locale/regulatory/privacy-notices/:path*',
      destination: '/:locale/regulatory/gdpr/privacy-notices/:path*',
      permanent: false,
    },
    {
      source: '/:locale/regulatory/privacy-notices',
      destination: '/:locale/regulatory/gdpr/privacy-notices',
      permanent: false,
    },
  ];
  ```

### Files rewritten

- `apps/web/src/app/[locale]/(school)/regulatory/gdpr/page.tsx` (new sub-hub)
- DSAR list + detail pages (light rework)
- DPA page (full rewrite — fix envelope crash, apply list/detail pattern)
- Data-retention page (fix API URLs, apply list pattern)

### Files preserved

- Privacy notices — ported as-is, only header updated.

### Translation keys

- New: `regulatory.gdpr.*` namespace (titles, descriptions, KPI labels).
- Keep: existing keys under each area, renamed if their namespace moves (e.g., `regulatory.compliance.*` → `regulatory.gdpr.dsar.*`).

---

## Success criteria

- [ ] `/regulatory/gdpr` sub-hub loads cleanly.
- [ ] All four sub-pages work and show correct data on NHQS.
- [ ] No `/en/v1/retention-*` 404s in console.
- [ ] No `Cannot read properties of undefined (reading 'version')` on DPA page.
- [ ] Old URLs (`/regulatory/compliance`, `/regulatory/dpa`, `/regulatory/data-retention`, `/regulatory/privacy-notices`) redirect correctly.
- [ ] DSAR create + status transitions still work.
- [ ] Mobile and RTL clean.
- [ ] Lint + type-check + tests pass. CI green.

---

## Testing

- Playwright: `apps/web/e2e/regulatory-gdpr.spec.ts` — walks hub → each sub-page and back.
- Manual: create a DSAR on NHQS, walk it through statuses.
- Manual: navigate to each old URL and confirm redirect.

---

## Risks

- **Route move is higher-risk than Phases 4 and 8 moves** because there are 4 pages, each with potential deep links in existing browser history / bookmarks. Make the redirects temporary (`permanent: false`) for 90 days, then switch to permanent once we're confident.
- **DPA page response envelope**. Remember to apply the Phase 1 unwrap convention.
- **Data-retention API path fix** needs verification: confirm `/api/v1/retention-policies` is the correct endpoint (backend might actually mount it at `/api/v1/data-retention/policies` — verify in `apps/api/src/modules/**` before rewriting the page).
