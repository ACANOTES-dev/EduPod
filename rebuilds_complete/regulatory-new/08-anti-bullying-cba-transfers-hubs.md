# Phase 8 — Anti-Bullying, CBA, and Transfers Hubs

**Goal:** promote three currently-nested-or-stub areas into real top-level regulatory sub-hubs. Each gets its own dashboard, KPI strip, and polished list / wizard surfaces.

**Dependencies:** Phases 1, 2, 4 (Phase 4 moved the CBA and Transfers files to top-level routes).

**Estimated effort:** 5–7 hours (three hubs in one phase, but they're related and smaller than Tusla/PPOD).

---

## Scope — in

### Anti-Bullying

- Replace the redirect stub with a real `/regulatory/anti-bullying` sub-hub pulling incident data from the Behaviour module via a regulatory-lens API.
- Fix the Cyrillic `"Bi Cinealта"` → `"Bí Cineálta"` bug.
- Fix the backend `/api/v1/behaviour/incidents/summary?categories=bullying` 400 — extend the backend enum if needed.

### CBA

- Rewrite `/regulatory/cba/page.tsx` (moved from `/regulatory/ppod/cba` in Phase 4) as a sub-hub.
- Fix the response-envelope crash.
- Fill all `regulatory.cba.*` translation gaps.

### Transfers

- Rewrite `/regulatory/transfers/page.tsx` (moved from `/regulatory/ppod/transfers` in Phase 4) as a sub-hub with create-transfer flow at `/regulatory/transfers/new`.
- Fill all `regulatory.transfers.*` translation gaps.

## Scope — out

- Changes to the Behaviour module's incident schema or storage.
- CBA / transfers business logic backend changes.

---

## Page composition

### `/regulatory/anti-bullying` (sub-hub)

```
PageHeader
  title: 'Anti-Bullying (Bí Cineálta)'
  description: 'Oversight of bullying incidents under Ireland's national anti-bullying framework.'
  back: { href: '/{locale}/regulatory' }
  actions: Link "Manage incidents in Behaviour module" → /behaviour/incidents?category=bullying

Bí Cineálta framework banner (rounded-2xl, neutral slate tint)
  Short explainer: what the framework is, link to policy PDF.

KPI strip (4 tiles)
  1. Open incidents
  2. Resolved this term
  3. Bullying category incidents this year
  4. Days since last incident

HubTile grid (3 tiles)
  1. Open incidents        → /behaviour/incidents?category=bullying&status=open
  2. Annual review         → /regulatory/anti-bullying/annual-review (new, Phase 9 or 11)
  3. Policy compliance     → link to policy tile in regulatory settings

Category breakdown section (rounded-2xl)
  Stacked bar chart of bullying types (cyberbullying, identity-based, racist, etc.)
  colored by severity.

Recent incidents list (rounded-2xl, last 5)
  Row link → Behaviour module detail.
```

### `/regulatory/cba` (sub-hub)

```
PageHeader
  title: 'CBA Sync (Classroom-Based Assessment)'
  description: 'Junior Cycle CBA grade synchronisation with P-POD.'
  back: { href: '/{locale}/regulatory' }
  actions: Button "Sync all pending" (admin only)

KPI strip (4 tiles)
  1. Synced
  2. Pending (warning if > 0)
  3. Errors (danger if > 0)
  4. Last sync

Subject breakdown table
  Per subject: total / synced / pending / errors.

Pending records list (rounded-2xl)
  Filters: subject, student, CBA type, grade.
  Table: student, subject, CBA type, grade, sync status, actions.
```

### `/regulatory/transfers` (sub-hub)

```
PageHeader
  title: 'Inter-School Transfers'
  description: 'Early-leaving transfers for P-POD reporting.'
  back: { href: '/{locale}/regulatory' }
  actions: Button "+ New transfer" → /regulatory/transfers/new

KPI strip (4 tiles)
  1. Pending
  2. Accepted this year
  3. Rejected this year
  4. In-transit (sent but not confirmed)

Filters section
  Direction (in / out), status, date range.

Results table
  Student, direction, other school, transfer date, status badge, P-POD confirmed, actions.
```

### `/regulatory/transfers/new` (form)

- Full-page form with `react-hook-form` + `createTransferSchema`.
- Two columns at `lg:` breakpoint; single column on mobile.
- Submit → POST → redirect to the newly created transfer's detail page.

---

## Concrete changes

### Files rewritten / new

- `apps/web/src/app/[locale]/(school)/regulatory/anti-bullying/page.tsx` (rewrite)
- `apps/web/src/app/[locale]/(school)/regulatory/cba/page.tsx` (rewrite)
- `apps/web/src/app/[locale]/(school)/regulatory/transfers/page.tsx` (rewrite)
- `apps/web/src/app/[locale]/(school)/regulatory/transfers/new/page.tsx` (rewrite)
- `apps/web/src/app/[locale]/(school)/regulatory/anti-bullying/_components/category-breakdown.tsx`

### Backend

- Extend `/api/v1/behaviour/incidents/summary` Zod query schema to accept `categories=bullying` (if that's what's causing the 400). Confirm root cause first with `curl`. Add a spec.
- Consider exposing a `/api/v1/regulatory/anti-bullying/summary` composite endpoint that returns the KPIs + category breakdown + recent incidents in one call, scoped to the `regulatory.view` permission. Prevents the UI from making three behaviour-module calls.

### Translation keys

- Fix `"Bi Cinealта"` → `"Bí Cineálta"` in `messages/en.json` and `ar.json`.
- Add all missing `regulatory.antiBullying.*`, `regulatory.cba.*`, `regulatory.transfers.*` keys.

---

## Success criteria

- [ ] All three sub-hubs load cleanly.
- [ ] No raw translation keys anywhere on CBA or Transfers pages.
- [ ] Anti-Bullying category-breakdown chart renders for NHQS (even if empty state).
- [ ] `"Bí Cineálta"` renders with correct Latin characters.
- [ ] Behaviour incidents summary API returns 200 for `categories=bullying`.
- [ ] Transfer create form submits successfully on NHQS and lands on the created record.
- [ ] Mobile and RTL clean on all three hubs.
- [ ] Lint + type-check + tests pass. CI green.

---

## Testing

- Playwright: one spec per hub in `apps/web/e2e/`.
- Manual: create a transfer on NHQS end-to-end.
- Manual: log one bullying incident in behaviour module, confirm the regulatory anti-bullying hub KPI updates.

---

## Risks

- **Anti-Bullying depends on the behaviour module.** If the backend doesn't expose the right filter or summary endpoint today, plan backend work first. Verify `behaviour.incidents` supports a `bullying` category filter before UI work begins.
- **Three hubs in one phase.** If it blows the estimate, split: ship Anti-Bullying alone first, then CBA + Transfers together in a follow-up.
- **CBA / Transfers URL change.** Old `/regulatory/ppod/cba` and `/regulatory/ppod/transfers` redirects (added in Phase 4) must still work.
