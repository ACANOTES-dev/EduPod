# Phase 6 — October Returns Hub

**Goal:** `/regulatory/october-returns` becomes a sub-dashboard that tells the user exactly what the October census needs, what's missing, and where to fix it. Fix the `reading 'map'` crash.

**Dependencies:** Phases 1, 2.

**Estimated effort:** 3–4 hours.

---

## Scope — in

- Rewrite `apps/web/src/app/[locale]/(school)/regulatory/october-returns/page.tsx`.
- Add preview and issues sub-pages (currently only the hub exists).
- Fix the response-envelope crash.
- Full `regulatory.octoberReturns.*` translation pass.

## Scope — out

- Backend census logic — unchanged.

---

## Page composition

### `/regulatory/october-returns` (sub-hub)

```
PageHeader
  title: 'October Returns'
  description: 'Annual student census required by the Department of Education.'
  back: { href: '/{locale}/regulatory' }
  actions: Button "Preview submission" → /regulatory/october-returns/preview

KPI strip (4 tiles)
  1. Students included
  2. Issues blocking submission (danger tone if > 0)
  3. Days until deadline
  4. Last preview generated

Readiness checklist (rounded-2xl)
  Walks through each October-returns field (student_count, gender_breakdown, etc.).
  Each row: ● field name, ● status (ready / missing / partial), ● "fix" CTA if applicable.

HubTile grid (2 tiles, teal accent)
  1. Issues to resolve      → /regulatory/october-returns/issues
  2. Preview submission     → /regulatory/october-returns/preview
```

### `/regulatory/october-returns/issues` (list)

- `PageHeader.back` → `/regulatory/october-returns`.
- Filters: severity, category.
- Table: issue, student (if applicable), severity badge, fix link (deep-links to students/finance/etc. where the data is edited).

### `/regulatory/october-returns/preview` (detail view)

- `PageHeader.back` → `/regulatory/october-returns`, actions: "Download preview CSV".
- Renders the aggregated census as a read-only table with totals.

---

## Concrete changes

### Files rewritten

- `apps/web/src/app/[locale]/(school)/regulatory/october-returns/page.tsx`

### Files created

- `apps/web/src/app/[locale]/(school)/regulatory/october-returns/issues/page.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/october-returns/preview/page.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/october-returns/_components/readiness-checklist.tsx`
- Co-located specs.

### Translation keys

`regulatory.octoberReturns.*` — all new.

---

## Success criteria

- [ ] `/regulatory/october-returns` loads without error boundary.
- [ ] Readiness checklist reads from `/v1/regulatory/october-returns/readiness` with envelope unwrap applied.
- [ ] Issues page shows real blocking issues from `/v1/regulatory/october-returns/issues` if any, otherwise the empty state.
- [ ] Preview page renders the aggregated census CSV.
- [ ] Mobile and RTL clean.
- [ ] Lint + type-check + tests pass.

---

## Testing

- Playwright: `apps/web/e2e/regulatory-october-returns.spec.ts`.
- Manual: trigger the preview on NHQS, confirm CSV download contains the right columns.

---

## Risks

- **Deep-link targets from "Fix" CTAs.** Each issue type maps to a different screen. Map them explicitly in a `_components/issue-to-fix-link.ts` catalogue so it's easy to extend.
