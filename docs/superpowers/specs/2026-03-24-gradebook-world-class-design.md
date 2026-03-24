# Gradebook World-Class Enhancement — Design Spec

## Overview

19 features across 4 sub-projects that transform the existing functional gradebook into a world-class, AI-powered academic management system. Every feature is tenant-configurable — the system adapts to the school, never the other way around.

**Golden Rule:** Everything is configurable by the tenant. The system provides the engine, the tenant configures the behavior.

**AI Gating:** All AI features require the `ai_functions` module to be enabled for the tenant. Platform-level `ANTHROPIC_API_KEY` is used (not per-tenant keys — per-tenant key routing is a future platform admin feature). Default model: Sonnet. Architecture supports per-feature model routing for future Opus use on high-stakes grading.

**UX Principle:** High technicality in the background, simple and friendly interface for the user. Complex computations, AI processing, and statistical analysis happen invisibly. Users see clean results, actionable insights, and intuitive controls.

---

## Sub-Project C: Advanced Grading Models (Foundation)

Build first — changes the data model that everything else depends on.

### C1. Rubric Engine

**Purpose:** Let teachers grade against structured criteria instead of a single score.

**Data Model:**
- `rubric_templates` — tenant_id, name, subject_id (nullable), created_by_user_id, created_at, updated_at, criteria (JSON array)
  - Each criterion: `{ id: string (nanoid), name: string, max_points: number, levels: [{ label: string, points: number, description: string }] }`
  - Criteria use stable `id` fields (not array indices) so reordering criteria doesn't break existing rubric_grades.
- `rubric_grades` — tenant_id, grade_id, criterion_id (string, matches criterion.id in template JSON), level_index (int), points_awarded (decimal), created_at, updated_at
  - Index: `idx_rubric_grades_tenant_grade` on (tenant_id, grade_id)
- `assessments.rubric_template_id` — nullable FK to rubric_templates

**Behavior:**
- Rubric is an optional input method. If attached to an assessment, grade entry UI shows criteria grid instead of single score box.
- Grade entry workflow with rubric: (1) create/upsert Grade record with `raw_score = null`, (2) insert rubric_grades per criterion, (3) compute sum and update `grades.raw_score`. All within one transaction.
- Criteria scores auto-sum into `grades.raw_score`. Existing computation pipeline unchanged.
- Teachers who don't use rubrics see no difference.

**UI:**
- Settings > "Rubric Templates" — CRUD, inline editor for criteria/levels
- Assessment creation: optional "Attach Rubric" dropdown
- Grade entry: criteria columns per student, clickable level badges. Score auto-calculated.

**Permissions:** `gradebook.manage` for template CRUD. `gradebook.enter_grades` for grading with rubrics.

---

### C2. Standards-Based Grading (as a Layer)

**Purpose:** Track mastery of curriculum standards alongside traditional scores, without changing the core workflow.

**Data Model:**
- `curriculum_standards` — tenant_id, subject_id, year_group_id, code (string), description (text)
  - Unique on (tenant_id, subject_id, code)
- `assessment_standard_mappings` — tenant_id, assessment_id, standard_id, created_at (many-to-many)
  - Index: `idx_asm_tenant_assessment` on (tenant_id, assessment_id)
- `competency_scales` — tenant_id, name, levels (JSON array of `{ label: string, threshold_min: number }`), created_at, updated_at
  - Default scale auto-created when tenant first accesses Standards settings: ["Beginning" ≥0%, "Developing" ≥40%, "Proficient" ≥70%, "Mastered" ≥90%]
- `student_competency_snapshots` — tenant_id, student_id, standard_id, academic_period_id, competency_level (string), score_average (decimal), computed_from_count (int), last_updated (timestamp)
  - Unique on (tenant_id, student_id, standard_id, academic_period_id)
  - Competency is deliberately cross-class: if a student takes the same subject in multiple classes, all assessments mapped to the standard are averaged together. This gives a holistic view of mastery.

**Behavior:**
- Teachers optionally tag assessments with standards they cover (multi-select).
- Competency auto-computed: average student scores on assessments mapped to a standard → map to competency level using scale thresholds.
- Runs alongside period grade computation. No extra clicks.
- Standards and competency data appear on report cards as optional section.

**UI:**
- Settings > "Curriculum Standards" — import CSV or create manually, organized by subject + year group
- Settings > "Competency Scales" — define scales with level names and threshold bands
- Assessment creation: optional "Standards Covered" multi-select tag picker
- Student profile: "Standards Progress" tab with per-standard progress bars (color-coded)
- Report card: optional "Competency Summary" section

**Permissions:** `gradebook.manage` for standards/scales CRUD.

---

### C3. GPA Calculation

**Purpose:** Configurable GPA calculation that works for any country's grading convention.

**Data Model:**
- `class_subject_grade_configs.credit_hours` — decimal, nullable. Subject weight in GPA. If null, equal weighting.
- `gpa_snapshots` — tenant_id, student_id, academic_period_id, gpa_value (decimal 4,3), credit_hours_total (decimal), snapshot_at (timestamp)
  - Unique on (tenant_id, student_id, academic_period_id)

**Behavior:**
- GPA = sum(grade_point_value × credit_hours) / sum(credit_hours).
- Grade point values come from the grading scale. The existing `gradingScaleRangeSchema` (numeric scales) already has an optional `gpa_value` field. For letter and custom scale types, a `gpa_value` field must be added to `gradingScaleGradeSchema` so all three scale types can map grades to GPA points.
- If no credit hours configured, simple average.
- Computed alongside period grades.
- Cumulative GPA calculated across all periods on demand.

**Schema Change Required:**
- Add `gpa_value: z.number().optional()` to `gradingScaleGradeSchema` in `packages/shared/src/schemas/gradebook.schema.ts` (letter and custom scale grade entries).
- Grading scale settings UI: add optional "GPA Points" column when editing letter/custom scale grades.

**Tenant Settings (stored in `tenant_settings.settings.gradebook`):**
- `gpaPrecision` — 1 | 2 (default: 2)
- `gpaScaleLabel` — string (default: "GPA")

**UI:**
- Grade config: optional "Credit Hours" field per class-subject
- Student profile: GPA displayed (current period + cumulative)
- Class view: GPA column in period grades
- Report card header: GPA
- Transcript: cumulative GPA

---

### C4. Formative vs Summative Distinction

**Purpose:** Different assessment types with configurable impact on final grades.

**Data Model:**
- New Prisma enum `AssessmentType`: `formative`, `summative`
- `assessment_categories.assessment_type` — AssessmentType (default: `summative`)
- Migration: existing categories default to `summative` (they currently all count toward period grades)

**Tenant Settings (stored in `tenant_settings.settings.gradebook`):**
- `formativeWeightCap` — number (nullable). If set, formative categories collectively capped at this % of final grade.
- `formativeIncludedInPeriodGrade` — boolean (default: true). If false, formative excluded from period grade computation entirely.

**Behavior:**
- Period grade computation: if formative cap set and formative categories exceed it, their combined weight is scaled down, summative scaled up proportionally.
- No change to teacher workflow.

**UI:**
- Assessment category CRUD: new "Type" dropdown (Formative/Summative)
- Tenant settings: "Formative weight cap" number field, "Include formative in period grade" toggle
- Report card: optional formative vs summative breakdown

---

### C5. Grade Curve / Normalization

**Purpose:** One-click grade scaling when an assessment was too hard or easy.

**Data Model:**
- `assessments.curve_applied` — enum: 'none' | 'linear_shift' | 'linear_scale' | 'sqrt' | 'bell' | 'custom' (default: 'none')
- `assessments.curve_params` — JSON (nullable). Stores method-specific parameters.
- `grade_curve_audit` — tenant_id, assessment_id, applied_by_user_id, applied_at, method, params (JSON), before_scores (JSON `[{ student_id: string, raw_score: number | null }]`), after_scores (JSON, same shape), can_undo (boolean, default: true)
  - Index: `idx_grade_curve_audit_tenant_assessment` on (tenant_id, assessment_id)
  - `can_undo` set to `false` when any individual grade is manually edited after the curve was applied. This prevents undo from silently overwriting manual edits.

**Curve Methods:**
- Linear shift: +X points to every score
- Linear scale: scale so highest becomes max_score
- Square root: new_score = sqrt(raw/max) × max
- Bell curve: fit to normal distribution with target mean/stddev
- Custom: teacher-defined mapping table

**Behavior:**
- Teacher selects method, sees live preview (before/after distribution chart), confirms.
- Raw scores updated, audit log created with `can_undo = true`.
- Undo available while `can_undo = true` (reverts from audit log before_scores). If any individual grade is manually edited after curve application, `can_undo` is set to `false` to prevent overwriting manual edits.

**UI:**
- Assessment detail: "Apply Curve" button (permission: `gradebook.apply_curve`)
- Modal: method selection, params, live preview chart, confirmation
- Audit trail on assessment detail page

**Permissions:** New permission `gradebook.apply_curve`.

---

### C6. Assessment Templates

**Purpose:** Save and reuse assessment blueprints for consistency and productivity.

**Data Model:**
- `assessment_templates` — tenant_id, name, subject_id (nullable), category_id, max_score, rubric_template_id (nullable), standard_ids (JSON array of UUIDs, nullable), counts_toward_report_card (boolean), created_by_user_id, created_at, updated_at
  - `standard_ids` stored as JSON (not a join table) for simplicity — templates are blueprints, not live data. When applying a template, the system filters out any deleted standards at runtime and creates proper `assessment_standard_mappings` for the new assessment.

**Behavior:**
- "Save as Template" from any assessment. "Create from Template" pre-fills everything except class/period/dates.
- Templates are tenant-wide, optionally scoped by subject.

**UI:**
- Assessment creation: "Start from template" dropdown (optional)
- Assessment detail: "Save as Template" button
- Settings > "Assessment Templates" — browse, edit, delete

---

### C7. Batch Default Grades

**Purpose:** Pre-fill a default score for the whole class, then edit exceptions.

**Data Model:** No new tables.

**Behavior:**
- Grade entry screen: "Set Default Score" button
- Fills all empty grade cells with the specified score (already-entered grades not overwritten)
- Teacher edits exceptions, saves normally via existing bulk upsert API

**UI:**
- "Set Default" button → popover with score input → apply
- Default-filled cells highlighted with subtle color
- Teacher overrides individual cells as needed

---

## Sub-Project A: Analytics & Insights

Build second — consumes the richer data model from Sub-Project C.

### A1. Grade Trend Visualizations

**Purpose:** Line charts and sparklines showing grade trajectories over time.

**Data Source:** Existing `grades` and `period_grade_snapshots` tables. Computed on the fly.

**Views:**
- **Student trend** — per-subject sparklines on student profile "Academic Trends" tab. Detailed line chart with assessment-by-assessment scores.
- **Class trend** — class average per assessment over time. Gradebook class view > "Analytics" tab.
- **Subject trend** — compare subject averages across classes. Grading Insights page.
- **Dashboard cards** — school-wide trend, biggest improvers, biggest decliners.

**UI:** Recharts (already in stack). Responsive. Trend arrows (↑ improving, ↓ declining, → stable) as compact indicators throughout the UI.

---

### A2. Grade Distribution Analytics

**Purpose:** Statistical analysis of score distributions per assessment and per period.

**Data Source:** Computed on the fly from `grades` table. Redis lazy cache for expensive aggregations.

**Cache Strategy:**
- Key pattern: `analytics:distribution:{tenant_id}:{assessment_id}` (assessment-level) or `analytics:period:{tenant_id}:{class_id}:{subject_id}:{period_id}` (period-level)
- TTL: 5 minutes
- Invalidation: grade upsert invalidates the relevant assessment-level and period-level cache keys. Invalidation is best-effort (delete key on grade save); stale cache is acceptable for analytics.

**Stats:** Mean, median, mode, standard deviation, pass rate, min, max, percentile bands.

**Views:**
- **Assessment distribution** — histogram/bell curve on assessment detail page. Auto-appears once grades entered.
- **Period distribution** — Gradebook class view > Analytics tab.
- **Item analysis** (if rubric attached) — per-criterion average scores. Identifies which criteria students struggled with most.
- **Color coding:** Green = healthy, yellow = heavily skewed, red = pass rate below threshold.

---

### A3. Teacher Grading Consistency

**Purpose:** Compare grade distributions across teachers teaching the same subject to detect bias.

**Data Source:** Computed from `grades` + `assessments` + class/teacher assignments. Redis cache.

**Analysis:**
- Identifies teachers teaching same subject in same year group
- Compares: average grades, pass rates, standard deviations, distribution shapes
- Flags significant deviations exceeding tenant-configurable threshold (default: 15%)
- Non-accusatory framing: "Unusual pattern detected — review recommended"

**UI:**
- Gradebook > "Grading Insights" page (new, admin-only)
- Permission: `gradebook.view_analytics`
- Table: subject × teacher × class with comparison metrics
- Bar chart: side-by-side teacher comparison per subject

---

### A4. Class / Year-Group Benchmarking

**Purpose:** Compare academic performance across classes and year groups.

**Data Source:** Aggregations from `period_grade_snapshots`. Redis cache.

**Views:**
- **Within year group** — Class 10A vs 10B vs 10C in Math
- **Across year groups** — Grade 10 vs Grade 11 overall
- **Period-over-period** — Term 1 vs Term 2 for same class-subject
- Exportable to PDF/CSV

**UI:**
- Grading Insights page > "Benchmarking" tab
- Filters: year group, subject, period

---

## Sub-Project B: AI Features

Build third — consumes data from A and C, plus Claude API.

### B1. AI Report Card Comments

**Purpose:** AI generates personalized report card comments. Teacher reviews and edits.

**Context sent to AI:**
- Student's subject grades with trends
- Attendance summary
- Competency levels (if standards enabled)
- Strengths (top subjects) and areas for improvement (weakest)

**Tenant Settings (AI section):**
- `commentStyle` — 'formal' | 'warm' | 'balanced'
- `commentSampleReference` — optional text (textarea). "Write comments like this."
- `commentTargetWordCount` — number (default: 100)
- Language follows report card `template_locale`

**Behavior:**
- Single: "AI Generate" button next to comment field on report card edit page
- Batch: select multiple report cards > "Generate Comments"
- AI output is a draft — teacher reviews, edits, saves. Never auto-saved.
- Bilingual: generates in report card locale (English or Arabic)

**Permissions:** `gradebook.enter_grades` (teachers generate comments for their own classes), `gradebook.manage`, or `gradebook.publish_report_cards`.

---

### B2. AI Exam / Essay Grading Assistant

**Purpose:** AI suggests scores for handwritten exams or essays. Teacher always confirms.

**Prerequisite — AI Grading Instructions:**
- `ai_grading_instructions` — tenant_id, class_id, subject_id, instruction_text, status ('draft' | 'pending_approval' | 'active' | 'rejected'), submitted_by_user_id, reviewed_by_user_id, reviewed_at, rejection_reason, created_at, updated_at
  - Unique on (tenant_id, class_id, subject_id). Instructions are updated in-place (not versioned per academic year) because classes are already scoped to an academic year. A new academic year creates new classes, so the unique constraint naturally resets.
  - Admin approval always required. Updating instruction_text resets status to `pending_approval`.
  - Without an active instruction, AI grading buttons don't appear for that class-subject.
  - Submit/edit requires `gradebook.manage_ai_grading`. Approve/reject requires `gradebook.approve_ai_grading`.
  - Index: `idx_ai_grading_instructions_tenant_class_subject` on (tenant_id, class_id, subject_id)

**Reference Marking Schemes:**
- `ai_grading_references` — tenant_id, assessment_id, file_url, file_type, uploaded_by_user_id, status ('pending_approval' | 'active' | 'rejected'), reviewed_by_user_id, reviewed_at, created_at, updated_at
  - Strictly per-assessment (each test has different answers). If a teacher wants to reuse a marking scheme, they re-upload it for the new assessment.
  - Auto-approved by default. Tenant setting `requireApprovalForMarkingSchemes` (boolean, default: false)
  - For structured subjects (math, science): teacher uploads model answers with full workings and point allocations
  - AI compares student work against reference, awards marks per question/step
  - Index: `idx_ai_grading_references_tenant_assessment` on (tenant_id, assessment_id)

**Inline Mode:**
- Grade entry screen > "AI Grade" icon next to student score cell
- Upload photo/text → AI suggests score (+ per-criterion scores if rubric attached) with reasoning
- Teacher accepts or adjusts

**Batch Mode:**
- Assessment > "AI Grade Batch" → upload multiple photos or multi-page PDF
- Tag pages to students (or AI reads student name/number from paper)
- Results table: student, suggested score, confidence (high/medium/low), reasoning
- Teacher reviews, accepts/adjusts, confirms

**Safety:**
- AI suggestions never auto-saved. Teacher always confirms.
- Low-confidence scores highlighted — teacher attention required.
- `grades.ai_assisted` (boolean) metadata flag for transparency.
- `entered_by_user_id` is always the teacher, not "AI".
- Rate limit: configurable per tenant (default: 200 AI gradings/day)

**AI Prompt includes:** grading instruction (class-level) + reference marking scheme (assessment-level, if uploaded) + rubric (if attached) + student's paper

---

### B3. Predictive At-Risk Detection

**Purpose:** Identify students likely to struggle before it's too late.

**Data Model:**
- `student_academic_risk_alerts` — tenant_id, student_id, risk_level ('low' | 'medium' | 'high'), alert_type ('at_risk_low' | 'at_risk_medium' | 'at_risk_high' | 'score_anomaly' | 'class_anomaly' | 'grading_pattern_anomaly' | 'teacher_variance'), subject_id (nullable), trigger_reason (text), details_json, detected_date, status ('active' | 'acknowledged' | 'resolved'), acknowledged_by_user_id, resolved_at, created_at, updated_at
  - Unique on (tenant_id, student_id, alert_type, COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'), detected_date). Uses COALESCE so a student can have both a Math score_anomaly and a Science score_anomaly on the same day.
  - Index: `idx_academic_risk_alerts_tenant_status` on (tenant_id, status) for dashboard queries
  - Index: `idx_academic_risk_alerts_tenant_student` on (tenant_id, student_id) for student profile

**Analysis (background job, configurable: daily or weekly):**
- Trend direction: improving/declining/stable
- Rate of change across recent assessments
- Current average vs historical average
- Comparison to class mean

**Tenant Settings (gradebook section):**
- Enable/disable at-risk detection
- Threshold definitions per tier (percentage decline, number of assessments)
- Per-tier configurable actions:
  - Show on dashboard (always on)
  - Notify homeroom teacher
  - Notify parent
  - Create intervention record
- Detection frequency: daily or weekly

**UI:**
- Dashboard: "At-Risk Students" card with count per tier
- Grading Insights > "At-Risk" tab with full list, filters by tier/subject/class
- Student profile: risk badge when active alert exists
- Acknowledge/resolve workflow with audit trail

---

### B4. Grade Anomaly Detection

**Purpose:** Detect statistical outliers and suspicious grading patterns.

**Runs alongside at-risk detection (same background job).**

**Detection Types:**
- **Score anomalies** — student score deviates >2 stddev from their own mean
- **Class-wide anomalies** — entire class scores unusually low on one assessment
- **Grading pattern anomalies** — teacher gives suspiciously uniform scores or bimodal distribution
- **Cross-teacher variance** — automated version of teacher consistency analysis

**Data Model:** Same `student_academic_risk_alerts` table with different `alert_type` values.

**UI:**
- Grading Insights > alerts with "Anomalies" filter
- Assessment detail: banner warning if class-wide anomaly detected
- Non-punitive tone: "Unusual pattern detected — review recommended"

---

### B5. Natural Language Grade Queries

**Purpose:** Staff asks questions in plain English/Arabic, gets structured results.

**Architecture:**
1. User types question
2. System sends question + schema description (available entities, fields, relationships) to Claude
3. Claude returns structured query definition (JSON — NOT raw SQL):
   ```json
   {
     "entity": "student",
     "filters": [
       { "field": "period_grades.computed_value", "op": "lt", "value": 50 },
       { "field": "class.year_group.name", "op": "eq", "value": "Grade 10" }
     ],
     "aggregations": [{ "fn": "count", "field": "period_grades.subject_id", "alias": "failing_subjects", "having": { "op": "gt", "value": 2 } }],
     "select": ["first_name", "last_name", "student_number", "failing_subjects"],
     "sort": [{ "field": "failing_subjects", "dir": "desc" }],
     "limit": 50
   }
   ```
4. Backend maps to Prisma queries with RLS (tenant isolation guaranteed). The mapping layer supports: students, grades, assessments, period_grade_snapshots, gpa_snapshots, classes, subjects as queryable entities.
5. Results rendered as actionable table (click student → profile, export to CSV)

**Example Queries:**
- "Which Grade 10 students are failing more than 2 subjects?"
- "Show me the top 10 students by GPA this term"
- "Which teachers have the lowest pass rate in Science?"
- "List all students who improved by more than 10% between Term 1 and Term 2"

**UI:**
- Gradebook sidebar: "Ask AI" menu item (visible when ai_functions enabled)
- Page: search bar, suggested queries when empty, recent query history, results area
- Export to CSV on results

**Safety:** Structured query definition only — no raw SQL. RLS enforced. Permission: `gradebook.view_analytics`.

---

### B6. AI Progress Summaries (for Parents)

**Purpose:** AI-generated plain-language summary of student performance shown to parents.

**Context sent to AI:**
- Only grades visible to parents: if D1 (grade publishing) is deployed, filters by `assessment.grades_published_at IS NOT NULL`. If D1 is not yet deployed, uses all grades (backwards-compatible).
- Period grade snapshots, grade trends
- Attendance summary
- Competency levels (if enabled)

**Behavior:**
- Generated on demand when parent views grades page, cached 24 hours (Redis, TTL 86400s)
- Cache invalidated when grades are published to parent (D1 publish action) OR on TTL expiry, whichever comes first. Cache key: `ai:progress_summary:{tenant_id}:{student_id}:{period_id}`
- Language follows parent's locale preference
- Tone follows tenant's comment style setting

**Tenant Settings:**
- `aiProgressSummariesEnabled` — boolean (default: false)

**UI:**
- Parent portal > student grades: summary card at top
- Parent portal > student dashboard: condensed one-liner
- Read-only. Teachers/admin can preview what parents see.

---

## Sub-Project D: Parent & Notification Experience

Build last — depends on the publishing system and AI summaries from B.

### D1. Controlled Grade Publishing & Notifications

**Purpose:** Admin controls when grades become visible to parents.

**Data Model:**
- `assessments.grades_published_at` — timestamp (nullable)
- `assessments.grades_published_by_user_id` — UUID (nullable)
- Publishing is at assessment level, not per-grade. This avoids updating hundreds of grade rows per publish action and eliminates consistency risk between grade-level and assessment-level flags.

**Behavior:**
- Parent portal queries filter by `assessment.grades_published_at IS NOT NULL`
- Admin publishes per-assessment or per-period (bulk)
- On publish: grade records flagged, notification dispatched to parents via existing notification system
- Per-assessment notification: "New grades posted: [Assessment] — [Subject]"
- Bulk period notification: digest listing all assessments

**Grade Readiness Dashboard:**
- Table: class × assessment, graded count, total enrolled, completion %, status (ready/incomplete/published)
- Bulk select + "Publish to Parents" button
- Per-period publish option

**UI:**
- Gradebook sidebar: "Publishing" menu item
- Permission: `gradebook.publish_grades_to_parents` (new)
- Dashboard: "Unpublished Grades" card

---

### D2. Mid-Term Progress Reports

**Purpose:** Lightweight interim reports sent mid-term without formal report card process.

**Data Model:**
- `progress_reports` — tenant_id, student_id, class_id, academic_period_id, generated_at, generated_by_user_id, status ('draft' | 'sent'), sent_at, created_at, updated_at
  - Unique on (tenant_id, student_id, class_id, academic_period_id, generated_at). Allows multiple progress reports per period (e.g., mid-term and 3/4-term).
  - Index: `idx_progress_reports_tenant_period` on (tenant_id, academic_period_id)
- `progress_report_entries` — tenant_id, progress_report_id, subject_id, current_average (decimal), trend ('improving' | 'declining' | 'stable'), teacher_note (text, nullable), created_at, updated_at

**Behavior:**
- Admin triggers generation for class/year group at any point during term
- System computes current standing from grades entered so far
- Teachers optionally add short notes per subject
- Admin reviews and sends → parents notified + view in parent portal
- Optional: tenant can schedule auto-generation (e.g., every 4 weeks)

**Difference from Report Cards:**
- Report cards: formal, end-of-term, frozen snapshots, PDF, comments
- Progress reports: informal, mid-term, live data, lightweight, no PDF

**UI:**
- Gradebook > "Progress Reports" page
- Generate, review, send workflow
- Parent portal: "Progress Updates" section

---

## New Permissions Summary

| Permission | Description |
|---|---|
| `gradebook.apply_curve` | Apply grade curves/normalization to assessments |
| `gradebook.view_analytics` | View grading insights, trends, consistency reports |
| `gradebook.publish_grades_to_parents` | Control grade visibility to parents |
| `gradebook.manage_ai_grading` | Submit/edit AI grading instructions |
| `gradebook.approve_ai_grading` | Approve/reject AI grading instructions |

---

## New Tenant Settings Summary

**Gradebook section additions:**
- `formativeWeightCap` — number (nullable)
- `formativeIncludedInPeriodGrade` — boolean (default: true)
- `gpaPrecision` — 1 | 2 (default: 2)
- `gpaScaleLabel` — string (default: "GPA")
- `atRiskDetectionEnabled` — boolean (default: false)
- `atRiskDetectionFrequency` — 'daily' | 'weekly' (default: 'weekly')
- `atRiskThresholds` — JSON { low: {...}, medium: {...}, high: {...} }
- `atRiskTierActions` — JSON { low: {...}, medium: {...}, high: {...} }
- `gradingConsistencyThreshold` — number (default: 15)
- `requireApprovalForMarkingSchemes` — boolean (default: false)

**AI section additions:**
- `commentStyle` — 'formal' | 'warm' | 'balanced' (default: 'balanced')
- `commentSampleReference` — string (nullable)
- `commentTargetWordCount` — number (default: 100)
- `aiProgressSummariesEnabled` — boolean (default: false)
- `aiGradingDailyLimit` — number (default: 200)

---

## Implementation Order

1. **Sub-Project C** (Advanced Grading Models) — C1 through C7
2. **Sub-Project A** (Analytics & Insights) — A1 through A4
3. **Sub-Project B** (AI Features) — B1 through B6
4. **Sub-Project D** (Parent & Notification Experience) — D1, D2

Each sub-project gets its own implementation plan and can be deployed independently.

---

## New Database Tables Summary

| Table | Purpose |
|---|---|
| `rubric_templates` | Reusable grading rubric definitions |
| `rubric_grades` | Per-criterion scores for rubric-graded assessments |
| `curriculum_standards` | Curriculum standard definitions per subject/year group |
| `assessment_standard_mappings` | Many-to-many: assessments ↔ standards |
| `competency_scales` | Configurable competency level definitions |
| `student_competency_snapshots` | Computed competency per student per standard |
| `gpa_snapshots` | Cached GPA per student per period |
| `grade_curve_audit` | Audit trail for grade curve applications |
| `assessment_templates` | Saved assessment blueprints |
| `ai_grading_instructions` | Per class-subject AI grading philosophy (approval workflow) |
| `ai_grading_references` | Per-assessment reference marking schemes |
| `student_academic_risk_alerts` | At-risk flags and anomaly alerts |
| `progress_reports` | Lightweight mid-term reports |
| `progress_report_entries` | Per-subject entries in progress reports |

All tables are tenant-scoped with `tenant_id` and RLS policies.
