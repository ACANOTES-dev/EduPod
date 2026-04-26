# Phase 5 — DES Returns Hub

**Goal:** `/regulatory/des-returns` becomes a sub-dashboard with its own readiness scorecard, guided generate-file flow, and subject-code mapping management. Fix the `ReferenceError: t is not defined` crash while rewriting.

**Dependencies:** Phases 1, 2.

**Estimated effort:** 4–5 hours.

---

## Scope — in

- Rewrite `apps/web/src/app/[locale]/(school)/regulatory/des-returns/page.tsx` as a sub-hub.
- Rewrite `des-returns/subject-mappings/page.tsx` (list + create mapping dialog).
- Rewrite `des-returns/generate/page.tsx` (wizard).
- Fix the lexical-scope `t` bug while rewriting.
- Fix the response envelope for `/v1/regulatory/des/readiness`.
- Add any missing `regulatory.desReturns.*` translations.

## Scope — out

- DES file-generation engine — no backend changes, this phase is UI only.

---

## Page composition

### `/regulatory/des-returns` (sub-hub)

```
PageHeader
  title: 'DES September Returns'
  description: 'Generate the annual DES submission files for your school.'
  back: { href: '/{locale}/regulatory' }
  actions: Button "Generate files" → /regulatory/des-returns/generate

Readiness scorecard (rounded-2xl)
  Academic year selector at top.
  For each required file (A / B / C / D / E / Form TL):
    ● status badge (Ready / Incomplete / Not started)
    ● list of blocking issues with links to the screen that fixes them
    ● last-generated-at timestamp

KPI strip (4 tiles)
  1. Files ready
  2. Files pending
  3. Blocking issues
  4. Last submission date

HubTile grid (3 tiles, teal accent)
  1. Subject Mappings       → /regulatory/des-returns/subject-mappings
  2. Generate files         → /regulatory/des-returns/generate
  3. View submitted returns → /regulatory/submissions?domain=des_september
```

### `/regulatory/des-returns/subject-mappings` (list)

- `PageHeader.back` → `/regulatory/des-returns`, actions: "Add mapping" dialog.
- Filters: academic year, status.
- Table: school subject, DES code, notes, actions.
- Dialog uses `react-hook-form` + `createDesSubjectCodeMappingSchema`.

### `/regulatory/des-returns/generate` (wizard)

- Steps: Select academic year → Select file type → Preview → Generate → Download.
- Each step teal-accented + localised.

---

## Concrete changes

### Files rewritten

- `apps/web/src/app/[locale]/(school)/regulatory/des-returns/page.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/des-returns/subject-mappings/page.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/des-returns/generate/page.tsx`

### Files created

- `apps/web/src/app/[locale]/(school)/regulatory/des-returns/_components/readiness-scorecard.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/des-returns/_components/subject-mapping-dialog.tsx`
- Co-located specs.

### Translation keys

`regulatory.desReturns.*` — add any missing. Ensure EN + AR parity.

### Backend

- None. All needed endpoints exist.

---

## Success criteria

- [ ] `/regulatory/des-returns` loads with readiness scorecard.
- [ ] No `ReferenceError: t is not defined` in console.
- [ ] Subject mapping create + delete work on NHQS.
- [ ] Generate wizard completes end-to-end for at least one file type (File A is easiest).
- [ ] Mobile and RTL clean.
- [ ] Lint + type-check + tests pass. CI green.

---

## Testing

- Playwright: `apps/web/e2e/regulatory-des-returns.spec.ts`.
- Manual: exercise the generate wizard for Form TL on NHQS.

---

## Risks

- **Readiness copy.** The blocking-issue messages need to be actionable, not generic. If the backend returns enum-style issue codes, map them to plain-English + Arabic sentences with deep links.
- **Academic-year selector state**. Keep it in the URL (`?year=2025-2026`) so the scorecard is shareable.
