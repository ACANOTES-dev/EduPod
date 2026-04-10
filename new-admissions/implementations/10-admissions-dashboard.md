# Implementation 10 — Admissions Dashboard Hub

> **Wave:** 4 (parallelizable with 11, 12, 13, 14)
> **Depends on:** 01, 02, 03
> **Deploys:** Web restart only

---

## Goal

Rewrite `apps/web/src/app/[locale]/(school)/admissions/page.tsx` as a beautiful, dense dashboard hub — matching the pattern of the Operations hub we shipped earlier. Replace the existing stat-cards-plus-table layout with a card grid that routes into the four queue sub-pages (built in impl 11), plus a form preview card (impl 13) and an overrides log card (impl 15).

## Visual spec

Follow the design language of the Operations hub (`apps/web/src/app/[locale]/(school)/operations/page.tsx`):

- `PageHeader` with title "Admissions" and description "Manage applications from submission through approval — every step financially gated."
- Hero section with a row of top-line KPIs (live counts from the API) — Ready to Admit, Waiting List, Conditional Approval, Approved This Month, Rejected This Month.
- Main grid with 2 cards per row on desktop, 1 per row on mobile.
- Cards:
  1. **Ready to Admit** (primary colour, amber if count > 0) — "X applications waiting for your decision" — routes to `/admissions/ready-to-admit`.
  2. **Waiting List** (sky) — "X applications queued — auto-promoted as seats open" — routes to `/admissions/waiting-list`.
  3. **Conditional Approval** (violet, red badge if any have lapsed windows) — "X applications awaiting payment — Y days until first expiry" — routes to `/admissions/conditional-approval`.
  4. **Rejected** (rose, muted) — "X applications rejected to date" — routes to `/admissions/rejected`.
  5. **Admission Form** (emerald) — "Preview the public application form and get the QR code" — routes to `/admissions/form-preview`.
  6. **Overrides Log** (neutral) — "X manual overrides granted to date" — routes to `/admissions/overrides` (impl 15).

Card layout: same visual component as the Operations hub card — icon tile, title, description, arrow, top accent bar, hover glow. Re-use the inline card component pattern rather than extracting a shared one (we did that in Operations and it worked fine).

Layout order:

- Row 1: Ready to Admit, Conditional Approval
- Row 2: Waiting List, Rejected
- Row 3: Admission Form, Overrides Log

## Data the page needs

The dashboard should load once on mount with a single API call that returns everything:

```ts
GET / api / v1 / admissions / dashboard - summary;

Response: {
  data: {
    counts: {
      ready_to_admit: number;
      waiting_list: number;
      waiting_list_awaiting_year_setup: number; // shown as sub-text
      conditional_approval: number;
      conditional_approval_near_expiry: number; // within 2 days
      rejected_total: number;
      approved_this_month: number;
      rejected_this_month: number;
      overrides_total: number;
    }
    capacity_pressure: Array<{
      year_group_id: string;
      year_group_name: string;
      waiting_list_count: number;
      total_capacity: number;
      enrolled_count: number;
      conditional_count: number;
    }>; // top 5 year groups by waiting list size
  }
}
```

Build this endpoint as part of this implementation — add a method to `applicationsService` or a new `admissions-dashboard.service.ts`. Read via capacity service batch + simple `groupBy` counts.

The `capacity_pressure` block is gold for the principal — it directly answers "should I open a new class for 2C?" by showing year groups with the longest waiting lists. Surface it as a small table below the card grid on desktop (optional on mobile).

## What to build

### 1. New backend — `apps/api/src/modules/admissions/admissions-dashboard.service.ts`

Minimal service with one method:

```ts
@Injectable()
export class AdmissionsDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacityService: AdmissionsCapacityService,
  ) {}

  async getSummary(tenantId: string): Promise<DashboardSummary>;
}
```

Implementation runs a handful of `count` queries inside a single RLS transaction, plus a batched capacity lookup for the top-5 waiting-list year groups.

Controller: `GET /v1/admissions/dashboard-summary` on the existing `applications.controller.ts` or a new `admissions-dashboard.controller.ts`. Permission: `admissions.view`.

### 2. New frontend — rewrite `admissions/page.tsx`

Drop the existing stat cards + table entirely. Replace with the dashboard layout described above. Reuse the `PageHeader`, `apiClient`, and the `useRoleCheck` hook. Cards are inline buttons that `router.push` to the sub-pages.

Role gates:

- `admissions.view` → can see Ready to Admit, Waiting List, Conditional Approval, Rejected, Form Preview cards.
- `admissions.manage` → additionally sees the Overrides Log card.
- `front_office` role → sees Ready to Admit, Waiting List, Conditional Approval (can record cash payments and approve applications), does NOT see Overrides Log.

Filter card visibility using the `useRoleCheck` hook like the Operations page does.

### 3. Translations

Add to `apps/web/messages/en.json` under a new `admissionsHub` namespace:

```json
"admissionsHub": {
  "title": "Admissions",
  "description": "Manage applications from submission through approval — every step financially gated.",
  "kpis": {
    "readyToAdmit": "Ready to Admit",
    "waitingList": "Waiting List",
    "conditionalApproval": "Conditional Approval",
    "approvedThisMonth": "Approved this month",
    "rejectedThisMonth": "Rejected this month"
  },
  "cards": {
    "readyToAdmit": {
      "title": "Ready to Admit",
      "description": "{count} applications waiting for your decision",
      "zero": "No applications waiting for review"
    },
    "waitingList": { "title": "...", "description": "...", "zero": "..." },
    "conditionalApproval": {
      "title": "Conditional Approval",
      "description": "{count} awaiting payment",
      "nearExpiry": "{count} expiring within 2 days",
      "zero": "No pending payments"
    },
    "rejected": { ... },
    "formPreview": {
      "title": "Admission Form",
      "description": "Preview the public form and get the QR code"
    },
    "overrides": {
      "title": "Overrides Log",
      "description": "{count} admin overrides granted"
    }
  },
  "capacityPressure": {
    "title": "Capacity pressure",
    "subtitle": "Year groups with the longest waiting lists",
    "headerYearGroup": "Year group",
    "headerWaiting": "Waiting",
    "headerCapacity": "Capacity / Enrolled / Conditional",
    "empty": "No waiting list activity"
  }
}
```

Arabic equivalents in `ar.json`.

### 4. Loading / empty states

- Skeleton loader while the summary fetches (cards as pulse boxes).
- If all counts are zero, show a friendly empty state card: "No application activity yet. Share your public form link to start receiving applications."

### 5. Auto-refresh

Add a lightweight poll: refetch the summary every 60 seconds while the page is visible. Use `document.visibilityState` to pause when the tab is hidden.

## Tests

Frontend:

- Component renders cards with live counts.
- Near-expiry badge shows when `conditional_approval_near_expiry > 0`.
- Role-based card visibility.
- Empty state rendering.

Backend:

- `AdmissionsDashboardService.getSummary` returns correct counts for a seeded dataset.
- Cross-tenant RLS leakage test.

## Deployment

1. Commit locally.
2. Patch → production.
3. Build `@school/api` (for the new endpoint) and `@school/web`.
4. Restart api and web: `pm2 restart api web --update-env`.
5. Smoke test: visit `/en/admissions` on production and verify the dashboard renders. Check all card links route correctly (even if the target sub-pages aren't built yet — they'll 404, which is expected mid-rebuild).
6. Update `IMPLEMENTATION_LOG.md`.

## Definition of done

- Dashboard summary endpoint built and tested.
- Frontend dashboard page rewritten and tested.
- Translations added in EN + AR.
- Auto-refresh on visibility.
- Role-aware card visibility.
- API + web restarted on production.
- Completion record added to the log.

## Notes for downstream implementations

- **11 (queue sub-pages)** are the targets of every card link. Ensure the href values match the routes impl 11 creates.
- **15 (cleanup)** updates the Operations hub's Admissions card to show a live count of `ready_to_admit` applications (pulled from this same endpoint).
