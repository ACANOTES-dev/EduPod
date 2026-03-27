# Sub-Plan 5: Frontend Completion

> **Module**: Behaviour Management
> **Status**: Implementation Spec
> **Date**: 2026-03-27
> **Scope**: i18n extraction (44 files), student analytics tab, 7 stub endpoint replacements, sidebar navigation, permission checks, notification preferences UI, RTL verification

---

## Table of Contents

1. [Inventory Summary](#1-inventory-summary)
2. [Task 1: i18n Extraction](#2-task-1-i18n-extraction)
3. [Task 2: Student Profile Analytics Tab](#3-task-2-student-profile-analytics-tab)
4. [Task 3: Stub Endpoint Replacement](#4-task-3-stub-endpoint-replacement)
5. [Task 4: Sidebar Navigation](#5-task-4-sidebar-navigation)
6. [Task 5: Frontend Permission Checks](#6-task-5-frontend-permission-checks)
7. [Task 6: Notification Preferences UI](#7-task-6-notification-preferences-ui)
8. [Task 7: Guardian Restrictions UI Verification](#8-task-7-guardian-restrictions-ui-verification)
9. [RTL Compliance Verification Plan](#9-rtl-compliance-verification-plan)
10. [Execution Order & Dependencies](#10-execution-order--dependencies)
11. [Acceptance Criteria Summary](#11-acceptance-criteria-summary)

---

## 1. Inventory Summary

### Files Requiring i18n Work

**Behaviour pages** (31 `.tsx` files):
| # | Path | String Estimate |
|---|------|-----------------|
| 1 | `behaviour/page.tsx` | ~15 |
| 2 | `behaviour/incidents/page.tsx` | ~25 |
| 3 | `behaviour/incidents/[id]/page.tsx` | ~40 |
| 4 | `behaviour/incidents/new/page.tsx` | ~35 |
| 5 | `behaviour/students/page.tsx` | ~15 |
| 6 | `behaviour/students/[studentId]/page.tsx` | ~20 |
| 7 | `behaviour/sanctions/page.tsx` | ~40 |
| 8 | `behaviour/sanctions/today/page.tsx` | ~15 |
| 9 | `behaviour/interventions/page.tsx` | ~25 |
| 10 | `behaviour/interventions/[id]/page.tsx` | ~30 |
| 11 | `behaviour/interventions/new/page.tsx` | ~25 |
| 12 | `behaviour/exclusions/page.tsx` | ~25 |
| 13 | `behaviour/exclusions/[id]/page.tsx` | ~30 |
| 14 | `behaviour/alerts/page.tsx` | ~25 |
| 15 | `behaviour/analytics/page.tsx` | ~35 |
| 16 | `behaviour/analytics/ai/page.tsx` | ~20 |
| 17 | `behaviour/tasks/page.tsx` | ~20 |
| 18 | `behaviour/appeals/page.tsx` | ~25 |
| 19 | `behaviour/appeals/[id]/page.tsx` | ~30 |
| 20 | `behaviour/recognition/page.tsx` | ~25 |
| 21 | `behaviour/amendments/page.tsx` | ~20 |
| 22 | `behaviour/documents/page.tsx` | ~20 |
| 23 | `behaviour/parent-portal/page.tsx` | ~25 |
| 24 | `behaviour/parent-portal/recognition/page.tsx` | ~15 |

**Safeguarding pages** (6 `.tsx` files):
| # | Path | String Estimate |
|---|------|-----------------|
| 25 | `safeguarding/page.tsx` | ~20 |
| 26 | `safeguarding/concerns/page.tsx` | ~25 |
| 27 | `safeguarding/concerns/[id]/page.tsx` | ~35 |
| 28 | `safeguarding/concerns/new/page.tsx` | ~25 |
| 29 | `safeguarding/my-reports/page.tsx` | ~15 |
| 30 | `settings/safeguarding/page.tsx` | ~20 |

**Behaviour settings pages** (7 `.tsx` files):
| # | Path | String Estimate |
|---|------|-----------------|
| 31 | `settings/behaviour-general/page.tsx` | ~50 |
| 32 | `settings/behaviour-categories/page.tsx` | ~20 |
| 33 | `settings/behaviour-policies/page.tsx` | ~25 |
| 34 | `settings/behaviour-houses/page.tsx` | ~15 |
| 35 | `settings/behaviour-awards/page.tsx` | ~20 |
| 36 | `settings/behaviour-admin/page.tsx` | ~15 |
| 37 | `settings/behaviour-documents/page.tsx` | ~15 |

**Shared components** (12 `.tsx` files):
| # | Path | String Estimate |
|---|------|-----------------|
| 38 | `components/behaviour/incident-card.tsx` | ~8 |
| 39 | `components/behaviour/incident-status-badge.tsx` | ~8 |
| 40 | `components/behaviour/quick-log-sheet.tsx` | ~15 |
| 41 | `components/behaviour/quick-log-fab.tsx` | ~3 |
| 42 | `components/behaviour/student-behaviour-header.tsx` | ~10 |
| 43 | `components/behaviour/category-picker.tsx` | ~5 |
| 44 | `components/behaviour/action-timeline.tsx` | ~10 |
| 45 | `components/behaviour/sla-indicator.tsx` | ~5 |
| 46 | `components/behaviour/safeguarding-severity-badge.tsx` | ~5 |
| 47 | `components/behaviour/safeguarding-status-badge.tsx` | ~8 |
| 48 | `components/behaviour/concern-card.tsx` | ~8 |
| 49 | `components/behaviour/break-glass-banner.tsx` | ~5 |

**Total estimated translatable strings**: ~950-1050 unique keys.

---

## 2. Task 1: i18n Extraction

### Current State

Zero behaviour/safeguarding pages use `useTranslations()` or `getTranslations()`. All user-facing text is hardcoded English. The translation files (`messages/en.json`, `messages/ar.json`) contain only a `nav.behaviour` / `nav.behaviourDashboard` key -- no `behaviour` section exists.

### Established Pattern (from Finance, Payroll, etc.)

The codebase uses `next-intl` consistently across all other modules:

**Client components** (which all behaviour pages are):
```typescript
import { useTranslations } from 'next-intl';

export default function SomePage() {
  const t = useTranslations('behaviour');       // scoped namespace
  // or: const t = useTranslations('behaviour.sanctions'); // nested scope
  return <PageHeader title={t('dashboard.title')} />;
}
```

**Server components** (not currently used in behaviour, but for reference):
```typescript
import { getTranslations } from 'next-intl/server';

export default async function SomePage() {
  const t = await getTranslations('behaviour');
  ...
}
```

### Translation Key Naming Convention

Follow the existing pattern from `finance`, `payroll`, `scheduling` sections:

```
behaviour.{page}.{element}
```

**Namespace structure**:
```json
{
  "behaviour": {
    "dashboard": {
      "title": "Behaviour Pulse",
      "description": "Overview of recent behaviour activity",
      "totalIncidents": "Total Incidents",
      "positiveNegative": "Positive / Negative",
      "openTasks": "Open Tasks",
      "overdue": "Overdue",
      "needsAttention": "needs attention",
      "allIncidents": "All Incidents",
      "students": "Students",
      "tasks": "Tasks",
      "escalated": "Escalated",
      "recentActivity": "Recent Activity",
      "viewAll": "View all",
      "noRecentIncidents": "No recent incidents",
      "logIncident": "Log Incident"
    },
    "incidents": {
      "title": "Behaviour Incidents",
      "newIncident": "New Incident",
      "tabs": {
        "all": "All",
        "positive": "Positive",
        "negative": "Negative",
        "pending": "Pending",
        "escalated": "Escalated",
        "my": "My"
      },
      "columns": {
        "date": "Date",
        "category": "Category",
        "students": "Student(s)",
        "status": "Status",
        "reporter": "Reporter"
      },
      "filters": {
        "dateFrom": "Date from",
        "dateTo": "Date to",
        "allCategories": "All Categories",
        "allStatuses": "All Statuses",
        "active": "Active",
        "investigating": "Investigating",
        "escalated": "Escalated",
        "resolved": "Resolved",
        "withdrawn": "Withdrawn"
      },
      "noIncidents": "No incidents found"
    },
    "sanctions": {
      "title": "Sanctions",
      "description": "Manage sanctions, detentions, and suspensions",
      "todaysDetentions": "Today's Detentions",
      "markServed": "Mark Served",
      "saving": "Saving...",
      "searchStudent": "Search student...",
      "tabs": { "list": "List", "calendar": "Calendar" },
      "calendarViewSoon": "Calendar view coming soon",
      "calendarViewDesc": "Visualise sanctions on a calendar to manage scheduling and room allocation.",
      "noSanctions": "No sanctions",
      "noSanctionsFilter": "No sanctions match the current filters",
      "unknownStudent": "Unknown Student",
      "columns": { ... },
      "types": {
        "detention": "Detention",
        "suspension_internal": "Internal Suspension",
        "suspension_external": "External Suspension",
        "expulsion": "Expulsion",
        "community_service": "Community Service",
        "loss_of_privilege": "Loss of Privilege",
        "restorative_meeting": "Restorative Meeting",
        "other": "Other"
      },
      "statuses": {
        "pending_approval": "Pending Approval",
        "scheduled": "Scheduled",
        "served": "Served",
        ...
      }
    },
    "studentProfile": { ... },
    "analytics": { ... },
    "interventions": { ... },
    "alerts": { ... },
    "appeals": { ... },
    "recognition": { ... },
    "amendments": { ... },
    "documents": { ... },
    "tasks": { ... },
    "exclusions": { ... },
    "parentPortal": { ... },
    "aiQuery": { ... }
  },
  "safeguarding": {
    "dashboard": { ... },
    "concerns": { ... },
    "myReports": { ... }
  },
  "behaviourSettings": {
    "general": { ... },
    "categories": { ... },
    "policies": { ... },
    "houses": { ... },
    "awards": { ... },
    "admin": { ... },
    "documents": { ... }
  }
}
```

### Extraction Strategy

**Phase 1 -- Extract constants and record maps first (high-density areas)**

Many pages define `Record<string, string>` maps for status labels, type labels, etc. These are the densest string concentrations:

- `sanctions/page.tsx`: `TYPE_LABELS` (8 entries), `STATUS_LABELS` (11 entries)
- `alerts/page.tsx`: `ALERT_TYPE_LABELS` (7 entries)
- `parent-portal/page.tsx`: `SANCTION_TYPE_LABELS` (8 entries)
- `exclusions/page.tsx`: `STATUS_COLORS` labels
- Tab label arrays: `TABS` arrays in incidents, interventions, sanctions, alerts, student profile

These get extracted to nested translation keys like `behaviour.sanctions.types.detention`.

**Phase 2 -- Extract inline strings page-by-page**

For each page:
1. Add `import { useTranslations } from 'next-intl';`
2. Add `const t = useTranslations('behaviour.{section}');` (or appropriate scope)
3. Replace every hardcoded English string with `t('keyName')`
4. For strings with interpolation (e.g., `Page ${page} of ${total}`), use ICU message format: `t('pagination', { page, total })` with key `"Page {page} of {total}"`

**Phase 3 -- Extract component strings**

Shared components in `components/behaviour/` get their own `useTranslations` call scoped to their relevant namespace, OR accept translated strings as props (prefer passing translated props when the component is used with different namespaces).

**Phase 4 -- Arabic translations**

After all English keys are extracted:
1. Copy the `behaviour` and `safeguarding` sections to `messages/ar.json`
2. Translate all values to Arabic
3. The `behaviourSettings` section also needs Arabic translation

### i18n Rules for Enum/Status Display

Pattern already established in the codebase: map enum values to translation keys rather than using `Record<string, string>` constants.

**Before** (current pattern in sanctions):
```typescript
const TYPE_LABELS: Record<string, string> = {
  detention: 'Detention',
  suspension_internal: 'Internal Suspension',
};
// Usage: TYPE_LABELS[row.type]
```

**After**:
```typescript
const t = useTranslations('behaviour.sanctions');
// Usage: t(`types.${row.type}` as Parameters<typeof t>[0])
```

This pattern is used in `settings/notifications/page.tsx` already.

### Acceptance Criteria -- i18n

- [ ] All 49 files (31 behaviour pages + 6 safeguarding pages + 7 settings pages + 12 components -- some components may not need i18n if they only receive translated props) import and use `useTranslations`
- [ ] Zero hardcoded English user-facing strings remain in behaviour/safeguarding files
- [ ] `messages/en.json` has a complete `behaviour`, `safeguarding`, and `behaviourSettings` section
- [ ] `messages/ar.json` has matching Arabic translations for all keys
- [ ] ICU message format used for all interpolated strings (pagination, counts, names)
- [ ] `turbo type-check` passes
- [ ] `turbo lint` passes
- [ ] Pages render correctly in both English and Arabic locales
- [ ] No untranslated key warnings in console

---

## 3. Task 2: Student Profile Analytics Tab

### Current State

File: `apps/web/src/app/[locale]/(school)/behaviour/students/[studentId]/page.tsx`

The Analytics tab currently renders a placeholder:
```tsx
{activeTab === 'Analytics' && (
  <div className="rounded-xl border border-dashed border-border bg-surface py-12 text-center">
    <p className="text-sm font-medium text-text-tertiary">Analytics</p>
    <p className="mt-1 text-xs text-text-tertiary">Coming in Phase E</p>
  </div>
)}
```

### Spec (from master spec section 3.7)

The Analytics tab requires:
1. **Points trend chart** -- line chart showing points accumulation over time
2. **Category donut** -- pie/donut chart showing incident distribution by category
3. **Time heatmap** -- day-of-week x period grid (same pattern as school-wide analytics, but student-specific, exposure-adjusted)
4. **Subject correlation** -- bar chart or table showing incident counts per subject
5. **Cohort comparison** -- the student vs their year group peers

### Data Source

The backend stub `GET /behaviour/students/:studentId/analytics` currently returns `{ data: null }`.

This endpoint needs to be implemented to return:
```typescript
interface StudentAnalyticsResponse {
  data: {
    points_trend: Array<{
      date: string;        // ISO date
      cumulative: number;  // running total
      positive: number;    // daily positive points
      negative: number;    // daily negative points
    }>;
    category_breakdown: Array<{
      category_id: string;
      category_name: string;
      polarity: string;
      count: number;
      percentage: number;
    }>;
    time_heatmap: Array<{
      weekday: number;     // 1-5 (Mon-Fri)
      period_order: number;
      count: number;
      exposure_adjusted_rate: number | null;
    }>;
    subject_correlation: Array<{
      subject_id: string;
      subject_name: string;
      positive_count: number;
      negative_count: number;
      total_count: number;
      rate_per_100_periods: number | null;
    }>;
    cohort_comparison: {
      student_positive_rate: number | null;
      student_negative_rate: number | null;
      cohort_avg_positive_rate: number | null;
      cohort_avg_negative_rate: number | null;
      cohort_size: number;
      year_group_name: string | null;
    };
  };
}
```

### Frontend Implementation

**Chart library**: Recharts (already used in `analytics/page.tsx` -- `LineChart`, `BarChart`, `ResponsiveContainer`, `Tooltip`, etc.)

**Layout** (responsive):
```
Mobile (< 768px): Single column, full width, vertically stacked
Desktop (>= 768px): 2-column grid for smaller charts, full width for trend line
```

**Component breakdown**:

1. **Points Trend** (full width):
   - `LineChart` with `ResponsiveContainer` width="100%" height={256}
   - Three lines: cumulative (primary color), positive (green), negative (red)
   - `CartesianGrid`, `XAxis` (date), `YAxis`, `Tooltip`
   - Date format: abbreviated (e.g., "15 Mar")

2. **Category Donut** (half width on desktop):
   - Use Recharts `PieChart` with `Pie` component, `innerRadius` for donut
   - Colors: positive=green, negative=red, neutral=gray (match category color if available)
   - Center label: total count
   - Legend below the chart on mobile

3. **Time Heatmap** (half width on desktop):
   - Reuse the same grid pattern from `analytics/page.tsx` (day-of-week x period)
   - 5 columns (Mon-Fri) x 8 rows (P1-P8)
   - Color intensity based on count (same green/amber/red scale)
   - Tooltip showing exact count on hover

4. **Subject Correlation** (full width):
   - Horizontal `BarChart` (same pattern as category breakdown in school analytics)
   - Each bar split by positive/negative
   - Show rate per 100 periods if exposure data is available

5. **Cohort Comparison** (full width):
   - Two-column stat display: student vs cohort average
   - Positive rate and negative rate side-by-side
   - Visual indicator (up/down arrow) if student is above/below cohort average
   - Year group label

**Loading state**: Skeleton placeholders matching chart dimensions.
**Empty state**: "No analytics data available yet" message when `data` is null or all arrays are empty.
**Error state**: Toast via apiClient error handler, show fallback message.

### Acceptance Criteria -- Student Analytics Tab

- [ ] Points trend line chart renders with real data from API
- [ ] Category donut chart renders with correct colors and proportions
- [ ] Time heatmap grid renders with 5x8 cells
- [ ] Subject correlation bar chart renders horizontally
- [ ] Cohort comparison displays student vs year group averages
- [ ] Loading skeleton shown while fetching
- [ ] Empty state shown when no data
- [ ] Responsive: single column on mobile, 2-column grid on desktop
- [ ] RTL-safe: all logical properties, chart labels readable in both directions
- [ ] All chart labels use translation keys

---

## 4. Task 3: Stub Endpoint Replacement

### Current Stubs in `behaviour-students.controller.ts`

All stubs are in `apps/api/src/modules/behaviour/behaviour-students.controller.ts`. The controller methods exist with correct decorators, guards, and routes -- only the implementation body is missing.

| # | Endpoint | Permission | Current Return | Required Implementation |
|---|----------|-----------|----------------|------------------------|
| 1 | `GET /students/:id/analytics` | `behaviour.view` | `{ data: null }` | Aggregate incident data for trend, category, heatmap, subject, cohort |
| 2 | `GET /students/:id/sanctions` | `behaviour.view` | `{ data: [], meta }` | Query `behaviour_sanctions` filtered by student_id, paginated |
| 3 | `GET /students/:id/interventions` | `behaviour.view` | `{ data: [], meta }` | Query `behaviour_interventions` filtered by student_id, paginated |
| 4 | `GET /students/:id/awards` | `behaviour.view` | `{ data: [], meta }` | Query `behaviour_student_awards` filtered by student_id, paginated |
| 5 | `GET /students/:id/ai-summary` | `behaviour.ai_query` | `{ data: null }` | Generate AI narrative summary of student behaviour (uses AI service) |
| 6 | `GET /students/:id/export` | `behaviour.manage` | `{ data: null }` | Generate PDF export of student behaviour profile |
| 7 | `GET /students/:id/parent-view` | `parent.view_behaviour` | `{ data: null }` | Return parent-safe filtered view of student behaviour data |

### Implementation Details per Endpoint

**1. Student Analytics** (`getStudentAnalytics`):
- Service method in `BehaviourStudentsService`
- Queries: `behaviour_incidents` (with participants join for student filter), `behaviour_incident_participants` grouped by period/weekday, `behaviour_sanctions` grouped by category
- Cohort comparison: query all students in same year group, compute average rates
- Exposure adjustment: read from scheduling data if available, otherwise return null for adjusted rates
- Response shape: see `StudentAnalyticsResponse` in Task 2 above

**2. Student Sanctions** (`getStudentSanctions`):
- Service method in `BehaviourStudentsService`
- Query `behaviour_sanctions` WHERE student_id = :studentId
- Include: incident (incident_number, description), supervised_by (first_name, last_name)
- Paginated with standard `{ data, meta }` response
- Sort by scheduled_date DESC

**3. Student Interventions** (`getStudentInterventions`):
- Service method in `BehaviourStudentsService`
- Query `behaviour_interventions` WHERE student_id = :studentId
- Include: assigned_to_user, latest review
- Paginated with standard `{ data, meta }` response
- Sort by start_date DESC

**4. Student Awards** (`getStudentAwards`):
- Service method in `BehaviourStudentsService`
- Query `behaviour_student_awards` WHERE student_id = :studentId
- Include: award definition (name, icon, color, tier), awarded_by_user
- Paginated with standard `{ data, meta }` response
- Sort by awarded_at DESC

**5. Student AI Summary** (`getStudentAiSummary`):
- Service method in `BehaviourStudentsService`
- Requires `behaviour.ai_query` permission (already set in decorator)
- Uses the AI service (if available) to generate a narrative summary
- Input: student's incident history, sanctions, interventions, points
- Output: structured narrative text with confidence score
- If AI service unavailable: return `{ data: null, message: 'AI service unavailable' }`

**6. Student PDF Export** (`exportStudentPdf`):
- Service method in `BehaviourStudentsService`
- Requires `behaviour.manage` permission (already set)
- Generates PDF with: profile header, points summary, incident timeline, sanctions list, intervention history, awards
- Uses existing PDF generation infrastructure
- Returns: binary PDF stream with correct content-type headers

**7. Parent View** (`getParentView`):
- Service method in `BehaviourStudentsService` (or `BehaviourParentService`)
- Requires `parent.view_behaviour` permission
- Data classification filter: only return PARENT-class fields
- Filter incidents by `parent_visible = true` on category
- Use `parent_description` (not raw `description`) for incident text
- Exclude: staff notes, context notes, SEND data, safeguarding data
- Include: acknowledgement status, sanctions (type + date only), awards

### Acceptance Criteria -- Stub Endpoints

- [ ] All 7 endpoints return real data from the database (not placeholder)
- [ ] Each endpoint has at least one happy-path unit test
- [ ] Each endpoint has a permission-denied test (wrong permission returns 403)
- [ ] Parent view endpoint enforces data classification filtering
- [ ] All queries are tenant-scoped via RLS (interactive transactions)
- [ ] Pagination works correctly on list endpoints
- [ ] `turbo test` passes with no regressions

---

## 5. Task 4: Sidebar Navigation

### Current State

File: `apps/web/src/app/[locale]/(school)/layout.tsx`

The sidebar already has a behaviour section (lines 122-127):
```typescript
{
  labelKey: 'nav.behaviour',
  roles: STAFF_ROLES,
  items: [
    { icon: Shield, labelKey: 'nav.behaviourDashboard', href: '/behaviour' },
  ],
},
```

This is a single link to the behaviour dashboard. The behaviour module has 10+ top-level pages that could benefit from sub-navigation in the sidebar.

### Required Changes

**Option A -- Expand the sidebar section with key sub-pages** (recommended):

The behaviour module is large but most navigation happens within the module itself. The sidebar should have the main entry point plus a few high-traffic links. The internal page navigation (tabs, quick links) handles the rest.

```typescript
{
  labelKey: 'nav.behaviour',
  roles: STAFF_ROLES,
  items: [
    { icon: Shield, labelKey: 'nav.behaviourDashboard', href: '/behaviour' },
    { icon: Activity, labelKey: 'nav.behaviourIncidents', href: '/behaviour/incidents', roles: STAFF_ROLES },
    { icon: Users, labelKey: 'nav.behaviourStudents', href: '/behaviour/students', roles: STAFF_ROLES },
    { icon: ShieldAlert, labelKey: 'nav.safeguarding', href: '/safeguarding', roles: ADMIN_ROLES },
  ],
},
```

**Translation keys to add** (in both `en.json` and `ar.json`):
```json
{
  "nav": {
    "behaviourIncidents": "Incidents",
    "behaviourStudents": "Student Profiles",
    "safeguarding": "Safeguarding"
  }
}
```

**Also add to `RequireRole` route map** in `apps/web/src/components/require-role.tsx`:
```typescript
{ prefix: '/behaviour', roles: ['school_principal', 'admin', 'school_vice_principal', 'teacher'] },
{ prefix: '/safeguarding', roles: ['school_principal', 'admin', 'school_vice_principal', 'teacher'] },
```

Note: The parent portal pages under `/behaviour/parent-portal` need separate handling -- parents access those via the parent dashboard, not the sidebar.

### Top-Level Href Update

Add the new sidebar hrefs to the `TOP_LEVEL_HREFS` set (derived from `navSections`) so they don't show a back button. This happens automatically since the set is computed from `navSections.flatMap(s => s.items.map(i => i.href))`.

### Acceptance Criteria -- Sidebar

- [ ] Behaviour section in sidebar shows 3-4 links (dashboard, incidents, students, safeguarding)
- [ ] Safeguarding link only visible to admin roles
- [ ] Sidebar labels use translation keys
- [ ] Sidebar items highlight correctly when on their respective pages
- [ ] `RequireRole` route map updated for `/behaviour` and `/safeguarding` prefixes
- [ ] Mobile sidebar renders the same items
- [ ] No back button shown on top-level sidebar pages

---

## 6. Task 5: Frontend Permission Checks

### Current State

**No frontend permission checks** exist in any behaviour/safeguarding page. The pages rely entirely on:
1. `RequireRole` component -- role-based route access (but currently NO entries for `/behaviour` or `/safeguarding`)
2. Backend `@RequiresPermission()` decorators -- returns 403 if permission missing

This means a user who has the `teacher` role but lacks `behaviour.view` permission can navigate to behaviour pages, see the skeleton/loading state, and then get empty results or errors when the API calls fail with 403.

### Required Changes

**Level 1 -- Add route-role mapping** (mandatory, minimal effort):

Add to `ROUTE_ROLE_MAP` in `require-role.tsx`:
```typescript
{ prefix: '/behaviour', roles: ['school_principal', 'admin', 'school_vice_principal', 'teacher'] },
{ prefix: '/behaviour/parent-portal', roles: ['parent'] },
{ prefix: '/safeguarding', roles: ['school_principal', 'admin', 'school_vice_principal', 'teacher'] },
```

**Level 2 -- Permission-aware UI gating** (recommended for safeguarding):

For safeguarding pages specifically, where data is highly sensitive, add explicit permission checking. The existing `useAuth` hook provides user data including memberships and roles. The permissions themselves are loaded from the backend per-request via the auth token.

Strategy: Create a lightweight `usePermissions` hook (or extend `useAuth`) that caches the user's permissions. Use it to conditionally render or redirect.

```typescript
// Hook approach:
function useHasPermission(permission: string): boolean | null {
  // null = still loading, true/false = resolved
  const { user } = useAuth();
  const [perms, setPerms] = React.useState<string[] | null>(null);

  React.useEffect(() => {
    if (user) {
      apiClient<{ data: string[] }>('/api/v1/auth/permissions')
        .then(res => setPerms(res.data))
        .catch(() => setPerms([]));
    }
  }, [user]);

  if (perms === null) return null;
  return perms.includes(permission);
}
```

Alternatively, since the backend already returns 403 on unauthorized requests, the frontend can handle this gracefully:

```typescript
// In each safeguarding page:
const [permissionDenied, setPermissionDenied] = React.useState(false);

// In API call catch:
.catch((err) => {
  if (err?.status === 403) setPermissionDenied(true);
});

// In render:
if (permissionDenied) {
  return <PermissionDenied message={t('permissionDenied')} />;
}
```

**Level 3 -- Conditional UI elements based on permissions**:

Certain actions should be hidden if the user lacks specific permissions:
- "Log Incident" button: visible only with `behaviour.log`
- Sanctions management actions: visible only with `behaviour.manage`
- AI Query link: visible only with `behaviour.ai_query`
- Staff analytics section: visible only with `behaviour.view_staff_analytics`
- Settings pages: visible only with `behaviour.admin`
- Export PDF button: visible only with `behaviour.manage`

This requires the permissions to be available client-side. The recommended approach is to add permissions to the JWT payload (already partially done -- the `JwtPayload` type exists in `@school/shared`) or fetch once and cache.

### Acceptance Criteria -- Permission Checks

- [ ] `RequireRole` route map includes `/behaviour` and `/safeguarding` entries
- [ ] Parents are redirected away from staff behaviour pages
- [ ] Safeguarding pages show a permission-denied state (not a blank page) when 403 received
- [ ] Action buttons (Log Incident, Export, AI Query) are conditionally hidden based on permissions
- [ ] Settings navigation items only visible to users with `behaviour.admin` permission

---

## 7. Task 6: Notification Preferences UI

### Current State

The existing notification preferences page is at `apps/web/src/app/[locale]/(school)/settings/notifications/page.tsx`. It uses a table layout with:
- Notification type column (type label)
- Enabled toggle (Switch)
- Channel checkboxes (email, sms, push)

The `TYPE_LABEL_KEYS` map currently lists 12 notification types (invoice, payment, report card, attendance, admission, announcement, approval, inquiry, payroll, payslip). Behaviour notification types are not listed.

### Required Changes

**Add behaviour notification types to the existing notification settings page**:

The backend needs to include these notification types in the response:
```typescript
const BEHAVIOUR_NOTIFICATION_TYPES = {
  'behaviour.incident_logged': 'notifBehaviourIncidentLogged',
  'behaviour.sanction_assigned': 'notifBehaviourSanctionAssigned',
  'behaviour.intervention_started': 'notifBehaviourInterventionStarted',
  'behaviour.intervention_review_due': 'notifBehaviourInterventionReviewDue',
  'behaviour.award_earned': 'notifBehaviourAwardEarned',
  'behaviour.alert_triggered': 'notifBehaviourAlertTriggered',
  'behaviour.appeal_submitted': 'notifBehaviourAppealSubmitted',
  'behaviour.appeal_decided': 'notifBehaviourAppealDecided',
  'behaviour.safeguarding_concern_raised': 'notifBehaviourSafeguardingConcern',
  'behaviour.acknowledgement_required': 'notifBehaviourAcknowledgementRequired',
};
```

**Parent-specific toggles** (in parent portal or parent profile):

Parents need type-specific notification preferences:
- Positive incidents: on/off
- Negative incidents (above threshold): on/off
- Sanctions: on/off (always on for certain types)
- Acknowledgement requests: on/off (forced on -- cannot disable)
- Daily digest vs immediate: toggle
- Digest time preference: time picker

This should be in the parent's profile/communication preferences page (`/profile/communication`), not in the admin settings. The backend already has `parent_notification_*` settings in the behaviour config -- those are school-level defaults. The parent-level overrides are per-user.

**File changes**:
1. `settings/notifications/page.tsx` -- add behaviour entries to `TYPE_LABEL_KEYS`
2. `messages/en.json` and `messages/ar.json` -- add translation keys for notification type labels
3. Parent communication page -- add behaviour notification preference section

### Acceptance Criteria -- Notification Preferences

- [ ] Behaviour notification types appear in admin notification settings page
- [ ] Each behaviour notification type has enable/disable toggle and channel selection
- [ ] Parent portal has behaviour-specific notification preferences
- [ ] Acknowledgement-required notifications cannot be disabled (forced on)
- [ ] Digest vs immediate toggle works for parent notifications
- [ ] Translation keys exist for all notification type labels

---

## 8. Task 7: Guardian Restrictions UI Verification

### Current State

Guardian restrictions are referenced in the master spec (task types, entity types) but the UI for managing them needs verification.

The `behaviour_tasks` table supports `guardian_restriction_review` as a task type, and `guardian_restriction` as an entity type. The settings page `behaviour-general/page.tsx` has parent visibility settings but no specific guardian restriction management UI.

### Required Verification

1. Does `behaviour-admin/page.tsx` include a guardian restrictions section?
2. Is there a dedicated page for viewing/managing guardian restrictions?
3. Can staff set guardian-level access restrictions from the student profile?

### If Missing -- Required Implementation

A guardian restrictions management UI would be a simple CRUD page:
- List existing restrictions for a student (filterable by status)
- Create restriction: select student, select guardian, set restriction type (no contact, supervised access only, no data access), set effective dates
- View restriction details with audit trail
- Review/renew/revoke workflow

This would live at `behaviour/students/[studentId]` as an additional tab or at a dedicated settings page.

### Acceptance Criteria -- Guardian Restrictions

- [ ] Verify whether guardian restriction UI exists
- [ ] If missing: create CRUD interface for managing restrictions
- [ ] Restrictions show in student profile context
- [ ] Staff can create, review, and revoke restrictions
- [ ] All text uses translation keys

---

## 9. RTL Compliance Verification Plan

### Automated Checks

1. **Lint rule scan**: Run `turbo lint` on all behaviour files -- the ESLint rule catches physical directional classes (`ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`, `rounded-l-`, `rounded-r-`, `border-l-`, `border-r-`).

2. **Grep scan for violations**:
   ```bash
   grep -rn 'ml-\|mr-\|pl-\|pr-\|left-\|right-\|text-left\|text-right\|rounded-l-\|rounded-r-\|border-l-\|border-r-' \
     apps/web/src/app/\[locale\]/\(school\)/behaviour/ \
     apps/web/src/app/\[locale\]/\(school\)/safeguarding/ \
     apps/web/src/components/behaviour/
   ```

3. **Exceptions that are NOT violations**:
   - `rtl:rotate-180` on icons (this is correct RTL handling)
   - CSS custom property values
   - Tailwind arbitrary values in brackets

### Manual Verification Checklist

For each page, verify in Arabic locale (`/ar/behaviour/...`):

- [ ] Page header alignment flips correctly
- [ ] Navigation arrows rotate (ArrowLeft has `rtl:rotate-180`)
- [ ] Table headers align correctly (text-start/text-end)
- [ ] Filter dropdowns open in correct direction
- [ ] Card layouts flow correctly
- [ ] Badge text is readable
- [ ] Form labels and inputs align correctly
- [ ] Pagination controls are in correct order
- [ ] Charts: axis labels readable, tooltips positioned correctly
- [ ] Heatmap: day labels in correct order for RTL
- [ ] Mobile card layouts: action buttons accessible
- [ ] Modal/dialog content flows correctly
- [ ] Toast notifications appear from correct side

### Known RTL Patterns in Codebase

The codebase correctly uses logical properties throughout:
- `me-2` (margin-end) instead of `mr-2`
- `ms-2` (margin-start) instead of `ml-2`
- `pe-4` (padding-end) instead of `pr-4`
- `ps-4` (padding-start) instead of `pl-4`
- `text-start` / `text-end` instead of `text-left` / `text-right`
- `border-s-4` instead of `border-l-4`
- `rtl:rotate-180` on directional icons

The sanctions page uses `border-s-amber-500` (correct) for accent borders.

### Recharts RTL Considerations

Recharts does not natively support RTL. The charts will render LTR regardless of locale. This is acceptable -- numerical charts are universally read left-to-right. The wrapper text (titles, labels, legends) should use RTL-aware containers.

---

## 10. Execution Order & Dependencies

```
Task 4: Sidebar Navigation ─────────────────┐
                                              │  (no dependencies, can run first)
Task 5: Frontend Permission Checks ──────────┤
                                              │
Task 3: Stub Endpoints (backend) ────────────┤  (parallel -- backend work)
                                              │
Task 2: Student Analytics Tab ───────────────┤  (depends on Task 3 endpoint #1)
                                              │
Task 1: i18n Extraction ─────────────────────┤  (largest task, can run in parallel)
                                              │  (must touch all files -- do AFTER
                                              │   Tasks 2, 4, 5 to avoid merge conflicts)
                                              │
Task 6: Notification Preferences UI ─────────┤  (independent)
                                              │
Task 7: Guardian Restrictions Verification ──┤  (independent, verification first)
                                              │
RTL Verification ────────────────────────────┘  (LAST -- after all other tasks)
```

**Recommended execution sequence**:
1. Tasks 4 + 5 (sidebar + permissions) -- small, quick, independent
2. Task 3 (stub endpoints) -- backend work, no frontend conflicts
3. Task 2 (analytics tab) -- depends on Task 3 endpoint #1
4. Task 7 (guardian restrictions verification) -- may or may not require implementation
5. Task 6 (notification preferences) -- moderate, independent
6. Task 1 (i18n extraction) -- largest task, touches every file, do last to avoid merge conflicts
7. RTL verification sweep -- final pass

**Estimated effort**:
- Task 1 (i18n): 4-6 hours (mechanical extraction + Arabic translation)
- Task 2 (analytics tab): 2-3 hours (charts + API integration)
- Task 3 (stub endpoints): 3-4 hours (7 service methods + tests)
- Task 4 (sidebar): 30 minutes
- Task 5 (permissions): 1-2 hours
- Task 6 (notifications): 1-2 hours
- Task 7 (guardian restrictions): 1-3 hours (depends on verification outcome)
- RTL verification: 1 hour

**Total estimated effort**: 13-21 hours

---

## 11. Acceptance Criteria Summary

### Gate Criteria (ALL must pass)

1. **Zero hardcoded English strings** in behaviour/safeguarding frontend files
2. **Complete Arabic translations** for all extracted keys
3. **All 7 stub endpoints** replaced with real implementations
4. **Student analytics tab** renders 5 chart types with real data
5. **Sidebar** shows behaviour section with sub-navigation
6. **Route-role mapping** covers all behaviour/safeguarding paths
7. **`turbo lint`** passes with zero errors
8. **`turbo type-check`** passes with zero errors
9. **`turbo test`** passes with zero regressions
10. **RTL verification** -- zero physical directional classes in behaviour files
11. **Notification preferences** include behaviour notification types
12. **Guardian restrictions** UI verified or implemented

### Regression Check

After all changes:
```bash
turbo test
turbo lint
turbo type-check
```

All must pass. Any pre-existing test that breaks must be fixed before marking complete.
