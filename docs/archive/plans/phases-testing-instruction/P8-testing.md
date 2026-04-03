# Phase 8 Testing Instructions — Audit Logs, Compliance, Imports, Reports & Approval Callbacks

---

## Overview

This document covers all tests required to validate Phase 8 deliverables. Tests are co-located with source files unless otherwise noted. Integration tests live in `apps/api/test/`. Follow the naming conventions in `.claude/rules/testing.md`.

**Scope of tables requiring RLS tests:** `audit_logs` (dual policy: nullable tenant_id), `compliance_requests`, `import_jobs`

---

## Section 1 — Unit Tests

Unit tests use Jest with mocked dependencies (mock `PrismaService`, `S3Service`, `Queue`, and external service clients). Test files are co-located with their service files.

---

### 1.1 `AuditLogService`

**File:** `apps/api/src/modules/audit-log/audit-log.service.spec.ts`

#### `write()`

| Test                                                  | Input                                                                                                                                                      | Expected Output                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| should create an audit log entry with all fields      | `tenantId='uuid-a'`, `actorUserId='uuid-b'`, `entityType='student'`, `entityId='uuid-c'`, `action='create'`, `metadata={foo:'bar'}`, `ipAddress='1.2.3.4'` | `prisma.auditLog.create()` called with matching data    |
| should accept null tenantId for platform-level events | `tenantId=null`, `actorUserId='uuid-b'`, `entityType='tenant'`                                                                                             | `create()` called with `tenant_id: undefined`           |
| should accept null actorUserId for system events      | `tenantId='uuid-a'`, `actorUserId=null`                                                                                                                    | `create()` called with `actor_user_id: undefined`       |
| should accept null entityId                           | `entityId=null`                                                                                                                                            | `create()` called with `entity_id: undefined`           |
| should never throw on database errors                 | `prisma.auditLog.create` rejects with `PrismaClientKnownRequestError`                                                                                      | Method resolves (no exception), `logger.error()` called |
| should never throw on unknown errors                  | `prisma.auditLog.create` rejects with generic `Error`                                                                                                      | Method resolves, `logger.error()` called                |

#### `list()`

| Test                                                     | Input                                                         | Expected Output                                               |
| -------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| should return paginated audit logs for a tenant          | `tenantId='uuid-a'`, `{page:1, pageSize:20}`                  | Returns `{data: [...], meta: {page:1, pageSize:20, total:N}}` |
| should apply entity_type filter                          | `{entity_type:'student'}`                                     | `where` includes `entity_type: 'student'`                     |
| should apply actor_user_id filter                        | `{actor_user_id:'uuid-x'}`                                    | `where` includes `actor_user_id: 'uuid-x'`                    |
| should apply action filter                               | `{action:'create'}`                                           | `where` includes `action: 'create'`                           |
| should apply date range filter with start_date only      | `{start_date:'2026-01-01'}`                                   | `where.created_at` includes `gte`                             |
| should apply date range filter with end_date only        | `{end_date:'2026-12-31'}`                                     | `where.created_at` includes `lte`                             |
| should apply date range filter with both dates           | `{start_date:'2026-01-01', end_date:'2026-06-30'}`            | `where.created_at` includes both `gte` and `lte`              |
| should include actor name in response when actor exists  | Actor user has `first_name='John'`, `last_name='Doe'`         | `data[0].actor_name` equals `'John Doe'`                      |
| should return actor_name as undefined when actor is null | `actor` relation is null                                      | `data[0].actor_name` is `undefined`                           |
| should format created_at as ISO string                   | Audit log has `created_at = new Date('2026-03-15T10:00:00Z')` | `data[0].created_at` equals `'2026-03-15T10:00:00.000Z'`      |

#### `listPlatform()`

| Test                                                       | Input                                                                   | Expected Output                                                         |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| should return paginated audit logs across all tenants      | `{page:1, pageSize:20}`                                                 | Returns all tenant logs with `meta.total` reflecting cross-tenant count |
| should apply tenant_id filter when provided                | `{tenant_id:'uuid-a'}`                                                  | `where` includes `tenant_id: 'uuid-a'`                                  |
| should include tenant_name in response                     | Tenant has `name='Al Noor School'`                                      | `data[0].tenant_name` equals `'Al Noor School'`                         |
| should return tenant_name as undefined when tenant is null | `tenant` relation is null (platform-level log)                          | `data[0].tenant_name` is `undefined`                                    |
| should apply all filter combinations                       | `{entity_type, actor_user_id, action, start_date, end_date, tenant_id}` | All filters applied to `where` clause                                   |

#### `track()`

| Test                                                 | Input                                                                     | Expected Output                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| should call write with entity_type from parameter    | `entityType='announcement'`, `entityId='uuid-x'`, `eventType='page_view'` | `write()` called with `entityType='announcement'`, `entityId='uuid-x'`, `action='page_view'` |
| should default entity_type to 'engagement' when null | `entityType=null`                                                         | `write()` called with `entityType='engagement'`                                              |
| should pass tracking: true in metadata               | Any input                                                                 | `write()` called with `metadata = { tracking: true }`                                        |

---

### 1.2 `ComplianceService`

**File:** `apps/api/src/modules/compliance/compliance.service.spec.ts`

#### `create()`

| Test                                                             | Input                                                                        | Expected Output                                                            |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| should create a compliance request for a valid parent subject    | `{request_type:'access_export', subject_type:'parent', subject_id:'uuid-p'}` | Record created with `status='submitted'`, includes `requested_by` relation |
| should create a compliance request for a valid student subject   | `{subject_type:'student', subject_id:'uuid-s'}`                              | Record created                                                             |
| should create a compliance request for a valid household subject | `{subject_type:'household', subject_id:'uuid-h'}`                            | Record created                                                             |
| should create a compliance request for a valid user subject      | `{subject_type:'user', subject_id:'uuid-u'}`                                 | Record created (user lookup without tenant_id)                             |
| should throw SUBJECT_NOT_FOUND when parent does not exist        | `subject_id='nonexistent'`                                                   | Throws 404 `SUBJECT_NOT_FOUND`                                             |
| should throw SUBJECT_NOT_FOUND when student does not exist       | `subject_id='nonexistent'`                                                   | Throws 404 `SUBJECT_NOT_FOUND`                                             |
| should throw DUPLICATE_REQUEST when active request exists        | Existing request with `status='submitted'` for same subject                  | Throws 409 `DUPLICATE_REQUEST`                                             |
| should allow creation when prior request is completed            | Existing request with `status='completed'` for same subject                  | New record created                                                         |
| should allow creation when prior request is rejected             | Existing request with `status='rejected'` for same subject                   | New record created                                                         |

#### `list()`

| Test                                        | Input                   | Expected Output                                                           |
| ------------------------------------------- | ----------------------- | ------------------------------------------------------------------------- |
| should return paginated compliance requests | `{page:1, pageSize:20}` | Returns `{data: [...], meta: {page, pageSize, total}}`                    |
| should filter by status when provided       | `{status:'submitted'}`  | `where` includes `status: 'submitted'`                                    |
| should include requested_by user details    | Any request             | Each item includes `requested_by` with `id, first_name, last_name, email` |

#### `get()`

| Test                                                       | Input                               | Expected Output                           |
| ---------------------------------------------------------- | ----------------------------------- | ----------------------------------------- |
| should return a single compliance request                  | Valid `requestId`                   | Full request with `requested_by` relation |
| should throw COMPLIANCE_REQUEST_NOT_FOUND for invalid ID   | Non-existent UUID                   | Throws 404                                |
| should throw COMPLIANCE_REQUEST_NOT_FOUND for wrong tenant | Request belongs to different tenant | Throws 404                                |

#### `classify()`

| Test                                                    | Input                                                                               | Expected Output                                                |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| should transition submitted to classified               | Request `status='submitted'`, `{classification:'anonymise', decision_notes:'test'}` | Updated to `status='classified'`, `classification='anonymise'` |
| should throw INVALID_STATUS when not in submitted state | Request `status='classified'`                                                       | Throws 400 `INVALID_STATUS`                                    |
| should throw INVALID_STATUS when already approved       | Request `status='approved'`                                                         | Throws 400                                                     |
| should throw INVALID_STATUS when completed              | Request `status='completed'`                                                        | Throws 400                                                     |
| should set decision_notes to null when not provided     | `{classification:'retain'}` without decision_notes                                  | `decision_notes` set to `null`                                 |

#### `approve()`

| Test                                                      | Input                         | Expected Output                |
| --------------------------------------------------------- | ----------------------------- | ------------------------------ |
| should transition classified to approved                  | Request `status='classified'` | Updated to `status='approved'` |
| should override decision_notes when provided              | `{decision_notes:'new note'}` | `decision_notes` updated       |
| should preserve existing decision_notes when not provided | No decision_notes in DTO      | Original `decision_notes` kept |
| should throw INVALID_STATUS when not classified           | Request `status='submitted'`  | Throws 400                     |
| should throw INVALID_STATUS when already approved         | Request `status='approved'`   | Throws 400                     |

#### `reject()`

| Test                                              | Input                         | Expected Output                |
| ------------------------------------------------- | ----------------------------- | ------------------------------ |
| should transition submitted to rejected           | Request `status='submitted'`  | Updated to `status='rejected'` |
| should transition classified to rejected          | Request `status='classified'` | Updated to `status='rejected'` |
| should throw INVALID_STATUS when already approved | Request `status='approved'`   | Throws 400                     |
| should throw INVALID_STATUS when completed        | Request `status='completed'`  | Throws 400                     |
| should throw INVALID_STATUS when already rejected | Request `status='rejected'`   | Throws 400                     |

#### `execute()`

| Test                                                                                | Input                                                       | Expected Output                                                                             |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| should transition approved to completed for access_export                           | Request `request_type='access_export'`, `status='approved'` | `accessExportService.exportSubjectData()` called, status `completed`, `export_file_key` set |
| should transition approved to completed for erasure with anonymise classification   | `request_type='erasure'`, `classification='anonymise'`      | `anonymisationService.anonymiseSubject()` called, status `completed`                        |
| should transition approved to completed for rectification with erase classification | `request_type='rectification'`, `classification='erase'`    | `anonymisationService.anonymiseSubject()` called                                            |
| should not call anonymisation for erasure without anonymise/erase classification    | `request_type='erasure'`, `classification='retain'`         | Neither `anonymisationService` nor `accessExportService` called, status `completed`         |
| should throw INVALID_STATUS when not approved                                       | Request `status='classified'`                               | Throws 400                                                                                  |
| should set export_file_key to null when not access_export                           | `request_type='erasure'`                                    | `export_file_key` is null                                                                   |

#### `getExportUrl()`

| Test                                                          | Input                                                                              | Expected Output                         |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------- |
| should return export_file_key for completed access_export     | `request_type='access_export'`, `status='completed'`, `export_file_key='s3://...'` | Returns `{export_file_key: 's3://...'}` |
| should throw NOT_FOUND when request_type is not access_export | `request_type='erasure'`                                                           | Throws 404                              |
| should throw NOT_FOUND when status is not completed           | `status='approved'`                                                                | Throws 404                              |
| should throw NOT_FOUND when export_file_key is null           | `export_file_key=null`                                                             | Throws 404                              |

---

### 1.3 `AnonymisationService`

**File:** `apps/api/src/modules/compliance/anonymisation.service.spec.ts`

#### `anonymiseSubject()` dispatch

| Test                                                                  | Input                                      | Expected Output                                      |
| --------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------- |
| should dispatch to anonymiseParent for parent subject                 | `subjectType='parent'`                     | `anonymiseParent()` called within RLS transaction    |
| should dispatch to anonymiseStudent for student subject               | `subjectType='student'`                    | `anonymiseStudent()` called within RLS transaction   |
| should dispatch to anonymiseHousehold for household subject           | `subjectType='household'`                  | `anonymiseHousehold()` called within RLS transaction |
| should dispatch to anonymiseStaff for user subject with staff profile | `subjectType='user'`, staff profile exists | `anonymiseStaff()` called within RLS transaction     |
| should skip anonymisation for user with no staff profile              | `subjectType='user'`, no staff profile     | Returns `{anonymised_entities: []}`                  |
| should return list of anonymised entity types                         | `subjectType='parent'`                     | Returns `{anonymised_entities: ['parent']}`          |

#### `anonymiseParent()`

| Test                                                                    | Input                                     | Expected Output                                                                        |
| ----------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| should replace first_name, last_name, email, phone with ANONYMISED-{id} | Parent with real data                     | `first_name='ANONYMISED-{parentId}'`, `email='ANONYMISED-{parentId}@anonymised.local'` |
| should also anonymise whatsapp_phone                                    | Parent with whatsapp_phone                | `whatsapp_phone='ANONYMISED-{parentId}'`                                               |
| should be idempotent (skip already anonymised)                          | Parent with `first_name='ANONYMISED-...'` | No update call made                                                                    |
| should handle non-existent parent gracefully                            | No parent found                           | No error, returns silently                                                             |

#### `anonymiseStudent()`

| Test                                                                           | Input                                                        | Expected Output                                   |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------- |
| should replace first_name, last_name, full_name, student_number                | Student with real data                                       | All fields set to `ANONYMISED-{studentId}`        |
| should anonymise Arabic name fields                                            | Student with `first_name_ar`, `last_name_ar`, `full_name_ar` | All Arabic fields set to `ANONYMISED-{studentId}` |
| should anonymise report card snapshot student_name                             | Report card with `snapshot_payload_json.student_name`        | `student_name` replaced                           |
| should anonymise report card snapshot student_first_name and student_last_name | Report card with both fields                                 | Both replaced                                     |
| should be idempotent                                                           | Already anonymised student                                   | No update call                                    |
| should handle non-existent student gracefully                                  | No student found                                             | No error                                          |

#### `anonymiseHousehold()`

| Test                                               | Input                        | Expected Output                             |
| -------------------------------------------------- | ---------------------------- | ------------------------------------------- |
| should replace household_name with ANONYMISED-{id} | Household with real name     | `household_name='ANONYMISED-{householdId}'` |
| should be idempotent                               | Already anonymised household | No update call                              |
| should handle non-existent household gracefully    | No household found           | No error                                    |

#### `anonymiseStaff()`

| Test                                                                               | Input                                         | Expected Output                                                   |
| ---------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| should replace job_title and department                                            | Staff profile with real data                  | Both set to `ANONYMISED-{staffProfileId}`                         |
| should anonymise payroll entry notes                                               | Payroll entries for this staff                | `notes` updated to `ANONYMISED-{staffProfileId}` via `updateMany` |
| should anonymise payslip snapshot staff_name, employee_name, job_title, department | Payslip with snapshot containing those fields | All fields replaced                                               |
| should be idempotent                                                               | `job_title` already starts with `ANONYMISED-` | No update call                                                    |
| should handle non-existent staff profile gracefully                                | No staff profile found                        | No error                                                          |

---

### 1.4 `AccessExportService`

**File:** `apps/api/src/modules/compliance/access-export.service.spec.ts`

#### `exportSubjectData()`

| Test                                                                             | Input                     | Expected Output                                                                                                              |
| -------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| should export parent data with profile, students, households                     | `subjectType='parent'`    | JSON uploaded to S3 at `compliance-exports/{requestId}.json`, includes `profile`, `linked_students`, `household_memberships` |
| should export student data with profile, attendance, grades, enrolments          | `subjectType='student'`   | Includes `profile`, `attendance_records` (max 100), `grades`, `class_enrolments`                                             |
| should export household data with profile, parents, students, invoices, payments | `subjectType='household'` | Includes `profile`, `linked_parents`, `linked_students`, `invoices` (max 50), `payments` (max 50)                            |
| should export user data with basic profile                                       | `subjectType='user'`      | Includes `profile` with `id, first_name, last_name, email`                                                                   |
| should upload JSON to S3 with correct key format                                 | `requestId='uuid-r'`      | `s3Service.upload()` called with key matching `compliance-exports/uuid-r.json`                                               |
| should include metadata envelope in exported JSON                                | Any subject               | JSON includes `export_generated_at`, `subject_type`, `subject_id`, `tenant_id`, `data`                                       |
| should use RLS-scoped transaction                                                | Any tenant                | `createRlsClient()` called with correct `tenant_id`                                                                          |

---

### 1.5 `ImportService`

**File:** `apps/api/src/modules/imports/import.service.spec.ts`

#### `upload()`

| Test                                                      | Input                                     | Expected Output                                                                       |
| --------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------- |
| should create import_job record with status uploaded      | Valid CSV buffer, `importType='students'` | `prisma.importJob.create()` called with `status='uploaded'`, `import_type='students'` |
| should upload CSV to S3 at {tenantId}/imports/{jobId}.csv | File buffer                               | `s3Service.upload()` called with key `imports/{jobId}.csv`                            |
| should enqueue imports:validate job after upload          | Valid upload                              | `importsQueue.add('imports:validate', {tenant_id, job_id})` called                    |
| should return serialised job with created_by user         | Any upload                                | Response includes `created_by` with `id, first_name, last_name`                       |

#### `list()`

| Test                                  | Input                   | Expected Output                                        |
| ------------------------------------- | ----------------------- | ------------------------------------------------------ |
| should return paginated import jobs   | `{page:1, pageSize:20}` | Returns `{data: [...], meta: {page, pageSize, total}}` |
| should filter by status when provided | `{status:'validated'}`  | `where` includes `status: 'validated'`                 |

#### `get()`

| Test                                               | Input                           | Expected Output                     |
| -------------------------------------------------- | ------------------------------- | ----------------------------------- |
| should return a single import job                  | Valid `jobId`                   | Full job with `created_by` relation |
| should throw IMPORT_JOB_NOT_FOUND for invalid ID   | Non-existent UUID               | Throws 404                          |
| should throw IMPORT_JOB_NOT_FOUND for wrong tenant | Job belongs to different tenant | Throws 404                          |

#### `confirm()`

| Test                                                            | Input                                            | Expected Output                                                  |
| --------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| should transition validated to processing                       | Job `status='validated'`, summary has valid rows | Updated to `status='processing'`, `imports:process` job enqueued |
| should throw INVALID_IMPORT_STATUS when not validated           | Job `status='uploaded'`                          | Throws 400 `INVALID_IMPORT_STATUS`                               |
| should throw INVALID_IMPORT_STATUS when already processing      | Job `status='processing'`                        | Throws 400                                                       |
| should throw ALL_ROWS_FAILED when failed equals total_rows      | `summary_json = {total_rows: 10, failed: 10}`    | Throws 400 `ALL_ROWS_FAILED`                                     |
| should allow confirm when some rows passed                      | `summary_json = {total_rows: 10, failed: 3}`     | Proceeds, status set to `processing`                             |
| edge: should handle summary_json with missing fields gracefully | `summary_json = {}`                              | Does not throw (totalRows=0, failedRows=0)                       |

#### `getTemplate()`

| Test                                                   | Input                             | Expected Output                                                                                    |
| ------------------------------------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------- |
| should return CSV header string for students           | `importType='students'`           | Returns `'first_name,last_name,student_number,date_of_birth,year_group_name,gender,nationality\n'` |
| should return CSV header string for parents            | `importType='parents'`            | Returns `'first_name,last_name,email,phone,household_name\n'`                                      |
| should return CSV header string for staff              | `importType='staff'`              | Returns correct headers                                                                            |
| should return CSV header string for fees               | `importType='fees'`               | Returns correct headers                                                                            |
| should return CSV header string for exam_results       | `importType='exam_results'`       | Returns correct headers                                                                            |
| should return CSV header string for staff_compensation | `importType='staff_compensation'` | Returns correct headers                                                                            |
| should throw INVALID_IMPORT_TYPE for unknown type      | `importType='unknown'`            | Throws 400 `INVALID_IMPORT_TYPE`                                                                   |

---

### 1.6 `ImportValidationService`

**File:** `apps/api/src/modules/imports/import-validation.service.spec.ts`

#### `validate()` — students

| Test                                                                 | Input                                          | Expected Output                                                                  |
| -------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| should validate a correct students CSV                               | Valid CSV with all required headers and fields | Job updated to `status='validated'`, `summary_json.successful > 0`, `failed = 0` |
| should fail when required headers missing                            | CSV missing `student_number` header            | Job `status='failed'`, errors contain "Missing required headers"                 |
| should fail row when required field is empty                         | Row with empty `first_name`                    | Row counted as failed, error references `first_name`                             |
| should fail row with invalid date_of_birth format                    | `date_of_birth='15/03/2020'`                   | Error: "Invalid date format. Expected YYYY-MM-DD."                               |
| should fail row with invalid gender value                            | `gender='x'`                                   | Error: "Gender must be one of: male, female, m, f"                               |
| should warn on duplicate student (same first_name + last_name + dob) | Two rows with same name and dob                | Warning generated for second row, row not failed                                 |
| should set status to 'failed' when all rows fail                     | Every row has missing required fields          | `status='failed'`, `successful = 0`                                              |

#### `validate()` — parents

| Test                                        | Input                    | Expected Output               |
| ------------------------------------------- | ------------------------ | ----------------------------- |
| should validate correct parents CSV         | Valid CSV                | `status='validated'`          |
| should fail row with invalid email format   | `email='not-an-email'`   | Error: "Invalid email format" |
| should warn on duplicate email              | Two rows with same email | Warning for second row        |
| should fail row with missing required email | Empty email              | Error references `email`      |

#### `validate()` — staff

| Test                               | Input         | Expected Output      |
| ---------------------------------- | ------------- | -------------------- |
| should validate correct staff CSV  | Valid CSV     | `status='validated'` |
| should fail row with invalid email | `email='bad'` | Error on email field |

#### `validate()` — fees

| Test                                        | Input          | Expected Output                        |
| ------------------------------------------- | -------------- | -------------------------------------- |
| should validate correct fees CSV            | Valid CSV      | `status='validated'`                   |
| should fail row when amount is not a number | `amount='abc'` | Error: "Amount must be a valid number" |

#### `validate()` — exam_results

| Test                                       | Input         | Expected Output                       |
| ------------------------------------------ | ------------- | ------------------------------------- |
| should validate correct exam_results CSV   | Valid CSV     | `status='validated'`                  |
| should fail row when score is not a number | `score='abc'` | Error: "Score must be a valid number" |

#### `validate()` — staff_compensation

| Test                                                | Input                        | Expected Output                                                |
| --------------------------------------------------- | ---------------------------- | -------------------------------------------------------------- |
| should validate correct staff_compensation CSV      | Valid CSV                    | `status='validated'`                                           |
| should fail row with invalid compensation_type      | `compensation_type='hourly'` | Error: "compensation_type must be one of: salaried, per_class" |
| should fail row when base_salary is not a number    | `base_salary='abc'`          | Error on base_salary                                           |
| should fail row when per_class_rate is not a number | `per_class_rate='xyz'`       | Error on per_class_rate                                        |
| should allow empty base_salary and per_class_rate   | Both fields empty            | No error for those fields                                      |

#### `validate()` — edge cases

| Test                                              | Input                       | Expected Output                                          |
| ------------------------------------------------- | --------------------------- | -------------------------------------------------------- |
| edge: should handle empty CSV file                | Empty buffer                | Job `status='failed'`, error: "CSV file is empty"        |
| edge: should handle CSV with only headers         | One header line, no data    | `total_rows = 0`, `status='validated'`                   |
| edge: should handle quoted CSV fields with commas | `"Smith, Jr.",John,...`     | Parsed correctly, fields not split on inner comma        |
| edge: should handle escaped quotes in CSV         | `"He said ""hello"""`       | Parsed as `He said "hello"`                              |
| edge: should handle S3 download failure           | `s3Service.download` throws | Job `status='failed'`, error includes "Validation error" |
| edge: should handle job with missing file_key     | `file_key=null`             | Returns early without updating status                    |

---

### 1.7 `ReportsService`

**File:** `apps/api/src/modules/reports/reports.service.spec.ts`

#### `promotionRollover()`

| Test                                                           | Input                                                       | Expected Output                                                   |
| -------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| should return promotion data from audit log when available     | Audit log with `action='promotion_commit'` exists           | Returns counts from `metadata_json`, details include year groups  |
| should compute promotion data from student records as fallback | No audit log exists                                         | Queries students with enrolments, returns computed counts         |
| should throw ACADEMIC_YEAR_NOT_FOUND for invalid academic year | Non-existent `academicYearId`                               | Throws 404                                                        |
| should count student as promoted when year_group changed       | Student's `year_group_id` differs from enrolment year group | `promoted` count incremented                                      |
| should count student as held_back when year_group unchanged    | Student's `year_group_id` same as enrolment year group      | `held_back` count incremented                                     |
| should count graduated students                                | Student `status='graduated'`                                | `graduated` count incremented                                     |
| should count withdrawn students                                | Student `status='withdrawn'`                                | `withdrawn` count incremented                                     |
| should build per-year-group detail breakdown                   | Multiple year groups with students                          | `details[]` array has entries per year group with non-zero counts |

#### `feeGenerationRuns()`

| Test                                                                             | Input                                             | Expected Output                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------- |
| should return paginated fee generation run summaries from audit logs             | Audit logs with `action='fee_generation_confirm'` | Returns `{data: FeeGenerationRunSummary[], meta: {...}}` |
| should filter by academic_year_id via metadata_json path                         | `{academic_year_id:'uuid'}`                       | `where.metadata_json` includes path filter               |
| should extract invoices_created, total_amount, households_affected from metadata | Audit log metadata has those fields               | Summary fields populated from metadata                   |
| should default numeric fields to 0 when missing from metadata                    | Metadata missing `invoices_created`               | Returns `invoices_created: 0`                            |

#### `writeOffs()`

| Test                                                                  | Input                                              | Expected Output                                                           |
| --------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| should return write-off entries from invoices with status written_off | Invoices with `status='written_off'`               | Returns `{data: WriteOffReport, meta: {...}}` with `entries` and `totals` |
| should apply date range filter on updated_at                          | `{start_date:'2026-01-01', end_date:'2026-06-30'}` | `where.updated_at` has `gte` and `lte`                                    |
| should compute total_written_off from all entries                     | 3 invoices with write_off_amounts 100, 200, 300    | `totals.total_written_off = 600`                                          |
| should compute total_discounts from discount invoices                 | Invoices with non-zero discount_amount             | `totals.total_discounts` reflects sum                                     |
| should handle empty results                                           | No written-off invoices                            | `entries = []`, `totals` both 0                                           |

#### `notificationDelivery()`

| Test                                                        | Input                                                | Expected Output                                                              |
| ----------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| should aggregate notification stats by channel              | Notifications with various channels and statuses     | `by_channel` array with `sent, delivered, failed, delivery_rate` per channel |
| should aggregate notification stats by template             | Notifications with different `template_key`          | `by_template` array with `sent, delivered, failed` per template              |
| should compute delivery_rate as percentage                  | 80 delivered out of 100 sent on email                | `delivery_rate = 80.00`                                                      |
| should handle delivery_rate of 0 when nothing sent          | No notifications sent for a channel                  | `delivery_rate = 0`                                                          |
| should filter by channel                                    | `{channel:'email'}`                                  | `where` includes `channel: 'email'`                                          |
| should filter by template_key                               | `{template_key:'welcome'}`                           | `where` includes `template_key: 'welcome'`                                   |
| should apply date range filter                              | `{start_date, end_date}`                             | `where.created_at` has range                                                 |
| should count queued notifications as not-sent               | Notification `status='queued'`                       | Not counted in `totalSent`                                                   |
| should count delivered and read as delivered                | `status='delivered'` and `status='read'`             | Both increment `totalDelivered`                                              |
| should aggregate failure_reasons sorted by count descending | Multiple failed notifications with different reasons | `failure_reasons` sorted desc by count                                       |

#### `studentExportPack()`

| Test                                                                                | Input                                | Expected Output                                                       |
| ----------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| should return complete student export pack                                          | Valid `studentId`                    | Returns `{subject_type:'student', subject_id, exported_at, sections}` |
| should include profile, attendance, grades, report_cards, class_enrolments sections | Valid student                        | All 5 section names present                                           |
| should throw STUDENT_NOT_FOUND for invalid student                                  | Non-existent `studentId`             | Throws 404                                                            |
| should limit attendance records to 200                                              | Student with >200 records            | `attendance_records` section has at most 200 items                    |
| should format numeric grade scores as numbers                                       | Grade with `raw_score = Decimal(95)` | `raw_score: 95` (number, not string/Decimal)                          |

#### `householdExportPack()`

| Test                                                   | Input                                  | Expected Output                                                         |
| ------------------------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------- |
| should return complete household export pack           | Valid `householdId`                    | Returns `{subject_type:'household', subject_id, exported_at, sections}` |
| should include profile, invoices, payments sections    | Valid household                        | All 3 section names present                                             |
| should throw HOUSEHOLD_NOT_FOUND for invalid household | Non-existent `householdId`             | Throws 404                                                              |
| should limit invoices to 100                           | Household with >100 invoices           | `invoices` section has at most 100 items                                |
| should limit payments to 100                           | Household with >100 payments           | `payments` section has at most 100 items                                |
| should include parents and students in profile section | Household with linked parents/students | Profile data includes `parents[]` and `students[]` arrays               |

---

### 1.8 `ApprovalRequestsService.approve()` — Mode A Callback Dispatch

**File:** `apps/api/src/modules/approvals/approval-requests.service.spec.ts`

> These tests extend the existing test file. Focus on the Mode A callback behaviour.

| Test                                                                      | Input                                                      | Expected Output                                                                             |
| ------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| should enqueue communications:on-approval for announcement_publish action | Approval request with `action_type='announcement_publish'` | `notificationsQueue.add('communications:on-approval', {...})` called                        |
| should enqueue finance:on-approval for invoice_issue action               | `action_type='invoice_issue'`                              | `financeQueue.add('finance:on-approval', {...})` called                                     |
| should enqueue payroll:on-approval for payroll_finalise action            | `action_type='payroll_finalise'`                           | `payrollQueue.add('payroll:on-approval', {...})` called                                     |
| should not enqueue any callback for non-Mode-A action types               | `action_type='custom_action'`                              | No queue `.add()` called                                                                    |
| should pass correct payload to callback job                               | `action_type='announcement_publish'`                       | Payload includes `tenant_id`, `approval_request_id`, `target_entity_id`, `approver_user_id` |
| should still block self-approval before callback dispatch                 | Requester == approver                                      | Throws 400 `SELF_APPROVAL_BLOCKED`, no queue call                                           |
| should still reject non-pending_approval status before callback           | `status='approved'`                                        | Throws 400 `INVALID_STATUS`, no queue call                                                  |

---

### 1.9 `AuditLogInterceptor`

**File:** `apps/api/src/common/interceptors/audit-log.interceptor.spec.ts`

#### `intercept()` — method filtering

| Test                                              | Input             | Expected Output                                              |
| ------------------------------------------------- | ----------------- | ------------------------------------------------------------ |
| should pass through GET requests without auditing | `method='GET'`    | `next.handle()` called, `auditLogService.write()` NOT called |
| should audit POST requests                        | `method='POST'`   | `auditLogService.write()` called                             |
| should audit PUT requests                         | `method='PUT'`    | `auditLogService.write()` called                             |
| should audit PATCH requests                       | `method='PATCH'`  | `auditLogService.write()` called                             |
| should audit DELETE requests                      | `method='DELETE'` | `auditLogService.write()` called                             |

#### `parseEntityFromPath()`

| Test                                                                 | Input                                               | Expected Output                                          |
| -------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------- |
| should parse entity_type and entity_id from /v1/students/{uuid}      | `/v1/students/550e8400-e29b-41d4-a716-446655440000` | `entityType='students'`, `entityId='550e8400-...'`       |
| should parse nested resource /v1/compliance-requests/{uuid}/classify | `/v1/compliance-requests/550e.../classify`          | `entityType='compliance-requests'`, `entityId='550e...'` |
| should fallback to first segment for /v1/imports/upload              | `/v1/imports/upload`                                | `entityType='imports'`, `entityId=null`                  |
| should strip query string before parsing                             | `/v1/students/550e...?include=grades`               | `entityType='students'`, `entityId='550e...'`            |
| should parse deepest resource/uuid pair                              | `/v1/tenants/{uuid1}/students/{uuid2}`              | `entityType='students'`, `entityId='{uuid2}'`            |
| should return 'unknown' when no segments                             | `/`                                                 | `entityType='unknown'`, `entityId=null`                  |
| should skip 'api' and 'v1' segments                                  | `/api/v1/students/{uuid}`                           | `entityType='students'`                                  |

#### `sanitizeBody()`

| Test                                        | Input                                                                                                         | Expected Output                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| should redact password field                | `{email:'a@b.com', password:'secret'}`                                                                        | `{email:'a@b.com', password:'[REDACTED]'}` |
| should redact all sensitive fields          | Body with `password, token, secret, mfa_secret, refresh_token, current_password, new_password, password_hash` | All set to `'[REDACTED]'`                  |
| should pass through non-sensitive fields    | `{name:'test', status:'active'}`                                                                              | Returned unchanged                         |
| should return undefined for undefined body  | `undefined`                                                                                                   | Returns `undefined`                        |
| should return undefined for non-object body | `null`                                                                                                        | Returns `undefined`                        |

#### Non-blocking behaviour

| Test                                                | Input                                | Expected Output                                               |
| --------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------- |
| should not fail the request when audit write throws | `auditLogService.write()` throws     | Response still returned successfully, `logger.error()` called |
| should not audit failed requests (error tap branch) | Request handler throws HttpException | `auditLogService.write()` NOT called                          |

---

### 1.10 `ImportProcessingService`

**File:** `apps/api/src/modules/imports/import-processing.service.spec.ts`

#### `process()`

| Test                                                                   | Input                                | Expected Output                                  |
| ---------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------ |
| should process valid student rows and create records                   | Job with students CSV                | Students created in DB, job `status='completed'` |
| should skip rows that had validation errors                            | Job summary has errors for rows 2, 4 | Rows 2, 4 skipped, others processed              |
| should process parents CSV and create parent + household_parent        | Valid parents CSV                    | Parent records and household links created       |
| should process staff CSV and create user + staff_profile               | Valid staff CSV                      | User and staff profile created                   |
| should set job status to 'failed' when all rows fail during processing | Every processRow throws              | `status='failed'`, `successful=0`                |
| should set status 'completed' when at least one row succeeds           | Mix of success and failure           | `status='completed'`                             |
| should delete S3 file on completion                                    | Processing completes                 | `s3Service.delete()` called                      |
| should handle S3 delete failure gracefully                             | `s3Service.delete()` throws          | Job still completed, warning logged              |
| should handle missing job gracefully                                   | Job not found in DB                  | Returns early, no processing                     |
| edge: should handle CSV with only headers (no data rows)               | CSV with 1 line                      | `status='failed'`, 0 processed                   |

---

## Section 2 — Integration Tests

Integration tests use Supertest against the running NestJS application. Each test group covers happy path, auth failures, permission failures, validation errors, and business logic errors.

**Test file locations:**

- `apps/api/test/audit-log.e2e-spec.ts`
- `apps/api/test/compliance.e2e-spec.ts`
- `apps/api/test/imports.e2e-spec.ts`
- `apps/api/test/reports.e2e-spec.ts`
- `apps/api/test/engagement.e2e-spec.ts`

---

### 2.1 Audit Log Endpoints

#### `GET /api/v1/audit-logs`

| Test                                                                                   | Expected                                       |
| -------------------------------------------------------------------------------------- | ---------------------------------------------- |
| should return 200 with paginated audit logs for authenticated user with analytics.view | `{data: [...], meta: {page, pageSize, total}}` |
| should return 401 when no auth token provided                                          | `401 Unauthorized`                             |
| should return 403 when user lacks analytics.view permission                            | `403 Forbidden`                                |
| should filter by entity_type query param                                               | Only matching entity_type returned             |
| should filter by action query param                                                    | Only matching action returned                  |
| should filter by date range                                                            | Only logs within range returned                |
| should paginate correctly with page=2                                                  | Correct offset applied                         |

#### `GET /api/v1/admin/audit-logs`

| Test                                                                                | Expected                        |
| ----------------------------------------------------------------------------------- | ------------------------------- |
| should return 200 with cross-tenant audit logs for platform admin with tenants.view | Response includes `tenant_name` |
| should return 401 when no auth token                                                | `401`                           |
| should return 403 when user lacks tenants.view permission                           | `403`                           |
| should filter by tenant_id query param                                              | Only matching tenant logs       |

---

### 2.2 Engagement Endpoint

#### `POST /api/v1/engagement/track`

| Test                                                         | Expected                        |
| ------------------------------------------------------------ | ------------------------------- |
| should return 200 with `{ok: true}` for valid tracking event | `{ok: true}`, audit log written |
| should return 401 when no auth token                         | `401`                           |
| should return 400 with invalid body (missing event_type)     | `400` validation error          |
| should accept optional entity_type and entity_id             | `{ok: true}`                    |

---

### 2.3 Compliance Endpoints

#### `POST /api/v1/compliance-requests`

| Test                                                       | Expected                          |
| ---------------------------------------------------------- | --------------------------------- |
| should return 201 with created compliance request          | Request with `status='submitted'` |
| should return 401 when no auth token                       | `401`                             |
| should return 403 when user lacks compliance.manage        | `403`                             |
| should return 400 with invalid body (missing subject_type) | `400`                             |
| should return 404 when subject does not exist              | `404 SUBJECT_NOT_FOUND`           |
| should return 409 when duplicate active request exists     | `409 DUPLICATE_REQUEST`           |

#### `GET /api/v1/compliance-requests`

| Test                                              | Expected                      |
| ------------------------------------------------- | ----------------------------- |
| should return 200 with paginated list             | `{data: [...], meta: {...}}`  |
| should return 401 when no auth token              | `401`                         |
| should return 403 when user lacks compliance.view | `403`                         |
| should filter by status query param               | Only matching status returned |

#### `GET /api/v1/compliance-requests/:id`

| Test                                              | Expected                         |
| ------------------------------------------------- | -------------------------------- |
| should return 200 with single compliance request  | Full request with `requested_by` |
| should return 401 when no auth token              | `401`                            |
| should return 403 when user lacks compliance.view | `403`                            |
| should return 404 for non-existent ID             | `404`                            |
| should return 400 for invalid UUID format         | `400`                            |

#### `POST /api/v1/compliance-requests/:id/classify`

| Test                                                   | Expected                                    |
| ------------------------------------------------------ | ------------------------------------------- |
| should return 200 with classified request              | `status='classified'`, `classification` set |
| should return 401 when no auth token                   | `401`                                       |
| should return 403 when user lacks compliance.manage    | `403`                                       |
| should return 400 when request not in submitted status | `400 INVALID_STATUS`                        |
| should return 400 with missing classification field    | `400` validation error                      |

#### `POST /api/v1/compliance-requests/:id/approve`

| Test                                                    | Expected             |
| ------------------------------------------------------- | -------------------- |
| should return 200 with approved request                 | `status='approved'`  |
| should return 400 when request not in classified status | `400 INVALID_STATUS` |
| should return 403 when user lacks compliance.manage     | `403`                |

#### `POST /api/v1/compliance-requests/:id/reject`

| Test                                                                 | Expected             |
| -------------------------------------------------------------------- | -------------------- |
| should return 200 with rejected request                              | `status='rejected'`  |
| should return 400 when request not in submitted or classified status | `400 INVALID_STATUS` |

#### `POST /api/v1/compliance-requests/:id/execute`

| Test                                                           | Expected                                          |
| -------------------------------------------------------------- | ------------------------------------------------- |
| should return 200 with completed request for access_export     | `status='completed'`, `export_file_key` populated |
| should return 200 with completed request for erasure+anonymise | `status='completed'`, subject anonymised          |
| should return 400 when request not approved                    | `400 INVALID_STATUS`                              |

#### `GET /api/v1/compliance-requests/:id/export`

| Test                                                               | Expected                   |
| ------------------------------------------------------------------ | -------------------------- |
| should return 200 with export_file_key for completed access_export | `{export_file_key: '...'}` |
| should return 404 when request type is not access_export           | `404`                      |
| should return 404 when request not completed                       | `404`                      |

---

### 2.4 Import Endpoints

#### `POST /api/v1/imports/upload`

| Test                                                 | Expected                     |
| ---------------------------------------------------- | ---------------------------- |
| should return 201 with created import job            | Job with `status='uploaded'` |
| should return 401 when no auth token                 | `401`                        |
| should return 403 when user lacks settings.manage    | `403`                        |
| should return 400 when no file attached              | `400 FILE_REQUIRED`          |
| should return 400 when file is not CSV               | `400 INVALID_FILE_TYPE`      |
| should return 400 when file exceeds 10MB             | `400 FILE_TOO_LARGE`         |
| should return 400 when import_type missing from body | `400` validation error       |

#### `GET /api/v1/imports`

| Test                                              | Expected                     |
| ------------------------------------------------- | ---------------------------- |
| should return 200 with paginated import jobs      | `{data: [...], meta: {...}}` |
| should return 401 when no auth token              | `401`                        |
| should return 403 when user lacks settings.manage | `403`                        |
| should filter by status query param               | Only matching status         |

#### `GET /api/v1/imports/template?import_type=students`

| Test                                                    | Expected                                       |
| ------------------------------------------------------- | ---------------------------------------------- |
| should return 200 with CSV content-type and header row  | `Content-Type: text/csv`, body contains header |
| should return 400 for invalid import_type               | `400`                                          |
| should include Content-Disposition header with filename | `attachment; filename="students_template.csv"` |

#### `GET /api/v1/imports/:id`

| Test                                     | Expected                   |
| ---------------------------------------- | -------------------------- |
| should return 200 with single import job | Full job with `created_by` |
| should return 404 for non-existent ID    | `404 IMPORT_JOB_NOT_FOUND` |

#### `POST /api/v1/imports/:id/confirm`

| Test                                           | Expected                    |
| ---------------------------------------------- | --------------------------- |
| should return 200 with processing import job   | `status='processing'`       |
| should return 400 when status is not validated | `400 INVALID_IMPORT_STATUS` |
| should return 400 when all rows failed         | `400 ALL_ROWS_FAILED`       |
| should return 404 for non-existent job         | `404`                       |

---

### 2.5 Reports Endpoints

#### `GET /api/v1/reports/promotion-rollover?academic_year_id={uuid}`

| Test                                             | Expected                                               |
| ------------------------------------------------ | ------------------------------------------------------ |
| should return 200 with promotion rollover report | `{promoted, held_back, graduated, withdrawn, details}` |
| should return 401 when no auth token             | `401`                                                  |
| should return 403 when user lacks analytics.view | `403`                                                  |
| should return 404 for non-existent academic year | `404 ACADEMIC_YEAR_NOT_FOUND`                          |
| should return 400 when academic_year_id missing  | `400` validation error                                 |

#### `GET /api/v1/reports/fee-generation-runs`

| Test                                                          | Expected                     |
| ------------------------------------------------------------- | ---------------------------- |
| should return 200 with paginated fee generation run summaries | `{data: [...], meta: {...}}` |
| should return 401 when no auth token                          | `401`                        |
| should return 403 when user lacks finance.view                | `403`                        |
| should filter by academic_year_id                             | Only matching runs           |

#### `GET /api/v1/reports/write-offs`

| Test                                           | Expected                                 |
| ---------------------------------------------- | ---------------------------------------- |
| should return 200 with write-off report        | `{data: {entries, totals}, meta: {...}}` |
| should return 401 when no auth token           | `401`                                    |
| should return 403 when user lacks finance.view | `403`                                    |
| should apply date range filters                | Only invoices within range               |

#### `GET /api/v1/reports/notification-delivery`

| Test                                                 | Expected                                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| should return 200 with notification delivery summary | `{total_sent, total_delivered, total_failed, by_channel, by_template, failure_reasons}` |
| should return 401 when no auth token                 | `401`                                                                                   |
| should return 403 when user lacks analytics.view     | `403`                                                                                   |
| should filter by channel                             | Only matching channel in results                                                        |
| should filter by template_key                        | Only matching template                                                                  |

#### `GET /api/v1/reports/student-export/:studentId`

| Test                                            | Expected                                    |
| ----------------------------------------------- | ------------------------------------------- |
| should return 200 with student export pack      | `{subject_type:'student', sections: [...]}` |
| should return 401 when no auth token            | `401`                                       |
| should return 403 when user lacks students.view | `403`                                       |
| should return 404 for non-existent student      | `404 STUDENT_NOT_FOUND`                     |

#### `GET /api/v1/reports/household-export/:householdId`

| Test                                           | Expected                                      |
| ---------------------------------------------- | --------------------------------------------- |
| should return 200 with household export pack   | `{subject_type:'household', sections: [...]}` |
| should return 401 when no auth token           | `401`                                         |
| should return 403 when user lacks finance.view | `403`                                         |
| should return 404 for non-existent household   | `404 HOUSEHOLD_NOT_FOUND`                     |

---

## Section 3 — RLS Leakage Tests

**File:** `apps/api/test/p8-rls.e2e-spec.ts`

Every RLS test follows the same pattern:

1. Create data as Tenant A
2. Authenticate as Tenant B
3. Attempt to read/query the data
4. Assert: Tenant A data is NOT returned (empty result or 404)

---

### 3.1 `audit_logs` — Dual RLS Policy (nullable tenant_id)

| Test                                                                                    | Setup                                                      | Assert                                                                                                   |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Tenant B cannot see Tenant A's audit logs via GET /api/v1/audit-logs                    | Create audit log for Tenant A                              | Tenant B list returns 0 matching Tenant A logs                                                           |
| Tenant B cannot see Tenant A's audit logs even when entity_type filter matches          | Create audit log for Tenant A with `entity_type='student'` | Tenant B filter by `entity_type='student'` returns no Tenant A records                                   |
| Platform-level audit logs (tenant_id=null) are visible only via platform admin endpoint | Create platform log with `tenant_id=null`                  | Tenant-scoped `GET /api/v1/audit-logs` does not return it; `GET /api/v1/admin/audit-logs` does return it |

### 3.2 `compliance_requests`

| Test                                                    | Setup                                             | Assert                                                                |
| ------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| Tenant B cannot list Tenant A's compliance requests     | Create compliance request for Tenant A            | Tenant B `GET /api/v1/compliance-requests` returns 0 Tenant A records |
| Tenant B cannot get Tenant A's compliance request by ID | Create compliance request for Tenant A            | Tenant B `GET /api/v1/compliance-requests/:id` returns 404            |
| Tenant B cannot classify Tenant A's compliance request  | Create submitted compliance request for Tenant A  | Tenant B `POST /api/v1/compliance-requests/:id/classify` returns 404  |
| Tenant B cannot approve Tenant A's compliance request   | Create classified compliance request for Tenant A | Tenant B `POST /api/v1/compliance-requests/:id/approve` returns 404   |
| Tenant B cannot execute Tenant A's compliance request   | Create approved compliance request for Tenant A   | Tenant B `POST /api/v1/compliance-requests/:id/execute` returns 404   |

### 3.3 `import_jobs`

| Test                                            | Setup                                    | Assert                                                    |
| ----------------------------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| Tenant B cannot list Tenant A's import jobs     | Create import job for Tenant A           | Tenant B `GET /api/v1/imports` returns 0 Tenant A records |
| Tenant B cannot get Tenant A's import job by ID | Create import job for Tenant A           | Tenant B `GET /api/v1/imports/:id` returns 404            |
| Tenant B cannot confirm Tenant A's import job   | Create validated import job for Tenant A | Tenant B `POST /api/v1/imports/:id/confirm` returns 404   |

---

## Section 4 — Manual QA Checklist

Step-by-step human testing instructions. Perform each test in both English and Arabic locales unless noted otherwise.

---

### 4.1 Reports Hub Navigation

1. **Navigate to Reports hub** (Settings > Reports or dedicated Reports page)
2. Verify the Reports hub page loads with links/cards to:
   - Promotion Rollover
   - Fee Generation Runs
   - Write-Offs
   - Notification Delivery
   - Student Export Pack
   - Household Export Pack
3. Click each link and verify the report page loads without errors
4. Switch to Arabic locale and verify:
   - All labels are translated
   - Layout is RTL (cards, tables, navigation all mirrored)
   - Numbers use Western numerals (0-9)

### 4.2 Promotion Rollover Report

1. Navigate to Promotion Rollover report
2. Select an academic year from the dropdown
3. Verify summary counts display: Promoted, Held Back, Graduated, Withdrawn
4. Verify per-year-group breakdown table renders correctly
5. Verify the report handles an academic year with no data (shows zeroes)
6. Switch to Arabic and verify all labels are translated and RTL

### 4.3 Fee Generation Runs Report

1. Navigate to Fee Generation Runs report
2. Verify paginated table shows: run date, invoices created, total amount, households affected
3. Apply academic year filter and verify results update
4. Verify pagination controls work (next/prev page)

### 4.4 Write-Offs Report

1. Navigate to Write-Offs report
2. Verify entries table shows: invoice number, household name, amount, date, reason
3. Verify totals section shows: Total Written Off, Total Discounts
4. Apply date range filter and verify results update
5. Verify empty state when no write-offs exist

### 4.5 Notification Delivery Report

1. Navigate to Notification Delivery report
2. Verify summary: Total Sent, Total Delivered, Total Failed
3. Verify by-channel breakdown with delivery rate percentages
4. Verify by-template breakdown table
5. Verify failure reasons list (sorted by count)
6. Apply channel filter and verify results update
7. Apply date range filter and verify results update

### 4.6 Student Export Pack

1. Navigate to a student profile page
2. Find and click "Export Pack" button
3. Verify JSON/page displays all sections: Profile, Attendance, Grades, Report Cards, Class Enrolments
4. Verify export for a student with no attendance/grades returns empty arrays (not errors)

### 4.7 Household Export Pack

1. Navigate to a household profile page
2. Find and click "Export Pack" button
3. Verify JSON/page displays all sections: Profile (with parents/students), Invoices, Payments
4. Verify export for a household with no invoices returns empty arrays

### 4.8 Audit Log Viewer

1. Navigate to Settings > Audit Log (school admin)
2. Verify paginated table of audit entries loads
3. Filter by entity_type and verify table updates
4. Filter by date range and verify table updates
5. Filter by actor (user) and verify table updates
6. Verify entries show: actor name, action, entity type, entity ID, timestamp, IP address
7. Verify metadata is viewable (expand row or click detail)
8. Switch to Arabic and verify labels/layout

### 4.9 Platform Admin Audit Log

1. Log in as platform admin
2. Navigate to Platform Admin > Audit Logs
3. Verify cross-tenant audit log table loads with tenant name column
4. Filter by specific tenant and verify results
5. Verify platform-level events (tenant_id=null) appear with "Platform" or empty tenant name

### 4.10 Compliance Request Lifecycle

1. Navigate to Settings > Compliance (school admin)
2. **Create:** Submit a new access_export request for a parent
   - Verify request appears in list with `status=submitted`
3. **Classify:** Click the request, classify it
   - Select classification, add notes
   - Verify status transitions to `classified`
4. **Approve:** Approve the classified request
   - Verify status transitions to `approved`
5. **Execute:** Execute the approved request
   - Verify status transitions to `completed`
   - For access_export: verify export_file_key is populated
6. **Reject path:** Create a new request, classify it, then reject it
   - Verify status transitions to `rejected`
7. **Duplicate prevention:** Try creating a second request for the same subject while one is active
   - Verify error message about duplicate
8. Switch to Arabic and repeat basic creation flow

### 4.11 Bulk Import Lifecycle

1. Navigate to Settings > Imports (school admin)
2. **Download template:** Click "Download Template" for Students
   - Verify CSV file downloads with correct headers
3. **Upload:** Fill in 3-5 rows in the template, upload via the form
   - Select import_type = students
   - Verify job appears in list with `status=uploaded`
4. **Wait for validation:** Refresh or poll until status changes to `validated`
   - Verify summary shows: total_rows, successful, failed, warnings
   - If there are errors, verify they show row number and field name
5. **Confirm:** Click "Confirm" on the validated job
   - Verify status transitions to `processing`
6. **Wait for completion:** Refresh until status = `completed`
   - Verify students were actually created in the system
7. **Error path:** Upload a CSV with missing required fields
   - Verify validation catches errors and status = `validated` or `failed`
   - Verify confirm is blocked when all rows failed
8. **File type validation:** Try uploading a .txt file
   - Verify error: "Only CSV files are accepted"
9. Repeat template download for each import type (parents, staff, fees, exam_results, staff_compensation)

### 4.12 Approval Callback Verification

1. Enable an approval workflow for `announcement_publish` in Settings > Approvals
2. Create a new announcement as a non-owner user
3. Publish the announcement -- it should go to `pending_approval`
4. Log in as an approver (different user)
5. Approve the announcement approval request
6. Verify the announcement automatically transitions to `published`
7. Verify notifications were dispatched for the announcement audience
8. Repeat for `invoice_issue` (create invoice, approve, verify issued)
9. Repeat for `payroll_finalise` if payroll is set up

### 4.13 Settings Tabs Verification

1. Navigate to Settings page
2. Verify "Audit Log" tab/section is visible and navigable
3. Verify "Compliance" tab/section is visible and navigable
4. Verify "Imports" tab/section is visible and navigable
5. Verify all three tabs render correct content in both locales
