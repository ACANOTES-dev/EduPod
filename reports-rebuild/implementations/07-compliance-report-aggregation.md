# Implementation 07 — Compliance Report Aggregation

> **Wave:** 2 (parallel, API restart)
> **Depends on:** 01
> **Deploys:** API restart only

---

## Goal

Replace the stubbed `ComplianceReportService` with real aggregation that sources every compliance field from its domain model. The compliance page currently has fields marked `hasGap: true` (the "Qualified Teachers %" field in `apps/web/src/app/[locale]/(school)/reports/compliance/page.tsx:23-44`) because no data source was wired. This phase makes every compliance field real or honestly missing.

Compliance reports are the primary artifact a school submits to regulators (Tusla, DES, inspection bodies). Getting numbers wrong here has legal consequences — this phase prioritises correctness and traceability over performance.

## What to change

### 1. `ComplianceReportService` rewrite (`apps/api/src/modules/reports/compliance-report.service.ts`)

Public interface:

```ts
type ComplianceReportRequest = {
  tenantId: string;
  academic_year_id: string;
  fields: ComplianceFieldKey[]; // which fields to include; default = all
};

type ComplianceField = {
  key: ComplianceFieldKey;
  label_key: string;
  value: string | number | null;
  unit: 'percent' | 'count' | 'hours' | 'ratio' | 'currency' | null;
  source: string; // "from behaviour_incident table, filtered by academic_year_id"
  last_verified_at: string; // when the underlying data was last updated
  has_gap: boolean; // true ONLY if we cannot source it reliably; show a yellow warning
  gap_reason?: string;
};

type ComplianceReport = {
  tenant: { name: string; academic_year: string };
  generated_at: string;
  fields: ComplianceField[];
};
```

Every field has a `source` string and a `last_verified_at`. Regulators ask "where did this number come from" — this answers that.

### 2. Compliance field catalogue

One file: `apps/api/src/modules/reports/compliance-report/compliance-fields.ts`. This is the authoritative list of every compliance metric the report can produce. Ship the following:

**Student-facing:**

1. `student_headcount` — count of active students.
2. `attendance_rate_annual` — cumulative attendance rate for the academic year.
3. `chronic_absenteeism_count` — students with attendance < 80% this year.
4. `exclusions_this_year` — behaviour exclusions (from `behaviour_exclusion_case`).
5. `sen_register_count` — students with active SEN support plan.
6. `safeguarding_concerns_raised_this_year` — count.
7. `critical_incidents_this_year` — count.

**Staff-facing:** 8. `staff_headcount` — count of active staff. 9. `teacher_headcount` — count of teaching staff. 10. `pupil_teacher_ratio` — students ÷ teachers. 11. `qualified_teachers_percent` — % of teachers with a `StaffVettingRecord` status of `qualified`. This was the previously-stubbed field — wire it to the vetting table. If no qualification field exists yet, declare `has_gap: true` with `gap_reason: "qualification_field_not_yet_collected"`. 12. `vetting_current_percent` — % of staff with vetting status `current`. 13. `staff_absence_rate_annual` — staff absences ÷ expected staff days.

**Finance:** 14. `fees_collected_ytd` — sum of `payments` amount this academic year. 15. `outstanding_balance_total` — sum across all households. 16. `write_offs_ytd` — sum of write-offs this year.

**Operations:** 17. `school_days_held` — count of days with at least one scheduled class. 18. `instruction_hours_held` — sum of scheduled minutes ÷ 60 this year. 19. `teacher_absence_days_uncovered` — count of absences with no cover assignment.

For any field that genuinely cannot be sourced today, set `has_gap: true` with a clear `gap_reason`. Do not fake values.

### 3. Aggregator functions

Each field has a thin aggregator function in `apps/api/src/modules/reports/compliance-report/aggregators/`:

- One file per field: `qualified-teachers-percent.aggregator.ts`, etc.
- Each exports `aggregate(tx, tenantId, academicYearId): Promise<{ value; last_verified_at; has_gap; gap_reason? }>`.
- Use existing services where possible (`StaffAnalyticsService.getQualificationCoverage`).

All aggregators run inside one RLS transaction.

### 4. Field versioning

The compliance field catalogue is versioned. The service returns the catalogue version in the response meta:

```ts
meta: { generated_at, catalogue_version: 'v1' }
```

When the catalogue changes (fields added/renamed), bump the version. Regulators asking about historical reports can be told "catalogue v1 ran from <date> to <date>".

### 5. Endpoint

`POST /v1/reports/compliance/generate`:

```
body: { academic_year_id, fields?: ComplianceFieldKey[] }
```

Guarded with `@RequiresPermission('compliance.view')` (reuse existing permission key; if absent, add to impl 01's permission seed — but only if absent, don't invent).

`GET /v1/reports/compliance/history` — list prior generations.

### 6. Persist generations

Reuse existing `ComplianceReportTemplate` table or extend with a generated-instances table if needed. Each generation writes a row: `{ tenant_id, academic_year_id, generated_at, generated_by, fields_json, catalogue_version }`. This gives an audit trail of what a school submitted when.

If schema changes are needed, decide in this phase whether to fix forward with a new migration; if the change is small, fix-forward via an impl-07 migration file.

## Testing requirements

- **Unit test per aggregator** — seed targeted fixture, assert value + gap handling.
- **Integration test** — full generation with all fields against NHQS-like fixture.
- **Gap field test** — field with declared gap returns `has_gap: true` and a useful `gap_reason`.
- **RLS test** — Tenant A does not leak.

## Post-deploy verification

1. `POST /v1/reports/compliance/generate` with `{ academic_year_id: '<current>' }` as owner@nhqs.test.
2. Confirm every field has a value or an honest gap reason.
3. Confirm `qualified_teachers_percent` either has a real number (if vetting records exist) or `has_gap: true, gap_reason: "..."` (honest).
4. Run again with `fields: ['student_headcount', 'staff_headcount']` only — confirm response contains only those two.
5. Export as PDF — confirm each field's `source` line is visible in the generated document.

## Follow-ups for subsequent waves

- **Impl 20 (Board + Compliance UI)** renders this alongside board reports.
- Any new compliance fields needed by future Tusla/DES submissions are additive — bump catalogue version.

## Rollback

`git revert <sha>` — service-level. Safe.
