# Teacher-Centric Assessments — Phase 1 Implementation Log

**Date**: 2026-04-07
**Commit**: `b41b1112` on `main`
**Status**: Deployed to production, verified

---

## What Was Built

Phase 1 delivers the **schema foundation, teaching allocation derivation, core backend services, and approval workflow** for the teacher-centric assessments system. No frontend changes were made — this phase is entirely backend/database.

---

## Schema Changes (Migration `20260407120000_add_teacher_centric_assessments`)

### New Enum: `ConfigApprovalStatus`

- Values: `draft`, `pending_approval`, `approved`, `rejected`, `archived`
- Used by: AssessmentCategory, RubricTemplate, CurriculumStandard, TeacherGradingWeight

### Extended Enum: `AssessmentStatus`

- Added: `submitted_locked`, `unlock_requested`, `reopened`, `final_locked`
- Kept: `draft`, `open`, `closed`, `locked` (backward compat in enum, data migrated)
- **Data migration**: 90 production assessments migrated `closed` → `submitted_locked`, 0 from `locked` → `final_locked`

### Modified Models

| Model                  | Changes                                                                                                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AssessmentCategory** | Added `created_by_user_id`, `subject_id`, `year_group_id`, `status` (default approved), `reviewed_by_user_id`, `reviewed_at`, `rejection_reason`. Made `default_weight` nullable. Replaced unique constraint with partial indexes (scoped + global). |
| **RubricTemplate**     | Added `status` (default approved), `reviewed_by_user_id`, `reviewed_at`, `rejection_reason`                                                                                                                                                          |
| **CurriculumStandard** | Added `created_by_user_id`, `status` (default approved), `reviewed_by_user_id`, `reviewed_at`, `rejection_reason`                                                                                                                                    |

### New Models

| Model                       | Purpose                                                      | Key Fields                                                                                                   |
| --------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| **TeacherGradingWeight**    | Teacher-owned category weight config per subject+year+period | `created_by_user_id`, `subject_id`, `year_group_id`, `academic_period_id`, `category_weights_json`, `status` |
| **AssessmentUnlockRequest** | Teacher requests to unlock a submitted assessment            | `assessment_id`, `requested_by_user_id`, `reason`, `status` (ApprovalStepStatus)                             |
| **GradeEditAudit**          | Audit trail for grade changes after assessment reopening     | `grade_id`, `assessment_id`, `old_raw_score`, `new_raw_score`, `reason`, `unlock_request_id`                 |

### RLS Policies

All 3 new tables have `tenant_isolation` policies enforcing `tenant_id = current_setting('app.current_tenant_id')::uuid`.

---

## New Permissions

| Permission                    | Tier  | Purpose                                                           |
| ----------------------------- | ----- | ----------------------------------------------------------------- |
| `gradebook.manage_own_config` | staff | Teacher creates/edits own categories, weights, rubrics, standards |
| `gradebook.approve_config`    | admin | Leadership approves/rejects teacher config                        |
| `gradebook.request_unlock`    | staff | Teacher requests assessment unlock                                |
| `gradebook.approve_unlock`    | admin | Leadership approves/rejects unlock                                |

**Role assignments**:

- `teacher` → `manage_own_config`, `request_unlock`
- `school_owner` → all 4 (manage + approve)
- `school_admin` → all 4

---

## New Services

### TeachingAllocationsService (`teaching-allocations.service.ts`)

Derives teacher's valid class+subject allocations from the intersection of:

1. `TeacherCompetency` (teacher → subject → year_group)
2. `CurriculumRequirement` (year_group → subject)
3. `Class` (classes under each year_group)

**Methods**: `getMyAllocations(tenantId, userId)`, `getAllAllocations(tenantId)`
**Output**: Enriched `TeachingAllocation[]` with setup status (has_grade_config, has_approved_categories, has_approved_weights, assessment_count)

### TeacherGradingWeightsService (`teacher-grading-weights.service.ts`)

Full CRUD + approval workflow for teacher-owned grading weight configs.
**Methods**: `create`, `findAll`, `findOne`, `update`, `delete`, `submitForApproval`, `review`
**Validation**: Weights must sum to 100%, all category IDs must be approved.

---

## Modified Services

### AssessmentCategoriesService

- `create()` now accepts `userId`, `subject_id`, `year_group_id` — teacher-scoped categories start as `draft`
- `findAll()` accepts filters (`userId`, `subject_id`, `year_group_id`, `status`)
- `update()` validates ownership, only allows edits when `draft` or `rejected`
- `delete()` validates ownership
- **New**: `submitForApproval()`, `review()`

### RubricService

- **New**: `submitForApproval()`, `review()` — approval workflow for rubric templates

### StandardsService

- `createStandard()` now accepts `userId`, sets `created_by_user_id` and `status: 'draft'`
- **New**: `submitForApproval()`, `review()`

---

## New API Endpoints (16 total)

### Teaching Allocations

| Method | Path                                     | Permission         |
| ------ | ---------------------------------------- | ------------------ |
| GET    | `/v1/gradebook/teaching-allocations`     | `gradebook.view`   |
| GET    | `/v1/gradebook/teaching-allocations/all` | `gradebook.manage` |

### Teacher Grading Weights

| Method | Path                                               | Permission                    |
| ------ | -------------------------------------------------- | ----------------------------- |
| POST   | `/v1/gradebook/teacher-grading-weights`            | `gradebook.manage_own_config` |
| GET    | `/v1/gradebook/teacher-grading-weights`            | `gradebook.view`              |
| GET    | `/v1/gradebook/teacher-grading-weights/:id`        | `gradebook.view`              |
| PATCH  | `/v1/gradebook/teacher-grading-weights/:id`        | `gradebook.manage_own_config` |
| DELETE | `/v1/gradebook/teacher-grading-weights/:id`        | `gradebook.manage_own_config` |
| POST   | `/v1/gradebook/teacher-grading-weights/:id/submit` | `gradebook.manage_own_config` |
| POST   | `/v1/gradebook/teacher-grading-weights/:id/review` | `gradebook.approve_config`    |

### Config Approval (categories, rubrics, standards)

| Method | Path                                             | Permission                    |
| ------ | ------------------------------------------------ | ----------------------------- |
| POST   | `/v1/gradebook/assessment-categories/:id/submit` | `gradebook.manage_own_config` |
| POST   | `/v1/gradebook/assessment-categories/:id/review` | `gradebook.approve_config`    |
| POST   | `/v1/gradebook/rubric-templates/:id/submit`      | `gradebook.manage_own_config` |
| POST   | `/v1/gradebook/rubric-templates/:id/review`      | `gradebook.approve_config`    |
| POST   | `/v1/gradebook/curriculum-standards/:id/submit`  | `gradebook.manage_own_config` |
| POST   | `/v1/gradebook/curriculum-standards/:id/review`  | `gradebook.approve_config`    |

---

## Module Changes

- **GradebookModule** now imports `SchedulingModule` (for `SchedulingReadFacade` used by TeachingAllocationsService)
- Added `TeachingAllocationsService` and `TeacherGradingWeightsService` to providers

---

## Zod Schema Changes (`packages/shared/src/schemas/gradebook.schema.ts`)

- `createAssessmentCategorySchema`: `default_weight` now optional, added `subject_id`, `year_group_id`
- `updateAssessmentCategorySchema`: Same additions
- `transitionAssessmentStatusSchema`: Added new status values
- **New**: `reviewConfigSchema` — `{ status: 'approved'|'rejected', rejection_reason?: string }` with cross-field validation
- **New**: `createTeacherGradingWeightSchema`, `updateTeacherGradingWeightSchema`
- **New**: `CONFIG_APPROVAL_STATUSES` constant and `ConfigApprovalStatus` type

---

## Architecture Docs Updated

- `docs/architecture/state-machines.md` — Updated AssessmentStatus lifecycle, added ConfigApprovalStatus machine
- `docs/architecture/module-blast-radius.md` — Updated GradebookModule with new SchedulingModule dependency and new services

---

## Test Results

- **Type-check**: ✅ All packages pass (`@school/shared`, `@school/api`)
- **Gradebook tests**: ✅ 1084 tests pass across 53 suites (0 failures)
- **API surface snapshot**: ✅ Updated with 16 new endpoints
- **Pre-existing failures** (not related to this change): 3 finance/PDF test suites (household-statements, statement-template)

---

## Production Verification

| Check                                | Result                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| API health                           | ✅ All services UP (PostgreSQL, Redis, Meilisearch, BullMQ)                     |
| New tables created                   | ✅ `teacher_grading_weights`, `assessment_unlock_requests`, `grade_edit_audits` |
| ConfigApprovalStatus enum            | ✅ `{draft, pending_approval, approved, rejected, archived}`                    |
| Assessment data migration            | ✅ 90 assessments `closed` → `submitted_locked`                                 |
| New columns on assessment_categories | ✅ `status`, `subject_id`, `year_group_id`, `created_by_user_id`                |
| RLS policies                         | ✅ All 3 new tables have tenant isolation policies                              |
| PM2 services                         | ✅ API, Web, Worker all online and stable                                       |

---

## Files Changed (24 files, +2473/-245 lines)

### New Files

- `apps/api/src/modules/gradebook/teaching-allocations.service.ts`
- `apps/api/src/modules/gradebook/teacher-grading-weights.service.ts`
- `packages/prisma/migrations/20260407120000_add_teacher_centric_assessments/migration.sql`
- `packages/prisma/migrations/20260407120000_add_teacher_centric_assessments/post_migrate.sql`
- `docs/plans/teacher-centric-assessments.md` (implementation spec)

### Modified Files

- `packages/prisma/schema.prisma` — New enum, modified models, new models, new relations
- `packages/shared/src/constants/permissions.ts` — 4 new permissions + role assignments
- `packages/shared/src/schemas/gradebook.schema.ts` — Updated + new Zod schemas
- `apps/api/src/modules/gradebook/gradebook.module.ts` — SchedulingModule import, new providers
- `apps/api/src/modules/gradebook/gradebook.controller.ts` — Teaching allocations + grading weights endpoints
- `apps/api/src/modules/gradebook/gradebook-advanced.controller.ts` — Rubric/standard approval endpoints
- `apps/api/src/modules/gradebook/assessment-categories.controller.ts` — Teacher-scoped + approval endpoints
- `apps/api/src/modules/gradebook/assessment-categories.service.ts` — Teacher ownership + approval workflow
- `apps/api/src/modules/gradebook/grading/rubric.service.ts` — Approval methods
- `apps/api/src/modules/gradebook/grading/standards.service.ts` — Teacher ownership + approval
- `apps/api/src/modules/gradebook/dto/gradebook.dto.ts` — New type exports
- `api-surface.snapshot.json` — Updated with new endpoints
- `docs/architecture/state-machines.md` — Updated assessment + new config approval machines
- `docs/architecture/module-blast-radius.md` — Updated GradebookModule dependencies
- 4 spec files updated for new method signatures

---

## What's Next (Phase 2)

Phase 2 will implement the **assessment lifecycle and unlock flow**:

- Extended `AssessmentsService.transitionStatus()` with the new state machine
- `UnlockRequestService` for create/approve/reject unlock requests
- `GradesService.bulkUpsert()` enhanced with GradeEditAudit for reopened assessments
- Final submission validation (every student must have an outcome)
- Gradebook teacher-scoping enforcement on all read endpoints
