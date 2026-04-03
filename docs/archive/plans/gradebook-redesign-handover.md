# Gradebook Module Redesign — Handover Document

## Purpose

This document provides a new session with everything needed to execute the gradebook redesign. It covers the user's specification, current system state, existing infrastructure, bugs to fix, and the implementation approach.

---

## User's Vision (Summary)

The gradebook currently lists entries per class+subject combination (120+ entries). The user wants it restructured to list **by class only** (Y1A, Y1B, etc.), with subjects handled inside each class gradebook. The core missing feature is a **Results tab** — a matrix where teachers enter grades per student, per subject, per assessment type. Grades are then auto-computed using configurable weights per year group and term.

**Full specification**: `/Users/ram/Downloads/gradebook-spec-notes.md` (the user's original notes — read this first)

---

## What Exists Today

### Database Models (schema.prisma, lines 1916–2053)

| Model                     | Purpose                           | Key Fields                                                                                                                             |
| ------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `GradingScale`            | Named scales (e.g., "Standard")   | `config_json` (JSONB with grade boundaries)                                                                                            |
| `AssessmentCategory`      | Category types                    | `name` (classwork/quiz/midterm/final/homework), `default_weight`                                                                       |
| `ClassSubjectGradeConfig` | Per-class, per-subject config     | `class_id`, `subject_id`, `grading_scale_id`, `category_weight_json`                                                                   |
| `Assessment`              | Individual assessments            | `class_id`, `subject_id`, `academic_period_id`, `category_id`, `title`, `max_score`, `status` (draft/open/closed/archived)             |
| `Grade`                   | Individual student grades         | `assessment_id`, `student_id`, `raw_score`, `is_missing`, `comment`, `entered_by_user_id`                                              |
| `PeriodGradeSnapshot`     | Computed/overridden period grades | `student_id`, `class_id`, `subject_id`, `academic_period_id`, `computed_value`, `display_value`, `overridden_value`, `override_reason` |

### Backend Services (apps/api/src/modules/gradebook/)

| File                                  | What it does                                                              |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `assessments.service.ts`              | CRUD for assessments, grade entry, CSV bulk import for grades             |
| `grades.service.ts`                   | Grade CRUD, batch save                                                    |
| `period-grade-computation.service.ts` | Computes period grades from assessment grades + category weights          |
| `class-grade-configs.service.ts`      | CRUD for ClassSubjectGradeConfig (weight configuration per class+subject) |
| `grading-scales.service.ts`           | CRUD for grading scales                                                   |
| `bulk-import.service.ts`              | CSV import for grades (existing pattern)                                  |
| `report-cards.service.ts`             | Report card generation                                                    |

### Frontend Pages (apps/web/src/app/[locale]/(school)/gradebook/)

| Route                                                  | What it does                                                                        |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `page.tsx`                                             | Main listing — shows assessments grouped by class+subject. Has year/period filters. |
| `[classId]/page.tsx`                                   | Class gradebook detail — 3 tabs: Assessments, Period Grades, Grade Config           |
| `[classId]/assessments/new/page.tsx`                   | Create new assessment form                                                          |
| `[classId]/assessments/[assessmentId]/grades/page.tsx` | Grade entry for a specific assessment                                               |
| `import/page.tsx`                                      | Bulk import page for grades                                                         |

### Existing API Endpoints

- `GET/POST /v1/assessments` — list/create assessments
- `GET/PATCH/DELETE /v1/assessments/:id` — single assessment CRUD
- `GET/PUT /v1/assessments/:id/grades` — get/save grades for an assessment
- `POST /v1/assessments/:id/grades/batch` — batch save grades
- `GET/PUT /v1/gradebook/config/:classId/:subjectId` — grade config per class+subject
- `GET /v1/gradebook/period-grades` — computed period grades
- `POST /v1/gradebook/period-grades/compute` — trigger computation
- `PATCH /v1/gradebook/period-grades/:id/override` — override a period grade

---

## Bugs to Fix First (Quick Wins)

### Bug 1: Closed assessments not clickable

**Location**: `gradebook/[classId]/page.tsx` — Assessments tab
**Issue**: Closed assessment rows don't have click handlers or links. Only open ones do.
**Fix**: Make all assessment rows clickable regardless of status (navigate to grades page or a read-only view).

### Bug 2: Clicking "Status" field breaks the page

**Location**: `gradebook/[classId]/page.tsx` — Assessments tab
**Issue**: Clicking the status badge/field navigates to a broken route or triggers an unhandled action.
**Fix**: Investigate the onClick handler on the status element. Likely navigating to an invalid URL. Remove the click handler or fix the route.

### Bug 3: Period Grades tab — "Validation failed" error

**Location**: `gradebook/[classId]/page.tsx` — Period Grades tab
**Issue**: API call to fetch period grades fails validation. Likely sending wrong query params.
**Fix**: Check what the frontend sends vs what the backend expects. Fix param names/types.

### Bug 4: Grade Config tab — API 404

**Location**: `gradebook/[classId]/page.tsx` — Grade Config tab
**Issue**: Calls `GET /api/gradebook/config/{classId}/...` which doesn't match the actual endpoint `GET /api/v1/gradebook/config/:classId/:subjectId`.
**Fix**: The API requires both classId AND subjectId. The tab is being removed per the redesign anyway, but fix the route if keeping any config UI.

---

## Redesign Implementation Plan

### Phase A: Bug Fixes + Filter Improvements (do first)

1. Fix all 4 bugs above
2. Add **Class filter** to gradebook main page (dropdown of homeroom classes from `/api/v1/classes?homeroom_only=true`)
3. Add **Subject filter** to gradebook main page (dropdown from `/api/v1/subjects`)
4. Remove subject-level grouping from the listing — show one row per class, not per class+subject

### Phase B: Tab Restructure + Assessment Improvements

1. Rename tabs: Assessments (keep), Results (new), Grades (renamed from Period Grades)
2. Remove Grade Config tab from the class gradebook detail page
3. Add **"Counts toward report card"** boolean to Assessment model (new column `counts_toward_report_card BOOLEAN DEFAULT true`)
4. Add the checkbox to the assessment creation form
5. Add **subject filter** inside the Assessments tab (within the class gradebook)
6. Make closed assessments clickable (shows read-only grade view)

### Phase C: Results Tab — Grade Entry Matrix (the big one)

The Results tab inside a class gradebook (e.g., `/gradebook/{classId}` → Results tab) shows:

**Table structure:**

```
Student Name | English                        | Maths                          | Science ...
             | CW | Quiz1 | Mid | HW | Final | CW | Quiz1 | Mid | HW | Final | ...
─────────────┼────┼───────┼─────┼────┼───────┼────┼───────┼─────┼────┼───────┼────
Ramadan      | __ | __    | __  | __ | __    | __ | __    | __  | __ | __    | ...
Fatima       | __ | __    | __  | __ | __    | __ | __    | __  | __ | __    | ...
```

**Data sources:**

- Rows: Students enrolled in the class (from `class_enrolments` where `status='active'`)
- Column groups: Subjects taught in the class (from assessments created for this class in the selected period)
- Sub-columns: Assessment types within each subject (from `Assessment` records for this class + period + subject)
- Cell values: `Grade.raw_score` for the intersection of student + assessment

**API needed:**

- `GET /v1/gradebook/{classId}/results-matrix?academic_period_id={periodId}` — returns the full matrix data (students × subjects × assessments with grades)
- `PUT /v1/gradebook/{classId}/results-matrix` — batch save all entered grades

**UI notes:**

- This table will be wide — needs horizontal scroll
- Editable input cells for each grade
- Subject headers span their assessment sub-columns
- Auto-save or explicit save button
- Filter by subject to reduce column count if needed

**IMPORTANT**: The user requested a detailed programmatic sketch/mockup of this table before building it. Present this to the user for confirmation before implementing.

### Phase D: Grading Weight Configuration (Settings)

**Location**: New page in Settings (or under Academics sidebar)

**Structure**: Per year group, per term, define what percentage each assessment category contributes:

```
Year Group: [dropdown]
Term: [dropdown]

| Category    | Weight (%) |
|-------------|-----------|
| Midterm     | 20        |
| Final Exam  | 70        |
| Classwork   | 5         |
| Homework    | 5         |
| Total       | 100%      |
```

**Key features:**

- Percentages must total 100% per term (validate on save)
- "Copy from..." button to duplicate one year group's config to another
- Per year group, per term (not global)

**Database**: The `ClassSubjectGradeConfig` table already exists with `category_weight_json`. However, the user's spec describes weights at the **year group + term** level, not class + subject level. This may need a new table or repurposing of the existing one. Consider: `YearGroupGradeWeights { tenant_id, year_group_id, academic_period_id, category_weights_json }`.

### Phase E: Grades Tab (Computed Grades)

**Location**: Renamed "Period Grades" → "Grades" tab in class gradebook

**Columns**: Student | Computed | Override | Final | Action

- **Computed**: Auto-calculated from Results (Phase C) + Weights (Phase D)
- **Override**: Manual override input
- **Final**: Shows override if set, otherwise computed
- Uses existing `PeriodGradeSnapshot` model + `period-grade-computation.service.ts`

### Phase F: Mass CSV/XLSX Upload for Grades

Follow the same pattern just built for attendance upload:

- `GET /v1/gradebook/upload-template?academic_period_id={id}&class_id={id}` — downloadable CSV template
- `POST /v1/gradebook/upload` — accepts CSV/XLSX, parses in memory, validates, creates Grade records
- Frontend page at `/gradebook/upload` with date/period picker, download template, upload, validation display

---

## Key Architectural Decisions

1. **Assessment.class_id already uses homeroom classes** — the subject is on the Assessment itself (`subject_id`), not derived from the class. This means the structure change (§2) is mostly a frontend grouping change, not a schema change.

2. **Grade entry already exists** at `gradebook/[classId]/assessments/[assessmentId]/grades/page.tsx` — but it's one assessment at a time. The Results tab (Phase C) is a cross-assessment matrix view.

3. **The `counts_toward_report_card` flag** needs a new column on the Assessment model + migration.

4. **Grading weights**: The existing `ClassSubjectGradeConfig` stores weights per class+subject. The user wants weights per year_group+term. Either add a new model or reuse the existing one with year_group as the grouping key.

5. **CSV/XLSX upload**: Use the same in-memory approach built for attendance (no S3, no workers). The `xlsx` package is already installed in `apps/api`.

---

## Files to Reference

| Purpose                               | Path                                                            |
| ------------------------------------- | --------------------------------------------------------------- |
| Prisma schema (gradebook models)      | `packages/prisma/schema.prisma` lines 1916-2053                 |
| Gradebook backend services            | `apps/api/src/modules/gradebook/` (14 files)                    |
| Gradebook frontend pages              | `apps/web/src/app/[locale]/(school)/gradebook/`                 |
| Gradebook controller                  | `apps/api/src/modules/gradebook/gradebook.controller.ts`        |
| Assessment schemas (Zod)              | `packages/shared/src/schemas/gradebook.schema.ts`               |
| Attendance upload (pattern to follow) | `apps/api/src/modules/attendance/attendance-upload.service.ts`  |
| Class assignment page (pattern)       | `apps/web/src/app/[locale]/(school)/class-assignments/page.tsx` |
| Tenant settings schema                | `packages/shared/src/schemas/tenant.schema.ts`                  |
| Translation files                     | `apps/web/messages/en.json`, `apps/web/messages/ar.json`        |
| User's full spec                      | `/Users/ram/Downloads/gradebook-spec-notes.md`                  |

## Implementation Order

```
Phase A (bugs + filters)  →  Phase B (tab restructure)  →  Phase C (results matrix)
                                                              ↓
                                                         Phase D (weight config)
                                                              ↓
                                                         Phase E (computed grades)
                                                              ↓
                                                         Phase F (CSV upload)
                                                              ↓
                                                         Phase G (report cards)
```

Phases A and B can be done in one session. Phases C-E are tightly coupled and should be planned together. Phase F follows the established attendance upload pattern and is independent once C exists.

---

## Phase G: Report Cards (depends on Phase E)

**Full spec**: `/Users/ram/Downloads/report-cards-spec-notes.md`

Report cards depend entirely on the gradebook Grades tab (Phase E) being complete — every report card pulls final grades from `PeriodGradeSnapshot`.

### What to Build

**Tab 1: Overview** — Replace current report cards landing page with a data table: Student | Period | Final Grade | Status. Pulls from `PeriodGradeSnapshot` (final = override ?? computed). Export as PDF/Excel. Add class + period filters.

**Tab 2: Report Cards** — Filters (class, term including "End of Year", template selector) + Generate button. Generates a single PDF with one page per student, populated with their grades.

### Template System — Recommended Approach: Hybrid

Ship 3-4 pre-built HTML/CSS templates rendered via Puppeteer (already used for invoices/payslips in the project). Templates use mustache-style placeholders (`{{student_name}}`, `{{grades_table}}`, `{{school_logo}}`). School owner customises via a settings form: logo, school name, colours, header text. Template selection is a dropdown on the Generate tab.

**Why Hybrid**: A drag-and-drop builder is a multi-week project on its own. Code-defined templates with customisable branding cover 90% of real-world needs. Schools that need truly custom layouts can request them as a service — the HTML/CSS template is trivial for a developer to create.

**Template data contract** (what each template receives):

```typescript
{
  school: { name, logo_url, primary_colour },
  student: { full_name, student_number, class_name, year_group },
  academic_year: { name },
  period: { name },
  subjects: Array<{ name, final_grade, max_possible, letter_grade? }>,
  attendance_summary?: { present_days, absent_days, total_days },
  teacher_comment?: string,
  principal_comment?: string,
}
```

### Existing Infrastructure to Reuse

- `ReportCard` model already in schema (status: draft/published/archived, teacher_comment, principal_comment)
- `report-cards.service.ts` already exists in gradebook module
- `report-cards.controller.ts` already exists
- Puppeteer is already in the stack for invoice/payslip PDF generation
- Export functionality (PDF/XLSX) already built for students/staff pages

### Key Files

- `packages/prisma/schema.prisma` lines 2055+ — ReportCard model
- `apps/api/src/modules/gradebook/report-cards.service.ts` — existing service
- `apps/web/src/app/[locale]/(school)/report-cards/` — existing frontend
- `/Users/ram/Downloads/report-cards-spec-notes.md` — full user spec
