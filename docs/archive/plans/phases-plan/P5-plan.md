# P5 Plan — Gradebook, Report Cards, and Transcripts

---

## Section 1 — Overview

Phase 5 delivers the complete grading system: grading scales with immutability enforcement, assessment categories with configurable weights, per-class-subject grade configuration, assessment lifecycle management, grade entry, period grade computation with weighted averages and snapshot storage, grade override workflow, report card generation with immutable snapshot payloads, report card revision chain, locale-specific PDF rendering via Puppeteer (English + Arabic), academic transcript generation aggregating across years, and exam results bulk CSV import. After this phase, teachers can grade students and schools can produce report cards and transcripts.

**Critical constraint**: All gradebook queries (assessment creation, grade entry, period grade computation, report card generation, transcript aggregation) MUST filter to `subject_type = 'academic'` when resolving subjects. `class_subject_grade_configs` only accepts classes whose subject has `subject_type = 'academic'` — application-layer validation on create.

### Prior-Phase Dependencies

| Phase | What P5 imports/extends                                                                                                                                                                                                                                                                                                                        |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0/P1 | `PrismaService`, `AuthModule`, `RbacModule`, `ConfigurationModule`, `RedisModule`, permission guards, RLS middleware (`createRlsClient`), `ZodValidationPipe`                                                                                                                                                                                  |
| P2    | `StudentsModule` (student records, `Student` model), `ClassesModule` (classes, enrolments, `Class`/`ClassEnrolment`), `AcademicsModule` (academic years/periods, `AcademicYear`/`AcademicPeriod`), `Subject` model (filter `subject_type = 'academic'`), `StaffProfile`, `YearGroup`, `Household`/`Parent` (for report card locale resolution) |
| P4A   | `AttendanceModule` — `DailyAttendanceSummary` table for report card attendance snapshots                                                                                                                                                                                                                                                       |

### Prior-Phase Services Used Directly

- `PrismaService` — all DB access
- `ConfigurationService` — read tenant settings (`gradebook.defaultMissingGradePolicy`, `gradebook.requireGradeComment`)
- `RedisService` — transcript caching (5-min TTL, key: `transcript:{tenant_id}:{student_id}`)
- `PermissionCacheService` — permission checks via guards

---

## Section 2 — Database Changes

### 2.1 New Enums

**AssessmentStatus**

```prisma
enum AssessmentStatus {
  draft
  open
  closed
  locked
}
```

**ReportCardStatus**

```prisma
enum ReportCardStatus {
  draft
  published
  revised
}
```

### 2.2 New Tables

---

#### `grading_scales`

| Column      | Type         | Constraints                         |
| ----------- | ------------ | ----------------------------------- |
| id          | UUID         | PK, `gen_random_uuid()`             |
| tenant_id   | UUID         | FK → tenants, NOT NULL              |
| name        | VARCHAR(100) | NOT NULL                            |
| config_json | JSONB        | NOT NULL                            |
| created_at  | TIMESTAMPTZ  | NOT NULL, DEFAULT now()             |
| updated_at  | TIMESTAMPTZ  | NOT NULL, DEFAULT now(), @updatedAt |

**Unique constraint**: `UNIQUE (tenant_id, name)` → `idx_grading_scales_tenant_name`
**Indexes**: `idx_grading_scales_tenant ON grading_scales(tenant_id)`
**RLS**: Standard tenant_isolation policy
**`set_updated_at()` trigger**: Yes — has `updated_at`
**Seed data**: None (tenant-configured)
**Immutability rule**: Cannot modify `config_json` if any grades exist for assessments that reference a `class_subject_grade_config` using this scale. Enforced at application layer.

**`config_json` Zod schema** (defined in `packages/shared`):

```typescript
const gradingScaleConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('numeric'),
    ranges: z
      .array(
        z.object({
          min: z.number(),
          max: z.number(),
          label: z.string().min(1),
          gpa_value: z.number().optional(),
        }),
      )
      .min(1),
    passing_threshold: z.number().nonnegative().optional(),
  }),
  z.object({
    type: z.literal('letter'),
    grades: z
      .array(
        z.object({
          label: z.string().min(1),
          numeric_value: z.number().optional(),
        }),
      )
      .min(1),
    passing_threshold: z.number().nonnegative().optional(),
  }),
  z.object({
    type: z.literal('custom'),
    grades: z
      .array(
        z.object({
          label: z.string().min(1),
          numeric_value: z.number().optional(),
        }),
      )
      .min(1),
    passing_threshold: z.number().nonnegative().optional(),
  }),
]);
```

Validation rules:

- If `type = 'numeric'`: `ranges` required, each range must have `min < max`, ranges must be non-overlapping and sorted ascending by `min`
- If `type = 'letter'` or `type = 'custom'`: `grades` required, non-empty
- `passing_threshold` if provided must be non-negative

---

#### `assessment_categories`

| Column         | Type         | Constraints                         |
| -------------- | ------------ | ----------------------------------- |
| id             | UUID         | PK, `gen_random_uuid()`             |
| tenant_id      | UUID         | FK → tenants, NOT NULL              |
| name           | VARCHAR(100) | NOT NULL                            |
| default_weight | NUMERIC(5,2) | NOT NULL                            |
| created_at     | TIMESTAMPTZ  | NOT NULL, DEFAULT now()             |
| updated_at     | TIMESTAMPTZ  | NOT NULL, DEFAULT now(), @updatedAt |

**Unique constraint**: `UNIQUE (tenant_id, name)` → `idx_assessment_categories_tenant_name`
**Indexes**: `idx_assessment_categories_tenant ON assessment_categories(tenant_id)`
**RLS**: Standard tenant_isolation policy
**`set_updated_at()` trigger**: Yes
**Seed data**: None

---

#### `class_subject_grade_configs`

| Column               | Type        | Constraints                         |
| -------------------- | ----------- | ----------------------------------- |
| id                   | UUID        | PK, `gen_random_uuid()`             |
| tenant_id            | UUID        | FK → tenants, NOT NULL              |
| class_id             | UUID        | FK → classes, NOT NULL              |
| subject_id           | UUID        | FK → subjects, NOT NULL             |
| grading_scale_id     | UUID        | FK → grading_scales, NOT NULL       |
| category_weight_json | JSONB       | NOT NULL                            |
| created_at           | TIMESTAMPTZ | NOT NULL, DEFAULT now()             |
| updated_at           | TIMESTAMPTZ | NOT NULL, DEFAULT now(), @updatedAt |

**Unique constraint**: `UNIQUE (tenant_id, class_id, subject_id)` → `idx_grade_configs_class_subject`
**Indexes**: `idx_grade_configs_tenant ON class_subject_grade_configs(tenant_id)`
**RLS**: Standard tenant_isolation policy
**`set_updated_at()` trigger**: Yes
**Application validation**: On create, verify `subject.subject_type = 'academic'`

**`category_weight_json` Zod schema**:

```typescript
const categoryWeightJsonSchema = z.object({
  weights: z
    .array(
      z.object({
        category_id: z.string().uuid(),
        weight: z.number().positive(),
      }),
    )
    .min(1),
});
```

---

#### `assessments`

| Column             | Type             | Constraints                          |
| ------------------ | ---------------- | ------------------------------------ |
| id                 | UUID             | PK, `gen_random_uuid()`              |
| tenant_id          | UUID             | FK → tenants, NOT NULL               |
| class_id           | UUID             | FK → classes, NOT NULL               |
| subject_id         | UUID             | FK → subjects, NOT NULL              |
| academic_period_id | UUID             | FK → academic_periods, NOT NULL      |
| category_id        | UUID             | FK → assessment_categories, NOT NULL |
| title              | VARCHAR(255)     | NOT NULL                             |
| max_score          | NUMERIC(10,2)    | NOT NULL                             |
| due_date           | DATE             | NULL                                 |
| grading_deadline   | DATE             | NULL                                 |
| status             | AssessmentStatus | NOT NULL, DEFAULT 'draft'            |
| created_at         | TIMESTAMPTZ      | NOT NULL, DEFAULT now()              |
| updated_at         | TIMESTAMPTZ      | NOT NULL, DEFAULT now(), @updatedAt  |

**Indexes**:

- `idx_assessments_tenant_class ON assessments(tenant_id, class_id)`
- `idx_assessments_tenant_period ON assessments(tenant_id, academic_period_id)`
  **RLS**: Standard tenant_isolation policy
  **`set_updated_at()` trigger**: Yes

**Status state machine**:

- `draft` → `open` (allow grade entry)
- `open` → `closed` (block further grade entry)
- `closed` → `locked` (permanent freeze, used in period computation)
- `closed` → `open` (re-open for corrections)
- Blocked: `locked` → any transition; `draft` → `closed`; `draft` → `locked`
- Grade entry allowed only when status is `draft` or `open`

---

#### `grades`

| Column             | Type          | Constraints                         |
| ------------------ | ------------- | ----------------------------------- |
| id                 | UUID          | PK, `gen_random_uuid()`             |
| tenant_id          | UUID          | FK → tenants, NOT NULL              |
| assessment_id      | UUID          | FK → assessments, NOT NULL          |
| student_id         | UUID          | FK → students, NOT NULL             |
| raw_score          | NUMERIC(10,4) | NULL                                |
| is_missing         | BOOLEAN       | NOT NULL, DEFAULT false             |
| comment            | TEXT          | NULL                                |
| entered_by_user_id | UUID          | FK → users, NOT NULL                |
| entered_at         | TIMESTAMPTZ   | NULL                                |
| created_at         | TIMESTAMPTZ   | NOT NULL, DEFAULT now()             |
| updated_at         | TIMESTAMPTZ   | NOT NULL, DEFAULT now(), @updatedAt |

**Unique constraint**: `UNIQUE (tenant_id, assessment_id, student_id)` → `idx_grades_unique`
**Indexes**: `idx_grades_student ON grades(tenant_id, student_id)`
**RLS**: Standard tenant_isolation policy
**`set_updated_at()` trigger**: Yes

**Semantics**:

- `is_missing = true` → student did not submit/take the assessment
- `raw_score = NULL, is_missing = false` → not yet graded
- `raw_score = 0, is_missing = false` → scored zero

---

#### `period_grade_snapshots`

| Column                 | Type          | Constraints                         |
| ---------------------- | ------------- | ----------------------------------- |
| id                     | UUID          | PK, `gen_random_uuid()`             |
| tenant_id              | UUID          | FK → tenants, NOT NULL              |
| student_id             | UUID          | FK → students, NOT NULL             |
| class_id               | UUID          | FK → classes, NOT NULL              |
| subject_id             | UUID          | FK → subjects, NOT NULL             |
| academic_period_id     | UUID          | FK → academic_periods, NOT NULL     |
| computed_value         | NUMERIC(10,4) | NOT NULL                            |
| display_value          | VARCHAR(50)   | NOT NULL                            |
| overridden_value       | VARCHAR(50)   | NULL                                |
| override_reason        | TEXT          | NULL                                |
| override_actor_user_id | UUID          | NULL, FK → users                    |
| snapshot_at            | TIMESTAMPTZ   | NOT NULL                            |
| created_at             | TIMESTAMPTZ   | NOT NULL, DEFAULT now()             |
| updated_at             | TIMESTAMPTZ   | NOT NULL, DEFAULT now(), @updatedAt |

**Unique constraint**: `UNIQUE (tenant_id, student_id, class_id, subject_id, academic_period_id)` → `idx_period_snapshots_unique`
**Indexes**:

- `idx_period_snapshots_student ON period_grade_snapshots(tenant_id, student_id)`
- `idx_period_snapshots_period ON period_grade_snapshots(tenant_id, academic_period_id)`
  **RLS**: Standard tenant_isolation policy
  **`set_updated_at()` trigger**: Yes

**UPSERT pattern**: `INSERT ... ON CONFLICT (tenant_id, student_id, class_id, subject_id, academic_period_id) DO UPDATE SET computed_value = EXCLUDED.computed_value, display_value = EXCLUDED.display_value, snapshot_at = now()`. Override fields (overridden_value, override_reason, override_actor_user_id) are NOT included in UPSERT — recomputation preserves existing overrides.

**Override rule**: Requires `gradebook.override_final_grade` permission. `override_reason` is mandatory when setting `overridden_value`. `computed_value` is preserved — override is display-only.

---

#### `report_cards`

| Column                     | Type             | Constraints                         |
| -------------------------- | ---------------- | ----------------------------------- |
| id                         | UUID             | PK, `gen_random_uuid()`             |
| tenant_id                  | UUID             | FK → tenants, NOT NULL              |
| student_id                 | UUID             | FK → students, NOT NULL             |
| academic_period_id         | UUID             | FK → academic_periods, NOT NULL     |
| status                     | ReportCardStatus | NOT NULL, DEFAULT 'draft'           |
| template_locale            | VARCHAR(10)      | NOT NULL                            |
| teacher_comment            | TEXT             | NULL                                |
| principal_comment          | TEXT             | NULL                                |
| published_at               | TIMESTAMPTZ      | NULL                                |
| published_by_user_id       | UUID             | NULL, FK → users                    |
| revision_of_report_card_id | UUID             | NULL, FK → report_cards (self-ref)  |
| snapshot_payload_json      | JSONB            | NOT NULL                            |
| created_at                 | TIMESTAMPTZ      | NOT NULL, DEFAULT now()             |
| updated_at                 | TIMESTAMPTZ      | NOT NULL, DEFAULT now(), @updatedAt |

**Partial unique constraint**: `UNIQUE (tenant_id, student_id, academic_period_id) WHERE status IN ('draft', 'published')` → `idx_report_cards_active_unique`
**Indexes**:

- `idx_report_cards_student ON report_cards(tenant_id, student_id)`
- `idx_report_cards_period ON report_cards(tenant_id, academic_period_id)`
- `idx_report_cards_revision ON report_cards(revision_of_report_card_id) WHERE revision_of_report_card_id IS NOT NULL`
  **RLS**: Standard tenant_isolation policy
  **`set_updated_at()` trigger**: Yes

**Immutability**: Once `status = 'published'`, `snapshot_payload_json` is frozen. Corrections require creating a new report card with `revision_of_report_card_id` pointing to the original. The original is then transitioned to `status = 'revised'`.

**`template_locale` selection logic**: Determined by: billing parent's `preferred_locale` → `tenant.default_locale` → `'en'`. Set at generation time. Admin can override before publishing.

**Revision query contract**: Default list/detail endpoints exclude `status = 'revised'`. Admin can pass `?include_revisions=true` to see full chain. Parent endpoints never show revised (superseded) cards.

**`snapshot_payload_json` Zod schema**:

```typescript
const reportCardSnapshotSchema = z.object({
  student: z.object({
    full_name: z.string(),
    student_number: z.string().nullable(),
    year_group: z.string(),
    class_homeroom: z.string().nullable(),
  }),
  period: z.object({
    name: z.string(),
    academic_year: z.string(),
    start_date: z.string(),
    end_date: z.string(),
  }),
  subjects: z.array(
    z.object({
      subject_name: z.string(),
      subject_code: z.string().nullable(),
      computed_value: z.number(),
      display_value: z.string(),
      overridden_value: z.string().nullable(),
      assessments: z.array(
        z.object({
          title: z.string(),
          category: z.string(),
          max_score: z.number(),
          raw_score: z.number().nullable(),
          is_missing: z.boolean(),
        }),
      ),
    }),
  ),
  attendance_summary: z
    .object({
      total_days: z.number(),
      present_days: z.number(),
      absent_days: z.number(),
      late_days: z.number(),
    })
    .optional(),
  teacher_comment: z.string().nullable(),
  principal_comment: z.string().nullable(),
});
```

### 2.3 Existing Model Modifications

#### Prisma Schema — New Relations

**Tenant** — add P5 relations:

```prisma
// P5 Relations
grading_scales              GradingScale[]
assessment_categories       AssessmentCategory[]
class_subject_grade_configs ClassSubjectGradeConfig[]
assessments                 Assessment[]
grades                      Grade[]
period_grade_snapshots      PeriodGradeSnapshot[]
report_cards                ReportCard[]
```

**Student** — add P5 relations:

```prisma
// P5 Relations
grades                 Grade[]
period_grade_snapshots PeriodGradeSnapshot[]
report_cards           ReportCard[]
```

**Class** — add P5 relations:

```prisma
// P5 Relations
class_subject_grade_configs ClassSubjectGradeConfig[]
assessments                 Assessment[]
period_grade_snapshots      PeriodGradeSnapshot[]
```

**Subject** — add P5 relations:

```prisma
// P5 Relations
class_subject_grade_configs ClassSubjectGradeConfig[]
assessments                 Assessment[]
period_grade_snapshots      PeriodGradeSnapshot[]
```

**AcademicPeriod** — add P5 relations:

```prisma
// P5 Relations
assessments            Assessment[]
period_grade_snapshots PeriodGradeSnapshot[]
report_cards           ReportCard[]
```

**User** — add P5 relations:

```prisma
// P5 Relations
grades_entered                  Grade[]
period_grade_overrides          PeriodGradeSnapshot[] @relation("override_actor")
report_cards_published          ReportCard[]          @relation("report_card_publisher")
```

### 2.4 New Permissions

Add to `packages/shared/src/constants/permissions.ts`:

```typescript
// Under gradebook:
gradebook: {
  manage: 'gradebook.manage',
  view: 'gradebook.view',
  enter_grades: 'gradebook.enter_grades',
  override_final_grade: 'gradebook.override_final_grade',  // NEW
  publish_report_cards: 'gradebook.publish_report_cards',    // NEW
},
// New section:
transcripts: {
  generate: 'transcripts.generate',  // NEW
},
// Under parent_portal:
parent_portal: {
  // ... existing ...
  view_transcripts: 'parent.view_transcripts',  // NEW
},
```

**Tier assignments**:

- `gradebook.override_final_grade` → `admin`
- `gradebook.publish_report_cards` → `admin`
- `transcripts.generate` → `admin`
- `parent.view_transcripts` → `parent`

**System role assignments**:

- `school_owner`: add all new admin permissions + transcript generate
- `school_admin`: add all new admin permissions + transcript generate
- `teacher`: no new permissions (already has `enter_grades` + `view`)
- `parent`: add `parent.view_transcripts`

### 2.5 RLS Policies

All 7 new tables get the standard policy:

```sql
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;
CREATE POLICY {table_name}_tenant_isolation ON {table_name}
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

Tables: `grading_scales`, `assessment_categories`, `class_subject_grade_configs`, `assessments`, `grades`, `period_grade_snapshots`, `report_cards`

### 2.6 Seed Data

Add new permissions to `packages/prisma/seed/permissions.ts`:

- `gradebook.override_final_grade` (description: "Override computed period grade display value", tier: admin)
- `gradebook.publish_report_cards` (description: "Publish report cards to parents", tier: admin)
- `transcripts.generate` (description: "Generate academic transcripts", tier: admin)
- `parent.view_transcripts` (description: "View and download own children's transcripts", tier: parent)

Update system role permission assignments in seed to include new permissions.

---

## Section 3 — API Endpoints

All endpoints require `AuthGuard` + `PermissionGuard`. Tenant-scoped endpoints use `@ModuleEnabled('gradebook')` guard. Base path: `/api/v1`.

### 3.1 Grading Scales

#### `POST /api/v1/gradebook/grading-scales`

- **Permission**: `gradebook.manage`
- **Request**: `{ name: string, config_json: GradingScaleConfig }`
- **Response**: `{ data: GradingScale }`
- **Logic**: Validate config_json per type rules (non-overlapping ranges for numeric, non-empty grades for letter/custom). Check unique constraint on (tenant_id, name). Create record.
- **Errors**: `DUPLICATE_SCALE_NAME` (409), `INVALID_SCALE_CONFIG` (400)

#### `GET /api/v1/gradebook/grading-scales`

- **Permission**: `gradebook.view`
- **Query**: `?page=1&pageSize=20`
- **Response**: `{ data: GradingScale[], meta: { page, pageSize, total } }`

#### `GET /api/v1/gradebook/grading-scales/:id`

- **Permission**: `gradebook.view`
- **Response**: `{ data: GradingScale }` (includes `is_in_use: boolean` flag)
- **Errors**: `NOT_FOUND` (404)

#### `PATCH /api/v1/gradebook/grading-scales/:id`

- **Permission**: `gradebook.manage`
- **Request**: `{ name?: string, config_json?: GradingScaleConfig }`
- **Logic**: Check if scale is in use (any `class_subject_grade_configs` reference it AND those configs have assessments with grades). If in use, block modification of `config_json`. Name change is always allowed.
- **Errors**: `SCALE_IN_USE` (409), `NOT_FOUND` (404), `DUPLICATE_SCALE_NAME` (409)

#### `DELETE /api/v1/gradebook/grading-scales/:id`

- **Permission**: `gradebook.manage`
- **Logic**: Block if any `class_subject_grade_configs` reference this scale.
- **Errors**: `SCALE_IN_USE` (409), `NOT_FOUND` (404)

---

### 3.2 Assessment Categories

#### `POST /api/v1/gradebook/assessment-categories`

- **Permission**: `gradebook.manage`
- **Request**: `{ name: string, default_weight: number }`
- **Response**: `{ data: AssessmentCategory }`
- **Errors**: `DUPLICATE_CATEGORY_NAME` (409)

#### `GET /api/v1/gradebook/assessment-categories`

- **Permission**: `gradebook.view`
- **Response**: `{ data: AssessmentCategory[] }` (no pagination — typically few categories)

#### `GET /api/v1/gradebook/assessment-categories/:id`

- **Permission**: `gradebook.view`
- **Response**: `{ data: AssessmentCategory }`
- **Errors**: `NOT_FOUND` (404)

#### `PATCH /api/v1/gradebook/assessment-categories/:id`

- **Permission**: `gradebook.manage`
- **Request**: `{ name?: string, default_weight?: number }`
- **Errors**: `DUPLICATE_CATEGORY_NAME` (409), `NOT_FOUND` (404)

#### `DELETE /api/v1/gradebook/assessment-categories/:id`

- **Permission**: `gradebook.manage`
- **Logic**: Block if any assessments reference this category.
- **Errors**: `CATEGORY_IN_USE` (409), `NOT_FOUND` (404)

---

### 3.3 Class Grade Configs

#### `PUT /api/v1/gradebook/classes/:classId/subjects/:subjectId/grade-config`

- **Permission**: `gradebook.manage`
- **Request**: `{ grading_scale_id: string, category_weight_json: CategoryWeightJson }`
- **Logic**: Verify class exists. Verify subject exists and `subject_type = 'academic'`. Verify grading_scale_id exists. Verify all category_ids in weights exist. UPSERT on (tenant_id, class_id, subject_id).
- **Response**: `{ data: ClassSubjectGradeConfig }`
- **Errors**: `SUBJECT_NOT_ACADEMIC` (400), `NOT_FOUND` (404), `INVALID_CATEGORY_IDS` (400)

#### `GET /api/v1/gradebook/classes/:classId/grade-configs`

- **Permission**: `gradebook.view`
- **Response**: `{ data: ClassSubjectGradeConfig[] }` (includes related grading_scale and resolved category names)

#### `GET /api/v1/gradebook/classes/:classId/subjects/:subjectId/grade-config`

- **Permission**: `gradebook.view`
- **Response**: `{ data: ClassSubjectGradeConfig }`
- **Errors**: `NOT_FOUND` (404)

#### `DELETE /api/v1/gradebook/classes/:classId/subjects/:subjectId/grade-config`

- **Permission**: `gradebook.manage`
- **Logic**: Block if assessments exist for this class+subject combination that have grades.
- **Errors**: `CONFIG_IN_USE` (409), `NOT_FOUND` (404)

---

### 3.4 Assessments

#### `POST /api/v1/gradebook/assessments`

- **Permission**: `gradebook.enter_grades` (teacher — scoped to assigned classes) OR `gradebook.manage` (admin — any class)
- **Request**: `{ class_id, subject_id, academic_period_id, category_id, title, max_score, due_date?, grading_deadline? }`
- **Logic**: Verify class exists. Verify subject `subject_type = 'academic'`. Verify teacher is assigned to class (if staff-tier). Verify category exists. Verify academic_period belongs to the class's academic_year. Verify a grade_config exists for (class, subject). Create with status `draft`.
- **Response**: `{ data: Assessment }`
- **Errors**: `SUBJECT_NOT_ACADEMIC` (400), `NOT_ASSIGNED_TO_CLASS` (403), `MISSING_GRADE_CONFIG` (400), `PERIOD_MISMATCH` (400)

#### `GET /api/v1/gradebook/assessments`

- **Permission**: `gradebook.view` OR `gradebook.enter_grades`
- **Query**: `?class_id=...&academic_period_id=...&category_id=...&status=...&page=1&pageSize=20`
- **Logic**: If teacher (staff-tier only), filter to assigned classes only.
- **Response**: `{ data: Assessment[], meta: { page, pageSize, total } }`

#### `GET /api/v1/gradebook/assessments/:id`

- **Permission**: `gradebook.view` OR `gradebook.enter_grades`
- **Response**: `{ data: Assessment }` (includes grade_count, student_count)
- **Errors**: `NOT_FOUND` (404)

#### `PATCH /api/v1/gradebook/assessments/:id`

- **Permission**: `gradebook.enter_grades` (own) OR `gradebook.manage`
- **Request**: `{ title?, max_score?, due_date?, grading_deadline?, category_id? }`
- **Logic**: Only allowed when status is `draft` or `open`. If `max_score` changes and grades exist, validate no grade exceeds new max.
- **Errors**: `ASSESSMENT_LOCKED` (409), `NOT_FOUND` (404), `GRADES_EXCEED_MAX` (400)

#### `PATCH /api/v1/gradebook/assessments/:id/status`

- **Permission**: `gradebook.enter_grades` (for draft→open, open→closed) OR `gradebook.manage` (for any transition including closed→locked, closed→open)
- **Request**: `{ status: AssessmentStatus }`
- **Logic**: Validate state machine transition. Block invalid transitions.
- **Errors**: `INVALID_STATUS_TRANSITION` (400), `NOT_FOUND` (404)

#### `DELETE /api/v1/gradebook/assessments/:id`

- **Permission**: `gradebook.manage`
- **Logic**: Only allowed when status is `draft` and no grades exist. Cascade deletes any placeholder grade records.
- **Errors**: `ASSESSMENT_HAS_GRADES` (409), `ASSESSMENT_NOT_DRAFT` (409), `NOT_FOUND` (404)

---

### 3.5 Grades

#### `PUT /api/v1/gradebook/assessments/:assessmentId/grades`

- **Permission**: `gradebook.enter_grades` (assigned) OR `gradebook.manage`
- **Request**:

```typescript
{
  grades: Array<{
    student_id: string;
    raw_score: number | null;
    is_missing: boolean;
    comment?: string | null;
  }>;
}
```

- **Logic**: Verify assessment exists and status is `draft` or `open`. Verify each student is enrolled in the assessment's class with `status = 'active'`. If tenant setting `requireGradeComment = true`, validate comment is present when `raw_score` is not null. UPSERT grades. Set `entered_by_user_id` to current user, `entered_at` to now() when `raw_score` is provided for the first time.
- **Response**: `{ data: Grade[] }`
- **Errors**: `ASSESSMENT_NOT_OPEN` (409), `STUDENT_NOT_ENROLLED` (400), `COMMENT_REQUIRED` (400), `SCORE_EXCEEDS_MAX` (400)

#### `GET /api/v1/gradebook/assessments/:assessmentId/grades`

- **Permission**: `gradebook.view` OR `gradebook.enter_grades`
- **Response**: `{ data: Grade[] }` (includes student name, student_number)
- **Errors**: `NOT_FOUND` (404)

---

### 3.6 Period Grades

#### `POST /api/v1/gradebook/period-grades/compute`

- **Permission**: `gradebook.manage`
- **Request**: `{ class_id, subject_id, academic_period_id }`
- **Logic**: See Section 4.6 for full computation algorithm. UPSERTs period_grade_snapshots. Preserves existing override fields.
- **Response**: `{ data: PeriodGradeSnapshot[], warnings: string[] }` (warnings include weight normalization notices)
- **Errors**: `MISSING_GRADE_CONFIG` (400), `NO_ASSESSMENTS` (400)

#### `GET /api/v1/gradebook/period-grades`

- **Permission**: `gradebook.view` OR `gradebook.enter_grades`
- **Query**: `?class_id=...&subject_id=...&academic_period_id=...`
- **Response**: `{ data: PeriodGradeSnapshot[] }` (includes student info)

#### `GET /api/v1/gradebook/students/:studentId/period-grades`

- **Permission**: `gradebook.view` OR `parent.view_grades` (with student-link scope check)
- **Query**: `?academic_period_id=...&academic_year_id=...`
- **Response**: `{ data: PeriodGradeSnapshot[] }` (grouped by subject)

#### `POST /api/v1/gradebook/period-grades/:id/override`

- **Permission**: `gradebook.override_final_grade`
- **Request**: `{ overridden_value: string, override_reason: string }`
- **Logic**: Set `overridden_value`, `override_reason`, `override_actor_user_id`. Invalidate transcript cache for this student.
- **Response**: `{ data: PeriodGradeSnapshot }`
- **Errors**: `OVERRIDE_REASON_REQUIRED` (400), `NOT_FOUND` (404)

---

### 3.7 Report Cards

#### `POST /api/v1/report-cards/generate`

- **Permission**: `gradebook.manage`
- **Request**: `{ student_ids: string[], academic_period_id: string }`
- **Logic**: For each student: build snapshot_payload_json from period_grade_snapshots + attendance summary + student/period metadata. Determine template_locale (billing parent's `preferred_locale` → `tenant.default_locale` → `'en'`). Check for existing active report card (if exists and is draft, update it; if published, return error suggesting revision). Create report_card with status `draft`.
- **Response**: `{ data: ReportCard[] }`
- **Errors**: `PUBLISHED_REPORT_EXISTS` (409 — with suggestion to use revision endpoint), `NO_PERIOD_GRADES` (400), `STUDENT_NOT_FOUND` (404)

#### `GET /api/v1/report-cards`

- **Permission**: `gradebook.view`
- **Query**: `?academic_period_id=...&status=...&student_id=...&include_revisions=false&page=1&pageSize=20`
- **Logic**: By default exclude `status = 'revised'` unless `include_revisions=true`.
- **Response**: `{ data: ReportCard[], meta: { page, pageSize, total } }`

#### `GET /api/v1/report-cards/:id`

- **Permission**: `gradebook.view`
- **Response**: `{ data: ReportCard }` (includes revision chain if any)
- **Errors**: `NOT_FOUND` (404)

#### `PATCH /api/v1/report-cards/:id`

- **Permission**: `gradebook.manage`
- **Request**: `{ teacher_comment?: string, principal_comment?: string, template_locale?: string }`
- **Logic**: Only allowed when status is `draft`. Updates the report card fields AND the corresponding fields in `snapshot_payload_json`.
- **Errors**: `REPORT_CARD_NOT_DRAFT` (409), `NOT_FOUND` (404)

#### `POST /api/v1/report-cards/:id/publish`

- **Permission**: `gradebook.publish_report_cards`
- **Logic**: Set `status = 'published'`, `published_at = now()`, `published_by_user_id`. Invalidate transcript cache for this student.
- **Errors**: `REPORT_CARD_NOT_DRAFT` (409), `NOT_FOUND` (404)

#### `POST /api/v1/report-cards/:id/revise`

- **Permission**: `gradebook.manage`
- **Logic**: Only on published report cards. Create a NEW report card with `revision_of_report_card_id` pointing to original. Copy `snapshot_payload_json` as base. Set new card to `draft`. Transition original to `status = 'revised'`.
- **Response**: `{ data: ReportCard }` (the new draft revision)
- **Errors**: `REPORT_CARD_NOT_PUBLISHED` (409), `NOT_FOUND` (404)

#### `GET /api/v1/report-cards/:id/pdf`

- **Permission**: `gradebook.view` OR `parent.view_grades` (with student-link scope check)
- **Logic**: Render report card using Puppeteer template based on `template_locale`. Stream PDF bytes.
- **Response**: `application/pdf` binary stream
- **Errors**: `TEMPLATE_NOT_FOUND` (500), `RENDER_TIMEOUT` (503 — retry once, then fail)

---

### 3.8 Transcripts

#### `GET /api/v1/transcripts/students/:studentId`

- **Permission**: `transcripts.generate` OR `parent.view_transcripts` (with student-link scope check)
- **Logic**: Aggregate all period_grade_snapshots for the student across all academic years/periods. Group by year → period → subject. Check Redis cache first (key: `transcript:{tenant_id}:{student_id}`, TTL 5 min).
- **Response**: `{ data: TranscriptData }`

#### `GET /api/v1/transcripts/students/:studentId/pdf`

- **Permission**: `transcripts.generate` OR `parent.view_transcripts` (with student-link scope check)
- **Logic**: Get transcript data (cached). Determine locale (same logic as report cards). Render via Puppeteer. Stream PDF.
- **Response**: `application/pdf` binary stream

---

### 3.9 Parent Portal

#### `GET /api/v1/parent/students/:studentId/grades`

- **Permission**: `parent.view_grades`
- **Query**: `?academic_period_id=...`
- **Logic**: Verify student is linked to current parent. Return assessments and grades for the student, grouped by subject.
- **Response**: `{ data: StudentGradesSummary }`

#### `GET /api/v1/parent/students/:studentId/report-cards`

- **Permission**: `parent.view_grades`
- **Logic**: Verify student linked. Return only `status = 'published'` report cards. Never show revised/superseded.
- **Response**: `{ data: ReportCard[] }`

#### `GET /api/v1/parent/students/:studentId/report-cards/:reportCardId/pdf`

- **Permission**: `parent.view_grades`
- **Logic**: Verify student linked. Verify report card is published. Render PDF.
- **Response**: `application/pdf`

#### `GET /api/v1/parent/students/:studentId/transcript/pdf`

- **Permission**: `parent.view_transcripts`
- **Logic**: Verify student linked. Generate transcript PDF.
- **Response**: `application/pdf`

---

### 3.10 Bulk Import

#### `POST /api/v1/gradebook/import/validate`

- **Permission**: `gradebook.manage`
- **Request**: Multipart form data with CSV file
- **CSV columns**: `student_identifier` (student_number or name), `subject_code` (or subject_name), `assessment_title`, `score`
- **Logic**: Parse CSV. Match students by `student_number` first, then by `first_name + last_name`. Match subjects by `code` first, then `name`. Match assessments by `title + class + subject + period`. Return match results.
- **Response**: `{ data: { matched: ImportRow[], unmatched: ImportRow[], errors: ValidationError[] } }`
- **Errors**: `INVALID_CSV_FORMAT` (400), `EMPTY_FILE` (400)

#### `POST /api/v1/gradebook/import/process`

- **Permission**: `gradebook.manage`
- **Request**: `{ rows: Array<{ student_id, assessment_id, score }> }` (pre-validated matched rows from validate step)
- **Logic**: Verify all assessments are in `draft` or `open` status. UPSERT grades for each row. Set `entered_by_user_id` and `entered_at`.
- **Response**: `{ data: { processed: number, skipped: number, errors: ImportError[] } }`

---

## Section 4 — Service Layer

### 4.1 GradingScalesService

**File**: `apps/api/src/modules/gradebook/grading-scales.service.ts`
**Module**: GradebookModule
**Dependencies**: PrismaService

**Methods**:

- `create(tenantId, dto)` → validate config, create scale
- `findAll(tenantId, pagination)` → list with pagination
- `findOne(tenantId, id)` → get single, include `is_in_use` flag
- `update(tenantId, id, dto)` → check immutability, update
- `delete(tenantId, id)` → check not referenced, delete
- `isInUse(tenantId, scaleId)` → check if any grade_configs reference this scale AND those have graded assessments

**Immutability check logic**:

1. Find all `class_subject_grade_configs` where `grading_scale_id = scaleId`
2. For each config, check if any `assessments` for that `(class_id, subject_id)` have `grades` with `raw_score IS NOT NULL`
3. If any exist → scale is in use → block `config_json` modification

### 4.2 AssessmentCategoriesService

**File**: `apps/api/src/modules/gradebook/assessment-categories.service.ts`
**Module**: GradebookModule
**Dependencies**: PrismaService

**Methods**:

- `create(tenantId, dto)` → validate unique name, create
- `findAll(tenantId)` → list all (no pagination — typically < 20)
- `findOne(tenantId, id)` → get single
- `update(tenantId, id, dto)` → update
- `delete(tenantId, id)` → check no assessments reference it, delete

### 4.3 ClassGradeConfigsService

**File**: `apps/api/src/modules/gradebook/class-grade-configs.service.ts`
**Module**: GradebookModule
**Dependencies**: PrismaService

**Methods**:

- `upsert(tenantId, classId, subjectId, dto)` → validate subject is academic, validate grading_scale exists, validate category_ids exist, UPSERT
- `findByClass(tenantId, classId)` → list all configs for class (include scale and category details)
- `findOne(tenantId, classId, subjectId)` → get specific config
- `delete(tenantId, classId, subjectId)` → check no graded assessments exist, delete

### 4.4 AssessmentsService

**File**: `apps/api/src/modules/gradebook/assessments.service.ts`
**Module**: GradebookModule
**Dependencies**: PrismaService, ClassGradeConfigsService

**Methods**:

- `create(tenantId, userId, dto)` → validate class, subject (academic), period, category, grade_config exists. Create with status `draft`.
- `findAll(tenantId, filters, pagination)` → list with filters (class_id, period, category, status). If user is teacher-tier, filter to assigned classes.
- `findOne(tenantId, id)` → get with grade_count, student_count
- `update(tenantId, id, dto)` → check status is draft/open, update
- `transitionStatus(tenantId, id, newStatus)` → validate state machine, transition
- `delete(tenantId, id)` → check draft and no grades, delete

**State machine validation**:

```
VALID_TRANSITIONS = {
  draft: ['open'],
  open: ['closed'],
  closed: ['locked', 'open'],
  locked: [],
}
```

### 4.5 GradesService

**File**: `apps/api/src/modules/gradebook/grades.service.ts`
**Module**: GradebookModule
**Dependencies**: PrismaService, ConfigurationService

**Methods**:

- `bulkUpsert(tenantId, assessmentId, userId, grades[])` → verify assessment status (draft/open), verify each student enrolled, enforce comment requirement per tenant setting, UPSERT all grades in single transaction. Handle unique constraint conflict (P2002) gracefully.
- `findByAssessment(tenantId, assessmentId)` → list all grades for assessment, include student info
- `findByStudent(tenantId, studentId, filters)` → get student's grades across assessments

### 4.6 PeriodGradeComputationService

**File**: `apps/api/src/modules/gradebook/period-grade-computation.service.ts`
**Module**: GradebookModule
**Dependencies**: PrismaService, ConfigurationService

**Methods**:

- `compute(tenantId, classId, subjectId, periodId)` → full computation + UPSERT snapshots

**Computation algorithm (step-by-step)**:

1. Load the `class_subject_grade_config` for (class, subject). Error if not found.
2. Load the `grading_scale` from the config.
3. Load all `assessments` for (class, subject, period) where status is NOT `draft`.
4. If no assessments → error `NO_ASSESSMENTS`.
5. Load all enrolled students for the class (status = `active`).
6. Get tenant setting `defaultMissingGradePolicy` (exclude | zero).
7. Parse `category_weight_json` → extract weights per category.
8. Calculate normalized weights: if `SUM(weights) != 100`, normalize each as `weight / SUM(weights) * 100`. Add warning to response.
9. For each student:
   a. For each category that has assessments:
   - Load grades for assessments in this category
   - Calculate category score as percentage:
     - If `policy = 'exclude'`: `SUM(raw_score) / SUM(max_score for graded assessments) * 100`
     - If `policy = 'zero'`: `SUM(COALESCE(raw_score, 0)) / SUM(max_score for all assessments) * 100`
     - Skip missing grades when policy = 'exclude' (is_missing = true OR raw_score IS NULL)
     - Treat missing as 0 when policy = 'zero' (is_missing = true → score = 0)
   - If no valid grades in category → skip category entirely
     b. Calculate weighted average: `SUM(category_score * normalized_weight) / SUM(normalized_weight for categories with data)`
     c. Apply grading scale to get display_value:
   - If `type = 'numeric'`: find range where `min <= computed_value <= max`, use `label`
   - If `type = 'letter'` or `type = 'custom'`: map based on `numeric_value` thresholds (if provided) or use position-based mapping
     d. UPSERT into `period_grade_snapshots` using the conflict clause. Preserve existing override fields.
10. Return all snapshots + warnings.

### 4.7 ReportCardsService

**File**: `apps/api/src/modules/gradebook/report-cards.service.ts`
**Module**: GradebookModule
**Dependencies**: PrismaService, PdfRenderingService, RedisService

**Methods**:

- `generate(tenantId, studentIds[], periodId)` → build snapshot payloads, create draft report cards
- `findAll(tenantId, filters, pagination)` → list (exclude revised by default)
- `findOne(tenantId, id)` → get detail with revision chain
- `update(tenantId, id, dto)` → update comments/locale on draft
- `publish(tenantId, id, userId)` → transition to published, invalidate transcript cache
- `revise(tenantId, id)` → create new draft, mark original as revised
- `renderPdf(tenantId, id)` → render PDF via PdfRenderingService

**Snapshot payload construction**:

1. Load student: `full_name`, `student_number`, year_group.name, homeroom class name
2. Load period: `name`, academic_year.name, `start_date`, `end_date`
3. Load all `period_grade_snapshots` for (student, period) → for each, load assessments with grades
4. Load attendance summary from `daily_attendance_summaries`:
   ```sql
   SELECT
     COUNT(*) as total_days,
     COUNT(*) FILTER (WHERE derived_status = 'present') as present_days,
     COUNT(*) FILTER (WHERE derived_status IN ('absent', 'partially_absent')) as absent_days,
     COUNT(*) FILTER (WHERE derived_status = 'late') as late_days
   FROM daily_attendance_summaries
   WHERE tenant_id = ? AND student_id = ? AND summary_date BETWEEN period.start_date AND period.end_date
   ```
   Note: Use Prisma's `groupBy` or `aggregate` — NOT raw SQL.
5. Determine `template_locale`: look up student → household → billing_parent → user → `preferred_locale` → fallback to `tenant.default_locale` → fallback to `'en'`
6. Assemble the JSON payload per the `reportCardSnapshotSchema`

### 4.8 TranscriptsService

**File**: `apps/api/src/modules/gradebook/transcripts.service.ts`
**Module**: GradebookModule
**Dependencies**: PrismaService, PdfRenderingService, RedisService

**Methods**:

- `getTranscriptData(tenantId, studentId)` → check Redis cache first. Aggregate all period_grade_snapshots. Group by academic_year → period → subject. Cache result for 5 min.
- `renderPdf(tenantId, studentId)` → get data + render via Puppeteer
- `invalidateCache(tenantId, studentId)` → delete Redis key (called on report_card publish and grade override)

### 4.9 BulkImportService

**File**: `apps/api/src/modules/gradebook/bulk-import.service.ts`
**Module**: GradebookModule
**Dependencies**: PrismaService

**Methods**:

- `validateCsv(tenantId, csvBuffer)` → parse CSV, match students/subjects/assessments, return match results
- `processImport(tenantId, userId, rows[])` → UPSERT grades in batches within a transaction

**CSV parsing logic**:

1. Parse CSV headers: expect `student_identifier`, `subject_code` (or `subject_name`), `assessment_title`, `score`
2. For each row:
   - Match student: try `student_number` first, then `first_name + last_name` (case-insensitive)
   - Match subject: try `code` first, then `name`
   - Match assessment: find by `title` within matched student's enrolled classes for matched subject
   - If multiple matches → flag as ambiguous
   - If no match → flag as unmatched with reason
3. Return structured results

### 4.10 PdfRenderingService

**File**: `apps/api/src/modules/pdf-rendering/pdf-rendering.service.ts`
**Module**: PdfRenderingModule (new shared module)
**Dependencies**: None (standalone)

This is a NEW shared module that will be used by gradebook (report cards, transcripts) and later phases (invoices, receipts, payslips).

**Methods**:

- `renderPdf(templateKey, locale, data, branding)` → render HTML template to PDF via Puppeteer, return Buffer
- `private getBrowser()` → lazy-create and cache Puppeteer browser instance
- `private getTemplate(templateKey, locale)` → resolve template function
- `onModuleDestroy()` → close browser instance

**Template registry**:

```typescript
const TEMPLATES: Record<string, Record<string, TemplateFn>> = {
  'report-card': {
    en: renderReportCardEn,
    ar: renderReportCardAr,
  },
  transcript: {
    en: renderTranscriptEn,
    ar: renderTranscriptAr,
  },
};
```

**Error handling**:

- Template not found → throw `TEMPLATE_NOT_FOUND`
- Chromium timeout → retry once (5s timeout each), then throw `RENDER_TIMEOUT`
- Missing font → preflight check before rendering, throw `FONT_MISSING`

**Puppeteer configuration**:

- `headless: true`
- `args: ['--no-sandbox', '--disable-setuid-sandbox']`
- Page format: A4
- Print background: true
- Margin: controlled by template CSS

---

## Section 5 — Frontend Pages and Components

**Reference**: the frontend styling guidance that existed when this plan was written. Executor should consult the current active frontend spec for colours, spacing, table patterns, form patterns, empty states, and PDF preview patterns.

### 5.1 Gradebook Main Page

**File**: `apps/web/src/app/[locale]/(school)/gradebook/page.tsx`
**Route**: `/gradebook`
**Server component**: Yes (data fetching)
**Permission**: `gradebook.view` OR `gradebook.enter_grades`
**Roles**: Admin sees all classes. Teacher sees only assigned classes.

**UI**:

- Page title: "Gradebook"
- Filter bar: academic year selector, academic period selector
- Grid/list of classes with: class name, subject, teacher, assessment count, grade completion percentage
- Click a class → navigate to class gradebook page
- Empty state for teacher: "No assessments created for this class yet." with CTA "Create first assessment"

### 5.2 Class Gradebook Page

**File**: `apps/web/src/app/[locale]/(school)/gradebook/[classId]/page.tsx`
**Route**: `/gradebook/:classId`
**Server component**: Yes (initial data), with client components for tabs
**Permission**: `gradebook.view` OR `gradebook.enter_grades`

**UI**:

- Breadcrumb: Gradebook → Class Name
- Tabs: Assessments | Period Grades | Grade Config
- **Assessments tab**: table of assessments with status badge (draft/open/closed/locked), category, max_score, due_date, grading_deadline, graded count. Row actions: Edit, Grade (enter grades), Change Status. "New Assessment" button.
- **Period Grades tab**: table of students × subjects showing computed/overridden grades. "Compute Grades" action for admin. Override action for admin.
- **Grade Config tab**: display/edit grading scale and category weights for each subject. Weight normalization warning if sum ≠ 100%.

### 5.3 Assessment Create/Edit Page

**File**: `apps/web/src/app/[locale]/(school)/gradebook/[classId]/assessments/new/page.tsx`
**Route**: `/gradebook/:classId/assessments/new`
**Client component**: Yes (form)
**API**: `POST /api/v1/gradebook/assessments`

**UI**:

- Form fields: Subject (select, filtered to academic), Period (select), Category (select), Title (text), Max Score (number), Due Date (date picker), Grading Deadline (date picker)
- Validation: subject must be academic, grade config must exist for class+subject
- Submit creates assessment in draft status

### 5.4 Grade Entry Page

**File**: `apps/web/src/app/[locale]/(school)/gradebook/[classId]/assessments/[assessmentId]/grades/page.tsx`
**Route**: `/gradebook/:classId/assessments/:assessmentId/grades`
**Client component**: Yes (interactive grid)
**Permission**: `gradebook.enter_grades` (assigned) OR `gradebook.manage`
**API**: `PUT /api/v1/gradebook/assessments/:id/grades`, `GET /api/v1/gradebook/assessments/:id/grades`

**UI**:

- Assessment header: title, category, max_score, status badge, due date
- Grade entry grid: student name | score input | missing checkbox | comment input
- Score input: numeric, max constrained by `max_score`
- Missing checkbox: when checked, clears score, marks `is_missing = true`
- Comment: text input (required indicator if tenant setting `requireGradeComment = true`)
- Status bar at bottom: "X of Y students graded"
- Save button: bulk upserts all grades
- Lock indicator: if assessment is closed/locked, inputs are disabled with message "This assessment is locked"
- **Speed-optimized**: tab between score fields, auto-advance on enter, keyboard navigation

### 5.5 Report Cards Page

**File**: `apps/web/src/app/[locale]/(school)/report-cards/page.tsx`
**Route**: `/report-cards`
**Server component**: Yes
**Permission**: `gradebook.manage` OR `gradebook.view`

**UI**:

- Filter bar: academic period selector, status filter (draft/published), student search
- Table: student name, period, status badge (draft=amber, published=emerald, revised=gray), template locale, published date, actions
- Actions: View/Preview PDF, Edit (draft), Publish (draft), Revise (published)
- "Generate Report Cards" button → opens generation dialog
- Status badges clearly distinguish draft, published, and revised per UI design brief §20.3

### 5.6 Report Card Generation Dialog

**File**: `apps/web/src/app/[locale]/(school)/report-cards/_components/generate-dialog.tsx`
**Client component**: Yes
**Permission**: `gradebook.manage`

**UI**:

- Select academic period
- Select students (multi-select with search, or "All students in period")
- Preview of how many report cards will be generated
- Warning if any students lack period grades
- Generate button → calls `POST /api/v1/report-cards/generate`

### 5.7 Report Card Detail/Preview

**File**: `apps/web/src/app/[locale]/(school)/report-cards/[id]/page.tsx`
**Route**: `/report-cards/:id`
**Server component**: Yes (data fetch), Client component for preview modal
**Permission**: `gradebook.view`

**UI**:

- Report card metadata: student, period, status, locale, published date
- Comment editing (if draft): teacher_comment, principal_comment
- Snapshot payload rendered as a formatted summary (not the PDF — just data view)
- "Preview PDF" button → opens full-screen PDF preview modal (per UI design brief §14b.1)
- "Download PDF" button
- Publish / Revise actions
- Revision chain display (if revisions exist)

### 5.8 Grading Scales Settings Page

**File**: `apps/web/src/app/[locale]/(school)/settings/grading-scales/page.tsx`
**Route**: `/settings/grading-scales`
**Permission**: `gradebook.manage`

**UI**:

- Table of grading scales: name, type (numeric/letter/custom), in-use indicator, actions
- Create/edit form: name, type selector, dynamic config fields (ranges for numeric, labels for letter/custom)
- In-use scales show lock icon and tooltip explaining immutability
- Delete blocked for in-use scales

### 5.9 Assessment Categories Settings Page

**File**: `apps/web/src/app/[locale]/(school)/settings/assessment-categories/page.tsx`
**Route**: `/settings/assessment-categories`
**Permission**: `gradebook.manage`

**UI**:

- Table of categories: name, default_weight, in-use indicator, actions
- Create/edit form: name, default_weight (percentage)
- Delete blocked for in-use categories

### 5.10 Bulk Import Page

**File**: `apps/web/src/app/[locale]/(school)/gradebook/import/page.tsx`
**Route**: `/gradebook/import`
**Client component**: Yes
**Permission**: `gradebook.manage`

**UI** (follows UI design brief §7.5 Import Flows):

- Step 1: File upload with template guidance ("Download CSV template")
- Step 2: Validation results — matched/unmatched/error breakdown table
- Step 3: Review matched rows, fix/exclude unmatched
- Step 4: Confirm and process
- Progress indicator during processing

### 5.11 Parent Grade View

**File**: `apps/web/src/app/[locale]/(school)/dashboard/parent/_components/grades-tab.tsx`
**Client component**: Yes
**Permission**: `parent.view_grades`

**UI**:

- Student selector (if parent has multiple children)
- Period selector
- Grades grouped by subject: assessment list with scores, category averages, period grade
- Published report cards section with "View PDF" links
- Transcript download link

### 5.12 Sidebar and Navigation Updates

- Add "Gradebook" item under ACADEMICS section in sidebar (icon: `BookOpen` from Lucide)
- Add "Report Cards" sub-item under Gradebook OR as its own item (based on permission)
- Add "Grading Scales" and "Assessment Categories" items under Settings
- Parent dashboard: add Grades tab/section

---

## Section 6 — Background Jobs

### 6.1 Mass Report Card PDF Generation

**Job name**: `gradebook:mass-report-card-pdf`
**Queue**: `gradebook`
**Processor file**: `apps/worker/src/processors/gradebook/mass-report-card-pdf.processor.ts`

**Trigger**: Admin clicks "Export all report cards as PDF" on the report cards list page for a given period.

**Payload**:

```typescript
{
  tenant_id: string,
  academic_period_id: string,
  report_card_ids: string[],
  requested_by_user_id: string,
}
```

**Processing**:

1. Extend `TenantAwareJob` base class
2. For each report_card_id: render PDF using PdfRenderingService
3. Concatenate all PDFs into a single consolidated document (using pdf-lib or similar)
4. Store temporarily in S3 (`/{tenant_id}/exports/report-cards-{period}-{timestamp}.pdf`)
5. Return download URL (signed, 1-hour expiry)
6. Update job status for frontend polling

**Retry**: 3 attempts, exponential backoff. Individual PDF failures don't block the batch — skip and report.

### 6.2 Bulk Grade Import Processing

**Job name**: `gradebook:bulk-import-process`
**Queue**: `gradebook`
**Processor file**: `apps/worker/src/processors/gradebook/bulk-import.processor.ts`

**Trigger**: Admin confirms bulk import on the import page (for large imports > 500 rows).

**Payload**:

```typescript
{
  tenant_id: string,
  rows: Array<{ student_id: string, assessment_id: string, score: number }>,
  imported_by_user_id: string,
}
```

**Processing**:

1. Extend `TenantAwareJob` base class
2. Process in batches of 100 rows within transactions
3. UPSERT grades per batch
4. Track progress for frontend polling

**Retry**: 3 attempts, exponential backoff. Dead-letter on failure.

Note: Small imports (< 500 rows) are processed synchronously via the API endpoint. The background job is for large imports only.

---

## Section 7 — Implementation Order

### Step 1: Database Migration + Seed

1. Add `AssessmentStatus` and `ReportCardStatus` enums to Prisma schema
2. Add all 7 new model definitions to Prisma schema
3. Add P5 relations to existing models (Tenant, Student, Class, Subject, AcademicPeriod, User)
4. Generate migration: `npx prisma migrate dev --name add-p5-gradebook-tables`
5. Add RLS policies for all 7 tables in `post_migrate.sql`
6. Add `set_updated_at()` triggers for all 7 tables
7. Add new permissions to seed data
8. Update system role permission assignments in seed

### Step 2: Shared Types and Zod Schemas

1. Create `packages/shared/src/types/gradebook.ts` — all P5 type definitions
2. Create `packages/shared/src/schemas/gradebook.schema.ts` — all Zod schemas:
   - `gradingScaleConfigSchema` (discriminated union)
   - `createGradingScaleSchema`, `updateGradingScaleSchema`
   - `createAssessmentCategorySchema`, `updateAssessmentCategorySchema`
   - `categoryWeightJsonSchema`
   - `upsertGradeConfigSchema`
   - `createAssessmentSchema`, `updateAssessmentSchema`, `transitionAssessmentStatusSchema`
   - `bulkUpsertGradesSchema`, grade entry item schema
   - `computePeriodGradesSchema`
   - `overridePeriodGradeSchema`
   - `generateReportCardsSchema`, `updateReportCardSchema`
   - `reportCardSnapshotSchema`
   - `importValidateSchema`, `importProcessSchema`
3. Add new permission constants to `packages/shared/src/constants/permissions.ts`
4. Export everything from `packages/shared/src/index.ts`

### Step 3: PDF Rendering Module (shared)

1. Create `apps/api/src/modules/pdf-rendering/pdf-rendering.module.ts`
2. Create `apps/api/src/modules/pdf-rendering/pdf-rendering.service.ts`
3. Create HTML template functions:
   - `apps/api/src/modules/pdf-rendering/templates/report-card-en.template.ts`
   - `apps/api/src/modules/pdf-rendering/templates/report-card-ar.template.ts`
   - `apps/api/src/modules/pdf-rendering/templates/transcript-en.template.ts`
   - `apps/api/src/modules/pdf-rendering/templates/transcript-ar.template.ts`
4. Install `puppeteer` dependency in `apps/api`

### Step 4: Backend Services (dependency order)

1. `GradingScalesService` — no service dependencies
2. `AssessmentCategoriesService` — no service dependencies
3. `ClassGradeConfigsService` — depends on step 1-2 for validation
4. `AssessmentsService` — depends on ClassGradeConfigsService
5. `GradesService` — depends on ConfigurationService (tenant settings)
6. `PeriodGradeComputationService` — depends on ConfigurationService
7. `ReportCardsService` — depends on PdfRenderingService, RedisService
8. `TranscriptsService` — depends on PdfRenderingService, RedisService
9. `BulkImportService` — depends on GradesService

### Step 5: Backend Controllers

1. `GradingScalesController` — routes for scales CRUD
2. `AssessmentCategoriesController` — routes for categories CRUD
3. `GradebookController` — main controller: grade configs, assessments, grades, period grades, import
4. `ReportCardsController` — report card management + PDF
5. `TranscriptsController` — transcript endpoints
6. `ParentGradebookController` — parent portal grade/report/transcript endpoints
7. Wire everything in `GradebookModule`

### Step 6: Background Job Processors

1. Create `apps/worker/src/processors/gradebook/mass-report-card-pdf.processor.ts`
2. Create `apps/worker/src/processors/gradebook/bulk-import.processor.ts`
3. Register processors in worker module

### Step 7: Frontend — Settings Pages

1. Grading Scales settings page (`/settings/grading-scales`)
2. Assessment Categories settings page (`/settings/assessment-categories`)
3. Add sidebar items under Settings

### Step 8: Frontend — Gradebook Pages

1. Gradebook main page (`/gradebook`)
2. Class gradebook page (`/gradebook/[classId]`)
3. Assessment create page (`/gradebook/[classId]/assessments/new`)
4. Grade entry page (`/gradebook/[classId]/assessments/[assessmentId]/grades`)
5. Bulk import page (`/gradebook/import`)
6. Add "Gradebook" to sidebar under ACADEMICS

### Step 9: Frontend — Report Cards and Transcripts

1. Report cards list page (`/report-cards`)
2. Report card generation dialog component
3. Report card detail page (`/report-cards/[id]`)
4. PDF preview modal (shared component following UI brief §14b.1)
5. Parent grades tab component
6. Transcript section in parent view

### Step 10: Navigation and Integration

1. Add sidebar entries for Gradebook, Report Cards
2. Update parent dashboard with grades/report cards/transcripts tab
3. Update student hub to show gradebook summary (per UI brief §4.2)
4. Update class hub to show gradebook activity (per UI brief §4.2)
5. Add i18n translation keys for all new pages

---

## Section 8 — Files to Create

### packages/shared/src/

- `types/gradebook.ts`
- `schemas/gradebook.schema.ts`

### packages/prisma/

- `migrations/{TIMESTAMP}_add_p5_gradebook_tables/migration.sql` (auto-generated)
- `migrations/{TIMESTAMP}_add_p5_gradebook_tables/post_migrate.sql` (RLS + triggers)

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
- `transcripts.service.ts`
- `bulk-import.service.ts`
- `gradebook.controller.ts`
- `report-cards.controller.ts`
- `transcripts.controller.ts`
- `parent-gradebook.controller.ts`

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

---

## Section 9 — Files to Modify

### packages/prisma/

- `schema.prisma` — add 2 enums, 7 models, P5 relations to Tenant/Student/Class/Subject/AcademicPeriod/User

### packages/shared/src/

- `constants/permissions.ts` — add `override_final_grade`, `publish_report_cards`, `transcripts.generate`, `parent.view_transcripts` + tier map + system role assignments
- `index.ts` — add P5 type and schema exports

### packages/prisma/seed/

- `permissions.ts` — add new permission records
- `system-roles.ts` — update system role permission lists

### apps/api/src/

- `app.module.ts` — import `GradebookModule` and `PdfRenderingModule`

### apps/worker/src/

- Module registration — register gradebook queue processors

### apps/web/src/

- Sidebar component — add Gradebook and Report Cards navigation items
- Settings layout — add Grading Scales and Assessment Categories links
- Parent dashboard — add grades tab/section
- Student detail page — add gradebook summary section
- Class detail page — add gradebook activity section
- `messages/en.json` — add all gradebook translation keys
- `messages/ar.json` — add all gradebook Arabic translations

---

## Section 10 — Key Context for Executor

### 10.1 Established Patterns (with file path examples)

**Service + RLS pattern**: See `apps/api/src/modules/attendance/attendance.service.ts`. Every mutation uses `createRlsClient(this.prisma, { tenant_id: tenantId })` followed by `$transaction(async (tx) => { ... })`. Read queries can use direct Prisma with `tenant_id` filter.

**Controller pattern**: See `apps/api/src/modules/attendance/attendance.controller.ts`. Thin controllers with `@UseGuards(AuthGuard, PermissionGuard)`, `@RequiresPermission()`, `@CurrentTenant()`, `@CurrentUser()`. Input validation via `@Body(new ZodValidationPipe(schema))`.

**Module wiring**: See `apps/api/src/modules/attendance/attendance.module.ts`. Import required modules, declare controllers/providers, export services.

**Zod schema pattern**: See `packages/shared/src/schemas/attendance.schema.ts`. Define schema → export type via `z.infer<typeof schema>`.

**Type pattern**: See `packages/shared/src/types/attendance.ts`. Interfaces matching DB/API shapes, `string` for UUIDs and timestamps.

**Decorators**: `apps/api/src/common/decorators/` — `@RequiresPermission()`, `@CurrentTenant()`, `@CurrentUser()`, `@ModuleEnabled()`.

**Guards**: `apps/api/src/common/guards/` — `AuthGuard`, `PermissionGuard`, `ModuleEnabledGuard`.

**RLS middleware**: `apps/api/src/common/middleware/rls.middleware.ts` — `createRlsClient()`.

### 10.2 Gotchas and Edge Cases

1. **Subject academic filter**: ALL gradebook queries MUST filter `subject_type = 'academic'`. This is the spec's #1 constraint. Validate on create for configs/assessments. Include in queries for grades/snapshots.

2. **Grading scale immutability**: The check is NOT "are any grade_configs using this scale" — it's "are any grade_configs using this scale that also have assessments with actual grades". An unused config referencing a scale does NOT make it immutable.

3. **Period grade UPSERT**: The `ON CONFLICT` clause must NOT update override fields. Use Prisma's `upsert` with careful field selection. Override fields should only change via the explicit override endpoint.

4. **Report card partial unique constraint**: Prisma does not support partial unique indexes natively. Use `@@index` with a raw SQL partial unique index in the `post_migrate.sql` file:

   ```sql
   CREATE UNIQUE INDEX idx_report_cards_active_unique
   ON report_cards(tenant_id, student_id, academic_period_id)
   WHERE status IN ('draft', 'published');
   ```

5. **Transcript cache invalidation**: Must invalidate on TWO events: (a) report card published, (b) period grade snapshot override. The cache key is `transcript:{tenant_id}:{student_id}`.

6. **Missing grade semantics**: Three distinct states: `is_missing = true` (didn't submit), `raw_score = NULL / is_missing = false` (not yet graded), `raw_score = 0 / is_missing = false` (scored zero). The computation engine must handle all three correctly per the tenant's missing grade policy.

7. **Weight normalization**: If category weights sum to, say, 80%, normalize to 100% (each weight × 100/80). The API response must include a warning string that the frontend displays. This is NOT an error — it's a valid configuration with a warning.

8. **Report card template_locale**: Resolution chain is: student.household.billing_parent.user.preferred_locale → tenant.default_locale → 'en'. This requires joining through multiple tables. Cache the locale per student to avoid repeated lookups during batch generation.

9. **Puppeteer browser lifecycle**: Create the browser instance lazily on first render request. Reuse across renders. Close on module destroy. Do NOT create a new browser per PDF — that's extremely slow.

10. **Parent endpoint scope check**: All parent portal endpoints must verify that the requesting parent is linked to the student via `student_parents` table. This is application-layer validation on top of RLS.

### 10.3 Tenant Settings Already Available

The tenant settings schema (`packages/shared/src/schemas/tenant.schema.ts`) already includes:

```typescript
gradebook: {
  defaultMissingGradePolicy: 'exclude' | 'zero',  // default: 'exclude'
  requireGradeComment: boolean,                      // default: false
}
```

These are accessed via `ConfigurationService` → `tenantSettings.settings.gradebook`.

### 10.4 Permissions Already Defined

Existing in `packages/shared/src/constants/permissions.ts`:

- `gradebook.manage` (admin) — already assigned to school_owner, school_admin
- `gradebook.view` (admin) — already assigned to school_owner, school_admin, teacher
- `gradebook.enter_grades` (staff) — already assigned to teacher
- `parent.view_grades` (parent) — already assigned to parent

NEW permissions to add:

- `gradebook.override_final_grade` (admin)
- `gradebook.publish_report_cards` (admin)
- `transcripts.generate` (admin)
- `parent.view_transcripts` (parent)

### 10.5 Module Key

`'gradebook'` already exists in `packages/shared/src/constants/modules.ts`. No changes needed.

### 10.6 RTL Styling Rules

All frontend components MUST use logical Tailwind utilities: `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`/`text-start`/`text-end`/`rounded-s-`/`rounded-e-`/`border-s-`/`border-e-`. Physical `left`/`right` classes are build errors.

### 10.7 PDF Template Design Notes

- Report card templates must include: school logo + name (from branding), student info, period info, subject grades table, attendance summary, teacher/principal comments
- Arabic template: `dir="rtl"`, Noto Sans Arabic font, right-aligned text, RTL table layout
- Both templates: white background (it's a printed document), professional academic styling
- Font embedding: use `@font-face` with base64-encoded font or file path accessible to Puppeteer
- A4 page size, reasonable margins (20mm)
- Consistent header/footer across pages if content overflows

### 10.8 Optimistic Concurrency

Per shared context §2.14, the following P5 entities need optimistic concurrency via `expected_updated_at`:

- None explicitly listed in the shared context for P5 entities. However, assessments (draft/open editing) and report cards (draft editing) should implement it for safety. Include `expected_updated_at` in PATCH endpoints for assessments and report cards.
