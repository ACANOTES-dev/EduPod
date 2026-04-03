# P5 Results — Gradebook, Report Cards, and Transcripts

## Summary

Phase 5 delivers the complete grading system for the School Operating System. It includes: grading scale management with immutability enforcement, assessment category configuration with weighted averages, per-class-subject grade configuration, assessment lifecycle management with a state machine (draft → open → closed → locked), grade entry with missing grade handling, period grade computation with weighted averages and snapshot storage, grade override workflow, report card generation with immutable snapshot payloads, report card revision chain, locale-specific PDF rendering via Puppeteer (English + Arabic), academic transcript generation aggregating across years, exam results bulk CSV import, and a parent portal for viewing grades, report cards, and transcripts.

## Database Migrations

### New Enums

- `AssessmentStatus` — draft, open, closed, locked
- `ReportCardStatus` — draft, published, revised

### New Tables (7)

| Table                         | Columns | Key Constraints                                                              |
| ----------------------------- | ------- | ---------------------------------------------------------------------------- |
| `grading_scales`              | 6       | UNIQUE(tenant_id, name), RLS                                                 |
| `assessment_categories`       | 6       | UNIQUE(tenant_id, name), RLS                                                 |
| `class_subject_grade_configs` | 8       | UNIQUE(tenant_id, class_id, subject_id), RLS                                 |
| `assessments`                 | 12      | Indexes on tenant_class, tenant_period, RLS                                  |
| `grades`                      | 11      | UNIQUE(tenant_id, assessment_id, student_id), RLS                            |
| `period_grade_snapshots`      | 14      | UNIQUE(tenant_id, student_id, class_id, subject_id, academic_period_id), RLS |
| `report_cards`                | 14      | Partial unique idx (draft/published), self-referencing revision chain, RLS   |

### Modified Models (relations added)

- `Tenant` — 7 new P5 relations
- `User` — grades_entered, period_grade_overrides, report_cards_published
- `Student` — grades, period_grade_snapshots, report_cards
- `Class` — class_subject_grade_configs, assessments, period_grade_snapshots
- `Subject` — class_subject_grade_configs, assessments, period_grade_snapshots
- `AcademicPeriod` — assessments, period_grade_snapshots, report_cards

### RLS Policies

All 7 new tables have standard tenant_isolation RLS policies with `set_updated_at()` triggers.

### Special Indexes

- `idx_report_cards_active_unique` — partial unique on (tenant_id, student_id, academic_period_id) WHERE status IN ('draft', 'published')

### Migration Files

- `packages/prisma/migrations/20260316180000_add_p5_gradebook_tables/post_migrate.sql`

## API Endpoints

### Grading Scales (5 endpoints)

| Method | Path                                   | Auth | Permission         |
| ------ | -------------------------------------- | ---- | ------------------ |
| POST   | `/api/v1/gradebook/grading-scales`     | JWT  | `gradebook.manage` |
| GET    | `/api/v1/gradebook/grading-scales`     | JWT  | `gradebook.view`   |
| GET    | `/api/v1/gradebook/grading-scales/:id` | JWT  | `gradebook.view`   |
| PATCH  | `/api/v1/gradebook/grading-scales/:id` | JWT  | `gradebook.manage` |
| DELETE | `/api/v1/gradebook/grading-scales/:id` | JWT  | `gradebook.manage` |

### Assessment Categories (5 endpoints)

| Method | Path                                          | Auth | Permission         |
| ------ | --------------------------------------------- | ---- | ------------------ |
| POST   | `/api/v1/gradebook/assessment-categories`     | JWT  | `gradebook.manage` |
| GET    | `/api/v1/gradebook/assessment-categories`     | JWT  | `gradebook.view`   |
| GET    | `/api/v1/gradebook/assessment-categories/:id` | JWT  | `gradebook.view`   |
| PATCH  | `/api/v1/gradebook/assessment-categories/:id` | JWT  | `gradebook.manage` |
| DELETE | `/api/v1/gradebook/assessment-categories/:id` | JWT  | `gradebook.manage` |

### Grade Configs (4 endpoints)

| Method | Path                                                                  | Auth | Permission         |
| ------ | --------------------------------------------------------------------- | ---- | ------------------ |
| PUT    | `/api/v1/gradebook/classes/:classId/subjects/:subjectId/grade-config` | JWT  | `gradebook.manage` |
| GET    | `/api/v1/gradebook/classes/:classId/grade-configs`                    | JWT  | `gradebook.view`   |
| GET    | `/api/v1/gradebook/classes/:classId/subjects/:subjectId/grade-config` | JWT  | `gradebook.view`   |
| DELETE | `/api/v1/gradebook/classes/:classId/subjects/:subjectId/grade-config` | JWT  | `gradebook.manage` |

### Assessments (6 endpoints)

| Method | Path                                       | Auth | Permission               |
| ------ | ------------------------------------------ | ---- | ------------------------ |
| POST   | `/api/v1/gradebook/assessments`            | JWT  | `gradebook.enter_grades` |
| GET    | `/api/v1/gradebook/assessments`            | JWT  | `gradebook.view`         |
| GET    | `/api/v1/gradebook/assessments/:id`        | JWT  | `gradebook.view`         |
| PATCH  | `/api/v1/gradebook/assessments/:id`        | JWT  | `gradebook.enter_grades` |
| PATCH  | `/api/v1/gradebook/assessments/:id/status` | JWT  | `gradebook.enter_grades` |
| DELETE | `/api/v1/gradebook/assessments/:id`        | JWT  | `gradebook.manage`       |

### Grades (2 endpoints)

| Method | Path                                                 | Auth | Permission               |
| ------ | ---------------------------------------------------- | ---- | ------------------------ |
| PUT    | `/api/v1/gradebook/assessments/:assessmentId/grades` | JWT  | `gradebook.enter_grades` |
| GET    | `/api/v1/gradebook/assessments/:assessmentId/grades` | JWT  | `gradebook.view`         |

### Period Grades (4 endpoints)

| Method | Path                                                  | Auth | Permission                       |
| ------ | ----------------------------------------------------- | ---- | -------------------------------- |
| POST   | `/api/v1/gradebook/period-grades/compute`             | JWT  | `gradebook.manage`               |
| GET    | `/api/v1/gradebook/period-grades`                     | JWT  | `gradebook.view`                 |
| GET    | `/api/v1/gradebook/students/:studentId/period-grades` | JWT  | `gradebook.view`                 |
| POST   | `/api/v1/gradebook/period-grades/:id/override`        | JWT  | `gradebook.override_final_grade` |

### Report Cards (7 endpoints)

| Method | Path                               | Auth | Permission                       |
| ------ | ---------------------------------- | ---- | -------------------------------- |
| POST   | `/api/v1/report-cards/generate`    | JWT  | `gradebook.manage`               |
| GET    | `/api/v1/report-cards`             | JWT  | `gradebook.view`                 |
| GET    | `/api/v1/report-cards/:id`         | JWT  | `gradebook.view`                 |
| PATCH  | `/api/v1/report-cards/:id`         | JWT  | `gradebook.manage`               |
| POST   | `/api/v1/report-cards/:id/publish` | JWT  | `gradebook.publish_report_cards` |
| POST   | `/api/v1/report-cards/:id/revise`  | JWT  | `gradebook.manage`               |
| GET    | `/api/v1/report-cards/:id/pdf`     | JWT  | `gradebook.view`                 |

### Transcripts (2 endpoints)

| Method | Path                                          | Auth | Permission             |
| ------ | --------------------------------------------- | ---- | ---------------------- |
| GET    | `/api/v1/transcripts/students/:studentId`     | JWT  | `transcripts.generate` |
| GET    | `/api/v1/transcripts/students/:studentId/pdf` | JWT  | `transcripts.generate` |

### Bulk Import (2 endpoints)

| Method | Path                                | Auth | Permission         |
| ------ | ----------------------------------- | ---- | ------------------ |
| POST   | `/api/v1/gradebook/import/validate` | JWT  | `gradebook.manage` |
| POST   | `/api/v1/gradebook/import/process`  | JWT  | `gradebook.manage` |

### Parent Portal (4 endpoints)

| Method | Path                                                                | Auth | Permission                |
| ------ | ------------------------------------------------------------------- | ---- | ------------------------- |
| GET    | `/api/v1/parent/students/:studentId/grades`                         | JWT  | `parent.view_grades`      |
| GET    | `/api/v1/parent/students/:studentId/report-cards`                   | JWT  | `parent.view_grades`      |
| GET    | `/api/v1/parent/students/:studentId/report-cards/:reportCardId/pdf` | JWT  | `parent.view_grades`      |
| GET    | `/api/v1/parent/students/:studentId/transcript/pdf`                 | JWT  | `parent.view_transcripts` |

## Services

| Service                         | File                                  | Responsibilities                            |
| ------------------------------- | ------------------------------------- | ------------------------------------------- |
| `GradingScalesService`          | `grading-scales.service.ts`           | CRUD with immutability enforcement          |
| `AssessmentCategoriesService`   | `assessment-categories.service.ts`    | CRUD with in-use protection                 |
| `ClassGradeConfigsService`      | `class-grade-configs.service.ts`      | UPSERT with academic subject validation     |
| `AssessmentsService`            | `assessments.service.ts`              | CRUD + state machine transitions            |
| `GradesService`                 | `grades.service.ts`                   | Bulk upsert with tenant setting enforcement |
| `PeriodGradeComputationService` | `period-grade-computation.service.ts` | Weighted average computation + UPSERT       |
| `ReportCardsService`            | `report-cards.service.ts`             | Generate, publish, revise + PDF rendering   |
| `TranscriptsService`            | `transcripts.service.ts`              | Aggregate + Redis cache                     |
| `BulkImportService`             | `bulk-import.service.ts`              | CSV parsing + validation + import           |
| `PdfRenderingService`           | `pdf-rendering.service.ts`            | Puppeteer PDF generation (shared module)    |

## Frontend

### Pages

| Route                                          | File                                      | Type   |
| ---------------------------------------------- | ----------------------------------------- | ------ |
| `/gradebook`                                   | `gradebook/page.tsx`                      | Client |
| `/gradebook/[classId]`                         | `gradebook/[classId]/page.tsx`            | Client |
| `/gradebook/[classId]/assessments/new`         | `assessments/new/page.tsx`                | Client |
| `/gradebook/[classId]/assessments/[id]/grades` | `grades/page.tsx`                         | Client |
| `/gradebook/import`                            | `gradebook/import/page.tsx`               | Client |
| `/report-cards`                                | `report-cards/page.tsx`                   | Client |
| `/report-cards/[id]`                           | `report-cards/[id]/page.tsx`              | Client |
| `/settings/grading-scales`                     | `settings/grading-scales/page.tsx`        | Client |
| `/settings/assessment-categories`              | `settings/assessment-categories/page.tsx` | Client |

### Components

| Component         | File                                             |
| ----------------- | ------------------------------------------------ |
| `GenerateDialog`  | `report-cards/_components/generate-dialog.tsx`   |
| `PdfPreviewModal` | `report-cards/_components/pdf-preview-modal.tsx` |
| `GradesTab`       | `dashboard/parent/_components/grades-tab.tsx`    |

### Navigation Updates

- Added "Report Cards" to ACADEMICS section in sidebar
- Added "Grading Scales" and "Assessment Categories" tabs to Settings

## Background Jobs

| Job Name                         | Queue       | Processor File                      | Trigger                  |
| -------------------------------- | ----------- | ----------------------------------- | ------------------------ |
| `gradebook:mass-report-card-pdf` | `gradebook` | `mass-report-card-pdf.processor.ts` | Admin batch export       |
| `gradebook:bulk-import-process`  | `gradebook` | `bulk-import.processor.ts`          | Large import (>500 rows) |

## Configuration

### New Permissions (4)

- `gradebook.override_final_grade` (admin tier)
- `gradebook.publish_report_cards` (admin tier)
- `transcripts.generate` (admin tier)
- `parent.view_transcripts` (parent tier)

### System Role Updates

- `school_owner`: added override_final_grade, publish_report_cards, transcripts.generate
- `school_admin`: added override_final_grade, publish_report_cards, transcripts.generate
- `parent`: added parent.view_transcripts

### Dependencies Added

- `puppeteer` added to `apps/api/package.json`

### Queue Added

- `GRADEBOOK` queue constant added to worker

## Files Created

### packages/shared/src/

- `types/gradebook.ts`
- `schemas/gradebook.schema.ts`

### packages/prisma/

- `migrations/20260316180000_add_p5_gradebook_tables/post_migrate.sql`

### apps/api/src/modules/pdf-rendering/

- `pdf-rendering.module.ts`
- `pdf-rendering.service.ts`
- `templates/report-card-en.template.ts`
- `templates/report-card-ar.template.ts`
- `templates/transcript-en.template.ts`
- `templates/transcript-ar.template.ts`

### apps/api/src/modules/gradebook/

- `gradebook.module.ts`
- `grading-scales.controller.ts`
- `grading-scales.service.ts`
- `assessment-categories.controller.ts`
- `assessment-categories.service.ts`
- `class-grade-configs.service.ts`
- `assessments.service.ts`
- `grades.service.ts`
- `period-grade-computation.service.ts`
- `report-cards.service.ts`
- `report-cards.controller.ts`
- `transcripts.service.ts`
- `transcripts.controller.ts`
- `bulk-import.service.ts`
- `gradebook.controller.ts`
- `parent-gradebook.controller.ts`
- `dto/gradebook.dto.ts`

### apps/worker/src/processors/gradebook/

- `mass-report-card-pdf.processor.ts`
- `bulk-import.processor.ts`

### apps/web/src/app/[locale]/(school)/gradebook/

- `page.tsx`
- `[classId]/page.tsx`
- `[classId]/assessments/new/page.tsx`
- `[classId]/assessments/[assessmentId]/grades/page.tsx`
- `import/page.tsx`

### apps/web/src/app/[locale]/(school)/report-cards/

- `page.tsx`
- `[id]/page.tsx`
- `_components/generate-dialog.tsx`
- `_components/pdf-preview-modal.tsx`

### apps/web/src/app/[locale]/(school)/settings/

- `grading-scales/page.tsx`
- `assessment-categories/page.tsx`

### apps/web/src/app/[locale]/(school)/dashboard/parent/\_components/

- `grades-tab.tsx`

## Files Modified

- `packages/prisma/schema.prisma` — 2 enums, 7 models, P5 relations on 6 existing models
- `packages/shared/src/constants/permissions.ts` — 4 new permissions, tier map, system role assignments
- `packages/shared/src/index.ts` — P5 type and schema exports
- `packages/prisma/seed/permissions.ts` — 4 new permission seed records
- `apps/api/src/app.module.ts` — imported GradebookModule, PdfRenderingModule
- `apps/api/package.json` — added puppeteer dependency
- `apps/worker/src/worker.module.ts` — registered GRADEBOOK queue and processors
- `apps/worker/src/base/queue.constants.ts` — added GRADEBOOK queue name
- `apps/web/src/app/[locale]/(school)/layout.tsx` — added Report Cards to sidebar
- `apps/web/src/app/[locale]/(school)/settings/layout.tsx` — added Grading Scales and Assessment Categories tabs
- `apps/web/messages/en.json` — added gradebook, reportCards, transcripts, import translation keys
- `apps/web/messages/ar.json` — added Arabic translations for all new keys

## Known Limitations

- Mass report card PDF concatenation (combining multiple PDFs into one) is logged but not fully implemented — requires pdf-lib integration and S3 upload in production
- Puppeteer PDF rendering uses Google Fonts CDN for Noto Sans Arabic — should embed font file in production for reliability
- Transcript PDF rendering does not support page breaks between academic years for very long transcripts
- Bulk import CSV parser is basic (comma-split) — does not handle quoted fields with commas

## Deviations from Plan

- None significant. All endpoints, services, tables, and pages match the plan specification.
