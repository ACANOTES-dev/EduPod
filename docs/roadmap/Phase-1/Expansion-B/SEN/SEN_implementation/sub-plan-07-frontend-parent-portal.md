# SEN Sub-Plan 07 — Frontend + Parent Portal + Cross-Module Integration

## Overview

All frontend pages for the SEN module, parent portal (read-only with input contribution), and lightweight cross-module integration points (student detail badge, attendance/behaviour context, search indexing).

**Depends on**: Sub-plans 01–06 (all API endpoints must exist).

---

## Proposed Changes

### Frontend — Staff SEN Pages

#### [NEW] `apps/web/src/app/[locale]/(school)/sen/`

```
sen/
├── page.tsx                          # SEN dashboard
├── _components/
│   ├── sen-dashboard-cards.tsx       # KPI cards (total SEN, by category, overdue reviews)
│   ├── sen-student-table.tsx         # Student directory table with filters
│   ├── support-plan-card.tsx         # Plan summary card
│   ├── goal-card.tsx                 # SMART goal with progress indicator
│   ├── goal-progress-timeline.tsx    # Progress entries timeline
│   ├── resource-utilisation-chart.tsx # Hours allocated vs. used
│   └── sna-schedule-grid.tsx         # Weekly SNA schedule visualisation
├── students/
│   ├── page.tsx                      # SEN student directory
│   └── [studentId]/
│       └── page.tsx                  # Student SEN profile (tabbed)
├── plans/
│   └── [planId]/
│       ├── page.tsx                  # Support plan detail
│       └── goals/
│           └── new/
│               └── page.tsx          # Create/edit SMART goal form
├── resource-allocation/
│   └── page.tsx                      # School-level SENO hour management
├── sna-assignments/
│   └── page.tsx                      # SNA assignment management
└── reports/
    └── page.tsx                      # SEN reporting hub
```

---

### Page Specifications

#### `/sen` — SEN Dashboard

KPI cards:

- Total SEN students (active profiles)
- Breakdown by primary category (pie/donut chart)
- Breakdown by support level (bar)
- Plans due for review (count + link to compliance report)
- Resource utilisation (percentage bar)

Data source: `GET /v1/sen/overview` + `GET /v1/sen/reports/plan-compliance?due_within_days=14`

#### `/sen/students` — SEN Student Directory

Paginated table with filters:

- Category filter (multi-select)
- Support level filter
- Year group filter
- Active/inactive toggle
- Search (student name)

Each row: student name, year group, primary category, support level, active plan status, SEN coordinator.

Data source: `GET /v1/sen/profiles`

#### `/sen/students/[studentId]` — Student SEN Profile (Tabbed)

Tabs:

1. **Profile** — SEN profile details, category, support level, diagnosis (if user has `sen.view_sensitive`), coordinator
2. **Plans** — Support plan list with status badges, link to plan detail
3. **Resources** — Allocated hours, used hours, utilisation bar
4. **Professionals** — Professional involvement list (visible only with `sen.view_sensitive`)
5. **Accommodations** — Active/inactive accommodations by type
6. **History** — Transition notes timeline

Data source: `GET /v1/sen/profiles/:id` (returns nested data) + individual endpoints per tab

#### `/sen/plans/[planId]` — Support Plan Detail

- Plan metadata (number, status, version, academic year/period, dates)
- Status transition actions (draft→active, active→under_review, etc.)
- Clone button (creates new draft for next term)
- Goals list with progress indicators
- Each goal expandable: target, baseline, current level, strategies, progress timeline
- Parent input / student voice / staff notes sections

Data source: `GET /v1/sen/plans/:id`

#### `/sen/plans/[planId]/goals/new` — SMART Goal Form

React Hook Form + Zod:

```typescript
const form = useForm<CreateSenGoalDto>({
  resolver: zodResolver(createSenGoalSchema),
  defaultValues: {
    title: '',
    target: '',
    baseline: '',
    target_date: '',
    display_order: 0,
  },
});
```

Fields: Title, Target (SMART), Baseline, Target Date. Strategies added inline after creation.

#### `/sen/resource-allocation` — Resource Management

Two sections:

1. **School-level allocations** — SENO hours and school-allocated hours by academic year. CRUD table.
2. **Student-level assignments** — Individual student hour allocation from school total. Utilisation percentage per student. Over-allocation warning.

Data source: `GET /v1/sen/resource-allocations`, `GET /v1/sen/student-hours`, `GET /v1/sen/resource-utilisation`

#### `/sen/sna-assignments` — SNA Assignment Management

Two views:

1. **By SNA** — Grouped by SNA staff member, showing their assigned students and schedule
2. **By Student** — Grouped by student, showing their SNA assignment

CRUD dialogs for assigning, updating schedule, ending assignment.

Data source: `GET /v1/sen/sna-assignments`

#### `/sen/reports` — SEN Reporting Hub

Tab layout:

- **NCSE Return** — Aggregated statistics, exportable
- **Overview** — Category/level/year group breakdowns
- **Resource Utilisation** — Allocation vs. usage charts
- **Plan Compliance** — Due/overdue review list
- **Professional Involvement** — Referral status aggregation

Data source: `GET /v1/sen/reports/*`

---

### Settings Page

#### [NEW] `apps/web/src/app/[locale]/(school)/settings/sen/page.tsx`

SEN module settings form:

- Default review cycle (weeks)
- Auto-flag on referral (toggle)
- SNA schedule format (weekly/daily)
- Enable parent portal access (toggle)
- Plan number prefix (text input)

Data source: tenant settings `sen` section.

---

### Parent Portal

#### [NEW] `apps/web/src/app/[locale]/(school)/parent/sen/`

```
parent/sen/
├── page.tsx              # Parent SEN overview for linked students
└── [planId]/
    └── page.tsx          # Read-only plan view with progress timeline
```

#### `/parent/sen` — Parent SEN Overview

- Shows SEN profile summary for each linked student (primary category, support level, active plan status)
- Link to active plan detail
- Only visible if tenant setting `sen.enable_parent_portal_access` is true

Data source: `GET /v1/sen/students/:studentId/profile` (scoped to parent's linked students)

#### `/parent/sen/[planId]` — Read-Only Plan View

- Plan metadata, goals with progress timeline
- `parent_input` field — editable text area where parents can contribute input to the plan
- All other fields are read-only
- No status transitions, no goal creation, no strategy modification

Data source: `GET /v1/sen/plans/:id`

> **Decision applied**: Parent "contribution" is limited to the `parent_input` text field on the support plan. Parents can view the full plan and submit input text, but cannot create goals, modify strategies, or make structural changes. This matches Irish IEP practice.

---

### Cross-Module Integration (Lightweight)

These are small additions to existing pages — not full features.

#### 1. Student Detail Page — SEN Badge + Tab

#### [MODIFY] `apps/web/src/app/[locale]/(school)/students/[id]/page.tsx`

- Add "SEN" badge next to student name if student has an active SEN profile
- Add "SEN" tab showing profile summary (category, support level, active plan, coordinator)
- Badge and tab only visible to users with `sen.view` permission

API check: `GET /v1/sen/students/:studentId/profile` — if 404, no badge/tab shown.

#### 2. Attendance — SEN Flag

#### [MODIFY] `apps/web/src/app/[locale]/(school)/attendance/mark/[sessionId]/page.tsx`

- Small SEN icon/badge next to student names who have active SEN profiles
- Tooltip shows primary category and support level
- Visual context only (no functional change to attendance marking)

Implementation: On attendance session load, fetch SEN status for all students in the class via a lightweight batch endpoint or by checking a `has_sen_profile` flag on the student response.

#### 3. Behaviour — SEN Context

#### [MODIFY] Behaviour student profile or incident view

- Show SEN profile summary (category, support level, active accommodations count) for context when viewing behaviour incidents
- Only visible to users with `sen.view` permission

#### 4. Search — Meilisearch Indexing

#### [MODIFY] Search indexing pipeline

- Index SEN profiles in Meilisearch alongside students
- Add `sen_category`, `sen_support_level`, `has_sen_profile` fields to the student search index
- Filterable in global search

#### 5. Reports Module — SEN Data Source

Deferred to a later iteration. The SEN Reports controller (Phase 6) provides the data — the unified Reports module can consume it when cross-module analytics are enhanced.

#### 6. Predictive Early Warning — SEN Risk Factor

Deferred. This is a separate Expansion-B item that will consume SEN status as one of its risk factor inputs when implemented.

---

### Navigation Update

#### [MODIFY] Sidebar navigation configuration

Add "SEN" section to the school sidebar navigation:

- Icon: `BookHeart` or `HeartHandshake` from `lucide-react`
- Visible only when `tenant_settings.sen.module_enabled` is true AND user has `sen.view` permission
- Sub-items: Dashboard, Students, Resource Allocation, SNA Assignments, Reports

Add "SEN" to parent sidebar when `sen.enable_parent_portal_access` is true.

---

### i18n Translation Keys

#### [NEW] Translation files

Add SEN-specific translation keys to `en.json` and `ar.json`:

- Navigation labels
- Page titles
- Form labels and validation messages
- Status labels (plan status, goal status, referral status)
- Category and support level human-readable names
- Dashboard card labels
- Empty state messages

---

## Architecture File Updates

After full implementation (all 7 phases), update:

- [feature-map.md](file:///Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/architecture/feature-map.md) — Add SEN Module section (#29) with full endpoint inventory and frontend pages
- [module-blast-radius.md](file:///Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/architecture/module-blast-radius.md) — Add SEN Module as Tier 4 (no downstream dependents initially). Note: cross-module reads of `students`, `class_enrolments`, `class_staff`, `staff_profiles`, `academic_years`, `pastoral_referrals` via Prisma-direct pattern.
- [state-machines.md](file:///Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/architecture/state-machines.md) — Add `SupportPlanStatus` and `SenGoalStatus` state machines with transitions, side effects, guards
- [event-job-catalog.md](file:///Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/architecture/event-job-catalog.md) — Add SEN review reminder cron job (if implemented in a future iteration)

---

## Verification

### Automated

```bash
# Full regression
npx turbo test

# CI pre-flight
npx turbo type-check && npx turbo lint
```

### Manual / Browser Testing

Once deployed, manually verify:

1. SEN dashboard loads with correct KPI cards
2. Student directory filters work (category, support level, year group)
3. Student profile tabs render correctly, sensitive data redacted appropriately
4. Support plan detail shows goals with progress timeline
5. SMART goal creation form validates correctly
6. Resource allocation over-allocation warning shows
7. SNA assignment schedule grid renders
8. Reports tabs load with data
9. Parent portal — read-only view works, parent_input saves
10. Student detail page shows SEN badge + tab
11. Attendance marking shows SEN icon
12. Settings page saves correctly
13. RTL layout (Arabic locale) renders correctly
14. Navigation visibility respects permissions + module_enabled
