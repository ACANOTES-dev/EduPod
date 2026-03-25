# P5 Testing Instructions — Gradebook, Report Cards, and Transcripts

---

## Section 1 — Unit Tests

### 1.1 GradingScalesService

**File**: `apps/api/src/modules/gradebook/grading-scales.service.spec.ts`

| Test | Input | Expected |
|------|-------|----------|
| should create a numeric grading scale | `{ name: 'Percentage', config_json: { type: 'numeric', ranges: [{ min: 0, max: 59, label: 'F' }, { min: 60, max: 100, label: 'A' }] } }` | Scale created with config |
| should create a letter grading scale | `{ name: 'Letter', config_json: { type: 'letter', grades: [{ label: 'Excellent' }, { label: 'Good' }] } }` | Scale created |
| should reject duplicate scale name | Same name as existing | `DUPLICATE_SCALE_NAME` (409) |
| should allow name change when scale is in use | Update name only | Success |
| should block config_json change when scale is in use | Update config_json when grades exist against it | `SCALE_IN_USE` (409) |
| should allow config_json change when scale is referenced but no grades exist | Config exists but no grades entered | Success |
| should block delete when referenced by grade configs | Delete when class_subject_grade_configs reference it | `SCALE_IN_USE` (409) |
| should return is_in_use flag correctly | Scale with graded assessments | `is_in_use: true` |

### 1.2 AssessmentCategoriesService

| Test | Expected |
|------|----------|
| should create a category | Category created with name and default_weight |
| should reject duplicate category name | `DUPLICATE_CATEGORY_NAME` (409) |
| should block delete when assessments reference category | `CATEGORY_IN_USE` (409) |

### 1.3 ClassGradeConfigsService

| Test | Expected |
|------|----------|
| should upsert grade config for academic subject | Config created |
| should reject non-academic subject | `SUBJECT_NOT_ACADEMIC` (400) |
| should reject invalid category IDs | `INVALID_CATEGORY_IDS` (400) |
| should reject invalid grading scale ID | `NOT_FOUND` (404) |
| should block delete when graded assessments exist | `CONFIG_IN_USE` (409) |

### 1.4 AssessmentsService — State Machine

| Test | Expected |
|------|----------|
| should allow draft → open | Success |
| should allow open → closed | Success |
| should allow closed → locked | Success |
| should allow closed → open (re-open) | Success |
| should block locked → any | `INVALID_STATUS_TRANSITION` (400) |
| should block draft → closed | `INVALID_STATUS_TRANSITION` (400) |
| should block draft → locked | `INVALID_STATUS_TRANSITION` (400) |
| should reject assessment creation without grade config | `MISSING_GRADE_CONFIG` (400) |
| should reject non-academic subject assessment | `SUBJECT_NOT_ACADEMIC` (400) |
| should reject delete when grades exist | `ASSESSMENT_HAS_GRADES` (409) |
| should reject delete when not draft | `ASSESSMENT_NOT_DRAFT` (409) |

### 1.5 GradesService

| Test | Expected |
|------|----------|
| should upsert grades for enrolled students | Grades created/updated |
| should reject grades when assessment is closed/locked | `ASSESSMENT_NOT_OPEN` (409) |
| should reject grades for non-enrolled students | `STUDENT_NOT_ENROLLED` (400) |
| should enforce comment requirement when tenant setting enabled | `COMMENT_REQUIRED` (400) |
| should reject score exceeding max_score | `SCORE_EXCEEDS_MAX` (400) |
| should set entered_at only on first grade entry | entered_at set once |
| should handle is_missing = true correctly | raw_score set to null |

### 1.6 PeriodGradeComputationService

| Test | Input | Expected |
|------|-------|----------|
| should compute weighted average correctly | Category A (weight 60): 80%, Category B (weight 40): 90% | computed_value = 84.0 |
| should normalize weights when sum != 100 | Weights sum to 80 | Normalized, warning returned |
| should exclude missing grades with 'exclude' policy | Student has 2 grades, 1 missing | Average of 2 graded only |
| should treat missing as zero with 'zero' policy | Student has 2 grades, 1 missing | Include 0 in average |
| should skip categories with no valid grades | Category has only missing grades | Category excluded from average |
| should apply numeric grading scale correctly | Score 85, ranges [0-59=F, 60-79=B, 80-100=A] | display_value = 'A' |
| should apply letter grading scale correctly | Score mapped to position | Correct label |
| should preserve existing override on recomputation | Override exists, recompute | Override fields unchanged |
| should error when no grade config exists | Class without config | `MISSING_GRADE_CONFIG` (400) |
| should error when no assessments exist | No assessments for period | `NO_ASSESSMENTS` (400) |
| edge: should handle all missing grades for student | All assessments missing | Student excluded or gets 0 |
| edge: should handle max_score = 0 | Division by zero scenario | Handled gracefully |

### 1.7 ReportCardsService

| Test | Expected |
|------|----------|
| should generate draft report cards with snapshot | Draft created with correct snapshot_payload_json |
| should include attendance summary in snapshot | Attendance counts correct |
| should determine template_locale from billing parent | Correct locale chain |
| should update draft report card comments | Comments updated in record and snapshot |
| should reject update on published report card | `REPORT_CARD_NOT_DRAFT` (409) |
| should publish report card | Status set to published, timestamps set |
| should reject publish on non-draft | `REPORT_CARD_NOT_DRAFT` (409) |
| should create revision from published card | New draft created, original set to revised |
| should reject revision on non-published card | `REPORT_CARD_NOT_PUBLISHED` (409) |
| should invalidate transcript cache on publish | Redis key deleted |

### 1.8 TranscriptsService

| Test | Expected |
|------|----------|
| should aggregate period grades across years | Grouped by year → period → subject |
| should cache transcript data in Redis (5 min TTL) | Cached on first call, served from cache on second |
| should invalidate cache correctly | Key deleted after invalidation |

### 1.9 BulkImportService

| Test | Expected |
|------|----------|
| should match students by student_number | Matched rows returned |
| should match students by name as fallback | Matched when no student_number match |
| should flag unmatched students | Unmatched rows with reason |
| should flag ambiguous matches | Multiple matches flagged |
| should reject invalid CSV format | `INVALID_CSV_FORMAT` (400) |

---

## Section 2 — Integration Tests

### 2.1 Grading Scales API

**File**: `apps/api/test/p5-grading-scales.e2e-spec.ts`

| Test | Method | Path | Expected |
|------|--------|------|----------|
| Happy: create grading scale | POST | `/api/v1/gradebook/grading-scales` | 201, scale returned |
| Happy: list grading scales | GET | `/api/v1/gradebook/grading-scales` | 200, paginated list |
| Happy: get single scale with is_in_use | GET | `/api/v1/gradebook/grading-scales/:id` | 200, includes is_in_use |
| Happy: update scale name | PATCH | `/api/v1/gradebook/grading-scales/:id` | 200, name updated |
| Happy: delete unused scale | DELETE | `/api/v1/gradebook/grading-scales/:id` | 200 |
| Fail: create without auth | POST | `/api/v1/gradebook/grading-scales` | 401 |
| Fail: create without permission | POST | `/api/v1/gradebook/grading-scales` (teacher) | 403 |
| Fail: update in-use config | PATCH | `/api/v1/gradebook/grading-scales/:id` | 409 |
| Fail: delete in-use scale | DELETE | `/api/v1/gradebook/grading-scales/:id` | 409 |

### 2.2 Assessment Categories API

| Test | Method | Path | Expected |
|------|--------|------|----------|
| Happy: CRUD cycle | POST/GET/PATCH/DELETE | `/api/v1/gradebook/assessment-categories` | Success |
| Fail: permission denied for teacher | POST | `/api/v1/gradebook/assessment-categories` | 403 |
| Fail: delete in-use category | DELETE | `/api/v1/gradebook/assessment-categories/:id` | 409 |

### 2.3 Assessments API

| Test | Method | Path | Expected |
|------|--------|------|----------|
| Happy: teacher creates assessment | POST | `/api/v1/gradebook/assessments` | 201 |
| Happy: status transitions | PATCH | `/api/v1/gradebook/assessments/:id/status` | 200 |
| Fail: non-academic subject | POST | `/api/v1/gradebook/assessments` | 400 |
| Fail: teacher not assigned to class | POST | `/api/v1/gradebook/assessments` | 403 |
| Fail: invalid status transition | PATCH | `/api/v1/gradebook/assessments/:id/status` | 400 |

### 2.4 Grades API

| Test | Method | Path | Expected |
|------|--------|------|----------|
| Happy: bulk upsert grades | PUT | `/api/v1/gradebook/assessments/:id/grades` | 200 |
| Fail: assessment not open | PUT | `/api/v1/gradebook/assessments/:id/grades` | 409 |
| Fail: student not enrolled | PUT | `/api/v1/gradebook/assessments/:id/grades` | 400 |

### 2.5 Period Grades API

| Test | Method | Path | Expected |
|------|--------|------|----------|
| Happy: compute period grades | POST | `/api/v1/gradebook/period-grades/compute` | 200, snapshots returned |
| Happy: override grade | POST | `/api/v1/gradebook/period-grades/:id/override` | 200 |
| Fail: override without reason | POST | `/api/v1/gradebook/period-grades/:id/override` | 400 |
| Fail: override without permission | POST | `/api/v1/gradebook/period-grades/:id/override` (teacher) | 403 |

### 2.6 Report Cards API

| Test | Method | Path | Expected |
|------|--------|------|----------|
| Happy: generate draft report cards | POST | `/api/v1/report-cards/generate` | 200 |
| Happy: publish report card | POST | `/api/v1/report-cards/:id/publish` | 200 |
| Happy: revise published card | POST | `/api/v1/report-cards/:id/revise` | 200 |
| Happy: render PDF | GET | `/api/v1/report-cards/:id/pdf` | 200, PDF content-type |
| Fail: publish non-draft | POST | `/api/v1/report-cards/:id/publish` | 409 |
| Fail: publish without permission | POST | `/api/v1/report-cards/:id/publish` (teacher) | 403 |

### 2.7 Parent Portal API

| Test | Method | Path | Expected |
|------|--------|------|----------|
| Happy: parent views child's grades | GET | `/api/v1/parent/students/:id/grades` | 200 |
| Happy: parent views published report cards | GET | `/api/v1/parent/students/:id/report-cards` | 200, only published |
| Fail: parent views unlinked student | GET | `/api/v1/parent/students/:id/grades` | 403 |

---

## Section 3 — RLS Leakage Tests

**File**: `apps/api/test/p5-rls-leakage.e2e-spec.ts`

For each of the 7 new tables, test:

1. Create data as Tenant A
2. Authenticate as Tenant B
3. Attempt to read/query the data
4. Assert: data is NOT returned (empty result or 404)

| Table | Test |
|-------|------|
| `grading_scales` | Tenant B cannot see Tenant A's grading scales |
| `assessment_categories` | Tenant B cannot see Tenant A's categories |
| `class_subject_grade_configs` | Tenant B cannot see Tenant A's grade configs |
| `assessments` | Tenant B cannot see Tenant A's assessments |
| `grades` | Tenant B cannot see Tenant A's grades |
| `period_grade_snapshots` | Tenant B cannot see Tenant A's period grade snapshots |
| `report_cards` | Tenant B cannot see Tenant A's report cards |

Additionally test:
- Tenant B cannot compute period grades for Tenant A's classes
- Tenant B cannot generate report cards for Tenant A's students
- Parent in Tenant A cannot see students in Tenant B

---

## Section 4 — Manual QA Checklist

### 4.1 Grading Scale Management (Admin)
- [ ] Navigate to Settings → Grading Scales
- [ ] Create a numeric grading scale with ranges (0-59=F, 60-69=D, 70-79=C, 80-89=B, 90-100=A)
- [ ] Create a letter grading scale (Excellent, Very Good, Good, Acceptable, Fail)
- [ ] Verify both appear in the list
- [ ] Edit scale name — verify it updates
- [ ] Delete unused scale — verify it's removed
- [ ] Create a grade config that uses the numeric scale, enter grades, then try to edit the scale config → should be blocked with message

### 4.2 Assessment Category Management (Admin)
- [ ] Navigate to Settings → Assessment Categories
- [ ] Create categories: Homework (20%), Quizzes (30%), Exams (50%)
- [ ] Edit default weight of Homework to 25%
- [ ] Try to delete a category that has assessments → should be blocked

### 4.3 Grade Configuration (Admin)
- [ ] Navigate to Gradebook → select a class → Grade Config tab
- [ ] Set grading scale and category weights for a subject
- [ ] Verify weights display with normalization warning if sum ≠ 100%

### 4.4 Assessment Lifecycle (Teacher)
- [ ] Navigate to Gradebook → select an assigned class
- [ ] Create a new assessment (title, category, max score, due date)
- [ ] Verify it appears as "Draft"
- [ ] Change status to "Open"
- [ ] Enter grades for students in the grade entry page
- [ ] Mark some students as "Missing"
- [ ] Save grades → verify saved
- [ ] Change status to "Closed"
- [ ] Verify grade entry is disabled
- [ ] As admin, change status to "Locked"
- [ ] Verify no further changes possible

### 4.5 Grade Entry Speed Test (Teacher)
- [ ] Open grade entry page for an assessment
- [ ] Tab between score fields — verify cursor moves correctly
- [ ] Enter grades rapidly — verify all save correctly
- [ ] Check "X of Y students graded" counter updates

### 4.6 Period Grade Computation (Admin)
- [ ] After entering grades for all assessments in a period
- [ ] Click "Compute Grades" on the Period Grades tab
- [ ] Verify weighted averages are computed correctly
- [ ] Verify grading scale labels are applied
- [ ] Verify weight normalization warning appears if weights don't sum to 100%
- [ ] Override a grade with reason → verify original value preserved

### 4.7 Report Card Generation (Admin)
- [ ] Navigate to Report Cards
- [ ] Click "Generate Report Cards"
- [ ] Select academic period and students
- [ ] Generate → verify draft report cards created
- [ ] Open a report card → verify snapshot data correct
- [ ] Add teacher comment and principal comment
- [ ] Preview PDF → verify formatting
- [ ] Publish report card → verify status changes
- [ ] Try to edit published card → should be blocked

### 4.8 Report Card Revision (Admin)
- [ ] On a published report card, click "Revise"
- [ ] Verify new draft created with original data
- [ ] Verify original marked as "revised"
- [ ] Edit revision → save → publish
- [ ] Verify only latest version shown in default list

### 4.9 PDF Rendering
- [ ] Generate report card PDF in English → verify layout, school logo, grades table
- [ ] Generate report card PDF in Arabic → verify RTL layout, Arabic fonts, correct alignment
- [ ] Generate transcript PDF in English → verify all academic years/periods listed
- [ ] Generate transcript PDF in Arabic → verify RTL

### 4.10 Bulk Import (Admin)
- [ ] Navigate to Gradebook → Import
- [ ] Download CSV template
- [ ] Upload valid CSV → verify matched/unmatched breakdown
- [ ] Review matches → process
- [ ] Verify grades imported correctly
- [ ] Upload invalid CSV → verify error messages

### 4.11 Parent Portal
- [ ] Log in as parent
- [ ] Navigate to grades tab → verify child's grades visible
- [ ] View published report cards → verify only published shown
- [ ] Download report card PDF → verify
- [ ] Download transcript PDF → verify
- [ ] Try to view another parent's child → should be blocked

### 4.12 Arabic Locale Testing (RTL)
- [ ] Switch to Arabic locale
- [ ] Verify all gradebook pages render correctly RTL
- [ ] Verify form inputs align correctly
- [ ] Verify table layouts are RTL
- [ ] Verify numeric values (scores, percentages) are LTR
- [ ] Verify date pickers work correctly

### 4.13 Role-Based Access
- [ ] As teacher: verify can only see assigned classes
- [ ] As teacher: verify cannot access settings (grading scales, categories)
- [ ] As teacher: verify cannot publish report cards
- [ ] As teacher: verify cannot override grades
- [ ] As parent: verify can only see linked students
- [ ] As admin: verify full access to all gradebook features
