# Assessment Module — Integration Test Specification

**Module:** Assessment (Gradebook, Analytics, Report Card linkage)
**Surface:** Backend API behaviour — RLS, cross-tenant isolation, contract adherence, state-machine transitions, invariants, concurrency, webhook-like event chains.
**Execution target:** A Jest + `supertest` harness hitting a live Postgres + Redis + MinIO stack (or the `integration` CI job on ports 5553 / 5554).
**Last Updated:** 2026-04-12

---

## Table of Contents

1. [Prerequisites & Test Harness](#1-prerequisites--test-harness)
2. [RLS Matrix — Every Tenant-Scoped Table](#2-rls-matrix--every-tenant-scoped-table)
3. [Cross-Tenant Direct-API Hostile Matrix](#3-cross-tenant-direct-api-hostile-matrix)
4. [Permission Matrix — Every Endpoint × Every Role](#4-permission-matrix--every-endpoint--every-role)
5. [Zod Validation — Boundary Cases](#5-zod-validation--boundary-cases)
6. [State-Machine Transitions — Valid & Invalid](#6-state-machine-transitions--valid--invalid)
7. [Unlock Request Lifecycle](#7-unlock-request-lifecycle)
8. [Config Approval Lifecycle (Categories / Weights / Rubrics / Standards)](#8-config-approval-lifecycle-categories--weights--rubrics--standards)
9. [Sum-to-100 Invariant on Weights](#9-sum-to-100-invariant-on-weights)
10. [Period Grade Computation Correctness](#10-period-grade-computation-correctness)
11. [Grade Curve — Audit & Idempotency](#11-grade-curve--audit--idempotency)
12. [Grade Publishing — Readiness & Side-Effects](#12-grade-publishing--readiness--side-effects)
13. [Rubric Grading Round-Trip](#13-rubric-grading-round-trip)
14. [Curriculum Standards Import](#14-curriculum-standards-import)
15. [Bulk Import — Contract & Idempotency](#15-bulk-import--contract--idempotency)
16. [Concurrency — Parallel Grade Writes](#16-concurrency--parallel-grade-writes)
17. [Concurrency — Simultaneous Lock Attempts](#17-concurrency--simultaneous-lock-attempts)
18. [Concurrency — Duplicate Unlock Request](#18-concurrency--duplicate-unlock-request)
19. [PDF Byte Structural Checks (pdf-parse)](#19-pdf-byte-structural-checks-pdf-parse)
20. [Event Emission — Communications / Notifications](#20-event-emission--communications--notifications)
21. [GDPR DSAR Traversal](#21-gdpr-dsar-traversal)
22. [Encrypted Fields — AI Grading & Verification Tokens](#22-encrypted-fields--ai-grading--verification-tokens)
23. [Analytics Contract Checks](#23-analytics-contract-checks)
24. [Transcript Generation — Cross-Year Data](#24-transcript-generation--cross-year-data)
25. [Data Invariants — Global](#25-data-invariants--global)
26. [Negative Authorization Tests](#26-negative-authorization-tests)
27. [Observations from Walkthrough](#27-observations-from-walkthrough)
28. [Sign-Off](#28-sign-off)

---

## 1. Prerequisites & Test Harness

| Item               | Spec                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| Postgres           | 15+, `school_platform` (or `edupod_test`) with all migrations applied.                                     |
| Redis              | 7+, empty.                                                                                                 |
| MinIO / S3         | Test bucket `edupod-test-assets` pre-provisioned.                                                          |
| Node               | 20+.                                                                                                       |
| Test runner        | Jest with `supertest`, `@nestjs/testing`.                                                                  |
| Tenants            | 2 isolated tenants (A, B). Fixtures seed different ids.                                                    |
| Seed data          | Teachers, students, classes, subjects, categories, weights, rubrics, standards — all needed for each test. |
| Clock              | Fake timer in tests; real time outside. Ensures grading window assertions are deterministic.               |
| Auth               | Sign tokens for each role via `TestAuthFactory`. No UI flow.                                               |
| Row count baseline | Each test begins with a DB snapshot; `afterEach` restores (via `jest.beforeEach(db.rollback)`).            |

---

## 2. RLS Matrix — Every Tenant-Scoped Table

Every gradebook table MUST have an RLS policy. Iterate over every table and, for each, write one "reader" test that inserts a row in Tenant A, switches RLS context to Tenant B, and asserts the row is invisible.

| #    | Table                                                              | Write as A                         | Read as B                             | Expected | Pass/Fail |
| ---- | ------------------------------------------------------------------ | ---------------------------------- | ------------------------------------- | -------- | --------- |
| 2.1  | `grading_scales`                                                   | INSERT GradingScale                | `SELECT COUNT(*) FROM grading_scales` | 0        |           |
| 2.2  | `assessment_categories`                                            | INSERT AssessmentCategory          | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.3  | `assessments`                                                      | INSERT Assessment                  | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.4  | `grades`                                                           | INSERT Grade                       | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.5  | `grade_edit_audit`                                                 | INSERT GradeEditAudit              | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.6  | `period_grade_snapshots`                                           | INSERT PeriodGradeSnapshot         | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.7  | `year_group_grade_weights`                                         | INSERT YearGroupGradeWeight        | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.8  | `teacher_grading_weights`                                          | INSERT TeacherGradingWeight        | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.9  | `rubric_templates`                                                 | INSERT RubricTemplate              | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.10 | `curriculum_standards`                                             | INSERT CurriculumStandard          | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.11 | `assessment_standard_mappings`                                     | INSERT AssessmentStandardMapping   | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.12 | `competency_scales`                                                | INSERT CompetencyScale             | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.13 | `grade_curve_audit`                                                | INSERT GradeCurveAudit             | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.14 | `assessment_templates`                                             | INSERT AssessmentTemplate          | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.15 | `class_subject_grade_configs`                                      | INSERT ClassSubjectGradeConfig     | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.16 | `progress_reports`                                                 | INSERT ProgressReport              | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.17 | `progress_report_entries`                                          | INSERT ProgressReportEntry         | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.18 | `report_cards`                                                     | INSERT ReportCard                  | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.19 | `report_card_templates`                                            | INSERT ReportCardTemplate          | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.20 | `report_card_approvals`                                            | INSERT ReportCardApproval          | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.21 | `report_card_deliveries`                                           | INSERT ReportCardDelivery          | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.22 | `report_card_batch_jobs`                                           | INSERT ReportCardBatchJob          | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.23 | `report_card_subject_comments`                                     | INSERT ReportCardSubjectComment    | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.24 | `report_card_overall_comments`                                     | INSERT ReportCardOverallComment    | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.25 | `report_card_teacher_requests`                                     | INSERT ReportCardTeacherRequest    | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.26 | `report_card_tenant_settings`                                      | INSERT ReportCardTenantSettings    | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.27 | `grade_threshold_configs`                                          | INSERT GradeThresholdConfig        | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.28 | `report_card_custom_field_defs`                                    | INSERT ReportCardCustomFieldDef    | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.29 | `report_card_custom_field_values`                                  | INSERT ReportCardCustomFieldValue  | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.30 | `report_card_acknowledgments`                                      | INSERT ReportCardAcknowledgment    | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.31 | `report_card_verification_tokens`                                  | INSERT ReportCardVerificationToken | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.32 | `assessment_unlock_requests`                                       | INSERT AssessmentUnlockRequest     | `SELECT COUNT(*) ...`                 | 0        |           |
| 2.33 | `ai_grading_instructions` / `ai_grading_references` / `ai_queries` | INSERT row                         | SELECT as B                           | 0        |           |

For each table also verify:

- `ALTER TABLE X ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` are both set (`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = ?`).
- Policy name pattern: `{table}_tenant_isolation`.
- Policy USING + WITH CHECK clauses reference `current_setting('app.current_tenant_id')::uuid`.

---

## 3. Cross-Tenant Direct-API Hostile Matrix

For every mutating endpoint: create row in Tenant A; obtain id. Authenticate as Tenant B user. Hit endpoint with Tenant A's id. Expect 404 (tenant-scoped `findFirst` returns null) or 403.

| #    | Endpoint                                                              | Method                  | Expected                    | Pass/Fail |
| ---- | --------------------------------------------------------------------- | ----------------------- | --------------------------- | --------- |
| 3.1  | /api/v1/gradebook/assessments/{idA}                                   | GET                     | 404                         |           |
| 3.2  | /api/v1/gradebook/assessments/{idA}                                   | PATCH                   | 404                         |           |
| 3.3  | /api/v1/gradebook/assessments/{idA}                                   | DELETE                  | 404                         |           |
| 3.4  | /api/v1/gradebook/assessments/{idA}/status                            | PATCH                   | 404                         |           |
| 3.5  | /api/v1/gradebook/assessments/{idA}/grades                            | PUT                     | 404                         |           |
| 3.6  | /api/v1/gradebook/assessments/{idA}/unlock-request                    | POST                    | 404                         |           |
| 3.7  | /api/v1/gradebook/assessments/{idA}/curve                             | POST / DELETE           | 404                         |           |
| 3.8  | /api/v1/gradebook/assessment-categories/{idA}                         | GET / PATCH / DELETE    | 404                         |           |
| 3.9  | /api/v1/gradebook/teacher-grading-weights/{idA}                       | GET / PATCH / DELETE    | 404                         |           |
| 3.10 | /api/v1/gradebook/rubric-templates/{idA}                              | GET / PATCH / DELETE    | 404                         |           |
| 3.11 | /api/v1/gradebook/curriculum-standards/{idA}                          | DELETE                  | 404                         |           |
| 3.12 | /api/v1/gradebook/period-grades/{idA}/override                        | POST                    | 404                         |           |
| 3.13 | /api/v1/gradebook/unlock-requests/{idA}/review                        | POST                    | 404                         |           |
| 3.14 | /api/v1/gradebook/classes/{classIdA}/allocations                      | GET                     | 404                         |           |
| 3.15 | /api/v1/gradebook/classes/{classIdA}/results-matrix                   | GET / PUT               | 404                         |           |
| 3.16 | /api/v1/gradebook/students/{studentIdA}/period-grades                 | GET                     | 404                         |           |
| 3.17 | /api/v1/gradebook/students/{studentIdA}/gpa                           | GET                     | 404                         |           |
| 3.18 | /api/v1/gradebook/students/{studentIdA}/competency-snapshots          | GET                     | 404                         |           |
| 3.19 | /api/v1/gradebook/analytics/distribution/{assessmentIdA}              | GET                     | 404                         |           |
| 3.20 | /api/v1/transcripts/students/{studentIdA}                             | GET                     | 404                         |           |
| 3.21 | /api/v1/report-cards                                                  | GET `?student_id={idA}` | returns empty (RLS scoping) |           |
| 3.22 | /api/v1/parent/students/{studentIdA}/grades                           | GET                     | 404 (parent is B)           |           |
| 3.23 | /api/v1/parent/students/{studentIdA}/report-cards/{reportCardIdA}/pdf | GET                     | 404                         |           |

Also: for LIST endpoints, assert the response from Tenant B NEVER includes any Tenant A ids even in pagination edge cases.

---

## 4. Permission Matrix — Every Endpoint × Every Role

Roles: `admin`, `teacher`, `parent`, `student`, `finance`, `behaviour`.

Build a test fixture that issues JWTs for each role in Tenant A. For every endpoint, assert:

- Role with required permission → 2xx.
- Role without required permission → 403.

Illustrative sample (full matrix has 100+ endpoints × 6 roles = 600+ cells):

| Endpoint                                               | Method    | Required permission                 | admin              | teacher                | parent        | student | finance | behaviour |
| ------------------------------------------------------ | --------- | ----------------------------------- | ------------------ | ---------------------- | ------------- | ------- | ------- | --------- |
| /api/v1/gradebook/assessments                          | GET       | gradebook.view                      | 200                | 200                    | 403           | 403     | 403     | 403       |
| /api/v1/gradebook/assessments                          | POST      | gradebook.enter_grades              | 200                | 200                    | 403           | 403     | 403     | 403       |
| /api/v1/gradebook/assessments/{id}                     | DELETE    | gradebook.manage                    | 200                | 403                    | 403           | 403     | 403     | 403       |
| /api/v1/gradebook/assessments/{id}/curve               | POST      | gradebook.apply_curve               | 200                | 403                    | 403           | 403     | 403     | 403       |
| /api/v1/gradebook/period-grades/{id}/override          | POST      | gradebook.override_final_grade      | 200                | 403                    | 403           | 403     | 403     | 403       |
| /api/v1/gradebook/publishing/publish                   | POST      | gradebook.publish_grades_to_parents | 200                | 403                    | 403           | 403     | 403     | 403       |
| /api/v1/gradebook/publishing/publish-period            | POST      | gradebook.publish_grades_to_parents | 200                | 403                    | 403           | 403     | 403     | 403       |
| /api/v1/gradebook/teacher-grading-weights              | POST      | gradebook.manage_own_config         | 200                | 200                    | 403           | 403     | 403     | 403       |
| /api/v1/gradebook/teacher-grading-weights/{id}/review  | POST      | gradebook.approve_config            | 200                | 403                    | 403           | 403     | 403     | 403       |
| /api/v1/gradebook/assessment-categories/{id}/review    | POST      | gradebook.approve_config            | 200                | 403                    | 403           | 403     | 403     | 403       |
| /api/v1/gradebook/rubric-templates/{id}/review         | POST      | gradebook.approve_config            | 200                | 403                    | 403           | 403     | 403     | 403       |
| /api/v1/gradebook/curriculum-standards/{id}/review     | POST      | gradebook.approve_config            | 200                | 403                    | 403           | 403     | 403     | 403       |
| /api/v1/gradebook/unlock-requests                      | GET       | gradebook.approve_unlock            | 200                | 403                    | 403           | 403     | 403     | 403       |
| /api/v1/gradebook/unlock-requests/{id}/review          | POST      | gradebook.approve_unlock            | 200                | 403                    | 403           | 403     | 403     | 403       |
| /api/v1/gradebook/assessments/{id}/unlock-request      | POST      | gradebook.request_unlock            | 403                | 200                    | 403           | 403     | 403     | 403       |
| /api/v1/gradebook/import/validate                      | POST      | gradebook.manage                    | 200                | 403                    | 403           | 403     | 403     | 403       |
| /api/v1/gradebook/import/process                       | POST      | gradebook.manage                    | 200                | 403                    | 403           | 403     | 403     | 403       |
| /api/v1/gradebook/weight-config/subject-weights        | GET / PUT | gradebook.manage                    | 200                | 403                    | 403           | 403     | 403     | 403       |
| /api/v1/gradebook/analytics/teacher-consistency        | GET       | gradebook.view_analytics            | 200                | 200 if role carries it | 403           | 403     | 403     | 403       |
| /api/v1/gradebook/ai/grading-instructions/{id}/approve | POST      | gradebook.approve_ai_grading        | 200                | 403                    | 403           | 403     | 403     | 403       |
| /api/v1/gradebook/ai/query                             | POST      | gradebook.view_analytics            | 200                | 403 (by default)       | 403           | 403     | 403     | 403       |
| /api/v1/parent/students/{id}/grades                    | GET       | parent.view_grades                  | 403                | 403                    | 200 if linked | 403     | 403     | 403       |
| /api/v1/parent/students/{id}/transcript/pdf            | GET       | parent.view_transcripts             | 403                | 403                    | 200 if linked | 403     | 403     | 403       |
| /api/v1/transcripts/students/{id}                      | GET       | transcripts.generate                | 200 if role has it | 200 if role has it     | 403           | 403     | 403     | 403       |
| /api/v1/report-cards                                   | GET       | gradebook.view / report_cards.view  | 200                | 200 (filtered)         | 403           | 403     | 403     | 403       |
| /api/v1/report-cards/{id}/approve                      | PATCH     | report_cards.approve                | 200                | 403                    | 403           | 403     | 403     | 403       |

This section is the MASTER contract matrix. Implement as a parameterised Jest suite.

---

## 5. Zod Validation — Boundary Cases

For each schema (cf. `packages/shared/src/schemas/gradebook.schema.ts`) verify each documented rule.

| #    | Schema                             | Case                                                   | Expected                                                          | Pass/Fail |
| ---- | ---------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- | --------- |
| 5.1  | `createAssessmentSchema`           | Missing `title`                                        | 422                                                               |           |
| 5.2  | `createAssessmentSchema`           | `max_score = 0`                                        | 422                                                               |           |
| 5.3  | `createAssessmentSchema`           | `max_score = 1000.01` (over cap)                       | 422                                                               |           |
| 5.4  | `createAssessmentSchema`           | `grading_deadline < due_date`                          | 422                                                               |           |
| 5.5  | `createAssessmentSchema`           | `counts_toward_report_card` non-boolean                | 422                                                               |           |
| 5.6  | `updateAssessmentSchema`           | Empty body                                             | 200 (no-op) or 422 depending on `.refine(Object.keys.length > 0)` |           |
| 5.7  | `transitionAssessmentStatusSchema` | Invalid status value                                   | 422                                                               |           |
| 5.8  | `bulkUpsertGradesSchema`           | `raw_score > max_score`                                | 422 or business-logic 400                                         |           |
| 5.9  | `bulkUpsertGradesSchema`           | `is_missing = true AND raw_score != null`              | 422                                                               |           |
| 5.10 | `bulkUpsertGradesSchema`           | Duplicate student_id in array                          | 422 or 409                                                        |           |
| 5.11 | `createAssessmentCategorySchema`   | `name.length = 1`                                      | 422                                                               |           |
| 5.12 | `createAssessmentCategorySchema`   | `default_weight = -1`                                  | 422                                                               |           |
| 5.13 | `createTeacherGradingWeightSchema` | Weights sum = 99.99                                    | 422 (within tolerance rejected)                                   |           |
| 5.14 | `createTeacherGradingWeightSchema` | Weights sum = 100.01                                   | 422                                                               |           |
| 5.15 | `createTeacherGradingWeightSchema` | Empty weights array                                    | 422                                                               |           |
| 5.16 | `createUnlockRequestSchema`        | `reason.length < 10`                                   | 422                                                               |           |
| 5.17 | `reviewConfigSchema`               | Missing `rejection_reason` when `action = 'rejected'`  | 422                                                               |           |
| 5.18 | `reviewConfigSchema`               | `rejection_reason` present when `action = 'approved'`  | allowed (ignored) or 422 — verify                                 |           |
| 5.19 | `computePeriodGradesSchema`        | Missing `academic_period_id`                           | 422                                                               |           |
| 5.20 | `overridePeriodGradeSchema`        | Both `overridden_value` and `override_reason` required | 422 if either missing                                             |           |
| 5.21 | `crossSubjectGradesQuerySchema`    | Invalid UUID                                           | 422                                                               |           |
| 5.22 | `upsertSubjectWeightsSchema`       | Weights sum ≠ 100 per year level                       | 422                                                               |           |
| 5.23 | `saveResultsMatrixSchema`          | Grades containing student not in class                 | 400 (business)                                                    |           |
| 5.24 | `importProcessSchema`              | Unknown student_id                                     | 400                                                               |           |
| 5.25 | `copyYearGroupGradeWeightsSchema`  | Source and target year group identical                 | 422                                                               |           |
| 5.26 | `propagateWeightsSchema`           | Invalid strategy value                                 | 422                                                               |           |
| 5.27 | `categoryWeightJsonSchema`         | Malformed JSON                                         | 422                                                               |           |
| 5.28 | `generateReportCardsSchema`        | Empty student_ids                                      | 422                                                               |           |
| 5.29 | `bulkDeleteReportCardsSchema`      | > 1000 ids                                             | 422                                                               |           |
| 5.30 | Any endpoint                       | JSON body over 10 MB                                   | 413                                                               |           |

---

## 6. State-Machine Transitions — Valid & Invalid

For each entity with a state field, test every valid transition AND every invalid one.

### 6.A. Assessment status

Valid: `draft → open`, `open → closed`, `closed → submitted_locked`, `submitted_locked → unlock_requested`, `unlock_requested → reopened` (on approve), `unlock_requested → submitted_locked` (on reject), `reopened → submitted_locked`, `submitted_locked → final_locked`, `* → cancelled` (except final_locked).

| #    | From                                          | To               | Actor               | Expected                                           | Pass/Fail |
| ---- | --------------------------------------------- | ---------------- | ------------------- | -------------------------------------------------- | --------- |
| 6.1  | draft                                         | open             | teacher (owner)     | 200                                                |           |
| 6.2  | draft                                         | submitted_locked | teacher             | 422 INVALID_TRANSITION                             |           |
| 6.3  | open                                          | closed           | teacher             | 200                                                |           |
| 6.4  | open                                          | draft            | teacher             | 422                                                |           |
| 6.5  | closed                                        | submitted_locked | teacher             | 200                                                |           |
| 6.6  | submitted_locked                              | unlock_requested | teacher             | 200 (via unlock request, not direct status change) |           |
| 6.7  | submitted_locked                              | reopened         | direct PATCH        | 422 (must go through unlock request)               |           |
| 6.8  | unlock_requested                              | reopened         | admin approve       | 200                                                |           |
| 6.9  | unlock_requested                              | submitted_locked | admin reject        | 200                                                |           |
| 6.10 | reopened                                      | submitted_locked | teacher             | 200                                                |           |
| 6.11 | submitted_locked                              | final_locked     | admin               | 200                                                |           |
| 6.12 | final_locked                                  | reopened         | any                 | 422                                                |           |
| 6.13 | \* any                                        | cancelled        | teacher (owner)     | 200 if not final_locked; 422 otherwise             |           |
| 6.14 | cancelled                                     | draft            | teacher             | 200 (only if no grades entered)                    |           |
| 6.15 | teacher transitions someone else's assessment | —                | teacher (non-owner) | 403                                                |           |
| 6.16 | admin transitions any                         | —                | admin               | 200                                                |           |

### 6.B. Config approval status (categories / weights / rubrics / standards)

Valid: `draft → pending_approval`, `pending_approval → approved | rejected`, `rejected → draft` (withdraw/edit), `approved → archived`.

| #    | From             | To               | Actor          | Expected            | Pass/Fail |
| ---- | ---------------- | ---------------- | -------------- | ------------------- | --------- |
| 6.17 | draft            | pending_approval | submitter      | 200                 |           |
| 6.18 | draft            | approved         | submitter      | 422                 |           |
| 6.19 | pending_approval | approved         | admin          | 200                 |           |
| 6.20 | pending_approval | rejected         | admin          | 200 (with reason)   |           |
| 6.21 | pending_approval | approved         | same submitter | 422 (self-approval) |           |
| 6.22 | approved         | archived         | admin          | 200                 |           |
| 6.23 | approved         | pending_approval | anyone         | 422                 |           |

### 6.C. Unlock request status

| #    | From     | To       | Actor | Expected | Pass/Fail |
| ---- | -------- | -------- | ----- | -------- | --------- |
| 6.24 | pending  | approved | admin | 200      |           |
| 6.25 | pending  | rejected | admin | 200      |           |
| 6.26 | approved | pending  | any   | 422      |           |
| 6.27 | rejected | pending  | any   | 422      |           |

### 6.D. Report card status

| #    | From      | To        | Actor                            | Expected | Pass/Fail |
| ---- | --------- | --------- | -------------------------------- | -------- | --------- |
| 6.28 | draft     | published | `gradebook.publish_report_cards` | 200      |           |
| 6.29 | published | archived  | admin                            | 200      |           |
| 6.30 | archived  | published | admin                            | 422      |           |
| 6.31 | published | draft     | anyone                           | 422      |           |

---

## 7. Unlock Request Lifecycle

| #    | Scenario                                                      | Expected                                                                       | Pass/Fail |
| ---- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------- |
| 7.1  | Teacher POSTs unlock request for owned, submitted_locked asmt | 201. Row with `status=pending`, `requested_by_user_id=teacher.id`.             |           |
| 7.2  | Second POST while pending                                     | 409 `UNLOCK_REQUEST_PENDING`.                                                  |           |
| 7.3  | Admin approves                                                | Unlock request status → approved. Assessment status → reopened.                |           |
| 7.4  | Assessment in unlock_requested state — teacher edits grades   | 403 `ASSESSMENT_LOCKED` (only reopened allows edit).                           |           |
| 7.5  | Admin rejects                                                 | Unlock request status → rejected. Assessment status stays submitted_locked.    |           |
| 7.6  | Teacher can immediately request unlock again                  | 201 OK (pending set cleared).                                                  |           |
| 7.7  | Teacher not owner attempts unlock request                     | 403.                                                                           |           |
| 7.8  | Admin reviews own request                                     | If admin also requested, same user cannot review. 422 `SELF_REVIEW_FORBIDDEN`. |           |
| 7.9  | Reason length exactly 10                                      | 200.                                                                           |           |
| 7.10 | Reason length 9                                               | 422.                                                                           |           |

---

## 8. Config Approval Lifecycle (Categories / Weights / Rubrics / Standards)

Repeat same approval flow for all four entities.

| #    | Scenario                                                    | Expected                                                              | Pass/Fail |
| ---- | ----------------------------------------------------------- | --------------------------------------------------------------------- | --------- |
| 8.1  | Teacher creates draft category                              | `status=draft`, `created_by = teacher.id`                             |           |
| 8.2  | Teacher submits draft                                       | status → pending_approval, submitted_at = now()                       |           |
| 8.3  | Admin approves                                              | status → approved, reviewed_by/at set                                 |           |
| 8.4  | Admin rejects with reason                                   | status → rejected, rejection_reason set                               |           |
| 8.5  | Teacher resubmits rejected                                  | status → pending_approval, rejection_reason NULL, reviewed_by/at NULL |           |
| 8.6  | Duplicate submission                                        | 409                                                                   |           |
| 8.7  | Cross-user edit of pending item                             | 403                                                                   |           |
| 8.8  | Self-approval attempt                                       | 403 `SELF_REVIEW_FORBIDDEN`                                           |           |
| 8.9  | Weights: same (teacher, subject, year, period) second entry | 409                                                                   |           |
| 8.10 | Rubric: approve empty criteria                              | 422                                                                   |           |
| 8.11 | Standard: approve missing code                              | 422                                                                   |           |
| 8.12 | Admin approves → event emitted                              | See §20                                                               |           |

---

## 9. Sum-to-100 Invariant on Weights

| #   | Scenario                                                  | Expected                                                       | Pass/Fail |
| --- | --------------------------------------------------------- | -------------------------------------------------------------- | --------- |
| 9.1 | Create with weights [50, 30, 20]                          | 200                                                            |           |
| 9.2 | Create with weights [50, 30, 20.01]                       | 422                                                            |           |
| 9.3 | Create with weights [50, 30, 19.99]                       | 422                                                            |           |
| 9.4 | Update to [50, 30, 20.005]                                | 200 (within 0.01 tolerance) or 422 — document actual behaviour |           |
| 9.5 | Subject weights propagation preserves per-class overrides | 200, count returned                                            |           |

---

## 10. Period Grade Computation Correctness

| #     | Scenario                                                            | Expected                                                                                                    | Pass/Fail |
| ----- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------- |
| 10.1  | Seed 3 assessments × 5 students, known grades, weights [50, 30, 20] | Computed value = Σ(score_i × weight_i / max_i) expressed on 100-scale.                                      |           |
| 10.2  | Missing grade for one assessment                                    | Student's computed value excludes missing weight; recomputed rate = sum of present weights.                 |           |
| 10.3  | All missing                                                         | Computed value = NULL, not NaN.                                                                             |           |
| 10.4  | Recompute idempotence                                               | Running compute twice yields same result.                                                                   |           |
| 10.5  | Override preserved                                                  | After recompute, `overridden_value` unchanged.                                                              |           |
| 10.6  | Grade edited after compute                                          | Re-compute reflects new value.                                                                              |           |
| 10.7  | Tolerance                                                           | ±0.01 on computed_value.                                                                                    |           |
| 10.8  | Cross-subject aggregation                                           | `/period-grades/cross-subject` returns correct per-subject averages consistent with raw data.               |           |
| 10.9  | GPA computation                                                     | `/students/{id}/gpa` = mean of letter-grade-to-GPA mapping over all computed period grades in current year. |           |
| 10.10 | Decimal precision                                                   | Stored as NUMERIC(5,2). No floating-point drift.                                                            |           |

---

## 11. Grade Curve — Audit & Idempotency

| #    | Scenario                                             | Expected                                                                                              | Pass/Fail |
| ---- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------- |
| 11.1 | Apply linear curve (add 5)                           | Every grade raw_score increased by 5, capped at max_score. Audit row created.                         |           |
| 11.2 | Apply twice                                          | Second application stacks (grades bumped additional 5) OR idempotent guard rejects — document actual. |           |
| 11.3 | Remove curve                                         | raw_score restored to original. Audit row appended with `method='reverted'`.                          |           |
| 11.4 | Curve on published grades                            | Rejected 422 "cannot curve published grades" — or allowed with re-publish banner.                     |           |
| 11.5 | Curve audit contains method, params, user, timestamp | Verified.                                                                                             |           |

---

## 12. Grade Publishing — Readiness & Side-Effects

| #    | Scenario                                              | Expected                                                                                                          | Pass/Fail |
| ---- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | Readiness with 0 locked assessments                   | `ready=false`, diagnostics `["no locked assessments"]`.                                                           |           |
| 12.2 | Readiness with approved weights but draft assessments | `ready=false`.                                                                                                    |           |
| 12.3 | Publish period                                        | Every non-cancelled assessment in period has `grades_published_at` set. `grades_published_by_user_id = admin.id`. |           |
| 12.4 | Republish (idempotent)                                | No new assessments affected. Response `{ already_published: N }`.                                                 |           |
| 12.5 | Selected students                                     | Only those students' grades flagged. `WHERE student_id IN (...)`.                                                 |           |
| 12.6 | Event emission                                        | `parent:grades-published` event fires (see §20).                                                                  |           |
| 12.7 | Parent read after publish                             | `/api/v1/parent/students/{id}/grades` returns the new period.                                                     |           |
| 12.8 | Parent read before publish                            | Period excluded.                                                                                                  |           |

---

## 13. Rubric Grading Round-Trip

| #    | Scenario                    | Expected                                                                 | Pass/Fail |
| ---- | --------------------------- | ------------------------------------------------------------------------ | --------- |
| 13.1 | Attach rubric to assessment | Assessment `rubric_template_id` set.                                     |           |
| 13.2 | Submit per-criterion score  | `POST /grades/{id}/rubric-grades` stores rubric_score_json on the Grade. |           |
| 13.3 | Aggregate                   | `raw_score = SUM(level_score × criterion_weight)` auto-computed.         |           |
| 13.4 | Invalid level               | 422.                                                                     |           |
| 13.5 | Criterion out of rubric     | 422.                                                                     |           |

---

## 14. Curriculum Standards Import

| #    | Scenario                          | Expected                                                | Pass/Fail |
| ---- | --------------------------------- | ------------------------------------------------------- | --------- |
| 14.1 | Import CSV with valid rows        | 200. Rows created with status=draft.                    |           |
| 14.2 | Import with duplicates            | Skip duplicates; return `{ imported: N, skipped: M }`.  |           |
| 14.3 | Import with malformed row         | 400 with issue list per row.                            |           |
| 14.4 | Subject / year_group auto-resolve | If codes reference unknown subjects/years, row flagged. |           |

---

## 15. Bulk Import — Contract & Idempotency

| #    | Scenario                           | Expected                                                                                                    | Pass/Fail |
| ---- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------- |
| 15.1 | Upload valid XLSX                  | `POST /validate` returns `{ valid: true, issues: [] }`.                                                     |           |
| 15.2 | Process                            | Returns `{ job_id }`. Job enqueued to BULK_IMPORT_PROCESS_JOB.                                              |           |
| 15.3 | Worker completes                   | Grades persisted. Audit trail: each grade has edited_by_user_id = admin, edited_at = now.                   |           |
| 15.4 | Same file re-uploaded              | Idempotent: existing grades updated with new values OR a dedup token prevents re-import. Document behavior. |           |
| 15.5 | Oversized file (> 50 MB)           | 413.                                                                                                        |           |
| 15.6 | Malicious content (zip bomb, etc.) | Rejected at parse. See security spec §§.                                                                    |           |

---

## 16. Concurrency — Parallel Grade Writes

| #    | Scenario                                                                                | Expected                                                                                                        | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1 | Two teacher sessions PUT grades for same assessment simultaneously (different students) | Both succeed; no row corruption.                                                                                |           |
| 16.2 | Same student, two parallel PUTs with different scores                                   | Last-write-wins or explicit conflict (document). Invariant: `edited_at` monotonically increases; no lost audit. |           |
| 16.3 | 50 concurrent PUTs with 10 students each                                                | All succeed; total row count per assessment = number of distinct students.                                      |           |
| 16.4 | Sequence number generation (if applicable) under concurrency                            | No duplicates.                                                                                                  |           |

---

## 17. Concurrency — Simultaneous Lock Attempts

| #    | Scenario                                                    | Expected                                              | Pass/Fail |
| ---- | ----------------------------------------------------------- | ----------------------------------------------------- | --------- |
| 17.1 | Two admins POST final-lock on same assessment concurrently  | One succeeds, other gets 409 `ALREADY_LOCKED`.        |           |
| 17.2 | Teacher POST submitted_locked while admin POST final_locked | One wins; other 422 invalid transition (state guard). |           |

---

## 18. Concurrency — Duplicate Unlock Request

| #    | Scenario                                         | Expected            | Pass/Fail |
| ---- | ------------------------------------------------ | ------------------- | --------- |
| 18.1 | Two parallel unlock requests for same assessment | One 201, other 409. |           |
| 18.2 | Two parallel approvals for same pending request  | One 200, other 409. |           |

---

## 19. PDF Byte Structural Checks (pdf-parse)

| #    | Artifact               | Expected                                                                                                                  | Pass/Fail |
| ---- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------- |
| 19.1 | Report card PDF        | `pdf-parse` extracts text containing student name, school name, every period grade, teacher comments, principal comments. |           |
| 19.2 | Transcript PDF         | Contains every historical grade; GPA; signature line.                                                                     |           |
| 19.3 | Results matrix PDF     | Every student row × every assessment column; color coding preserved as extractable hint text.                             |           |
| 19.4 | Arabic report card PDF | RTL text present; Arabic numerals if configured.                                                                          |           |
| 19.5 | PDF font embedding     | Fonts embedded so the PDF renders the same on every machine.                                                              |           |
| 19.6 | Metadata               | `/Title`, `/Author`, `/Producer` set.                                                                                     |           |

---

## 20. Event Emission — Communications / Notifications

| #     | Trigger                   | Expected event                                                                            | Pass/Fail |
| ----- | ------------------------- | ----------------------------------------------------------------------------------------- | --------- |
| 20.1  | Admin approves config     | `gradebook:config-approved` — to submitter's inbox.                                       |           |
| 20.2  | Admin rejects config      | `gradebook:config-rejected` — with reason.                                                |           |
| 20.3  | Admin approves unlock     | `gradebook:unlock-approved` — to teacher.                                                 |           |
| 20.4  | Admin rejects unlock      | `gradebook:unlock-rejected`.                                                              |           |
| 20.5  | Grades published          | `parent:grades-published` — to every parent of every student in period.                   |           |
| 20.6  | Report card published     | `parent:report-card-ready` — to parents.                                                  |           |
| 20.7  | Unlock request created    | `gradebook:unlock-requested` — to every admin/principal.                                  |           |
| 20.8  | Progress report sent      | `parent:progress-report` — to parents.                                                    |           |
| 20.9  | Risk detection job result | `wellbeing:at-risk-student` — to pastoral / early warning module.                         |           |
| 20.10 | Event payload schema      | Each event has `{ tenant_id, recipient_user_id, entity_id, kind, timestamp }` at minimum. |           |

---

## 21. GDPR DSAR Traversal

| #    | Scenario             | Expected                                                                                                                         | Pass/Fail |
| ---- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 21.1 | Student DSAR request | Export JSON includes: Assessment ids student is graded on, raw_scores, comments, period grade snapshots, report cards, ack logs. |           |
| 21.2 | Student redaction    | Soft-delete keeps `tenant_id`, nulls PII on their Grade rows. Computed grades adjusted OR flagged redacted.                      |           |
| 21.3 | Teacher DSAR         | Export includes teacher's own weight submissions, rubric templates, standards, audit actions.                                    |           |
| 21.4 | Parent DSAR          | Export includes parent's ack logs.                                                                                               |           |
| 21.5 | Cross-tenant DSAR    | Never returns other tenant's data.                                                                                               |           |

---

## 22. Encrypted Fields — AI Grading & Verification Tokens

| #    | Field                                 | Expectation                                                                                 | Pass/Fail |
| ---- | ------------------------------------- | ------------------------------------------------------------------------------------------- | --------- |
| 22.1 | AI API key for `AiModule` integration | Stored in AWS Secrets Manager, not DB. Never returned in API responses.                     |           |
| 22.2 | `ReportCardVerificationToken.token`   | Random 32+ byte token. Hashed at rest (hash column + compare via `crypto.timingSafeEqual`). |           |
| 22.3 | API responses showing the token       | Only on creation (single-use). Subsequent GETs do NOT echo the token.                       |           |
| 22.4 | Expired tokens                        | Rejected on verification.                                                                   |           |
| 22.5 | Revoke token                          | Marks row revoked; further use rejected.                                                    |           |

---

## 23. Analytics Contract Checks

| #    | Endpoint                                           | Contract                                                                                      | Pass/Fail |
| ---- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------- |
| 23.1 | `/gradebook/analytics/distribution/{assessmentId}` | Response: `{ buckets: [{ label, count }], total, mean, median, stdDev, passRate, min, max }`. |           |
| 23.2 | `/gradebook/analytics/period-distribution`         | Response: same shape for aggregate period.                                                    |           |
| 23.3 | `/gradebook/analytics/students/{id}/trend`         | Array of `{ assessment_id, date, score, max, percentile }`. Chronological.                    |           |
| 23.4 | `/gradebook/analytics/classes/{id}/trend`          | Per-class time series.                                                                        |           |
| 23.5 | `/gradebook/analytics/teacher-consistency`         | Array per teacher: `{ user_id, avg, std_dev, anomalies }`.                                    |           |
| 23.6 | `/gradebook/analytics/benchmark`                   | Returns tenant/school/historical trio.                                                        |           |
| 23.7 | All responses tenant-scoped                        | No cross-tenant aggregation unless platform-level benchmark feature with explicit consent.    |           |

---

## 24. Transcript Generation — Cross-Year Data

| #    | Scenario                     | Expected                                                                                          | Pass/Fail |
| ---- | ---------------------------- | ------------------------------------------------------------------------------------------------- | --------- |
| 24.1 | Student with 3 years of data | Transcript shows all 3 years, chronological.                                                      |           |
| 24.2 | Transcript reproducibility   | Same student generates byte-identical PDF (modulo timestamp) — or deterministic content at least. |           |
| 24.3 | Permission scope             | `transcripts.generate` + parent `parent.view_transcripts`.                                        |           |
| 24.4 | Cross-year RLS               | Only own tenant.                                                                                  |           |

---

## 25. Data Invariants — Global

| #     | Invariant                                                                                       | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------- | --------- |
| 25.1  | Every Assessment row has non-null `tenant_id`.                                                  |           |
| 25.2  | Every Grade row's `assessment.tenant_id = grade.tenant_id`.                                     |           |
| 25.3  | Every PeriodGradeSnapshot row's class + subject + period are all same tenant.                   |           |
| 25.4  | No two `(student_id, assessment_id)` grade rows.                                                |           |
| 25.5  | No two `(teacher, subject, year, period)` TeacherGradingWeight.                                 |           |
| 25.6  | `AssessmentUnlockRequest.status='pending'` → at most one per assessment.                        |           |
| 25.7  | `AssessmentCategory.status='approved'` + `reviewed_by IS NOT NULL` + `reviewed_at IS NOT NULL`. |           |
| 25.8  | `grades.edited_at ≥ grades.created_at`.                                                         |           |
| 25.9  | `assessment.grading_deadline ≥ assessment.due_date` when both are set.                          |           |
| 25.10 | `period_grade_snapshot.overridden_value != NULL` → `override_actor_user_id != NULL`.            |           |
| 25.11 | Approved config items have non-null `reviewed_by` and `reviewed_at`.                            |           |
| 25.12 | Rejected config items have non-null `rejection_reason`.                                         |           |
| 25.13 | Every RubricTemplate's `max_score` = sum of top-level scores across criteria.                   |           |
| 25.14 | No orphan `AssessmentStandardMapping`.                                                          |           |
| 25.15 | No orphan `Grade` (FK to Assessment).                                                           |           |
| 25.16 | No orphan `ReportCardOverallComment` or SubjectComment.                                         |           |

---

## 26. Negative Authorization Tests

Every mutating endpoint — invoke without any JWT and with a forged JWT. Expect 401 or 403 respectively. Every read endpoint — same.

| #    | Endpoint                             | No JWT | Forged JWT | Expected | Pass/Fail |
| ---- | ------------------------------------ | ------ | ---------- | -------- | --------- |
| 26.1 | /api/v1/gradebook/assessments        | ✓      | ✓          | 401/403  |           |
| 26.2 | /api/v1/gradebook/assessments POST   | ✓      | ✓          | 401/403  |           |
| 26.3 | /api/v1/gradebook/publishing/publish | ✓      | ✓          | 401/403  |           |
| 26.4 | /api/v1/parent/students/{id}/grades  | ✓      | ✓          | 401/403  |           |

(Expand to all endpoints via parameterised test.)

---

## 27. Observations from Walkthrough

1. **`gradebook.manage_own_config` is NOT enforced uniformly** — `AssessmentCategoriesController.create` requires `gradebook.manage`, yet teachers need to create their own categories. Either teachers must have `manage` (broad) or endpoint must accept `manage_own_config`. Ambiguity flagged.
2. **Self-approval check** — not explicitly asserted in code. Re-verify `reviewConfigService` and `UnlockRequestService.review` contain the `submitted_by !== reviewed_by` guard.
3. **Idempotency of publishing** — documentation promises idempotent, code behavior not verified; test this explicitly.
4. **Curve stacking** — if admin applies linear curve twice, does it stack? Document expected behavior, then test.
5. **`FORCE ROW LEVEL SECURITY`** — verify every gradebook table has this clause, not just RLS enabled.
6. **`assessment_standard_mappings`** cross-tenant: if mapping points to assessment in tenant A, but standard in tenant B (bug scenario) — does RLS catch? Test.
7. **Parent hostile studentId substitution** — verify `ParentGradebookService` joins on `student_parent` relationship BEFORE returning any data.
8. **Transcript PDF** — ensure historical data from deprecated academic years is still RLS-scoped correctly.
9. **AI query injection** — NL query executes against DB; ensure strict read-only transaction + whitelisted tables.

---

## 28. Sign-Off

| Reviewer | Date | Passing | Failing | Notes |
| -------- | ---- | ------- | ------- | ----- |
|          |      |         |         |       |

Integration leg passes when every matrix cell in §§2–6 is green, every state transition in §6 behaves as specified, and every invariant in §25 holds.

---
