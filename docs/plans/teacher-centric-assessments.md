# Teacher-Centric Assessments System — Implementation Spec

## Overview

Replace the current admin-owned, tenant-wide assessment configuration model with a teacher-centric workflow. Teachers see only their own class-subject allocations, configure assessment categories/weights/rubrics/standards scoped to what they teach, submit config for approval, and manage the full assessment-to-report-card lifecycle within their allocations.

**Core principle**: Everything a teacher creates goes through approval. Only approved config items can be used in live assessments. Leadership (owner/principal/VP) has full visibility.

---

## Phase 1: Schema + Teaching Allocations + Core Backend

### Schema Changes

**New enum: `ConfigApprovalStatus`**

- `draft`, `pending_approval`, `approved`, `rejected`, `archived`

**Extended enum: `AssessmentStatus`**

- Add: `submitted_locked`, `unlock_requested`, `reopened`, `final_locked`
- Migrate: `closed` → `submitted_locked`, `locked` → `final_locked`
- Keep: `draft`, `open`

**Modified model: `AssessmentCategory`**

- Add: `created_by_user_id` (UUID?, FK User), `subject_id` (UUID?, FK Subject), `year_group_id` (UUID?, FK YearGroup)
- Add: `status` (ConfigApprovalStatus, default approved for existing)
- Add: `reviewed_by_user_id` (UUID?), `reviewed_at` (Timestamptz?), `rejection_reason` (Text?)
- Make `default_weight` nullable (deprecated, will be removed later)
- Drop unique `(tenant_id, name)` → Add partial unique indexes:
  - Scoped: `(tenant_id, name, subject_id, year_group_id)` WHERE both NOT NULL
  - Global: `(tenant_id, name)` WHERE both NULL

**Modified model: `RubricTemplate`**

- Add: `status` (ConfigApprovalStatus, default approved for existing)
- Add: `reviewed_by_user_id` (UUID?), `reviewed_at` (Timestamptz?), `rejection_reason` (Text?)

**Modified model: `CurriculumStandard`**

- Add: `created_by_user_id` (UUID?, FK User)
- Add: `status` (ConfigApprovalStatus, default approved for existing)
- Add: `reviewed_by_user_id` (UUID?), `reviewed_at` (Timestamptz?), `rejection_reason` (Text?)

**New model: `TeacherGradingWeight`**

- `id` UUID PK, `tenant_id` FK, `created_by_user_id` FK User
- `subject_id` FK Subject, `year_group_id` FK YearGroup, `academic_period_id` FK AcademicPeriod
- `category_weights_json` Json
- `status` ConfigApprovalStatus (default draft)
- `reviewed_by_user_id` UUID?, `reviewed_at` Timestamptz?, `rejection_reason` Text?
- Unique: `(tenant_id, created_by_user_id, subject_id, year_group_id, academic_period_id)`

**New model: `AssessmentUnlockRequest`**

- `id` UUID PK, `tenant_id` FK
- `assessment_id` FK Assessment, `requested_by_user_id` FK User
- `reason` Text
- `status` ApprovalStepStatus (pending/approved/rejected)
- `reviewed_by_user_id` UUID?, `reviewed_at` Timestamptz?, `rejection_reason` Text?
- `created_at`, `updated_at`

**New model: `GradeEditAudit`**

- `id` UUID PK, `tenant_id` FK
- `grade_id` FK Grade, `assessment_id` FK Assessment, `student_id` FK Student
- `old_raw_score` Decimal?, `new_raw_score` Decimal?
- `old_comment` Text?, `new_comment` Text?
- `edited_by_user_id` FK User, `reason` Text
- `unlock_request_id` UUID? FK AssessmentUnlockRequest
- `created_at` Timestamptz

### New Permissions

- `gradebook.manage_own_config` (staff tier) — teacher creates/edits own categories, weights, rubrics, standards
- `gradebook.approve_config` (admin tier) — leadership approves/rejects teacher config
- `gradebook.request_unlock` (staff tier) — teacher requests assessment unlock
- `gradebook.approve_unlock` (admin tier) — leadership approves/rejects unlock

### New/Modified Services

- **TeachingAllocationsService** — derives teacher's valid class+subject allocations from TeacherCompetency ∩ CurriculumRequirement
- **AssessmentCategoriesService** — teacher-scoped create (with subject_id, year_group_id, created_by), approval endpoints, backward-compatible findAll
- **TeacherGradingWeightsService** — new service, full CRUD + approval + 100% validation
- **RubricService** — add approval submit/review methods
- **StandardsService** — add created_by_user_id + approval methods

### New Endpoints

- `GET /v1/gradebook/teaching-allocations` — teacher's matrix
- `GET /v1/gradebook/teaching-allocations/all` — leadership view (all teachers)
- `POST /v1/gradebook/assessment-categories/:id/submit` — submit for approval
- `POST /v1/gradebook/assessment-categories/:id/review` — approve/reject
- `POST /v1/gradebook/teacher-grading-weights` — create
- `GET /v1/gradebook/teacher-grading-weights` — list (teacher-scoped)
- `PATCH /v1/gradebook/teacher-grading-weights/:id` — update
- `DELETE /v1/gradebook/teacher-grading-weights/:id` — delete
- `POST /v1/gradebook/teacher-grading-weights/:id/submit` — submit for approval
- `POST /v1/gradebook/teacher-grading-weights/:id/review` — approve/reject
- `POST /v1/gradebook/rubric-templates/:id/submit` — submit for approval
- `POST /v1/gradebook/rubric-templates/:id/review` — approve/reject
- `POST /v1/gradebook/curriculum-standards/:id/submit` — submit for approval
- `POST /v1/gradebook/curriculum-standards/:id/review` — approve/reject

---

## Phase 2: Assessment Lifecycle + Unlock Flow

### Assessment Status Machine (New)

```
draft → open → submitted_locked → [unlock_requested → reopened → final_locked]
                                    ↑                           │
                                    └───────────────────────────┘ (can re-request)
```

### Changes

- **AssessmentsService.transitionStatus()** — new valid transitions map
- **New: UnlockRequestService** — create request, approve/reject, trigger status change
- **GradesService.bulkUpsert()** — when assessment is reopened, create GradeEditAudit entries for changed grades
- **Grade entry validation** — final submission only when every enrolled student has an outcome (score, rubric, or missing/absent/not-submitted flag)
- **Gradebook teacher-scoping** — all read endpoints filter by teacher's allocations unless leadership role

### New Endpoints

- `POST /v1/gradebook/assessments/:id/unlock-request` — teacher requests unlock
- `GET /v1/gradebook/unlock-requests` — pending requests (leadership)
- `POST /v1/gradebook/unlock-requests/:id/review` — approve/reject

---

## Phase 3: Frontend — Dashboard + Config Pages

### New Pages (under `/assessments/`)

1. **Assessments Dashboard** (`/assessments`) — class×subject matrix, status indicators, setup summary cards
2. **Assessment Categories** (`/assessments/categories`) — teacher-owned CRUD with approval workflow
3. **Grading Weights** (`/assessments/grading-weights`) — teacher-owned, per subject+year+period, 100% validation
4. **Rubric Templates** (`/assessments/rubric-templates`) — teacher-owned with approval
5. **Curriculum Standards** (`/assessments/curriculum-standards`) — teacher-owned with approval

### Navigation

- Learning > Assessments becomes L2 group
- L3 tabs: Assessments | Gradebook | Report Cards | Categories | Weights | Rubrics | Standards
- Hide 4 teacher-config pages from `/settings/` (categories, weights, rubrics, standards)
- Keep in settings: Grading Scales, Competency Scales

### Role-Aware Rendering

- Teacher: sees own allocations matrix, own config items, own gradebook
- Leadership: sees all teachers' allocations, all config, all gradebook, approval queue

---

## Phase 4: Frontend — Workspace + Gradebook + Polish

### New Pages

1. **Assessment Workspace** (`/assessments/workspace/[classId]/[subjectId]`) — per-allocation detail:
   - Approved config summary (categories, weights, rubrics, standards)
   - Recent assessments list
   - Create assessment form (only if config complete)
   - Setup warnings for missing config
2. **Unlock Request UI** — teacher can request unlock from locked assessment detail
3. **Approval Queue** — leadership dashboard for pending config + unlock approvals

### Modified Pages

- **Gradebook** — teacher-scoped: only shows own allocations. Leadership: shows all.
- **Grade Entry** — audit trail visible after reopening. Reason required for changes.
- **Report Cards** — verify reads only finalized (submitted_locked or final_locked) data

### Legacy Cleanup

- Remove default_weight from assessment category UI entirely
- Remove `default_weight` column from DB (final migration)
- Hide assessment config from Settings once teacher workflow is confirmed stable
