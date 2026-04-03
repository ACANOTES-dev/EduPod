# SP4: Analytics Completion — Detailed Implementation Spec

**Status**: Ready for implementation
**Dependencies**: SP1 (cron registration for pattern detection and MV refresh)
**Estimated tasks**: 11 discrete work items
**Risk**: Low-medium (all work is additive to existing analytics service)

---

## Table of Contents

1. [Gap 1: Export Functionality](#gap-1-export-functionality)
2. [Gap 2: ETB Benchmarking Query Endpoints](#gap-2-etb-benchmarking-query-endpoints)
3. [Gap 3: Teacher-Level Analytics](#gap-3-teacher-level-analytics)
4. [Gap 4: Class-Level Comparisons](#gap-4-class-level-comparisons)
5. [Gap 5: Exposure Normalisation](#gap-5-exposure-normalisation)
6. [Gap 6: Sanction Served/No-Show Tracking](#gap-6-sanction-servedno-show-tracking)
7. [Gap 7: Intervention SEND Breakdown](#gap-7-intervention-send-breakdown)
8. [Gap 8: avg_days_to_complete](#gap-8-avg_days_to_complete)
9. [Gap 9: Student Profile Analytics Tab](#gap-9-student-profile-analytics-tab)
10. [Gap 10: Attendance Overlay](#gap-10-attendance-overlay)
11. [Gap 11: Pattern Detection End-to-End Verification](#gap-11-pattern-detection-end-to-end-verification)

---

## Existing Infrastructure Summary

### PDF Generation

- **Puppeteer pipeline exists**: `apps/api/src/modules/pdf-rendering/pdf-rendering.service.ts`
  - `PdfRenderingService` manages a shared browser instance
  - `renderPdf(templateKey, locale, data, branding)` renders HTML template to PDF buffer
  - `renderFromHtml(html)` renders raw HTML to PDF — useful for dynamic analytics exports
  - Template registration via `TEMPLATES` record keyed by template name + locale
- **Report export service exists**: `apps/api/src/modules/reports/report-export.service.ts`
  - `generateFormattedExcel(data, config)` produces XLSX with headers
  - `generateBrandedPdf(data, config)` produces PDF from tabular data
- **Frontend export-utils**: `apps/web/src/lib/export-utils.ts`
  - Client-side jsPDF + jspdf-autotable for quick PDF
  - Client-side XLSX for Excel
  - Pattern: `exportToExcel({ fileName, columns, rows })` / `exportToPdf({ fileName, title, columns, rows })`
- **Behaviour document service exists**: `apps/api/src/modules/behaviour/behaviour-document.service.ts`
  - Already generates detention notices, suspension letters as PDFs with Puppeteer
  - Uses S3 upload for storage

### Materialised Views (all exist, WITH DATA)

- `mv_student_behaviour_summary` — per student/academic year aggregates (positive/negative/neutral counts, points, ratio)
- `mv_behaviour_benchmarks` — ETB benchmarking by canonical category per tenant/year/period with cohort minimum suppression
- `mv_behaviour_exposure_rates` — teaching period counts from schedules joined to classes/enrolments/academic periods

### Cron/Worker Infrastructure

- `CronSchedulerService` at `apps/worker/src/cron/cron-scheduler.service.ts` — currently only registers gradebook crons
- `RefreshMVProcessor` at `apps/worker/src/processors/behaviour/refresh-mv.processor.ts` — handles all three MV refreshes
- `DetectPatternsProcessor` at `apps/worker/src/processors/behaviour/detect-patterns.processor.ts` — fully implemented (7 pattern types)
- **SP1 dependency**: Cron registration for `behaviour:refresh-mv-*` and `behaviour:detect-patterns` jobs not yet wired

### Schema Key Facts

- `BehaviourSanction.status` is `SanctionStatus` enum with values: `pending_approval`, `scheduled`, `served`, `partially_served`, `no_show`, `excused`, `cancelled`, `rescheduled`, `not_served_absent`, `appealed`, `replaced`, `superseded`
- `BehaviourSanction.served_at` (DateTime?) already exists
- `BehaviourIntervention.send_aware` (Boolean) already exists — this is the SEND flag
- `BehaviourTask.completed_at` (DateTime?) already exists
- `BehaviourTask.created_at` (DateTime) already exists
- `BehaviourCategory.benchmark_category` (BenchmarkCategory enum) already exists
- `DailyAttendanceSummary` has `student_id`, `summary_date`, `derived_status` — joinable for attendance overlay
- `Student` model has NO dedicated `send_status` field — SEND awareness is tracked per-intervention

---

## Gap 1: Export Functionality

### Current State

- `behaviour-students.controller.ts` line 182-187: `exportStudentPdf()` returns `{ data: null, message: 'PDF export not yet implemented' }`
- No CSV export endpoint exists anywhere in the behaviour module
- No case file export endpoint (separate from safeguarding case file which does exist)

### Required Exports (from spec section 4 data classification)

1. **Student Pack PDF** — STAFF-class data, watermarked "CONFIDENTIAL"
2. **CSV export** — tabular incident/sanction/intervention data for the analytics dashboard
3. **Case file export** — SAFEGUARDING-class, watermarked, audit-logged (separate from safeguarding module's own case file)

### Implementation Plan

#### 1a. Student Pack PDF

**File**: `apps/api/src/modules/behaviour/behaviour-export.service.ts` (new)

```
Service: BehaviourExportService
Dependencies: PrismaService, PdfRenderingService, BehaviourScopeService
```

**Method**: `generateStudentPackPdf(tenantId, studentId, userId, locale): Promise<Buffer>`

Steps:

1. Load student profile (name, year group, class)
2. Load incident history (STAFF-class fields only — strip `context_notes`, SEND details, safeguarding flags)
3. Load sanction history
4. Load intervention summary (no SEND notes)
5. Load points summary from `mv_student_behaviour_summary`
6. Load recognition awards
7. Build HTML from template
8. Add watermark: diagonal "CONFIDENTIAL" in 45-degree light grey text, repeated across each page
9. Render PDF via `PdfRenderingService.renderFromHtml(html)`
10. Return Buffer

**Template**: `apps/api/src/modules/pdf-rendering/templates/student-behaviour-pack-en.template.ts` (new)

- Bilingual: create `student-behaviour-pack-ar.template.ts` as well
- Register in `PdfRenderingService.TEMPLATES` under key `'student-behaviour-pack'`
- Template structure:
  - Header: School name, logo, "Student Behaviour Report — CONFIDENTIAL"
  - Student info: Name, year group, class, date range
  - Summary cards: Total incidents, positive ratio, points balance
  - Incident table: Date, category, polarity, status, reported by, description (parent_description only)
  - Sanctions table: Type, date, status, served/no-show
  - Interventions table: Title, type, status, outcome
  - Awards table: Award type, date, reason
  - Footer: Generated date, page numbers

**Watermark implementation**: CSS-based in template

```css
.page::before {
  content: 'CONFIDENTIAL';
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-45deg);
  font-size: 80px;
  color: rgba(200, 200, 200, 0.3);
  z-index: 1000;
  pointer-events: none;
}
```

**Controller update**: Replace stub in `behaviour-students.controller.ts` line 179-187:

```typescript
@Get('behaviour/students/:studentId/export')
@RequiresPermission('behaviour.manage')
@HttpCode(HttpStatus.OK)
async exportStudentPdf(
  @CurrentTenant() tenant: TenantContext,
  @CurrentUser() user: JwtPayload,
  @Param('studentId', ParseUUIDPipe) studentId: string,
  @Res() res: Response,
) {
  const locale = 'en'; // Derive from Accept-Language or query param
  const buffer = await this.exportService.generateStudentPackPdf(
    tenant.tenant_id, studentId, user.sub, locale,
  );
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="student-behaviour-pack-${studentId.slice(0, 8)}.pdf"`,
  });
  res.send(buffer);
}
```

**Audit logging**: The `AuditLogInterceptor` captures the export action automatically. Add `export_type: 'student_pack'` to response metadata for tracing.

#### 1b. CSV Export Endpoint

**New endpoint on analytics controller** (`behaviour-analytics.controller.ts`):

```
GET /v1/behaviour/analytics/export/csv
Permission: behaviour.manage
Query params: Same as behaviourAnalyticsQuerySchema + exportType enum
```

**Export types** (add to `behaviourAnalyticsQuerySchema` for this endpoint):

- `incidents` — all incidents matching filters
- `sanctions` — all sanctions matching filters
- `interventions` — all interventions matching filters
- `categories` — category breakdown (same as analytics categories)
- `staff_activity` — staff logging table

**Implementation** in `BehaviourExportService`:

```
generateCsvExport(tenantId, userId, permissions, query, exportType): Promise<{ buffer: Buffer; filename: string }>
```

Steps:

1. Fetch data based on `exportType` using existing analytics service methods (or direct queries for raw incident lists)
2. Map to flat columns (no nested objects)
3. Generate CSV string with header row
4. Return as Buffer with `text/csv` content type

**CSV format rules**:

- UTF-8 BOM prefix (`\uFEFF`) for Excel compatibility
- Comma-separated
- Double-quote fields containing commas or newlines
- Date format: ISO 8601 (YYYY-MM-DD)
- Monetary values: 2 decimal places
- Null values: empty string

#### 1c. Case File Export

Defer to safeguarding module scope — the safeguarding controller already has `v1/safeguarding/:id/case-file` endpoint. If behaviour-specific case file is needed (incidents + sanctions + interventions for a student, including SENSITIVE-class data), implement as:

```
GET /v1/behaviour/students/:studentId/case-file
Permission: behaviour.view_sensitive
```

Uses same pattern as student pack but includes `context_notes`, SEND details, adds stronger watermark "STRICTLY CONFIDENTIAL — SENSITIVE DATA".

### Acceptance Criteria

- [ ] `GET /v1/behaviour/students/:id/export` returns a valid PDF buffer (not the stub JSON)
- [ ] PDF contains watermark text "CONFIDENTIAL" visible on every page
- [ ] PDF contains student name, incident table, sanctions, interventions, awards
- [ ] PDF strips `context_notes` and safeguarding data (STAFF-class only)
- [ ] `GET /v1/behaviour/analytics/export/csv` returns valid CSV for each export type
- [ ] CSV has BOM prefix and correct headers
- [ ] Both endpoints require `behaviour.manage` permission
- [ ] Audit log records the export action

---

## Gap 2: ETB Benchmarking Query Endpoints

### Current State

- `mv_behaviour_benchmarks` MV exists and is populated (defined in `post_migrate.sql` of migration `20260326220000`)
- MV contains: `tenant_id`, `academic_year_id`, `academic_period_id`, `benchmark_category`, `student_count`, `incident_count`, `rate_per_100`, `computed_at`
- HAVING clause enforces `benchmark_min_cohort_size` (default 10) from tenant settings
- `BenchmarkCategory` enum has 13 values: praise, merit, minor_positive, major_positive, verbal_warning, written_warning, detention, internal_suspension, external_suspension, expulsion, note, observation, other
- Tenant settings schema already has `cross_school_benchmarking_enabled` (default false) and `benchmark_min_cohort_size` (default 10)
- **No query endpoints exist** — the MV is populated but never read by the API

### Implementation Plan

#### 2a. Benchmark Query Schema (packages/shared)

Add to `packages/shared/src/behaviour/schemas/analytics.schema.ts`:

```typescript
export const benchmarkQuerySchema = z.object({
  academicYearId: z.string().uuid(),
  academicPeriodId: z.string().uuid().optional(),
});

export interface BenchmarkEntry {
  benchmark_category: string;
  student_count: number;
  incident_count: number;
  rate_per_100: number;
}

export interface BenchmarkResult {
  entries: BenchmarkEntry[];
  academic_year_id: string;
  academic_period_id: string | null;
  tenant_opted_in: boolean;
  data_quality: DataQuality;
}
```

#### 2b. Service Method

Add to `BehaviourAnalyticsService`:

```typescript
async getBenchmarks(
  tenantId: string,
  query: { academicYearId: string; academicPeriodId?: string },
): Promise<BenchmarkResult>
```

Steps:

1. Check tenant opt-in: read `cross_school_benchmarking_enabled` from tenant settings
2. If not opted in, return `{ entries: [], tenant_opted_in: false }`
3. Query `mv_behaviour_benchmarks` via raw SQL (MV not in Prisma schema):
   ```sql
   SELECT benchmark_category, student_count, incident_count, rate_per_100
   FROM mv_behaviour_benchmarks
   WHERE tenant_id = $1::uuid
     AND academic_year_id = $2::uuid
     AND ($3::uuid IS NULL OR academic_period_id = $3::uuid)
   ORDER BY benchmark_category
   ```
4. Return results with `tenant_opted_in: true`

**Important**: This endpoint returns the tenant's own data for self-comparison. Cross-tenant aggregation (ETB panel) is a platform-level feature, not tenant-scoped. The tenant endpoint lets schools see where they sit relative to the taxonomy.

#### 2c. Controller Endpoint

Add to `BehaviourAnalyticsController`:

```
GET /v1/behaviour/analytics/benchmarks
Permission: behaviour.admin
Query: benchmarkQuerySchema
```

#### 2d. Anonymity Rules Enforcement

- Already enforced in MV definition (HAVING clause with min cohort size)
- API layer: verify `cross_school_benchmarking_enabled` before returning data
- No student names, descriptions, or staff names in the MV by design
- Rate is per-100-students, not raw counts

### Acceptance Criteria

- [ ] `GET /v1/behaviour/analytics/benchmarks?academicYearId=X` returns data from `mv_behaviour_benchmarks`
- [ ] Returns `{ entries: [], tenant_opted_in: false }` when `cross_school_benchmarking_enabled` is false
- [ ] Data grouped by `benchmark_category` (13 canonical values)
- [ ] No student-level data in response
- [ ] Requires `behaviour.admin` permission
- [ ] Cohort minimum suppression is enforced (comes from MV HAVING clause)

---

## Gap 3: Teacher-Level Analytics

### Current State

- `getStaffActivity()` in `behaviour-analytics.service.ts` (lines 404-501) reports logging activity per staff member
- This shows only **logging volume** (how many incidents each teacher logged), not **incident rate** (how many incidents occurred in that teacher's classes/lessons)
- No per-teacher incident rate endpoint exists
- The `mv_behaviour_exposure_rates` MV includes `staff_id` (mapped from `schedules.teacher_staff_id`) — this is the teaching exposure data needed

### Implementation Plan

#### 3a. New Method: `getTeacherAnalytics()`

Add to `BehaviourAnalyticsService`:

```typescript
async getTeacherAnalytics(
  tenantId: string,
  query: BehaviourAnalyticsQuery,
): Promise<TeacherAnalyticsResult>
```

Steps:

1. Get incidents grouped by the teacher who was teaching at the time (join through `subject_id` + `schedules` or use the `reported_by_id` as fallback when subject_id is null)
2. For teacher identification, query incidents where `subject_id IS NOT NULL`, then join to `classes` -> `schedules` to find the teacher_staff_id for that subject/class/time
3. Alternatively (simpler, more reliable): use the `reported_by_id` for logging rate AND query `mv_behaviour_exposure_rates` for teaching exposure per staff
4. Compute: `incident_rate = incidents_in_teacher_lessons / total_teaching_periods * 100`

**Practical approach** (avoids complex schedule-time-matching):

- Step 1: Get all incidents with `subject_id NOT NULL` in date range
- Step 2: For each subject_id, find the teacher via `schedules` table (the teacher_staff_id assigned to classes teaching that subject)
- Step 3: Group incident counts by teacher
- Step 4: Get exposure from `mv_behaviour_exposure_rates` grouped by `staff_id`
- Step 5: Compute rate

#### 3b. Shared Types

Add to `analytics.schema.ts`:

```typescript
export interface TeacherAnalyticsEntry {
  teacher_id: string;
  teacher_name: string;
  incidents_in_lessons: number;
  incidents_logged: number;
  total_teaching_periods: number;
  incident_rate_per_100: number | null;
  last_logged_at: string | null;
  inactive_flag: boolean;
}

export interface TeacherAnalyticsResult {
  entries: TeacherAnalyticsEntry[];
  data_quality: DataQuality;
}
```

#### 3c. Controller Endpoint

Add to `BehaviourAnalyticsController`:

```
GET /v1/behaviour/analytics/teachers
Permission: behaviour.view_staff_analytics
Query: behaviourAnalyticsQuerySchema
```

This is intentionally separate from the existing `GET /v1/behaviour/analytics/staff` endpoint (which shows logging activity). The teacher analytics endpoint shows incident rates in that teacher's classes.

### Acceptance Criteria

- [ ] `GET /v1/behaviour/analytics/teachers` returns per-teacher incident rate
- [ ] Each entry includes both `incidents_in_lessons` (incidents during their classes) and `incidents_logged` (incidents they reported)
- [ ] `incident_rate_per_100` uses exposure data from `mv_behaviour_exposure_rates` when available, null otherwise
- [ ] Requires `behaviour.view_staff_analytics` permission
- [ ] Falls back gracefully if exposure MV is empty

---

## Gap 4: Class-Level Comparisons

### Current State

- `getComparisons()` in `behaviour-analytics.service.ts` (lines 617-682) provides year-group-level comparisons only
- Groups by `year_group_id` via participant -> student -> year_group
- No class-level grouping exists
- The `behaviourAnalyticsQuerySchema` already has `classId` as an optional filter but no dedicated class comparison endpoint

### Implementation Plan

#### 4a. New Method: `getClassComparisons()`

Add to `BehaviourAnalyticsService`:

```typescript
async getClassComparisons(
  tenantId: string,
  userId: string,
  permissions: string[],
  query: BehaviourAnalyticsQuery,
): Promise<ClassComparisonResult>
```

Steps:

1. Get scope filter
2. Query incidents with participant -> student -> class_enrolments join
3. Group by class_id
4. Get student counts per class from class_enrolments
5. Compute rates per class (incident_rate, positive_rate, negative_rate per student)
6. Include class name, year group name, teacher name

```typescript
// Key query approach
const incidents = await this.prisma.behaviourIncident.findMany({
  where,
  select: {
    polarity: true,
    participants: {
      where: { participant_type: 'student' },
      select: {
        student: {
          select: {
            class_enrolments: {
              where: { status: 'active' },
              select: {
                class: { select: { id: true, name: true, year_group: { select: { name: true } } } },
              },
            },
          },
        },
      },
    },
  },
});
```

#### 4b. Shared Types

Add to `analytics.schema.ts`:

```typescript
export interface ClassComparisonEntry {
  class_id: string;
  class_name: string;
  year_group_name: string;
  incident_rate: number | null;
  positive_rate: number | null;
  negative_rate: number | null;
  student_count: number;
}

export interface ClassComparisonResult {
  entries: ClassComparisonEntry[];
  data_quality: DataQuality;
}
```

#### 4c. Controller Endpoint

Add to `BehaviourAnalyticsController`:

```
GET /v1/behaviour/analytics/class-comparisons
Permission: behaviour.view
Query: behaviourAnalyticsQuerySchema (yearGroupId can filter to a single year group's classes)
```

### Acceptance Criteria

- [ ] `GET /v1/behaviour/analytics/class-comparisons` returns per-class incident rates
- [ ] Each entry includes class name, year group name, and student count
- [ ] Rates are per-student (incident_count / student_count \* 100)
- [ ] Respects scope filtering (class-teacher sees only own classes)
- [ ] Can filter by `yearGroupId` to show classes within a year group

---

## Gap 5: Exposure Normalisation

### Current State

- `mv_behaviour_exposure_rates` MV exists and is populated (defined in `post_migrate.sql`)
- MV contains: `tenant_id`, `academic_year_id`, `academic_period_id`, `effective_from`, `effective_until`, `subject_id`, `staff_id`, `year_group_id`, `context_type`, `total_teaching_periods`, `total_students`, `computed_at`
- `getSubjects()` method (line 363-378) tries to read from MV when `query.exposureNormalised` is true
- **The query works** but the MV may not be refreshed (depends on SP1 cron being registered)
- `getHeatmap()` always returns `rate: null` (line 211) — never attempts exposure normalisation
- `getComparisons()` uses student count normalisation, not teaching period normalisation
- `getOverview()` always passes `false` to `makeDataQuality()` (line 160)
- `getTrends()` always passes `false` (line 267)

### Implementation Plan

#### 5a. Heatmap Exposure Normalisation

In `getHeatmap()` (line 175-219), after the raw data grouping:

1. If `query.exposureNormalised` is true, query `mv_behaviour_exposure_rates`:

   ```sql
   SELECT subject_id, SUM(total_teaching_periods) as periods
   FROM mv_behaviour_exposure_rates
   WHERE tenant_id = $1::uuid
   GROUP BY subject_id
   ```

   Note: Heatmap is by weekday/period, not by subject. The normalisation for heatmap should be:
   - Total teaching periods happening at that weekday/period combination
   - This requires matching `schedules` by day_of_week and period_order

2. **Alternative (simpler, more accurate)**: For heatmap, the rate should be `incidents / total_classes_at_that_slot`. Query the `schedules` table directly:

   ```sql
   SELECT
     EXTRACT(DOW FROM s.effective_start_date) as weekday,
     s.period_order,
     COUNT(DISTINCT s.id) as total_slots
   FROM schedules s
   WHERE s.tenant_id = $1::uuid
   GROUP BY weekday, s.period_order
   ```

3. Compute: `rate = raw_count / total_slots_at_that_time * 100`

4. Update the `rate` field in each `HeatmapCell` (currently hardcoded null at line 211)

5. Update `data_quality.exposure_normalised` to `true` when rate is computed

#### 5b. Overview Data Quality Flag

In `getOverview()` (line 160): Change `this.makeDataQuality(false)` to check if exposure data is available:

```typescript
// After existing queries, check MV availability
let exposureAvailable = false;
try {
  const mvCheck = await this.prisma.$queryRaw<[{ exists: boolean }]>`
    SELECT EXISTS (SELECT 1 FROM mv_behaviour_exposure_rates WHERE tenant_id = ${tenantId}::uuid LIMIT 1) as exists
  `;
  exposureAvailable = mvCheck[0]?.exists ?? false;
} catch { /* MV not available */ }

return { ..., data_quality: this.makeDataQuality(exposureAvailable) };
```

#### 5c. Trends Data Quality

Same pattern for `getTrends()` — check MV availability and set flag.

### Acceptance Criteria

- [ ] Heatmap `rate` field is no longer always null when exposure data exists
- [ ] `data_quality.exposure_normalised` reflects actual MV data availability
- [ ] Graceful fallback when MV is empty or doesn't exist (rate stays null, flag stays false)
- [ ] Rate calculation uses appropriate denominator for each context (teaching periods for subjects, class slots for heatmap)

---

## Gap 6: Sanction Served/No-Show Tracking

### Current State

- `getSanctions()` in `behaviour-analytics.service.ts` (lines 505-531)
- Line 525: `served: 0` — hardcoded
- Line 526: `no_show: 0` — hardcoded
- The `BehaviourSanction` model has `status` field with enum values including `served`, `partially_served`, `no_show`
- The `served_at` DateTime field exists

### Implementation Plan

Replace the `groupBy` approach with a more detailed query that counts statuses:

```typescript
async getSanctions(
  tenantId: string,
  userId: string,
  permissions: string[],
  query: BehaviourAnalyticsQuery,
): Promise<SanctionSummaryResult> {
  const { from, to } = this.buildDateRange(query);

  // Group by type AND status to get served/no-show counts
  const rawData = await this.prisma.behaviourSanction.groupBy({
    by: ['type', 'status'],
    where: {
      tenant_id: tenantId,
      created_at: { gte: from, lte: to },
    },
    _count: { _all: true },
  });

  // Aggregate by type
  const typeMap = new Map<string, { total: number; served: number; no_show: number }>();

  for (const row of rawData) {
    const existing = typeMap.get(row.type as string) ?? { total: 0, served: 0, no_show: 0 };
    existing.total += row._count._all;
    if (row.status === 'served' || row.status === 'partially_served') {
      existing.served += row._count._all;
    }
    if (row.status === 'no_show' || row.status === 'not_served_absent') {
      existing.no_show += row._count._all;
    }
    typeMap.set(row.type as string, existing);
  }

  const entries = Array.from(typeMap.entries()).map(([type, data]) => ({
    sanction_type: type,
    total: data.total,
    served: data.served,
    no_show: data.no_show,
    trend_percent: null as number | null,
  }));

  return { entries, data_quality: this.makeDataQuality(false) };
}
```

**Key change**: Group by `['type', 'status']` instead of just `['type']`, then post-process to aggregate served and no-show counts.

### Exact Lines to Change

- `behaviour-analytics.service.ts` lines 505-531: Replace entire `getSanctions()` method

### Acceptance Criteria

- [ ] `served` field reflects actual count of sanctions with status `served` or `partially_served`
- [ ] `no_show` field reflects actual count of sanctions with status `no_show` or `not_served_absent`
- [ ] Total still includes all statuses
- [ ] No hardcoded zeros remain

---

## Gap 7: Intervention SEND Breakdown

### Current State

- `getInterventionOutcomes()` in `behaviour-analytics.service.ts` (lines 535-559)
- Line 554: `send_count: 0` — hardcoded
- Line 555: `non_send_count: row._count` — hardcoded (always equals total)
- The `BehaviourIntervention` model has `send_aware: Boolean @default(false)` field

### Implementation Plan

Change the query to include `send_aware` in the groupBy:

```typescript
async getInterventionOutcomes(
  tenantId: string,
  query: BehaviourAnalyticsQuery,
): Promise<InterventionOutcomeResult> {
  const { from, to } = this.buildDateRange(query);

  // Group by outcome AND send_aware
  const rawData = await this.prisma.behaviourIntervention.groupBy({
    by: ['outcome', 'send_aware'],
    where: {
      tenant_id: tenantId,
      created_at: { gte: from, lte: to },
      outcome: { not: null },
    },
    _count: true,
  });

  // Aggregate by outcome
  const outcomeMap = new Map<string, { count: number; send_count: number; non_send_count: number }>();

  for (const row of rawData) {
    const key = (row.outcome as string) ?? 'unknown';
    const existing = outcomeMap.get(key) ?? { count: 0, send_count: 0, non_send_count: 0 };
    existing.count += row._count;
    if (row.send_aware) {
      existing.send_count += row._count;
    } else {
      existing.non_send_count += row._count;
    }
    outcomeMap.set(key, existing);
  }

  const entries = Array.from(outcomeMap.entries()).map(([outcome, data]) => ({
    outcome,
    count: data.count,
    send_count: data.send_count,
    non_send_count: data.non_send_count,
  }));

  return { entries, data_quality: this.makeDataQuality(false) };
}
```

### Exact Lines to Change

- `behaviour-analytics.service.ts` lines 535-559: Replace entire `getInterventionOutcomes()` method

### Acceptance Criteria

- [ ] `send_count` reflects interventions where `send_aware = true`
- [ ] `non_send_count` reflects interventions where `send_aware = false`
- [ ] `count = send_count + non_send_count` for each outcome
- [ ] No hardcoded zeros remain

---

## Gap 8: avg_days_to_complete

### Current State

- `getTaskCompletion()` in `behaviour-analytics.service.ts` line 792: `avg_days_to_complete: null` with comment "Requires individual record analysis"
- `getInterventionOutcomes()` does not have an avg_days field but the shared type `InterventionOutcomeEntry` does not include it either — only tasks have this field
- `BehaviourTask` has both `created_at` and `completed_at` fields — difference gives days to complete

### Implementation Plan

After the existing groupBy query in `getTaskCompletion()`, add a second query:

```typescript
// Calculate avg_days_to_complete for completed tasks
const completedTasks = await this.prisma.behaviourTask.findMany({
  where: {
    tenant_id: tenantId,
    created_at: { gte: from, lte: to },
    status: 'completed' as $Enums.BehaviourTaskStatus,
    completed_at: { not: null },
  },
  select: {
    task_type: true,
    created_at: true,
    completed_at: true,
  },
});

// Group by task_type and compute average
const avgDaysMap = new Map<string, number>();
const taskTypeGroups = new Map<string, number[]>();

for (const task of completedTasks) {
  if (!task.completed_at) continue;
  const days = (task.completed_at.getTime() - task.created_at.getTime()) / (1000 * 60 * 60 * 24);
  const existing = taskTypeGroups.get(task.task_type as string) ?? [];
  existing.push(days);
  taskTypeGroups.set(task.task_type as string, existing);
}

for (const [type, daysList] of taskTypeGroups) {
  const avg = daysList.reduce((sum, d) => sum + d, 0) / daysList.length;
  avgDaysMap.set(type, Math.round(avg * 10) / 10); // 1 decimal place
}
```

Then in the entries mapping:

```typescript
const entries = Array.from(taskTypeMap.entries()).map(([type, data]) => ({
  task_type: type,
  total: data.total,
  completed: data.completed,
  overdue: data.overdue,
  completion_rate: data.total > 0 ? data.completed / data.total : 0,
  avg_days_to_complete: avgDaysMap.get(type) ?? null,
}));
```

### Exact Lines to Change

- `behaviour-analytics.service.ts` lines 738-796: Extend `getTaskCompletion()` method
- Line 792: Replace `avg_days_to_complete: null` with the computed value

### Acceptance Criteria

- [ ] `avg_days_to_complete` shows actual average for completed tasks of each type
- [ ] Average is in days with 1 decimal place precision
- [ ] Returns null for task types with no completed tasks
- [ ] Only considers tasks where `completed_at` is not null

---

## Gap 9: Student Profile Analytics Tab

### Current State

- `apps/web/src/app/[locale]/(school)/behaviour/students/[studentId]/page.tsx` lines 197-202:
  ```tsx
  {
    activeTab === 'Analytics' && (
      <div className="rounded-xl border border-dashed border-border bg-surface py-12 text-center">
        <p className="text-sm font-medium text-text-tertiary">Analytics</p>
        <p className="mt-1 text-xs text-text-tertiary">Coming in Phase E</p>
      </div>
    );
  }
  ```
- Backend stub exists: `behaviour-students.controller.ts` lines 96-103:
  ```typescript
  async getStudentAnalytics(@Param('studentId', ParseUUIDPipe) _studentId: string) {
    return { data: null, message: 'Student analytics not yet implemented' };
  }
  ```

### Implementation Plan

#### 9a. Backend: Student Analytics Endpoint

Replace stub in `behaviour-students.controller.ts`:

**New service method** in `BehaviourStudentsService`:

```typescript
async getStudentAnalytics(tenantId: string, studentId: string): Promise<StudentAnalyticsResult>
```

Returns:

```typescript
{
  summary: {
    total_incidents: number;
    positive_count: number;
    negative_count: number;
    neutral_count: number;
    positive_ratio: number | null;
    total_points: number;
    active_interventions: number;
    pending_sanctions: number;
  };
  trend: TrendPoint[];          // Last 90 days, weekly buckets
  category_breakdown: Array<{   // Top categories for this student
    category_name: string;
    polarity: string;
    count: number;
  }>;
  period_comparison: Array<{    // Incident counts per academic period
    period_name: string;
    positive: number;
    negative: number;
  }>;
  sanction_history: Array<{
    type: string;
    count: number;
    served: number;
    no_show: number;
  }>;
}
```

Steps:

1. Query `mv_student_behaviour_summary` for aggregate counts (or compute directly if MV unavailable)
2. Query incidents for this student in last 90 days for trend chart
3. GroupBy category for breakdown
4. GroupBy academic period for period comparison
5. Query sanctions grouped by type with status counts

#### 9b. Frontend: Student Analytics Tab

Replace the placeholder at line 197-202 with a real component.

**New component**: `apps/web/src/components/behaviour/student-analytics-tab.tsx`

**Charts** (using existing Recharts dependency):

1. **Trend Line** (LineChart): Positive vs negative incidents over time (weekly, 90 days)
2. **Category Breakdown** (horizontal BarChart): Top 10 categories by count, color-coded by polarity
3. **Period Comparison** (grouped BarChart): Positive/negative per academic period
4. **Summary Cards**: Total incidents, positive ratio, points, active interventions

**Data fetching**: `apiClient<StudentAnalyticsResult>(`/api/v1/behaviour/students/${studentId}/analytics`)`

**Layout** (mobile-first):

```
[Summary Cards - 2x2 grid]
[Trend Chart - full width]
[Category Breakdown - full width]
[Period Comparison - full width, only if multiple periods]
```

#### 9c. Shared Types

Add to `analytics.schema.ts`:

```typescript
export interface StudentAnalyticsResult {
  summary: {
    total_incidents: number;
    positive_count: number;
    negative_count: number;
    neutral_count: number;
    positive_ratio: number | null;
    total_points: number;
    active_interventions: number;
    pending_sanctions: number;
  };
  trend: TrendPoint[];
  category_breakdown: Array<{
    category_name: string;
    polarity: string;
    count: number;
  }>;
  period_comparison: Array<{
    period_name: string;
    positive: number;
    negative: number;
  }>;
  sanction_history: Array<{
    type: string;
    count: number;
    served: number;
    no_show: number;
  }>;
}
```

### Acceptance Criteria

- [ ] Analytics tab shows real data (no placeholder)
- [ ] Summary cards display total incidents, positive ratio, points, active interventions
- [ ] Trend line chart shows weekly positive/negative over 90 days
- [ ] Category breakdown bar chart shows top categories
- [ ] Period comparison shows data per academic period when available
- [ ] Loading state shown while data fetches
- [ ] Empty state shown when student has no behaviour data
- [ ] Mobile responsive (single column at 375px)
- [ ] Backend endpoint returns structured data (not stub)

---

## Gap 10: Attendance Overlay

### Current State

- Spec mentions attendance correlation in analytics (heatmap overlay, profile analytics)
- `DailyAttendanceSummary` model exists with `student_id`, `summary_date`, `derived_status`
- No behaviour code currently joins to attendance data
- Heatmap has no attendance layer
- Student profile analytics has no attendance correlation

### Implementation Plan

#### 10a. Student Analytics Attendance Correlation

Add to the `getStudentAnalytics()` response:

```typescript
attendance_correlation: {
  total_days: number;
  absent_days: number;
  absence_rate: number;
  incidents_on_absent_days: number;   // Incidents logged on days student was absent (data integrity flag)
  incidents_on_present_days: number;  // Incidents when student was present
  avg_incidents_per_present_day: number | null;
} | null  // null if attendance data unavailable
```

Query:

1. Get student's daily attendance summaries for the date range
2. Get student's incidents for the date range
3. Cross-reference: for each incident, check if the student was present that day
4. Compute absence rate and incident density on present days

#### 10b. Heatmap Attendance Overlay (optional — lower priority)

The heatmap currently shows incident counts by weekday/period. An attendance overlay would show average attendance percentage at each slot. This requires:

1. Querying `attendance_records` (not daily summaries) by session/period
2. Computing attendance rate per weekday/period slot
3. Adding an `attendance_rate` field to `HeatmapCell`

**Recommendation**: Implement as a secondary layer toggle on the frontend, not a separate endpoint. Add an optional `attendance_rate: number | null` to the heatmap cell response.

#### 10c. Shared Type Updates

Add to `HeatmapCell`:

```typescript
attendance_rate?: number | null;  // Optional attendance overlay
```

Add `StudentAnalyticsResult.attendance_correlation` as defined above.

### Acceptance Criteria

- [ ] Student analytics tab shows attendance correlation when attendance data exists
- [ ] `incidents_on_absent_days` correctly identifies data anomalies (incident logged when student was absent)
- [ ] Heatmap optionally includes attendance_rate per cell (frontend toggle)
- [ ] Graceful null when attendance module is not enabled or no data exists

---

## Gap 11: Pattern Detection End-to-End Verification

### Current State

- `DetectPatternsProcessor` at `apps/worker/src/processors/behaviour/detect-patterns.processor.ts` is fully implemented
- Detects 7 pattern types: escalating students, disengaging students, logging gaps, overdue reviews, hotspot subjects, suspension returns, policy threshold breaches
- **The daily cron never fires** — `CronSchedulerService` only registers gradebook crons
- SP1 (cron registration) will add the cron registration
- This task is about verifying the processor works end-to-end once SP1 wires it

### Implementation Plan

#### 11a. Verify SP1 Cron Registration (dependency check)

After SP1 is implemented, confirm that `CronSchedulerService` registers:

```typescript
await this.behaviourQueue.add(
  BEHAVIOUR_DETECT_PATTERNS_JOB,
  {}, // Cross-tenant: processor iterates all tenants
  {
    repeat: { pattern: '0 4 * * *' }, // Daily at 04:00 UTC
    jobId: `cron:${BEHAVIOUR_DETECT_PATTERNS_JOB}`,
    removeOnComplete: 10,
    removeOnFail: 50,
  },
);
```

**Issue**: The current `DetectPatternsProcessor` expects `tenant_id` in the payload (line 34-37), but cron jobs are cross-tenant. Two options:

1. **Option A**: Change cron to iterate tenants in the scheduler and enqueue one job per tenant
2. **Option B**: Change the processor to handle cross-tenant (iterate all tenants within the processor)

**Recommendation**: Option A (consistent with gradebook pattern). The scheduler should:

1. On cron fire, query all active tenants
2. For each tenant, enqueue a `behaviour:detect-patterns` job with that tenant's ID
3. This naturally distributes work and respects the `TenantAwareJob` pattern

#### 11b. End-to-End Test Scenarios

Create test file: `apps/worker/src/processors/behaviour/detect-patterns.processor.spec.ts`

Test each pattern type:

1. **Escalating student**: Create student with 4 negative incidents in 7 days (up from 1 in prior 7 days) -> expect `escalating_student` alert
2. **Disengaging student**: Create student with prior positive activity but zero recent positive + 2+ negative -> expect `disengaging_student` alert
3. **Logging gap**: Create staff member with `behaviour.log` permission, no incidents in 14 days -> expect `logging_gap` alert
4. **Overdue review**: Create active intervention with `next_review_date` 4 days ago -> expect `overdue_review` alert
5. **Hotspot subject**: Create subject with incidents > 2x school average -> expect `hotspot` alert
6. **Suspension return**: Create sanction with `suspension_end_date` in 2 days, no `return_check_in` task -> expect `suspension_return` alert
7. **Policy breach**: Create matched evaluation with zero action executions -> expect `policy_threshold_breach` alert
8. **Idempotency**: Run processor twice -> expect alerts updated, not duplicated

#### 11c. Verify Pulse Cache Clearing

Lines 438-444 of the processor have a comment about clearing Redis pulse cache but no implementation. After pattern detection, the pulse score should be recalculated on next API request. Verify this works by:

1. Running pattern detection
2. Calling pulse endpoint
3. Confirming pulse reflects new alerts

**Note**: The current code has a TODO at line 440-441 about Redis client not being injected in worker. This needs resolution — either inject Redis or accept that pulse cache clears on TTL expiry (which is fine if TTL is short, e.g., 5 minutes).

### Acceptance Criteria

- [ ] After SP1 wires the cron, `behaviour:detect-patterns` job fires daily
- [ ] Job processes all active tenants (one job per tenant, queued by scheduler)
- [ ] Each of the 7 pattern types correctly creates alerts when conditions are met
- [ ] Existing active alerts are updated (not duplicated) on re-run
- [ ] Alert recipients are correctly determined (users with `behaviour.admin`)
- [ ] Pulse cache reflects new alerts within reasonable time (5 min TTL or explicit clear)

---

## Cross-Cutting Concerns

### Shared Type Additions Summary

All new types to add to `packages/shared/src/behaviour/schemas/analytics.schema.ts`:

- `BenchmarkEntry`, `BenchmarkResult` (Gap 2)
- `TeacherAnalyticsEntry`, `TeacherAnalyticsResult` (Gap 3)
- `ClassComparisonEntry`, `ClassComparisonResult` (Gap 4)
- `StudentAnalyticsResult` (Gap 9)
- `benchmarkQuerySchema` (Gap 2)

### New Controller Endpoints Summary

| Gap | Method | Route                                       | Permission                                |
| --- | ------ | ------------------------------------------- | ----------------------------------------- |
| 1a  | GET    | `/v1/behaviour/students/:id/export`         | `behaviour.manage` (update existing stub) |
| 1b  | GET    | `/v1/behaviour/analytics/export/csv`        | `behaviour.manage` (new)                  |
| 2   | GET    | `/v1/behaviour/analytics/benchmarks`        | `behaviour.admin` (new)                   |
| 3   | GET    | `/v1/behaviour/analytics/teachers`          | `behaviour.view_staff_analytics` (new)    |
| 4   | GET    | `/v1/behaviour/analytics/class-comparisons` | `behaviour.view` (new)                    |

### New Service Files

| File                                    | Purpose                       |
| --------------------------------------- | ----------------------------- |
| `behaviour-export.service.ts`           | PDF and CSV export generation |
| `student-behaviour-pack-en.template.ts` | English PDF template          |
| `student-behaviour-pack-ar.template.ts` | Arabic PDF template           |

### Module Registration

`behaviour.module.ts` must register:

- `BehaviourExportService` as provider
- Import `PdfRenderingModule` (if not already imported)
- Inject `BehaviourExportService` into `BehaviourStudentsController`

### Frontend Components

| File                        | Purpose                                           |
| --------------------------- | ------------------------------------------------- |
| `student-analytics-tab.tsx` | Charts and data for student profile Analytics tab |

### Dependencies on SP1

- Gap 5 (exposure normalisation): Requires `behaviour:refresh-mv-exposure-rates` cron to be registered
- Gap 11 (pattern detection): Requires `behaviour:detect-patterns` cron to be registered
- Both MV refreshes (`mv_student_behaviour_summary`, `mv_behaviour_benchmarks`) must be scheduled for Gap 2 and Gap 9 to show fresh data

### Implementation Order

Recommended sequence (no internal dependencies between most gaps):

1. **Gap 6** (sanction served/no-show) — simplest, pure service method replacement
2. **Gap 7** (intervention SEND breakdown) — same pattern as Gap 6
3. **Gap 8** (avg_days_to_complete) — same pattern, extends existing method
4. **Gap 5** (exposure normalisation) — extends heatmap/overview, depends on MV being refreshed
5. **Gap 4** (class-level comparisons) — new endpoint, follows existing comparison pattern
6. **Gap 3** (teacher-level analytics) — new endpoint, uses exposure MV
7. **Gap 2** (ETB benchmarking) — new endpoint, reads from existing MV
8. **Gap 9** (student profile analytics tab) — largest item, new backend + frontend
9. **Gap 1** (exports) — largest item, new service + templates + endpoints
10. **Gap 10** (attendance overlay) — cross-module join, optional heatmap extension
11. **Gap 11** (pattern detection verification) — after SP1, test-focused

Gaps 6, 7, 8 can be done in parallel. Gaps 2, 3, 4 can be done in parallel. Gap 9 and Gap 1 are independent of each other.
