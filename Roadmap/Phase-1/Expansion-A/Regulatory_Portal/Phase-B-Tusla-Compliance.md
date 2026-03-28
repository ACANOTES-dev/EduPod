# Phase B — Tusla Compliance Services

**Wave**: 2
**Deploy Order**: d2
**Depends On**: A

## Scope

Implements the Tusla-specific business logic: threshold monitoring (students approaching/exceeding the 20-day absence threshold), SAR (Student Absence Report) generation for two reporting periods, AAR (Annual Attendance Report) generation, and queries for suspensions (≥6 days) and expulsions requiring Tusla notification. All methods read from existing attendance and behaviour tables, joined with the Tusla absence code mappings created in Phase A.

## Deliverables

- `apps/api/src/modules/regulatory/regulatory-tusla.service.ts` — threshold monitor, SAR generation, AAR generation, suspensions query, expulsions query
- `apps/api/src/modules/regulatory/regulatory-tusla.service.spec.ts` — tests per the spec's test plan
- `apps/api/src/modules/regulatory/regulatory.controller.ts` — **add** Tusla endpoint group:
  - `GET /v1/regulatory/tusla/threshold-monitor`
  - `POST /v1/regulatory/tusla/sar/generate`
  - `POST /v1/regulatory/tusla/aar/generate`
  - `GET /v1/regulatory/tusla/absence-mappings`
  - `POST /v1/regulatory/tusla/absence-mappings`
  - `GET /v1/regulatory/tusla/suspensions`
  - `GET /v1/regulatory/tusla/expulsions`
- `apps/api/src/modules/regulatory/regulatory.controller.spec.ts` — **add** Tusla endpoint test cases

## Out of Scope

- Tusla absence code mapping CRUD (already in Phase A)
- Reduced school day CRUD (already in Phase A)
- Worker job for daily threshold scanning (Phase E)
- Tusla frontend pages (Phase G)
- DES, PPOD, CBA, transfer functionality (Phases C, D)

## Dependencies

**Phase A** provides:
- `tusla_absence_code_mappings` table — the tenant-configurable mapping from EduPod attendance statuses to Tusla categories
- `reduced_school_days` table — for reduced timetable tracking
- Zod schemas: `generateTuslaSarSchema`, `generateTuslaAarSchema`, `tuslaThresholdConfigSchema`
- Constants: `TUSLA_DEFAULT_THRESHOLD_DAYS`, `TUSLA_SAR_PERIODS`
- The controller file and module registration

## Implementation Notes

- **Integration points (read-only against existing tables)**:
  - `daily_attendance_summaries` — cumulative absence counts per student
  - `attendance_records` — individual session records for Tusla categorisation
  - `behaviour_sanctions` — suspension data (type `suspension_internal` | `suspension_external`, filter `suspension_days >= 6`)
  - `behaviour_exclusion_cases` — expulsion data
  - `tusla_absence_code_mappings` — tenant-configurable code mapping (Phase A table)
- The threshold monitor query joins `daily_attendance_summaries` with student data and returns students approaching or exceeding the configurable threshold (default 20 days).
- SAR generation joins students + attendance records + Tusla mappings for a date range, producing per-student rows with Tusla-categorised absence counts.
- AAR aggregates: total students, total days lost, count of students with 20+ absences.
- Suspensions query filters `behaviour_sanctions` where type is `suspension_internal` or `suspension_external` and `suspension_days >= 6`.
- Expulsions query reads `behaviour_exclusion_cases`.
- Controller endpoints added under a `// ─── Tusla ───` section separator in the existing controller.
