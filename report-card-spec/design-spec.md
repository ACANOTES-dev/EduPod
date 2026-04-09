# Report Cards Redesign — Design Spec

**Status:** Draft for review
**Date:** 2026-04-09
**Owner:** Product (Ram) + Engineering (Claude)
**Scope:** Replatform the report cards module to align with the gradebook experience, introduce admin-controlled comment workflows, and lay the foundation for future homework/attendance integration.

---

## 1. Goals

1. Replace the flat "one row per student per subject per period" overview with a **class-first, matrix-shaped** view that mirrors the gradebook experience.
2. Move report card **generation** behind an admin-only wizard with granular scope control (year group / class / individual student).
3. Introduce an **admin-controlled comment window** to gate teacher comment input and AI usage, reducing uncontrolled API costs.
4. Provide teachers with a **purpose-built comment editor** that surfaces grades, AI-drafted narratives, and per-student comment fields in one place.
5. Provide teachers with a **request flow** to ask the principal to reopen a window or regenerate a report without direct self-service.
6. Support **English + Arabic** report card output — one language per physical PDF, never mixed — driven by a per-student `preferred_second_language` flag.
7. Preserve all existing report card features that work today (approvals, custom fields, delivery, acknowledgments) and refactor rather than replace.

## 2. Non-goals (v1)

1. **PDF visual design.** The actual layout of the printed PDF is on hold pending user-supplied design. This spec defines the _contract_ between data and template, not the visual rendering.
2. **Homework diary integration.** Templates that include homework data will ship after the homework module lands.
3. **Attendance integration.** Same — attendance-aware templates ship after the attendance module lands.
4. **Behavioural analysis integration.** Same — lands after the behaviour module lands.
5. **Languages other than English and Arabic.** The architecture must support adding French/German/Spanish/etc., but v1 ships only English and Arabic.
6. **Student photos as a required feature.** The photo field and toggle are defined, but photo upload/storage is a separate workstream. Photos simply don't render if absent.
7. **Bulk approval workflows (existing infra).** We keep the existing `ReportCardApprovalConfig` / `ReportCardApproval` tables but do not extend them in this phase.

## 3. Personas and permissions

| Persona                        | Role label                                            | What they can do                                                                                                                                       |
| ------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Principal / Vice-principal** | `report_cards.manage`                                 | Open/close comment windows, run the generation wizard, configure tenant settings, override missing comments, approve teacher requests, view everything |
| **Front-office admin**         | `report_cards.view`                                   | View the library and settings; **cannot** open windows or generate                                                                                     |
| **Homeroom teacher**           | `report_cards.comment` + homeroom flag on their class | Edit overall comments for their homeroom during an open window; edit subject comments for any subject they teach; submit requests                      |
| **Subject teacher**            | `report_cards.comment`                                | Edit subject comments for any subject they teach, during an open window; submit requests                                                               |
| **Parent**                     | n/a (parent portal)                                   | View published report cards for their children (existing delivery infra)                                                                               |
| **Student**                    | n/a                                                   | Out of scope for this phase                                                                                                                            |

Throughout this spec, "admin" means any user with `report_cards.manage` — typically the principal, but the permission is the authority, not the job title.

## 4. Architecture overview

The redesign does **not** introduce a new module. It refactors the existing `gradebook/report-cards` module in the API and rebuilds the frontend pages under `apps/web/src/app/[locale]/(school)/report-cards`. It also adds one new frontend page (Report Comments) under a sibling route.

### 4.1 Existing infrastructure to preserve and reuse

From `apps/api/src/modules/gradebook/report-cards/`:

| Existing asset                                            | Role in the new design                                                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `ReportCard` model                                        | Still the authoritative table for generated report cards. Schema extended; usage model clarified.                                       |
| `ReportCardTemplate` model                                | Used for the "content scope" templates (grades-only, grades+homework, etc.). `locale` column already supports multi-language templates. |
| `ReportCardBatchJob` model                                | Backs the generation wizard runs. Treated as the audit log of who ran what when.                                                        |
| `ReportCardApproval` / `ReportCardApprovalConfig`         | Preserved, untouched. Not used by the new comment-window model but still available for tenants that opt in.                             |
| `ReportCardDelivery`                                      | Preserved. Still the parent-delivery channel.                                                                                           |
| `ReportCardAcknowledgment`                                | Preserved. Parent acknowledgment flow.                                                                                                  |
| `ReportCardVerificationToken`                             | Preserved. Verifiable links.                                                                                                            |
| `ReportCardCustomFieldDef` / `ReportCardCustomFieldValue` | Preserved. Used for the configurable personal-info fields on the report.                                                                |
| `grade-threshold.service.ts`                              | Still the source of truth for A/B/C thresholds.                                                                                         |
| `report-card-generation.service.ts`                       | Refactored to accept the new scope model (year/class/individual), the new language model, and the new comment sources.                  |
| `report-card-template.service.ts`                         | Refactored to enumerate content-scope templates and their language variants.                                                            |
| `report-cards-queries.service.ts`                         | Refactored: the flat overview query is replaced with a matrix-shaped query that reuses existing gradebook aggregation.                  |
| `report-card-delivery.service.ts`                         | Light refactor to handle per-language document delivery.                                                                                |
| `report-card-analytics.service.ts`                        | Unchanged.                                                                                                                              |

### 4.2 New components

**Backend services (new files, same module):**

- `report-comment-windows.service.ts` — open/close/extend/reopen comment windows
- `report-card-subject-comments.service.ts` — CRUD for per-subject teacher comments
- `report-card-overall-comments.service.ts` — CRUD for per-student overall comments
- `report-card-ai-draft.service.ts` — single-student AI draft generation (refactor of the existing `ai-generate-comments` bulk endpoint)
- `report-card-teacher-requests.service.ts` — teacher request submission + principal review
- `report-card-settings.service.ts` — tenant-level settings (defaults, principal signature, field config)

**Frontend pages (new or rebuilt):**

- `/[locale]/report-cards/page.tsx` — rebuilt landing (class cards grouped by year)
- `/[locale]/report-cards/[classId]/page.tsx` — new matrix view (mirrors gradebook class page)
- `/[locale]/report-cards/library/page.tsx` — list of generated documents (role-scoped)
- `/[locale]/report-cards/generate/page.tsx` — admin wizard
- `/[locale]/report-cards/settings/page.tsx` — tenant settings
- `/[locale]/report-cards/requests/page.tsx` — teacher request queue (principal view) + request submission (teacher view)
- `/[locale]/report-comments/page.tsx` — teacher comment editor landing (new top-level page)
- `/[locale]/report-comments/[assignmentId]/page.tsx` — per-(subject × class) comment editor

**New DB tables:**

1. `report_comment_windows`
2. `report_card_subject_comments`
3. `report_card_overall_comments`
4. `report_card_teacher_requests`
5. `report_card_tenant_settings`

**New columns on existing tables:**

- `students.preferred_second_language` — nullable varchar(10)

---

## 5. Data model

### 5.1 New table: `report_comment_windows`

Controls when teachers can edit comments and consume AI drafts.

| Column                     | Type                         | Notes                                                                  |
| -------------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| `id`                       | UUID PK                      |                                                                        |
| `tenant_id`                | UUID NOT NULL                | FK to `tenants`, RLS                                                   |
| `academic_period_id`       | UUID NOT NULL                | FK to `academic_periods`. The period these comments will apply to.     |
| `opens_at`                 | TIMESTAMPTZ NOT NULL         | Start of editing window.                                               |
| `closes_at`                | TIMESTAMPTZ NOT NULL         | End of editing window. Enforced server-side.                           |
| `status`                   | ENUM `comment_window_status` | `scheduled` / `open` / `closed`                                        |
| `opened_by_user_id`        | UUID NOT NULL                | FK to `users`                                                          |
| `closed_at`                | TIMESTAMPTZ                  | Actual close time (may differ from `closes_at` if closed early)        |
| `closed_by_user_id`        | UUID                         | FK to `users`, set when manually closed                                |
| `instructions`             | TEXT                         | Optional note from principal to teachers ("please finalise by Friday") |
| `created_at`, `updated_at` | TIMESTAMPTZ                  | Standard                                                               |

**Constraints:**

- `UNIQUE(tenant_id) WHERE status = 'open'` — at most one open window per tenant at any time.
- `CHECK (closes_at > opens_at)`
- RLS policy: standard `tenant_id = current_setting('app.current_tenant_id')::uuid`.

**Indexes:**

- `idx_report_comment_windows_tenant_status (tenant_id, status)`
- `idx_report_comment_windows_period (tenant_id, academic_period_id)`

### 5.2 New table: `report_card_subject_comments`

Teacher-authored, AI-seeded narrative per (student × subject × period). Edited during an open window.

| Column                     | Type                           | Notes                                                                                                      |
| -------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `id`                       | UUID PK                        |                                                                                                            |
| `tenant_id`                | UUID NOT NULL                  | RLS                                                                                                        |
| `student_id`               | UUID NOT NULL                  | FK to `students`                                                                                           |
| `subject_id`               | UUID NOT NULL                  | FK to `subjects`                                                                                           |
| `class_id`                 | UUID NOT NULL                  | FK to `classes` — the class the student was in when this comment was written (stable across re-enrolments) |
| `academic_period_id`       | UUID NOT NULL                  | FK to `academic_periods`                                                                                   |
| `author_user_id`           | UUID NOT NULL                  | FK to `users` — the teacher who wrote/owns it                                                              |
| `comment_text`             | TEXT NOT NULL                  | May be empty string initially                                                                              |
| `is_ai_draft`              | BOOLEAN NOT NULL DEFAULT false | True iff the text is the unedited AI draft                                                                 |
| `finalised_at`             | TIMESTAMPTZ                    | Set when the teacher marks the comment finalised                                                           |
| `finalised_by_user_id`     | UUID                           | Who finalised it                                                                                           |
| `last_ai_drafted_at`       | TIMESTAMPTZ                    | When the current text was AI-seeded (for audit/cost tracking)                                              |
| `created_at`, `updated_at` | TIMESTAMPTZ                    | Standard                                                                                                   |

**Constraints:**

- `UNIQUE(tenant_id, student_id, subject_id, academic_period_id)` — one comment per student per subject per period.
- RLS.

**Indexes:**

- `idx_subj_comments_teacher (tenant_id, author_user_id, academic_period_id)`
- `idx_subj_comments_class (tenant_id, class_id, subject_id, academic_period_id)`

### 5.3 New table: `report_card_overall_comments`

Homeroom teacher (or admin) overall narrative per (student × period).

| Column                     | Type          | Notes                                     |
| -------------------------- | ------------- | ----------------------------------------- |
| `id`                       | UUID PK       |                                           |
| `tenant_id`                | UUID NOT NULL | RLS                                       |
| `student_id`               | UUID NOT NULL | FK to `students`                          |
| `class_id`                 | UUID NOT NULL | FK to `classes` — homeroom class          |
| `academic_period_id`       | UUID NOT NULL | FK to `academic_periods`                  |
| `author_user_id`           | UUID NOT NULL | FK to `users` — homeroom teacher or admin |
| `comment_text`             | TEXT NOT NULL |                                           |
| `finalised_at`             | TIMESTAMPTZ   |                                           |
| `finalised_by_user_id`     | UUID          |                                           |
| `created_at`, `updated_at` | TIMESTAMPTZ   |                                           |

**Constraints:**

- `UNIQUE(tenant_id, student_id, academic_period_id)`
- RLS.

### 5.4 New table: `report_card_teacher_requests`

Teachers submit requests to the principal for (a) window reopening or (b) report regeneration for a specific scope.

| Column                     | Type                          | Notes                                                                                                           |
| -------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `id`                       | UUID PK                       |                                                                                                                 |
| `tenant_id`                | UUID NOT NULL                 | RLS                                                                                                             |
| `requested_by_user_id`     | UUID NOT NULL                 | FK to `users`                                                                                                   |
| `request_type`             | ENUM `teacher_request_type`   | `open_comment_window` / `regenerate_reports`                                                                    |
| `academic_period_id`       | UUID NOT NULL                 | The period the request targets                                                                                  |
| `target_scope_json`        | JSONB NOT NULL                | `{ scope: 'student' \| 'class' \| 'year_group', ids: [...] }` for regenerate requests; null for window requests |
| `reason`                   | TEXT NOT NULL                 | Teacher explains why                                                                                            |
| `status`                   | ENUM `teacher_request_status` | `pending` / `approved` / `rejected` / `completed` / `cancelled`                                                 |
| `reviewed_by_user_id`      | UUID                          | FK to `users` — the principal who reviewed                                                                      |
| `reviewed_at`              | TIMESTAMPTZ                   |                                                                                                                 |
| `review_note`              | TEXT                          | Optional response                                                                                               |
| `resulting_run_id`         | UUID                          | FK to `report_card_batch_jobs` — if the request triggered a regen run                                           |
| `resulting_window_id`      | UUID                          | FK to `report_comment_windows` — if the request triggered a window open                                         |
| `created_at`, `updated_at` | TIMESTAMPTZ                   |                                                                                                                 |

**Indexes:**

- `idx_teacher_requests_status (tenant_id, status)`
- `idx_teacher_requests_user (tenant_id, requested_by_user_id)`

### 5.5 New table: `report_card_tenant_settings`

One row per tenant. JSONB payload holds all defaults.

| Column                     | Type                 | Notes                    |
| -------------------------- | -------------------- | ------------------------ |
| `id`                       | UUID PK              |                          |
| `tenant_id`                | UUID NOT NULL UNIQUE | RLS, one per tenant      |
| `settings_json`            | JSONB NOT NULL       | See payload schema below |
| `created_at`, `updated_at` | TIMESTAMPTZ          |                          |

**`settings_json` schema (Zod, lives in `packages/shared`):**

```ts
{
  // Display mode for matrix views (not the PDF — the PDF always shows both)
  matrix_display_mode: 'score' | 'grade', // default

  // Show top-3 rank badges on the report card
  show_top_rank_badge: boolean,

  // Default personal-info fields to render on the PDF. Wizard overrides per run.
  default_personal_info_fields: Array<
    | 'full_name' | 'student_number' | 'date_of_birth' | 'sex'
    | 'nationality' | 'national_id' | 'admission_date' | 'photo'
    | 'homeroom_teacher' | 'year_group' | 'class_name'
  >,

  // Comment finalisation gate for generation
  require_finalised_comments: boolean, // default true
  allow_admin_force_generate: boolean, // default true

  // Principal digital signature
  principal_signature_storage_key: string | null, // S3 key
  principal_name: string | null,                  // Printed below signature

  // Grade thresholds — pointer to existing grade_threshold table, no duplication
  grade_threshold_set_id: string | null,

  // Default template for quick-gen
  default_template_id: string | null,
}
```

**Indexes:**

- `UNIQUE(tenant_id)`

### 5.6 New column: `students.preferred_second_language`

| Column                      | Type             | Notes                                                                                                              |
| --------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `preferred_second_language` | VARCHAR(10) NULL | Enum-constrained in Zod to `ar` / `fr` / `de` / `es` / etc. V1 validates only `ar`. Editable from student profile. |

### 5.7 Existing `ReportCard` — changes

The existing `ReportCard` table is the canonical "generated document" table. It already has `template_locale`, `status`, `snapshot_payload_json`, and `revision_of_report_card_id`. For the new design:

1. **Unique constraint added:** `UNIQUE(tenant_id, student_id, academic_period_id, template_id, template_locale) WHERE status != 'superseded'`
   - Enforces one current version per (student, period, template, language).
   - When a regen happens, the old row is marked `superseded` (or deleted) in the same transaction as the upsert.
   - `revision_of_report_card_id` chain is preserved for audit, but the default queries only return non-superseded rows.
2. **Column rename:** `teacher_comment` → `overall_comment_text` (populated from `report_card_overall_comments` at generation time).
3. **New column:** `subject_comments_json JSONB` — frozen snapshot of all subject comments at generation time, keyed by `subject_id`.
4. **New column:** `personal_info_fields_json JSONB` — which personal-info fields were selected for this run, frozen at generation time.
5. **New column:** `pdf_storage_key VARCHAR(512)` — S3/storage path for the rendered PDF.
6. **New column:** `template_id UUID` — FK to `ReportCardTemplate`, required. Currently nullable. Null rows from legacy data get backfilled to the default template.

**Status enum (`ReportCardStatus`) update:**

- Add `superseded` state for rows that have been overwritten by a regen.
- Existing states (`draft`, `published`, etc.) preserved.

### 5.8 Existing `ReportCardTemplate` — usage clarified

No schema changes. The `locale` column is used to distinguish language variants of the same template. One "content scope" template family is represented as N rows (one per language).

Example rows for v1:

```
id: t1, name: "Grades Only", locale: "en", content_scope: "grades_only"
id: t2, name: "Grades Only", locale: "ar", content_scope: "grades_only"
```

**New column needed:** `content_scope VARCHAR(64) NOT NULL` — enum-constrained to `grades_only` for v1; future values include `grades_homework`, `grades_attendance`, `grades_homework_attendance`, `full_master`. This tells the generator which data sources to pull from.

### 5.9 Existing `ReportCardBatchJob` — usage

Used as the run log. Each wizard submission creates one `ReportCardBatchJob` row. Extended with:

- `scope_type` enum (`year_group` / `class` / `individual`)
- `scope_ids_json` JSONB — list of IDs in the selected scope
- `personal_info_fields_json` JSONB — field configuration chosen for this run
- `languages_requested` TEXT[] — typically `['en']` or `['en','ar']`
- `students_generated_count`, `students_blocked_count`, `errors_json`

---

## 6. Feature area: Report Cards overview (landing + class view)

### 6.1 Landing page — class cards grouped by year

**Route:** `/[locale]/report-cards`

**Behaviour:** exact mirror of the gradebook landing page (`/[locale]/gradebook`). Same visual pattern, same year-group grouping, same card layout.

**Differences from gradebook:**

- Card subtitle shows "X generated report cards" instead of "X assessments"
- Cards only appear for classes that are **eligible** — i.e., classes with at least one enrolled student who has grades in at least one period. Empty classes are hidden.
- Click behaviour navigates to `/[locale]/report-cards/[classId]` (the matrix view), not the gradebook.

### 6.2 Class matrix view

**Route:** `/[locale]/report-cards/[classId]`

**Behaviour:** structurally mirrors the gradebook class matrix (`ResultsMatrix` component at `apps/web/src/app/[locale]/(school)/gradebook/[classId]/results-matrix.tsx`). One row per student, columns per subject, cells show period-aggregated grade/score.

**Differences from gradebook matrix:**

- The **only** filter is the **period selector** — Period 1 / Period 2 / … / All periods (end of year). Whatever the admin wants printed on the report card is what they select here.
- **No subject filter.** The report card needs the full picture.
- **No assessment drill-down.** Cells are non-interactive; clicking a cell opens a read-only popover with the underlying assessments (same data, different affordance).
- A **grade / score toggle** in the top right, respecting the tenant's `matrix_display_mode` default but user-overridable for the session.
- The **final grade column** is computed correctly — the current bug where `final_grade` sometimes shows the percentage rather than the letter is fixed by replacing the flat overview query with the matrix query.
- **Export** button becomes a PDF preview link (opens the current-period report for any student in the matrix), not a spreadsheet export.

**Data source:** new query endpoint `GET /v1/report-cards/classes/:classId/matrix?academic_period_id=all|<id>`. Shape:

```ts
{
  class: { id, name, year_group: { id, name } },
  period: { id, name } | { id: 'all', name: 'Full year' },
  students: Array<{
    id, first_name, last_name, student_number,
    preferred_second_language: string | null,
  }>,
  subjects: Array<{ id, name, code }>,
  cells: Record<student_id, Record<subject_id, {
    score: number | null,     // 0-100
    grade: string | null,      // letter
    assessment_count: number,
    has_override: boolean,
  }>>,
  overall_by_student: Record<student_id, {
    weighted_average: number | null,
    overall_grade: string | null,
    rank_position: number | null,  // null unless top 3
  }>,
}
```

All aggregation reuses the existing gradebook engine. Nothing new to compute.

---

## 7. Feature area: Generation wizard (admin/principal)

**Route:** `/[locale]/report-cards/generate` (admin-only, `report_cards.manage` required)

### 7.1 Wizard steps

1. **Scope selection**
   - Pick a mode: **Year group** / **Class** / **Individual students**
   - Multi-select within the chosen mode
   - Live count of matched students shown on every change
2. **Period selection**
   - Select a single academic period, or "Full year" (all periods)
3. **Template selection**
   - Pick a content-scope template (for v1, only "Grades only" is selectable; homework/attendance variants are visible but disabled with "Coming soon" tooltips)
4. **Personal-info fields**
   - Pre-filled from tenant defaults
   - Admin can add/remove fields for this run
   - Live preview of which fields will render
5. **Language**
   - Automatic: English is always generated. Any student with a `preferred_second_language` value that the template supports gets an additional copy. The wizard displays a breakdown: "32 English reports + 8 Arabic reports will be generated."
6. **Comment validation**
   - System runs a dry-check against `report_card_subject_comments` and `report_card_overall_comments` for the selected scope + period.
   - Reports: missing subject comments count, unfinalised subject comments count, missing overall comments count.
   - If the tenant setting `require_finalised_comments` is true AND anything is missing: generation is blocked with a summary list ("Missing subject comment: Maya Santos — Mathematics; …").
   - Admin can check **"Force-generate anyway"** (only visible if `allow_admin_force_generate` is true). Missing comments render as a dash or blank in the PDF.
7. **Review and submit**
   - Summary of everything above
   - Submit → creates a `ReportCardBatchJob` row and enqueues the generation job

### 7.2 Generation job flow

Runs in `apps/worker/src/processors/report-card-generation.processor.ts` (existing file, refactored). For each student in scope:

1. Read grades from the existing gradebook aggregation for the selected period
2. Read finalised subject comments from `report_card_subject_comments`
3. Read finalised overall comment from `report_card_overall_comments`
4. Read the student's `preferred_second_language`
5. Compose the rendering payload (`snapshot_payload_json`)
6. Render English PDF → upload to storage → upsert `ReportCard` row with `template_locale = 'en'`
7. If `preferred_second_language` is set and the template has a matching locale row → render second-language PDF → upload → upsert second `ReportCard` row with that locale
8. Mark any existing `ReportCard` rows for this (student, period, template, locale) that aren't the new ID as `superseded` (or hard-delete them, depending on the audit preference — **default: delete old PDF from storage, keep no previous version, matches "overwrite" semantics**)
9. Update batch job counters

On any per-student error, the student is added to `errors_json` on the batch job but the job continues for the rest.

### 7.3 Regeneration semantics

- Runs **overwrite**. The previous PDF is deleted from storage. The previous `ReportCard` row is replaced by the new one via upsert on the unique key `(tenant_id, student_id, academic_period_id, template_id, template_locale)`.
- No version history is kept at the document level. The `ReportCardBatchJob` log tracks who ran what when, but the documents themselves are always the latest.
- This is a deliberate simplification — see Section 2 (Goals / non-goals).

---

## 8. Feature area: Report comments (teacher editor)

### 8.1 Landing page

**Route:** `/[locale]/report-comments`

**Access:** any user with `report_cards.comment` (all teachers) plus admin.

**Behaviour:**

1. **Top-of-page status banner:**
   - If there is an open comment window for the tenant: "Comment window open for **Term 1** — closes **10 April 2026**. You must finalise all comments before this date." Green/positive styling.
   - If no open window: "Comment window is closed. You can view past comments but cannot edit. Contact the principal to request reopening." Muted/informational styling, with a **"Request window reopen"** button.
2. **Content below the banner:** a card grid grouped by year group, using the same visual grammar as the gradebook and report-cards landing pages. Each card represents one **teaching assignment** — i.e., one (subject × class) pair the current user owns for the period of the open window (or the most recent closed window if none is open).

   Example card:

   ```
   ┌──────────────────────────┐
   │ English                  │
   │ Second class — 2A        │
   │ Period: Term 1           │
   │                          │
   │ ▓▓▓▓▓▓░░░░  18 / 24      │
   │ comments finalised       │
   └──────────────────────────┘
   ```

   Color/progress reflects finalisation state. Grey border when the window is closed (read-only).

3. **Homeroom section (homeroom teachers only):** separately, above their subject cards, a prominent card labelled "Overall comments — 2A (homeroom)" tracks progress on the overall narratives.

### 8.2 Drill-in view — per (subject × class × period)

**Route:** `/[locale]/report-comments/subject/[classId]/[subjectId]` (period is taken from the active window)

For a subject teacher. For the homeroom overall-comment flow, see Section 8.3.

**Layout: three columns**

| #   | Column      | Content                                                                                                                                                                                                   |
| --- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Student** | Student name, number, photo thumb if available                                                                                                                                                            |
| 2   | **Grade**   | Score + letter grade + tiny trajectory sparkline across assessments in the window's period. Clicking opens a popover with the assessment breakdown (read-only). Display mode respects the tenant setting. |
| 3   | **Comment** | Inline-edit textarea. Seeded with the AI draft on first load if empty. Shows an "AI draft" badge until the teacher edits or finalises. Per-row **Finalise** button.                                       |

**Top toolbar:**

- Period indicator (read-only, shows which period the window is targeting)
- **"AI-draft all empty"** — bulk-calls the AI for every row where the comment is blank. Disabled when window is closed.
- **"Finalise all drafts"** — bulk-finalise all non-empty comments. Disabled when window is closed.
- Filter: show all / show only unfinalised / show only finalised

**Window-closed state:** all textareas become read-only. AI buttons disabled. A message banner reads "This window is closed. To edit, request the principal to reopen it." with a shortcut link to submit a request.

### 8.3 Overall comment flow (homeroom teacher)

**Route:** `/[locale]/report-comments/overall/[classId]`

Very similar to the subject editor, but:

- No subject column — only student + grade (overall weighted) + overall comment
- No AI draft button — the overall comment is a human task (this is a deliberate design choice to preserve the human touch for the holistic narrative)
- Otherwise identical UX

### 8.4 Admin view of the same pages

When an admin (any user with `report_cards.manage`) visits the Report Comments pages, they see:

- All teaching assignments in the tenant (not just their own)
- Filters for class, subject, teacher, finalisation status
- Ability to edit or finalise on behalf of any teacher (with audit log trail via `finalised_by_user_id`)
- A persistent **"Open/close window"** control in the page header

---

## 9. Feature area: Comment window controls (admin)

The comment window controls live on both the Report Comments page header (for admin) and the `/report-cards/settings` page.

### 9.1 Opening a window

**Modal fields:**

- Academic period (required, single select)
- Opens at (datetime, defaults to "now")
- Closes at (datetime, required, must be > opens_at)
- Instructions (optional free text shown to teachers in the banner)

**On submit:**

- Inserts a row into `report_comment_windows` with `status = 'open'` (or `'scheduled'` if `opens_at > now()`)
- Unique partial index enforces only one open window per tenant — if another is already open, the UI requires closing it first

### 9.2 Closing, extending, reopening

- **Close now:** sets `status = 'closed'`, `closed_at = now()`, `closed_by_user_id = caller`
- **Extend:** updates `closes_at` (only allowed while status is open or scheduled)
- **Reopen:** only allowed on a recently closed window; transitions back to `open` and clears `closed_at`. Allowed at any time.

### 9.3 Enforcement

Enforcement is server-side on every write endpoint that touches comments:

- `report-card-subject-comments.service.ts` rejects writes if no open window exists for the comment's `academic_period_id`
- `report-card-overall-comments.service.ts` — same
- `report-card-ai-draft.service.ts` rejects AI calls if no open window exists for the requested period
- Error code: `COMMENT_WINDOW_CLOSED`
- Error message: human-readable with the next scheduled window if one exists

---

## 10. Feature area: Teacher requests

### 10.1 Request types

1. **`open_comment_window`** — teacher asks the principal to reopen or open a window for a specific period, typically because they discovered an error and need to amend a comment after the window closed.
2. **`regenerate_reports`** — teacher asks the principal to regenerate report cards for a specific scope (student/class/year group) because something changed (grade correction, comment edit after regen, data fix).

### 10.2 Teacher submission flow

**Route:** `/[locale]/report-cards/requests/new` or inline buttons on relevant pages.

Form:

- Request type (the two options above)
- Period (required)
- Scope (for regenerate only): student search / class picker / year group picker — same selector component as the wizard's scope step
- Reason (required, free text, ≥ 10 chars)

**On submit:** inserts a `report_card_teacher_requests` row with `status = 'pending'`. The principal receives a notification (existing notification infra).

### 10.3 Principal review flow

**Route:** `/[locale]/report-cards/requests`

Shows a queue of pending requests. Each row has:

- Requester name + role
- Request type
- Period
- Scope summary
- Reason
- **Approve** / **Reject** buttons

**On approve:**

- For `open_comment_window`: redirects the principal to the comment window modal, pre-filled with the requested period
- For `regenerate_reports`: redirects the principal to the generation wizard, pre-filled with the requested scope + period
- The originating request is linked to the resulting window/run via `resulting_window_id` / `resulting_run_id`
- Status transitions: `pending` → `approved` → (once the window/run completes) `completed`

**On reject:** status → `rejected`, optional review note shown to the teacher in their request list.

---

## 11. Feature area: Report cards library

**Route:** `/[locale]/report-cards/library`

Shows the current-state report cards for the viewing user's scope.

### 11.1 Teacher view

- List of students visible to the teacher (students in their teaching assignments for subject teachers; homeroom class for homeroom teachers)
- Each row: student name, class, most recent report card period, links to download PDFs (one per language)
- Read-only. No regenerate, no edit.

### 11.2 Admin view

- All students
- Filters: class, year group, period, template, language
- Per row: download links + a small **"Regenerate this student"** shortcut that opens the generation wizard pre-filled

---

## 12. Languages and localisation

### 12.1 Core rule

**One language per physical PDF. Never mixed.** No exceptions.

### 12.2 Generation model

For each (student, period, template) target:

1. Always render the template's English locale. This produces the authoritative PDF.
2. If the student has `preferred_second_language = 'ar'` (or any other supported code), **and** the template has a locale row for that language, render an additional PDF.
3. Both PDFs are stored separately as individual `ReportCard` rows, differing only in `template_locale`.
4. The English PDF is legally authoritative (Ireland context). The second-language PDF is an additional courtesy copy.

### 12.3 v1 language scope

- English (`en`) — required, always generated
- Arabic (`ar`) — supported for students with `preferred_second_language = 'ar'`

Other languages are deferred. Adding one later is a matter of:

1. Adding a new locale row to `ReportCardTemplate` for each content-scope template
2. Extending the Zod enum on `students.preferred_second_language`
3. No schema changes

### 12.4 Student-facing flag

`students.preferred_second_language` is edited from the student profile page (existing UI — add the field to the edit form). Default is null (English only). Admin can also bulk-set the flag via a CSV import (existing import infra — new column supported).

---

## 13. Personal-info field configuration

### 13.1 Available fields

| Key                | Source                                   | Notes                          |
| ------------------ | ---------------------------------------- | ------------------------------ |
| `full_name`        | `students.first_name` + `last_name`      | Always available               |
| `student_number`   | `students.student_number`                | Always available               |
| `date_of_birth`    | `students.date_of_birth`                 |                                |
| `sex`              | `students.sex`                           |                                |
| `nationality`      | `students.nationality`                   |                                |
| `national_id`      | `students.national_id` (encrypted)       | Only visible to admin contexts |
| `admission_date`   | `students.admission_date`                |                                |
| `photo`            | `students.photo_storage_key` (future)    | Renders placeholder if missing |
| `homeroom_teacher` | Derived from class → homeroom assignment |                                |
| `year_group`       | `classes.year_group`                     |                                |
| `class_name`       | `classes.name`                           | Typically always included      |

### 13.2 Configuration flow

- **Tenant default:** set in Settings → Report Card Settings. Persists in `report_card_tenant_settings.settings_json.default_personal_info_fields`.
- **Per-run override:** in the generation wizard step 4, the admin can add/remove fields for this run. The selection is frozen into `ReportCardBatchJob.personal_info_fields_json` and also copied onto each generated `ReportCard.personal_info_fields_json` for reproducibility.

### 13.3 Template rendering contract

The PDF template receives `personal_info: Record<FieldKey, string | null>` where only the requested keys are populated. The template must handle any combination gracefully — missing fields simply don't render.

---

## 14. Top-3 class rank badge

- **Off by default** at the tenant level, toggled via `report_card_tenant_settings.settings_json.show_top_rank_badge`.
- When enabled: the generation payload computes each student's rank within their class for the selected period. Only students ranked 1, 2, or 3 (including ties) receive a badge on the PDF header. Everyone else: no badge, nothing said.
- The rank is computed off the weighted overall average. Tie-breaks join places (two students tied at rank 1 → both receive "top 1", the next distinct average is rank 3, not 2).
- Matches the existing per-student analytics card pattern.

---

## 15. Principal digital signature

- Uploaded once by the principal in Settings → Report Card Settings → "Digital signature" block.
- Stored as an image file in tenant-scoped storage, key referenced by `report_card_tenant_settings.settings_json.principal_signature_storage_key`.
- At generation time, the signature image is loaded into the rendering payload and embedded on every PDF.
- If absent, the signature block on the PDF shows a plain underlined empty line (for physical wet-sign).
- Re-uploads overwrite the existing file. No versioning.

---

## 16. PDF template rendering — contract only (visual design TBD)

The PDF template is a React component rendered via `@react-pdf/renderer` (existing dependency) that takes a typed payload and returns PDF bytes.

### 16.1 Input contract

```ts
interface ReportCardRenderPayload {
  tenant: {
    name: string;
    logo_storage_key: string | null;
    principal_name: string | null;
    principal_signature_storage_key: string | null;
    address: string | null;
  };
  language: 'en' | 'ar';
  direction: 'ltr' | 'rtl';
  template: {
    id: string;
    content_scope: 'grades_only'; // v1
  };
  student: {
    id: string;
    personal_info: Record<PersonalInfoFieldKey, string | null>;
    rank_badge: 1 | 2 | 3 | null;
  };
  academic_period: {
    id: string;
    name: string;
    academic_year_name: string;
  };
  grades: {
    subjects: Array<{
      subject_id: string;
      subject_name: string;
      teacher_name: string;
      score: number | null; // 0-100
      grade: string | null; // A/B/C/...
      subject_comment: string; // from finalised subject comments
    }>;
    overall: {
      weighted_average: number | null;
      overall_grade: string | null;
      overall_comment: string; // from finalised overall comment
    };
    grading_scale: Array<{ label: string; min: number; max: number }>;
  };
  issued_at: string; // ISO date
}
```

### 16.2 Output contract

- A single PDF buffer
- Must be portrait A4
- Must render correctly RTL for `language = 'ar'`
- Must use logical CSS properties (start/end) so the same template produces both directions

### 16.3 Visual design status

**Held for user-supplied design.** The user is designing the visual layout independently and will share it later. The template file `apps/web/src/report-card-templates/grades-only/en.tsx` (and `ar.tsx`) will be implemented at that point. The implementation plan reserves this work for a distinct phase and all preceding work can proceed without it.

---

## 17. Permissions matrix

| Action                                        | `report_cards.view` | `report_cards.comment`  | `report_cards.manage` |
| --------------------------------------------- | ------------------- | ----------------------- | --------------------- |
| View report cards overview (landing + matrix) | ✅                  | ✅                      | ✅                    |
| View library (scoped to own classes)          | ❌                  | ✅                      | ✅                    |
| View library (all)                            | ✅                  | ❌                      | ✅                    |
| View Report Comments page                     | ❌                  | ✅                      | ✅                    |
| Edit own subject comments during open window  | ❌                  | ✅                      | ✅                    |
| Edit overall comments (homeroom only)         | ❌                  | ✅ (own class)          | ✅ (all)              |
| Call AI draft endpoint                        | ❌                  | ✅ (own, during window) | ✅                    |
| Submit teacher request                        | ❌                  | ✅                      | ✅                    |
| Review teacher request                        | ❌                  | ❌                      | ✅                    |
| Open/close/extend comment window              | ❌                  | ❌                      | ✅                    |
| Run generation wizard                         | ❌                  | ❌                      | ✅                    |
| Edit tenant settings                          | ❌                  | ❌                      | ✅                    |
| Upload principal signature                    | ❌                  | ❌                      | ✅                    |
| Force-generate bypassing comment gate         | ❌                  | ❌                      | ✅ (if tenant allows) |

Homeroom status is a separate boolean on the `class_teacher` assignment, not a permission. A teacher with `report_cards.comment` who is also marked as homeroom for class X can edit overall comments for X; otherwise they can only edit subject comments.

---

## 18. Audit and logging

- Every generation run is logged in `ReportCardBatchJob`
- Every comment edit updates `updated_at` on the comment row; finalisation captures `finalised_by_user_id`
- Every comment window open/close is logged in `report_comment_windows` with both the opener and closer
- Every teacher request is immutable once reviewed — the review decision is captured on the row
- Mutations flow through the existing `AuditLogInterceptor` — no manual audit writes

---

## 19. Error handling and edge cases

| Scenario                                                                              | Handling                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Generation when no comments exist at all                                              | If `require_finalised_comments`, block with a summary. If admin overrides, PDFs render with blank comment blocks.                                                                                      |
| Student changes class mid-period                                                      | The subject comment is tied to the class at write time. If regenerated after the move, the wizard uses the student's **current** class for grouping but the **historical** grade/comment data.         |
| Student has `preferred_second_language = 'fr'` but template only supports `en` + `ar` | Only English PDF is generated. A warning row appears on the run summary: "Maya Santos: requested language 'fr' unavailable for template 'Grades Only'."                                                |
| Comment window expires mid-edit                                                       | The teacher's save call fails with `COMMENT_WINDOW_CLOSED`. The UI keeps the unsaved text in a local draft and offers a "Save as local draft" option so work isn't lost.                               |
| Two admins open a window simultaneously                                               | The unique partial index on `report_comment_windows` causes the second insert to fail. The UI shows a friendly message.                                                                                |
| AI draft endpoint called during closed window                                         | Rejected server-side with `COMMENT_WINDOW_CLOSED`. The button is disabled in the UI but the server is the authority.                                                                                   |
| Teacher tries to edit another teacher's comment                                       | Rejected with `FORBIDDEN`. Even admins go through a separate override endpoint that logs the override.                                                                                                 |
| Regeneration run fails partway through                                                | Partial success: students already rendered have their new PDFs; failed students remain on the previous PDF (because the upsert was atomic per student). Run status = `partial_success`, errors listed. |
| Principal signature file is missing or corrupted at generation time                   | Signature slot renders blank with an underline. Generation does not fail. A warning is logged on the batch job.                                                                                        |

---

## 20. Migration / rollout strategy

1. **Schema migration** lands first, all new tables + columns, with RLS policies.
2. **Backend services** ship in a non-breaking way — existing endpoints continue to function until frontend rewires.
3. **Frontend pages** are rebuilt in place. The old `report-cards/page.tsx` is replaced, the matrix page is new, the Report Comments page is new.
4. **Old overview endpoint** (`GET /v1/report-cards/overview` returning the flat table) is deleted once the frontend no longer calls it. Grep-verified.
5. **Existing `ReportCard` rows** from prior tenants are backfilled: set `template_id` to the default template, leave comments as-is.
6. **Feature flag:** none required. The changes are non-destructive to existing data and the new flow is immediately usable.
7. **Documentation updates:** `docs/architecture/module-blast-radius.md`, `docs/architecture/event-job-catalog.md`, `docs/architecture/state-machines.md` (for the new comment window state machine and teacher request state machine).

---

## 21. Open items tracked for future phases

1. **Student photo upload / storage** — design lands here, implementation is a separate feature.
2. **Homework diary template variants** — wait for homework module.
3. **Attendance template variants** — wait for attendance module.
4. **Behavioural analysis template variants** — wait for behaviour module.
5. **Master template** combining all four — lands after all four are in place.
6. **Tenant-created templates** — v1 ships default templates only. Tenant-custom templates are a future feature.
7. **Non-English/Arabic languages** — architecture supports them; add as tenants request.
8. **Parent acknowledgment workflow** — existing `ReportCardAcknowledgment` infra is preserved but not rewired in this phase.
9. **Email/SMS delivery** — existing `ReportCardDelivery` is preserved; new library UI does not change delivery behaviour.

---

## 22. Acceptance criteria summary

The redesign is considered complete when:

1. The Report Cards landing page shows class cards grouped by year, matching the gradebook visual pattern.
2. Clicking a class card opens a matrix view with one row per student, columns per subject, and a period filter.
3. A grade/score toggle in the matrix view respects the tenant default and is user-overridable.
4. The final grade column shows the correct letter grade (no regressions of the current bug showing percentages).
5. Only users with `report_cards.manage` can access the generation wizard.
6. The generation wizard supports year-group, class, and individual-student scope.
7. The wizard enforces finalised-comment gates with an admin override.
8. Generation produces one PDF per (student, template, English) and one additional PDF per (student, template, second language) when the student has that flag.
9. Teacher comments are editable only during an open comment window.
10. AI draft calls are rejected outside an open window, server-side.
11. The Report Comments page shows a 3-column editor with student, grade, and comment.
12. Teachers can submit window-reopen and regeneration requests; principals can approve or reject.
13. Approval of a teacher request routes the principal into the corresponding action pre-filled.
14. Every tenant has exactly one `report_card_tenant_settings` row and can configure defaults.
15. The principal's digital signature is pre-filled on generated reports.
16. Top-3 class rank is configurable and never exposes rank beyond the top 3.
17. Runs overwrite prior documents — the library always shows the latest PDF per (student, period, template, language).
18. The old flat overview endpoint is removed from the frontend and backend.
19. All new tables have RLS policies and pass RLS leakage tests.
20. `turbo lint`, `turbo type-check`, and `turbo test` all pass.

---

## 23. Glossary

| Term                     | Meaning                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Admin**                | User with `report_cards.manage` permission (typically principal or vice-principal)                                                            |
| **Comment window**       | A tenant-wide time range during which teachers can edit/AI-draft comments for a specific period                                               |
| **Content scope**        | What data the report card covers: grades-only, grades+homework, grades+attendance, etc. One template per content scope per language.          |
| **Finalised comment**    | A comment the teacher has marked as ready for generation — locked unless re-edited                                                            |
| **Generation run**       | One submission of the generation wizard, tracked as a `ReportCardBatchJob`                                                                    |
| **Personal info fields** | The student-identity fields rendered on the top of the report card (name, DOB, photo, etc.) — configurable per tenant and per run             |
| **Run overwrite**        | The behaviour where regenerating for the same (student, period, template, language) replaces the prior PDF rather than stacking a new version |
| **Scope**                | In the generation wizard: year group / class / individual student — the selection mode for who gets a report card                             |
| **Second-language flag** | `students.preferred_second_language` — when set, triggers an additional PDF in that language alongside the English one                        |
| **Teacher request**      | A formal ask from a teacher to the principal, either to reopen a comment window or to regenerate reports for a specific scope                 |
| **Top-3 badge**          | A rank badge awarded only to students ranked 1, 2, or 3 in their class — no lower ranks are shown                                             |
