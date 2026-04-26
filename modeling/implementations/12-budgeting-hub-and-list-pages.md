# Implementation 12 — Budgeting Hub + List Pages

> **Wave:** 4
> **Depends on:** 01 (schema), 03 (financial-models service), 07 (event-budgets service)
> **Deploys:** web restart only (`pm2 restart web`)

---

## Goal

Replace the "coming soon" placeholder at `/finance/budgeting` with a real hub: two big tiles (Financial Models / Event & Trip Costs) plus a recent-activity strip. Add list pages and create-new flows for both entities. This is the first user-visible surface of the rebuild — everything subsequent waves do hangs off these entry points.

The hub itself does not introduce a sub-strip — it's the dashboard-of-hub-tiles flavour of the morphing shell (per `frontend.md` and §3a of the redesign spec). The two list pages (`/models` and `/events`) similarly use the morph bar without a sub-strip; their navigation is self-contained via the back button on `PageHeader` and the "+ New" CTA.

## What to change

### 1. Hub landing — `apps/web/src/app/[locale]/(school)/finance/budgeting/page.tsx`

REWRITE the existing placeholder. New shape:

- `'use client'` directive at top.
- Imports follow the 3-block pattern.
  - External: `lucide-react` icons (`LineChart`, `Compass`, `Sparkles`, `ArrowRight`), `next/navigation` (`usePathname`), `next-intl` (`useTranslations`), `react` (`* as React`).
  - Internal `@school/*` / `@/*`: `apiClient` from `@/lib/api-client`, `PageHeader` from `@/components/page-header`, `HubTile` from `@/components/hub-tile`.
  - Relative: `./_components/recent-activity` (note the page itself doesn't import a `hub-tile.tsx` from `_components` — it reuses the shared `@/components/hub-tile`; we only put a NEW local `_components/hub-tile.tsx` IF we need a budgeting-specific variant — see §2).

- Component: `BudgetingHubPage` (default export).
  - Local state: `recentItems: RecentActivityItem[] | null`, `isLoading: boolean`, `error: string | null`.
  - `React.useEffect` on mount: in parallel fetch
    - `apiClient<{ data: FinancialModel[] }>('/api/v1/budgeting/financial-models?limit=5&sort=updated_at:desc')`
    - `apiClient<{ data: EventBudget[] }>('/api/v1/budgeting/event-budgets?limit=5&sort=updated_at:desc')`
  - Catch each independently with `.catch((err) => { console.error('[BudgetingHub.recent]', err); return null; })`. If both fail, set `error` to a generic toastable message; otherwise set `recentItems` to the merged-and-sorted-by-`updated_at`-desc top 5.
  - Cleanup via cancellation flag (mirror existing finance hub pattern).
  - Layout: `<div className="flex min-w-0 flex-col gap-8 pb-10 p-6">`
    1. `<PageHeader title={t('title')} description={t('description')} back={{ href: '/finance', label: t('backToFinance') }} />`
    2. Two-tile grid: `<section className="grid grid-cols-1 gap-5 md:grid-cols-2">`. Two `HubTile` instances (see config below).
    3. Recent activity section: `<section><h2 ...>{t('recent.title')}</h2><RecentActivity items={recentItems} isLoading={isLoading} /></section>`.

- Hub tile config (rendered in JSX, not a separate `HUB_CARDS` array unless preferred for readability):

  | tile     | icon        | accent                                            | iconBg                            | glow                 | href                        |
  | -------- | ----------- | ------------------------------------------------- | --------------------------------- | -------------------- | --------------------------- |
  | `models` | `LineChart` | `from-emerald-400 via-emerald-500 to-emerald-600` | `bg-emerald-100 text-emerald-700` | `from-emerald-50/80` | `/finance/budgeting/models` |
  | `events` | `Compass`   | `from-amber-400 via-amber-500 to-amber-600`       | `bg-amber-100 text-amber-700`     | `from-amber-50/80`   | `/finance/budgeting/events` |

  Translation key shape:
  - `t('cards.models.title')` → "Financial Models"
  - `t('cards.models.description')` → "Annual revenue & expenditure forecasts. Multi-year. Scenario comparison. Variance tracking."
  - `t('cards.events.title')` → "Event & Trip Costs"
  - `t('cards.events.description')` → "Quick cost calculators for trips, fundraisers, sports days. Per-student / per-household breakdown."

- Permission gate: the page itself trusts the existing route-level guard. The Finance hub's tile linking here must add a `permission` check to hide the budgeting card when `budgeting.view` is missing — but that's a finance-hub change and is OUT OF SCOPE for this phase (the existing finance hub keeps `comingSoon: true` until phase 21 which removes the flag). For this phase we only ship the new pages.

  HOWEVER, we DO want the budgeting hub itself to hide both tiles when permissions are missing. Use the existing `useModuleEnabled('budgeting')` hook AND read permissions from the auth context (look up the existing pattern — most school pages call a `usePermissions()` or check via `auth.permissions.includes('budgeting.view')`). If `budgeting.view` is missing, render an inline empty state: "You don't have access to budgeting. Contact your administrator." The two tiles' visibility further filters: `models` requires `budgeting.view`; `events` requires `budgeting.view`.

### 2. Hub tile component — `apps/web/src/app/[locale]/(school)/finance/budgeting/_components/hub-tile.tsx`

NEW. This is a budgeting-specific variant of the global `@/components/hub-tile` because it accepts an optional `count` and an explicit description that the global tile doesn't render in the same way for some hubs. If after sketching the hub layout it turns out the global `HubTile` is fully sufficient, delete this file and use the global one — the implementing session must make that call. In the spec we assume a local one for clarity, with this shape:

- Props:
  ```typescript
  type Props = {
    icon: LucideIcon;
    title: string;
    description: string;
    href: string;
    accent: string; // gradient classes for the top bar
    iconBg: string; // bg + text classes for the icon container
    glow: string; // gradient class for the hover glow
    count?: number; // shown as a pill on the right when > 0
  };
  ```
- Renders an `<Link href={`/${locale}${href}`}>` wrapping the same gradient/glow/icon/title/description shape used in the existing finance hub `HubCard`. Locale comes from `useLocale()`. Logical-property classes only (`me-`, `ms-`, `start-`, `end-`).
- No `comingSoon` branch — both tiles are real.

### 3. Recent activity component — `apps/web/src/app/[locale]/(school)/finance/budgeting/_components/recent-activity.tsx`

NEW. Renders the merged recent list.

- Type alias at top of file:
  ```typescript
  type RecentActivityItem =
    | {
        kind: 'model';
        id: string;
        name: string;
        status: 'draft' | 'published' | 'archived';
        updated_at: string;
        fiscal_year_start: string;
      }
    | {
        kind: 'event';
        id: string;
        name: string;
        status: 'draft' | 'confirmed' | 'fees_generated' | 'completed' | 'cancelled';
        updated_at: string;
        event_date: string | null;
      };
  ```
- Props: `{ items: RecentActivityItem[] | null; isLoading: boolean }`.
- Loading state: 3 skeleton rows (`<Skeleton />` from `@school/ui`).
- Empty state (`items` is non-null but length 0): friendly message "No activity yet — create your first model or event to get started" with two inline links (`/models/new`, `/events/new`).
- List: each row is a `Link` to `/finance/budgeting/${item.kind === 'model' ? 'models' : 'events'}/${item.id}`. Row layout:
  - LTR: icon (LineChart for model, Compass for event) → name → small status badge → relative time (`updated_at`).
  - Use `format-date.ts` helpers (already in `apps/web/src/lib`) to format `updated_at` as "2 hours ago" style.
  - Logical-property spacing only.

### 4. Models list — `apps/web/src/app/[locale]/(school)/finance/budgeting/models/page.tsx`

NEW.

- Imports follow the 3-block pattern. Pulls `apiClient`, `PageHeader`, `Button`/`Badge`/`Sheet` from `@school/ui`, lucide icons (`Plus`, `Filter`, `MoreVertical`, `Archive`, `LineChart`).
- Page state:
  - `models: FinancialModel[] | null`
  - `meta: { page: number; pageSize: number; total: number } | null`
  - `isLoading: boolean`
  - `filters: { status: 'all' | 'draft' | 'published' | 'archived'; fiscalYearFrom: number | null; fiscalYearTo: number | null }`
  - `page: number` (1-based)
  - `mobileFilterOpen: boolean`
- Derived: `hasFilters = filters.status !== 'all' || filters.fiscalYearFrom !== null || filters.fiscalYearTo !== null`
- Effect: on `filters` / `page` change, `apiClient<{ data: FinancialModel[]; meta: ... }>(\`/api/v1/budgeting/financial-models?status=${filters.status}&fiscal_year_from=${...}&fiscal_year_to=${...}&page=${page}&pageSize=20\`)`. The list endpoint must accept those query params — confirmed against impl 03's contract; if a param is missing add it in impl 03 before this phase deploys.
- Layout:
  - `PageHeader` with `title={t('models.title')}`, `description={t('models.description')}`, `back={{ href: '/finance/budgeting', label: t('backToHub') }}`, and primary action: `<Button asChild><Link href="/finance/budgeting/models/new"><Plus /> {t('models.new')}</Link></Button>`. Hide the button when permission `budgeting.manage` is missing.
  - Filter row: chip selector for status (4 chips: All / Draft / Published / Archived) + year-from / year-to numeric inputs (responsive: full width on mobile, sm:w-28 each). On mobile, the entire filter row collapses behind a `<Button onClick={() => setMobileFilterOpen(true)}><Filter /> Filter</Button>` that opens a `Sheet` from `@school/ui` containing the same controls.
  - Table: wrap in `<div className="overflow-x-auto">`. Columns: Name (with subtitle showing description), FY (e.g. "2026/27"), Horizon ("1 year" / "3 years" / "5 years"), Status (Badge), Last edited (relative time), Net result latest (currency, JetBrains Mono), Actions (kebab → Edit / Duplicate / Archive — each gated on permission).
  - Mobile (<768px): replace table with stacked card view via `@school/ui` `RecordHub`-style cards. Each card shows name + FY + status pill + net + relative time, full-width tappable to navigate to the model.
  - Pagination: `Page X of Y` + Prev/Next buttons. Use existing finance pagination pattern as reference.
  - Empty state: when `models?.length === 0` and no filters active, show illustration (any tasteful lucide icon stack — `LineChart` over a soft blob) + "No models yet — create your first to get started" + a primary `New financial model` button.

### 5. Models create — `apps/web/src/app/[locale]/(school)/finance/budgeting/models/new/page.tsx`

NEW. react-hook-form + zodResolver.

- Schema: import `createFinancialModelSchema` from `@school/shared/budgeting`. Phase 03 defines it; if it doesn't yet, request it in §"Follow-ups" and stub locally for the spec.
- Form fields:
  - `name` — required text input, `Input` component, max 255 chars.
  - `description` — optional textarea (Textarea from `@school/ui`).
  - `fiscal_year_start` — date picker (HTML `<input type="date">` or existing date-picker pattern). Default: the current calendar year's September 1st OR the tenant's academic year start if available via `apiClient<{ data: { academic_year_start: string } }>('/api/v1/tenants/me/preferences')`. Auto-derive `fiscal_year_end = fiscal_year_start + 365 days` and submit it on the wire.
  - `horizon_years` — `Select` with options 1 / 3 / 5; default 1 (or `BudgetingTenantPreferences.default_horizon_years` if accessible — fetch on mount as a side effect).
- Submit: `apiClient<{ data: FinancialModel }>('/api/v1/budgeting/financial-models', { method: 'POST', body: JSON.stringify(values) })`. On success, `router.push(`/${locale}/finance/budgeting/models/${created.id}`)`.
- Errors: caught by react-hook-form's resolver for client-side validation; backend errors land via the global error handler. If a 400 with `code: 'INVALID_FISCAL_YEAR'` returns, show the message inline next to the date picker.
- Permission: page top should redirect to `/finance/budgeting/models` if user lacks `budgeting.manage`. Use the existing `useRequiresPermission` pattern (look it up — most write-only pages use it).
- Layout: same `PageHeader` shell + a single-column form card (max-w-2xl). Submit/Cancel buttons at the end.

### 6. Events list — `apps/web/src/app/[locale]/(school)/finance/budgeting/events/page.tsx`

NEW. Mirror of the models list with these differences:

- Filters:
  - Type chip selector: All / Trip / Fundraiser / Sports day / Performance / Capital purchase / Other.
  - Status chip selector: All / Draft / Confirmed / Fees generated / Completed / Cancelled.
  - Date range picker (from / to) — full-width on mobile.
- Table columns: Name, Type (Badge), Date (or "—"), Class/Year group (lookup name from event.class_id / year_group_id, or "All"), Participants (number, JetBrains Mono), Total cost (currency, JetBrains Mono — derived server-side from the event's drivers via the engine; if absent on the list payload, request impl 07 to include it as a `summary.total_cost` field), Status, Actions kebab.
- Mobile cards: similar collapse to a stacked card view.
- API: `GET /api/v1/budgeting/event-budgets?type=...&status=...&date_from=...&date_to=...&page=...`.
- Empty state copy: "No event budgets yet — plan your first trip or fundraiser to get started".

### 7. Events create — `apps/web/src/app/[locale]/(school)/finance/budgeting/events/new/page.tsx`

NEW. react-hook-form + zodResolver, schema `createEventBudgetSchema` from `@school/shared/budgeting`.

- Form fields:
  - `name` — required text.
  - `event_type` — `Select`: Trip / Fundraiser / Sports day / Performance / Capital purchase / Other.
  - `event_date` — date picker (optional).
  - `event_end_date` — optional, only shown if `event_type === 'trip'` and the user toggles "Multi-day".
  - `class_id` OR `year_group_id` — radio toggle (Class / Year group / Whole school). When Class selected, show a Combobox autocomplete that hits `apiClient<{ data: Class[] }>('/api/v1/classes?limit=100')` on focus (mirror existing class-picker pattern from admissions). When Year group selected, populate from `apiClient<{ data: YearGroup[] }>('/api/v1/year-groups')`. When Whole school, leave both null.
  - `participant_count` — number input. When `class_id` is set, prefill from the chosen class's enrolment count via `apiClient<{ data: { active_count: number } }>('/api/v1/classes/{id}/enrolment-summary')`. When `year_group_id` is set, prefill from year-group active count.
  - `household_share_pct` — slider 0–100 (use shadcn Slider if present in `@school/ui`; otherwise an `<input type="range">` + numeric display). Default from `BudgetingTenantPreferences.default_household_share_pct` or 100.
  - `payment_plan` — `Select`: One-off / 2 payments / 3 payments / 4 payments. Default `one_off`.
- Submit: POST `/api/v1/budgeting/event-budgets`, redirect to `/finance/budgeting/events/[id]`.
- Permission: `budgeting.manage` required.

### 8. Translation keys

Add to `apps/web/messages/en.json` under namespace `financeBudgeting`:

```json
{
  "financeBudgeting": {
    "title": "Budgeting & Analysis",
    "description": "Plan, model, and analyse your school's finances",
    "backToHub": "Back to Budgeting",
    "backToFinance": "Back to Finance",
    "cards": {
      "models": {
        "title": "Financial Models",
        "description": "Annual revenue & expenditure forecasts. Multi-year. Scenario comparison. Variance tracking."
      },
      "events": {
        "title": "Event & Trip Costs",
        "description": "Quick cost calculators for trips, fundraisers, sports days. Per-student / per-household breakdown."
      }
    },
    "recent": {
      "title": "Recent activity",
      "empty": "No activity yet — create your first model or event to get started",
      "modelLabel": "Model",
      "eventLabel": "Event"
    },
    "models": {
      "title": "Financial Models",
      "description": "Annual budgets and scenario forecasts",
      "new": "New financial model",
      "filters": {
        "status": "Status",
        "yearFrom": "Year from",
        "yearTo": "Year to",
        "all": "All",
        "draft": "Draft",
        "published": "Published",
        "archived": "Archived"
      },
      "columns": {
        "name": "Name",
        "fy": "FY",
        "horizon": "Horizon",
        "status": "Status",
        "lastEdited": "Last edited",
        "netResult": "Net result"
      },
      "empty": "No models yet — create your first to get started",
      "createForm": {
        "title": "New financial model",
        "name": "Name",
        "description": "Description (optional)",
        "fiscalYearStart": "Fiscal year start",
        "horizon": "Horizon",
        "horizonOptions": {
          "1": "1 year",
          "3": "3 years",
          "5": "5 years"
        },
        "submit": "Create model",
        "cancel": "Cancel"
      }
    },
    "events": {
      "title": "Event & Trip Budgets",
      "description": "Quick calculators for trips and one-off events",
      "new": "New event budget",
      "filters": {
        "type": "Type",
        "status": "Status",
        "dateFrom": "From",
        "dateTo": "To"
      },
      "columns": {
        "name": "Name",
        "type": "Type",
        "date": "Date",
        "scope": "Scope",
        "participants": "Participants",
        "total": "Total cost",
        "status": "Status"
      },
      "empty": "No event budgets yet — plan your first trip or fundraiser to get started",
      "createForm": {
        "title": "New event budget",
        "name": "Name",
        "type": "Type",
        "eventDate": "Date",
        "eventEndDate": "End date",
        "scope": "Scope",
        "scopeClass": "Class",
        "scopeYearGroup": "Year group",
        "scopeSchool": "Whole school",
        "participantCount": "Participants",
        "householdSharePct": "Household share %",
        "paymentPlan": "Payment plan",
        "paymentPlanOptions": {
          "one_off": "One-off",
          "two_payments": "2 payments",
          "three_payments": "3 payments",
          "four_payments": "4 payments"
        },
        "submit": "Create event budget",
        "cancel": "Cancel"
      }
    }
  }
}
```

Mirror the same keys with the same English values into `apps/web/messages/ar.json` (real Arabic translation lands in phase 21). Replace any prior `financeBudgeting` placeholder content in both files (the existing keys for `heroTitle` / `heroBody` / `preview.*` / `badge` may be removed since the placeholder page is gone).

### 9. Routing layout

Confirm `apps/web/src/app/[locale]/(school)/finance/budgeting/layout.tsx` does NOT exist; if it does, leave it untouched (it's likely just a passthrough). The existing `(school)` group layout provides the morph bar. No new layout file needed.

### 10. Mobile

- Hub: tiles stack vertically at <768px. Recent activity rows are full-width tappable.
- Lists: tables collapse to stacked cards at <768px (use Tailwind `md:hidden` / `hidden md:block` split). Filters hide behind a sheet.
- Forms: single-column on mobile, two-column at `md:` and above only for paired short fields (year-from / year-to). Inputs `text-base` minimum.

## Testing requirements

- **Component snapshot/integration tests** (Jest / RTL):
  - `_components/hub-tile.spec.tsx` — renders title, description, count when provided; href contains locale prefix.
  - `_components/recent-activity.spec.tsx` — loading, empty, with-items branches; filters out malformed kinds.
- **Page-level smoke** (RTL with mocked `apiClient`):
  - Hub: renders title, two tiles, calls both list endpoints, displays merged recent items sorted desc.
  - Models list: applies status filter via chip click, calls API with `status=published`, renders rows.
  - Events list: applies type filter, renders rows.
  - New-model form: submits, redirects on success.
- **Playwright (Rule 27a)** — see post-deploy verification.
- **No regressions**: run `pnpm turbo run test --filter=@school/web` and confirm everything green.
- **Type-check + lint**: `pnpm turbo run type-check`, `pnpm turbo run lint` from the monorepo root.

## Post-deploy verification

1. Local gauntlet: type-check, lint, unit tests pass.
2. Commit (`feat(budgeting): hub landing + list pages + create-new flows`), rsync, `chown`, `pnpm --filter @school/web build`, `pm2 restart web`.
3. Hit `/api/health` → 200. PM2 logs clean.
4. Acquire Playwright lock (Rule 27b) and run:
   - Authenticate as `owner@nhqs.test` (Password123!).
   - `browser_navigate('https://nhqs.edupod.app/en/finance/budgeting')` → assert title "Budgeting & Analysis", two tiles visible, no console errors.
   - Click the "Financial Models" tile → asserts URL `/finance/budgeting/models`, asserts list renders (or empty state if NHQS has no models yet).
   - Click "+ New financial model" → form renders with three fields. Type a name, submit, assert redirect to `/finance/budgeting/models/[id]`. The workspace at that URL won't render fully until impl 13 ships — for this phase, assert the URL changed and the page returned 200; the workspace may show a placeholder.
   - Navigate back to hub → click "Event & Trip Costs" → events list renders.
   - Capture `browser_console_messages(level: 'error')`. Assert empty.
5. Test mobile at 375px (`browser_resize({ width: 375, height: 812 })`):
   - Tiles stack vertically.
   - Models list collapses to cards.
   - "Filter" button opens a sheet.
   - Form is single-column with full-width inputs.
6. Release the Playwright lock.
7. Append the completion record to `IMPLEMENTATION_LOG.md` per Rule 7.

## Follow-ups

- Phase 13 will turn `/models/[id]` from a placeholder into the actual workspace.
- Phase 17 will turn `/events/[id]` into the trip workspace.
- Phase 21 will retranslate the Arabic placeholders we shipped here.
- Phase 21 will also remove `comingSoon: true` from the budgeting card on `/finance/page.tsx` (the finance super-hub) — DO NOT do that here; that finance-hub change is a Phase 21 cleanup step so we can validate the new pages end-to-end before flipping the gate.
- If `createFinancialModelSchema` / `createEventBudgetSchema` / `EventBudget.summary.total_cost` / class enrolment-summary endpoint don't exist in their parent phases (03 / 07), record the gap in the completion notes and ping the owning impl to add them. The list and create flows defined here MUST be wired against the real backend before flipping `completed`.

## Rollback

`git revert <commit-sha>` then `pm2 restart web`. The revert restores the placeholder page; no DB changes; no permissions affected. Translation keys removed cleanly because `messages/{locale}.json` revert with the rest. Anyone navigating to `/models` or `/events` after revert will get a 404 from Next.js — acceptable.
