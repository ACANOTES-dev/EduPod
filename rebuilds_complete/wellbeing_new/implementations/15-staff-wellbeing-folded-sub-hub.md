# Implementation 15 — Staff Wellbeing Folded Sub-Hub

> **Wave:** 5 (**parallel-risky** — apply rules H1–H10)
> **Classification:** frontend
> **Depends on:** 12
> **Deploys:** Web restart only

---

## Goal

Today there are five separate routes under staff wellbeing (`/wellbeing/dashboard`, `/wellbeing/my-workload`, `/wellbeing/surveys`, `/wellbeing/survey`, `/wellbeing/reports`, `/wellbeing/resources`), four of which crash on load. This impl folds them into a single rich `/wellbeing/staff` super-hub with internal navigation (in-page anchors + tab strip locally — pastoral-style is allowed inside a page). The five old routes redirect to the new page's hash anchors (`#aggregate`, `#my`, `#surveys`, `#board-report`, `#resources`).

The page restores the data layer that was 404ing — assumes the staff-wellbeing endpoints exist on the backend (per the audit, they do; the live walkthrough showed 404s only because the endpoints' module is not currently deployed/registered for the NHQS tenant). If the endpoints genuinely don't exist after Wave 3, file a follow-up to add a small backend impl.

## Shared files this impl touches

- `apps/web/messages/en.json` + `ar.json` — add `wellbeingStaff.*` namespace. Apply Rules H8 + H9.
- `IMPLEMENTATION_LOG.md` — separate commit.

Hot-zone severity: **HIGH** (translations + multiple page redirects).

## What to build

### 1. New page `apps/web/src/app/[locale]/(school)/wellbeing/staff/page.tsx`

#### Layout

- **PageHeader** — title "Staff Wellbeing", description.
- **In-page nav strip** (sticky-top, inside the page) — links to four sections: My Workload (staff), Aggregate (admin), Surveys (admin), Board Report + Resources. Smooth-scroll on click.
- **Section: My Workload** (`#my`) — every authenticated staff sees this. Personal teaching periods, cover duties this term, timetable quality score. Existing my-workload page logic, but inlined as a section here. Use cards instead of separate pages.
- **Section: Aggregate Dashboard** (`#aggregate`) — admin only. KPI strip (avg teaching load, cover fairness Gini, timetable quality, substitution pressure) + 6 chart panels (workload distribution, cover fairness histogram, timetable quality breakdown, substitution pressure trend, absence trend, correlation chart). Existing dashboard page logic.
- **Section: Surveys** (`#surveys`) — admin only. Survey list + create/edit dialogs. Existing surveys page UI.
- **Section: Board Report** (`#board-report`) — admin only. Termly summary report with print button. Existing reports page UI.
- **Section: EAP & Resources** (`#resources`) — all staff see. EAP card + crisis resources + custom resources. Existing resources page UI.

Each section is a top-level region in the page with a section header (icon + title + brief description).

### 2. Old route redirects

Replace `apps/web/src/app/[locale]/(school)/wellbeing/dashboard/page.tsx` with:

```tsx
import { redirect } from 'next/navigation';
export default function StaffDashboardRedirect({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/wellbeing/staff#aggregate`);
}
```

Repeat for `my-workload` (`#my`), `surveys` (`#surveys` — but `surveys/[id]` stays as a routable detail page; only the list redirects), `reports` (`#board-report`), `resources` (`#resources`).

### 3. Internal organisation

Move the meaningful logic of each old page into co-located components under `apps/web/src/app/[locale]/(school)/wellbeing/staff/_components/`:

```
_components/
├── my-workload-section.tsx
├── aggregate-section.tsx
├── surveys-section.tsx
├── board-report-section.tsx
└── resources-section.tsx
```

These components own their own data fetching, loading states, and empty states. The page just composes them.

### 4. Survey detail page stays

`/wellbeing/surveys/[id]` and the survey-respond `/wellbeing/survey` page stay as separate routes (they're deep-link targets from notifications). Update them only if necessary — link back to `/wellbeing/staff#surveys` as their breadcrumb.

### 5. Translation additions

Namespace `wellbeingStaff.*`. Mirror `wellbeingHub.*` shape. Apply Rule H8.

## Tests

- `wellbeing/staff/page.spec.tsx`:
  - All sections render under principal role
  - Admin-only sections hidden under teacher role; teacher sees only My Workload + Resources
  - Old route redirects fire correctly
- Playwright: visit `/en/wellbeing/staff`, scroll through, click nav strip links, confirm smooth-scroll. Visit `/en/wellbeing/dashboard` and confirm redirect to `#aggregate`.

## Watch out for

- **My Workload restoration** — the audit showed `/api/v1/staff-wellbeing/my-workload/*` endpoints returning 404 on NHQS. Verify they're now wired (post-Wave-3 should not have changed this; if they're still 404, file a follow-up backend task and degrade the section gracefully with an empty state).
- **Sticky in-page nav strip** — keep it small and elegant; this is a pastoral-style internal tab strip, which the user has confirmed is fine. Don't over-engineer; ~48px tall, smooth-scroll on click, active section highlight on scroll.
- **Section visibility by role** — each section component checks role internally and renders nothing (or a permission-denied tile) if the user lacks access. The in-page nav strip hides links for sections the user can't see.

## Deployment notes

- Restart: web only.
- Smoke:
  - `/en/wellbeing/staff` renders all sections (as principal)
  - `/en/wellbeing/dashboard` → 302 → `/en/wellbeing/staff#aggregate`
  - `/en/wellbeing/my-workload` → 302 → `/en/wellbeing/staff#my`
  - All charts that previously crashed now render (or show clean empty states if endpoints are still 404)
