# Design System Rules — Regulatory Module

Every phase in this redesign must obey these rules. If a rule feels inconvenient, fix the plan — don't bypass the rule.

Primary references:

- `docs/plans/ux-redesign-final-spec.md` §14 — canonical hub and sub-page composition.
- `apps/web/src/app/[locale]/(school)/wellbeing/page.tsx` — reference hub implementation.
- `apps/web/src/app/[locale]/(school)/finance/page.tsx` — reference hub implementation.
- `apps/web/src/app/[locale]/(school)/safeguarding/page.tsx` — reference hub implementation.

---

## 1. Module identity

- **Accent gradient:** `from-teal-400 via-teal-500 to-teal-600`
- **Icon background:** `bg-teal-100 text-teal-700`
- **Used on:** every `HubTile` accent bar inside `/regulatory/*`, every KPI tile hover glow, every primary CTA gradient on regulatory pages.
- **Do not mix palettes.** A tile that lives under `/regulatory` must use the teal pair. Safeguarding retains slate only on standalone `/safeguarding/*` routes; inside `/regulatory/safeguarding` it adopts teal.
- Phase 1 registers the teal row in `docs/plans/ux-redesign-final-spec.md` §14.4.

---

## 2. Super-dashboard pattern (the main rule)

Every navigable destination is a dashboard until we reach an actual list or form.

```
/regulatory                                 ← super dashboard (KPI strip + hub tiles)
/regulatory/tusla                           ← sub-dashboard  (KPI strip + hub tiles)
/regulatory/tusla/sar                       ← wizard / form
/regulatory/tusla/reduced-days              ← list page
/regulatory/tusla/reduced-days/:id          ← detail page
```

- Hub level renders the 4-KPI strip + 4-QuickAction row + `HubTile` grid + optional contextual feed.
- Sub-hub level renders the same four blocks, scoped to that sub-module's numbers.
- Only at the list/form/detail level do we switch to §14.5 / §14.6 patterns.

No redirect stubs. If a sub-hub only has one action, it's still a sub-hub — the single action is a HubTile, not the whole page.

---

## 3. Back-button rule (non-negotiable)

Every page reachable from another page renders an **explicit** back link. Browser back is a fallback, never the primary path.

- Use `PageHeader({ back: { href, label } })`. The component ships a chevron that flips in RTL.
- Hub roots do not render a back button — they are entered from the morph bar.
- Depth-1 sub-hubs (e.g., `/regulatory/tusla`) back to `/regulatory`.
- Depth-2 pages (e.g., `/regulatory/tusla/sar`) back to their sub-hub (`/regulatory/tusla`), not to `/regulatory`.
- Depth-3 detail pages (e.g., `/regulatory/tusla/reduced-days/:id`) back to their list page.
- In multi-step wizards, the back link goes to the parent hub AND the wizard's own "previous step" control stays inside the wizard body.

---

## 4. Shell rules

- Morph-bar top nav stays. The "Regulatory" hub pill must stay active on every `/regulatory/*` route.
- **No sub-strip.** The current `apps/web/src/lib/nav-config.ts` `regulatory: [...]` block is deleted in Phase 1.
- **No in-page secondary nav.** `_components/regulatory-nav.tsx` is retired in Phase 1; sub-navigation comes exclusively from hub tiles on the current super/sub-dashboard.
- No bottom tab bar on mobile. Hamburger overlay is the mobile navigation, same as the rest of the product.

---

## 5. Page composition (per §14)

### 5.1 Hub / sub-hub

```tsx
<div className="flex min-w-0 flex-col gap-8 pb-10">
  <PageHeader title={...} description={...} />
  {errorBanner}
  {kpiStrip}            {/* grid grid-cols-2 gap-3 sm:grid-cols-4 */}
  {quickActions}        {/* grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 */}
  {hubTileGrid}         {/* grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 */}
  {contextualFeed}      {/* rounded-2xl section with list of recent items */}
</div>
```

### 5.2 List page

```tsx
<div className="flex min-w-0 flex-col gap-6 pb-10">
  <PageHeader title={...} back={{...}} actions={...} />
  {errorBanner}
  {summaryStrip}        {/* optional 3-up SummaryCard grid */}
  {filtersSection}      {/* rounded-2xl, Filter icon + Reset */}
  {resultsSection}      {/* rounded-2xl, divided list or DataTable */}
  {pagination}          {/* only if totalPages > 1 */}
</div>
```

### 5.3 Detail page

```tsx
<div className="flex min-w-0 flex-col gap-6 pb-10">
  <PageHeader title={...} back={{...}} actions={...} />
  {identityStrip}       {/* ref number, status badges, metadata */}
  {lgGridSplit}         {/* lg:grid-cols-[2fr_1fr] main content + sidebar */}
  {dangerZone}          {/* optional, last section */}
</div>
```

### 5.4 Form page

- `react-hook-form` + `zodResolver` (non-negotiable for new code).
- Zod schemas live in `@school/shared` — never redefined in the UI.
- Fieldset-style sections as rounded-2xl cards when >6 fields.
- Inner field gap `gap-4`, inter-section gap `gap-6`.
- Submit right-aligned, Cancel/back left-aligned.
- Inline errors: `text-danger-700 text-xs` below the offending field.
- Destructive confirms go through the shared `ConfirmDialog`.

---

## 6. Visual polish checklist

Regulatory is the "boring by reputation" domain. Each page is expected to push visual quality past baseline:

- **Staggered fade-in on hub tiles** (60ms increments) using existing `HubTile` animation.
- **Hover state on every interactive card** — `transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-teal-300`.
- **Icon strategy** — Lucide only, tinted with `bg-teal-100 text-teal-700`. No custom SVGs. No emoji.
- **Typography** — `Figtree` primary, `JetBrains Mono` for codes and reference numbers.
- **Empty states never feel empty** — always include tinted circle icon + short heading + next-step copy + optional CTA.
- **Skeletons always match the real layout** — `CardSkeleton`, `animate-pulse rounded bg-border/60` sized to the real content.
- **Numbers are the star** — KPI values at `stat-value` (28/700), labels at 11px uppercase. Monetary / time values use tenant-locale formatters.

---

## 7. Error handling (per CLAUDE.md)

- Every `catch` block either surfaces a user-visible toast (`toast.error(msg)`) OR logs with context (`console.error('[MyPage.myFn]', err)`).
- Empty `catch {}` is prohibited.
- Backend errors use structured `{ code, message }` and `NestJS` exception classes (`throw new NotFoundException({ code: 'REG_X_NOT_FOUND', message: '...' })`).

---

## 8. RTL + i18n

- All user-facing strings go through `useTranslations()` with keys under `regulatory.<subHub>.<area>.<key>`.
- Every EN key added in the plan must land in `messages/en.json` AND `messages/ar.json` within the same phase.
- Logical CSS properties only (`ms-` / `me-` / `ps-` / `pe-` / `start-` / `end-`). Physical directions (`ml-`, `mr-`, `text-left`, etc.) are a lint error.
- Chevrons pointing "forward" include `rtl:rotate-180`.
- Codes / references / dates wrap in `dir="ltr"` with `font-mono` when appropriate.

---

## 9. Mobile

- Every page tested at 375px width.
- Content wrappers: `flex-1 min-w-0 overflow-x-hidden`. The `min-w-0` is not optional.
- Tables wrap in `<div className="overflow-x-auto">`, or collapse to stacked cards on small screens.
- Inputs are `w-full` with `text-base` (16px) on mobile.
- Minimum touch target 44×44px.

---

## 10. Naming conventions

- Routes: `/regulatory/<sub-hub>/<resource>` kebab-case, plural resources.
- Page files: `apps/web/src/app/[locale]/(school)/regulatory/**/page.tsx`.
- Sub-hub components (not routed) in `_components/` folders.
- Translation namespaces: `regulatory.<subHubCamelCase>` (e.g., `regulatory.tusla`, `regulatory.gdpr`, `regulatory.antiBullying`).
- Zod schemas in `packages/shared/src/regulatory/` (already exists).

---

## 11. Deprecated components

By the end of Phase 1 these are no longer rendered anywhere inside `/regulatory/*`:

- `apps/web/src/app/[locale]/(school)/regulatory/_components/regulatory-nav.tsx` — remove imports, retire file.
- `apps/web/src/app/[locale]/(school)/regulatory/_components/compliance-status-card.tsx` — superseded by KPI tile + HubTile. Retire if unused after hub rewrite.
- `apps/web/src/app/[locale]/(school)/regulatory/_components/deadline-timeline.tsx` — superseded by the contextual feed section on the super-dashboard. Retire if unused.
