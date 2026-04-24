# Implementation 05 — Domain Report Services (finish aggregation)

> **Wave:** 2 (parallel, API restart)
> **Depends on:** 01
> **Deploys:** API restart only

---

## Goal

Finish every domain-specific report service so the corresponding frontend pages can drop their `MOCK_*` constants in Wave 4. Most of these services are already real and correct; a handful return partial or stubbed data. This phase closes those gaps and adds the response shape the new UI expects (series + meta, not just bare arrays).

## Scope of work per service

### 1. `AttendanceAnalyticsService`

Already real. No changes required except: verify `getClassComparison(yearGroupId)` works across all class types (not just timetabled ones); add missing RLS test coverage if absent.

### 2. `GradeAnalyticsService`

Already real. Add one missing aggregation the frontend needs: `getSubjectDifficultyTrend(subjectId, terms)` — per-term pass/fail trend so the "Subject Difficulty" chart can draw a line instead of one bar. Extend the existing `getSubjectDifficulty` to return per-term splits when a `by: 'term'` query param is passed.

### 3. `DemographicsService`

Already real. Add `getEnrolmentTrendByYearGroup(yearGroupId, months)` — the hub's "Year group size over time" drill-down needs this.

### 4. `StudentProgressService`

Partial. Methods `getStudentProgress(studentId)` exist; add:

- `getTrendsByCohort(yearGroupId, term)` — cohort-level attendance + grade trend, for the dashboard-linked view.
- `listAtRiskStudentsNewThisWeek(tenantId)` — drill-down for KPI 3.

### 5. `AdmissionsAnalyticsService`

Already real. Verify `getRejectionReasons()` has correct enum labels after any recent enum changes; add RLS coverage.

### 6. `StaffAnalyticsService`

Already real. No change.

### 7. `CrossModuleInsightsService`

Already real. No change.

### 8. `ReportsDataAccessService`

The shared data-access layer feeding the subject registry + query engine. Harden:

- All methods must return RLS-scoped data (use `createRlsClient`).
- Remove any `this.prisma.X` direct reads that bypass RLS.
- Document the methods in file-level comments: one block per method listing its caller and return shape.

### 9. Reporting response shape

Every endpoint in this wave must return `{ data, meta }` where `meta` at minimum has `generated_at`. The Wave 4 UI layer assumes this; the existing responses are a mix of bare arrays and `{ data }` only.

Sweep every controller in `apps/api/src/modules/reports/reports-enhanced.controller.ts` and its siblings; normalise to `{ data, meta }` with a small helper:

```ts
const wrap = <T>(data: T): { data: T; meta: { generated_at: string } } => ({
  data,
  meta: { generated_at: new Date().toISOString() },
});
```

Leave the existing response transform interceptor in place; just ensure service returns are the inner shape.

### 10. Add `description` copy keys for each report

Every report page's subtitle is currently either missing or stubbed. Add a translation key per report that describes what the report shows in one sentence. These keys land in impl 22's translation sweep, but **declare the key names in this phase** in a comment at the top of each service file so the translation impl has an authoritative list.

## What NOT to do in this phase

- Do not touch `BoardReportService` — that's impl 06.
- Do not touch `ComplianceReportService` — that's impl 07.
- Do not touch any AI service — impls 10, 11, 12.
- Do not touch the KPI dashboard — impl 03.

## Testing requirements

- **Unit test coverage ratchet** — any service touched must have ≥ 80% coverage. Add specs for new methods.
- **RLS tests** for each new method — Tenant A vs Tenant B isolation.
- **Integration test** — hit each endpoint with seeded data, verify shape matches `{ data, meta }`.

## Post-deploy verification

1. For each of the 7 services: hit the primary endpoint as owner@nhqs.test, confirm real data (not empty / not mock).
2. Hit `/v1/reports/student-progress/at-risk-new-this-week` — confirm a number consistent with actual risk-alert rows this week.
3. Check that none of the existing frontend pages have broken (the frontend still reads old shape in this wave; the normalisation shape is additive, not breaking).

## Follow-ups for subsequent waves

- **Impl 15 (Individual Report Pages UI)** will consume all of these. It kills `MOCK_PASS_FAIL`, `NATIONALITY_DATA`, `MOCK_SCATTER`, etc. and wires the real endpoints.
- **Impl 16 (Builder UI)** also calls a subset for pre-populating certain filters.

## Rollback

`git revert <sha>` — service-level changes only. No schema or contract break. Safe.
