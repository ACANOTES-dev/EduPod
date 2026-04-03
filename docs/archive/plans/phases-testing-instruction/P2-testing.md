# P2 Testing Instructions — Households, Parents, Students, Staff, Academics

## Section 1 — Unit Tests

### 1.1 HouseholdsService (`apps/api/src/modules/households/households.service.spec.ts`)

| #   | Test                                                                          | Expected                             |
| --- | ----------------------------------------------------------------------------- | ------------------------------------ |
| 1   | create: should create household with emergency contacts                       | returns household with contacts      |
| 2   | create: should set needs_completion = false when contacts provided            | needs_completion is false            |
| 3   | findAll: should return paginated households                                   | returns data + meta                  |
| 4   | findAll: should filter by status                                              | only matching status returned        |
| 5   | findAll: should search by household_name                                      | ILIKE match works                    |
| 6   | findOne: should return household with all relations                           | includes parents, students, contacts |
| 7   | findOne: should throw NotFoundException for non-existent id                   | 404                                  |
| 8   | update: should update household fields                                        | returns updated household            |
| 9   | updateStatus: should update status to archived                                | status changed                       |
| 10  | setBillingParent: should set billing parent when parent is linked             | primary_billing_parent_id set        |
| 11  | setBillingParent: should throw when parent not in household                   | PARENT_NOT_IN_HOUSEHOLD error        |
| 12  | addEmergencyContact: should add contact when count < 3                        | contact created                      |
| 13  | addEmergencyContact: should throw when count >= 3                             | CONTACTS_LIMIT_REACHED error         |
| 14  | removeEmergencyContact: should remove contact when count > 1                  | contact deleted                      |
| 15  | removeEmergencyContact: should throw when count = 1                           | MIN_CONTACTS_REQUIRED error          |
| 16  | linkParent: should create household_parents record                            | record created                       |
| 17  | unlinkParent: should remove parent link                                       | record deleted                       |
| 18  | unlinkParent: should block when parent is billing parent                      | IS_BILLING_PARENT error              |
| 19  | merge: should move students, parents, contacts to target                      | all data consolidated                |
| 20  | merge: should archive source household                                        | source status = archived             |
| 21  | merge: should throw when source = target                                      | SAME_HOUSEHOLD error                 |
| 22  | merge: should skip duplicate parent links                                     | no duplicates                        |
| 23  | split: should create new household with selected members                      | new household created                |
| 24  | split: should move selected students to new household                         | students.household_id updated        |
| 25  | checkNeedsCompletion: should set true when no contacts or no billing parent   | needs_completion = true              |
| 26  | checkNeedsCompletion: should set false when contacts and billing parent exist | needs_completion = false             |

### 1.2 ParentsService (`apps/api/src/modules/parents/parents.service.spec.ts`)

| #   | Test                                                                  | Expected                         |
| --- | --------------------------------------------------------------------- | -------------------------------- |
| 1   | create: should create parent record                                   | returns parent                   |
| 2   | create: should auto-link to household when household_id provided      | household_parents record created |
| 3   | create: should auto-link user_id when email matches existing user     | parent.user_id set               |
| 4   | create: should validate whatsapp_phone when whatsapp channel selected | throws if missing                |
| 5   | findAll: should return paginated parents                              | data + meta                      |
| 6   | findAll: should search by name and email                              | matches found                    |
| 7   | findOne: should return parent with households and students            | includes relations               |
| 8   | update: should update parent fields                                   | returns updated                  |
| 9   | linkStudent: should create student_parents record                     | record created                   |
| 10  | unlinkStudent: should remove student_parents record                   | record deleted                   |

### 1.3 StudentsService (`apps/api/src/modules/students/students.service.spec.ts`)

| #   | Test                                                              | Expected                        |
| --- | ----------------------------------------------------------------- | ------------------------------- |
| 1   | create: should create student                                     | returns student                 |
| 2   | create: should create parent links when provided                  | student_parents records created |
| 3   | create: should validate allergy details required when has_allergy | throws if missing               |
| 4   | findAll: should return paginated students                         | data + meta                     |
| 5   | findAll: should filter by status                                  | only matching                   |
| 6   | findAll: should filter by year_group_id                           | only matching                   |
| 7   | findAll: should filter by has_allergy                             | only allergic students          |
| 8   | findOne: should return full student detail                        | includes all relations          |
| 9   | update: should update student fields                              | returns updated                 |
| 10  | updateStatus: should allow applicant → active                     | status changed                  |
| 11  | updateStatus: should allow active → withdrawn with reason         | status + exit_date set          |
| 12  | updateStatus: should block applicant → graduated                  | INVALID_STATUS_TRANSITION       |
| 13  | updateStatus: should block archived → active                      | INVALID_STATUS_TRANSITION       |
| 14  | updateStatus: should require reason for withdrawal                | WITHDRAWAL_REASON_REQUIRED      |
| 15  | updateStatus: withdrawal should drop all active enrolments        | enrolments set to dropped       |
| 16  | updateStatus: should allow withdrawn → active (re-enrollment)     | status changed                  |
| 17  | updateStatus: should allow active → graduated                     | status + exit_date set          |
| 18  | updateStatus: should allow graduated → archived                   | status changed                  |
| 19  | allergyReport: should return students with has_allergy = true     | only allergic students          |
| 20  | allergyReport: should filter by year_group_id                     | filtered results                |
| 21  | exportPack: should return profile + placeholder arrays            | empty attendance/grades         |

### 1.4 StaffProfilesService (`apps/api/src/modules/staff-profiles/staff-profiles.service.spec.ts`)

| #   | Test                                                               | Expected                |
| --- | ------------------------------------------------------------------ | ----------------------- |
| 1   | create: should create staff profile                                | returns profile         |
| 2   | create: should encrypt bank details                                | encrypted values stored |
| 3   | create: should throw when user not found                           | USER_NOT_FOUND          |
| 4   | create: should throw on duplicate (same user+tenant)               | STAFF_PROFILE_EXISTS    |
| 5   | findAll: should return paginated profiles with masked bank details | bank details masked     |
| 6   | findOne: should return profile with user info                      | includes user relation  |
| 7   | update: should re-encrypt bank details on change                   | new encrypted values    |
| 8   | getBankDetails: should return last 4 chars only                    | masked values           |
| 9   | preview: should return cached preview                              | cached after first call |

### 1.5 AcademicYearsService (`apps/api/src/modules/academics/academic-years.service.spec.ts`)

| #   | Test                                        | Expected                  |
| --- | ------------------------------------------- | ------------------------- |
| 1   | create: should create academic year         | returns year              |
| 2   | create: should catch overlapping dates      | OVERLAPPING_ACADEMIC_YEAR |
| 3   | create: should catch duplicate name         | DUPLICATE_NAME / P2002    |
| 4   | updateStatus: should allow planned → active | status changed            |
| 5   | updateStatus: should allow active → closed  | status changed            |
| 6   | updateStatus: should block closed → active  | INVALID_STATUS_TRANSITION |
| 7   | updateStatus: should block planned → closed | INVALID_STATUS_TRANSITION |
| 8   | findOne: should include periods             | periods array populated   |

### 1.6 AcademicPeriodsService (`apps/api/src/modules/academics/academic-periods.service.spec.ts`)

| #   | Test                                                   | Expected            |
| --- | ------------------------------------------------------ | ------------------- |
| 1   | create: should create period within year bounds        | returns period      |
| 2   | create: should reject dates outside year range         | PERIOD_OUTSIDE_YEAR |
| 3   | create: should catch overlapping periods               | OVERLAPPING_PERIOD  |
| 4   | updateStatus: should enforce same transitions as years | correct blocking    |

### 1.7 YearGroupsService (`apps/api/src/modules/academics/year-groups.service.spec.ts`)

| #   | Test                                                     | Expected          |
| --- | -------------------------------------------------------- | ----------------- |
| 1   | create: should create year group                         | returns group     |
| 2   | findAll: should return ordered by display_order          | correct order     |
| 3   | remove: should delete unused year group                  | deleted           |
| 4   | remove: should block deletion when students reference it | YEAR_GROUP_IN_USE |
| 5   | remove: should block deletion when classes reference it  | YEAR_GROUP_IN_USE |

### 1.8 SubjectsService (`apps/api/src/modules/academics/subjects.service.spec.ts`)

| #   | Test                                           | Expected         |
| --- | ---------------------------------------------- | ---------------- |
| 1   | create: should create subject                  | returns subject  |
| 2   | findAll: should filter by subject_type         | filtered results |
| 3   | findAll: should filter by active               | filtered results |
| 4   | remove: should block when classes reference it | SUBJECT_IN_USE   |

### 1.9 ClassesService (`apps/api/src/modules/classes/classes.service.spec.ts`)

| #   | Test                                            | Expected               |
| --- | ----------------------------------------------- | ---------------------- |
| 1   | create: should create class                     | returns class          |
| 2   | create: should catch duplicate name within year | 409                    |
| 3   | assignStaff: should create class_staff record   | record created         |
| 4   | assignStaff: should catch duplicate assignment  | STAFF_ALREADY_ASSIGNED |
| 5   | removeStaff: should delete class_staff record   | deleted                |
| 6   | preview: should return cached data              | Redis cached           |

### 1.10 ClassEnrolmentsService (`apps/api/src/modules/classes/class-enrolments.service.spec.ts`)

| #   | Test                                                       | Expected                     |
| --- | ---------------------------------------------------------- | ---------------------------- |
| 1   | create: should enrol student                               | returns enrolment            |
| 2   | create: should block already enrolled (active)             | STUDENT_ALREADY_ENROLLED     |
| 3   | updateStatus: should allow active → dropped                | status changed, end_date set |
| 4   | updateStatus: should allow active → completed              | status changed               |
| 5   | updateStatus: should allow dropped → active                | re-enrolment                 |
| 6   | updateStatus: should block completed → active              | INVALID_STATUS_TRANSITION    |
| 7   | bulkEnrol: should enrol multiple students                  | enrolled count correct       |
| 8   | bulkEnrol: should skip already enrolled                    | skipped count correct        |
| 9   | dropAllActiveForStudent: should drop all active enrolments | all set to dropped           |

### 1.11 PromotionService (`apps/api/src/modules/academics/promotion.service.spec.ts`)

| #   | Test                                                          | Expected           |
| --- | ------------------------------------------------------------- | ------------------ |
| 1   | preview: should propose 'promote' when next_year_group exists | correct action     |
| 2   | preview: should propose 'graduate' when no next_year_group    | correct action     |
| 3   | preview: should propose 'hold_back' when no year_group        | correct action     |
| 4   | commit: promote should update year_group_id                   | year_group changed |
| 5   | commit: graduate should set status to graduated               | status + exit_date |
| 6   | commit: withdraw should set status to withdrawn               | status + exit_date |
| 7   | commit: should drop active enrolments for all actions         | enrolments dropped |

### 1.12 DashboardService (`apps/api/src/modules/dashboard/dashboard.service.spec.ts`)

| #   | Test                                                    | Expected          |
| --- | ------------------------------------------------------- | ----------------- |
| 1   | schoolAdmin: should return greeting based on time       | correct greeting  |
| 2   | schoolAdmin: should return accurate counts              | correct stats     |
| 3   | schoolAdmin: should return needs_completion households  | list populated    |
| 4   | parent: should return linked students                   | correct students  |
| 5   | parent: should return empty array when no parent record | graceful handling |

### 1.13 SearchService (`apps/api/src/modules/search/search.service.spec.ts`)

| #   | Test                                                        | Expected             |
| --- | ----------------------------------------------------------- | -------------------- |
| 1   | should fall back to PostgreSQL when Meilisearch unavailable | results returned     |
| 2   | fallback should search students by name                     | matching students    |
| 3   | fallback should search households by name                   | matching households  |
| 4   | should filter by entity types                               | only requested types |

---

## Section 2 — Integration Tests (E2E)

### 2.1 Households (`apps/api/test/households.e2e-spec.ts`)

| #   | Test                                                                 | Status           |
| --- | -------------------------------------------------------------------- | ---------------- |
| 1   | POST /households — should create household with emergency contacts   | 201              |
| 2   | POST /households — should reject without students.manage             | 403              |
| 3   | POST /households — should reject invalid body (no name)              | 400              |
| 4   | GET /households — should list households                             | 200 + data array |
| 5   | GET /households/:id — should return household detail                 | 200              |
| 6   | GET /households/:id — should return 404 for non-existent             | 404              |
| 7   | PATCH /households/:id — should update name                           | 200              |
| 8   | PUT /households/:id/billing-parent — should set billing parent       | 200              |
| 9   | PUT /households/:id/billing-parent — should reject unlinked parent   | 400              |
| 10  | POST /households/:id/emergency-contacts — should add contact         | 201              |
| 11  | POST /households/:id/emergency-contacts — should reject when 3 exist | 400              |
| 12  | DELETE /households/:id/emergency-contacts/:cid — should remove       | 204              |
| 13  | DELETE /households/:id/emergency-contacts/:cid — should block last   | 400              |
| 14  | POST /households/:id/parents — should link parent                    | 201              |
| 15  | DELETE /households/:id/parents/:pid — should unlink parent           | 204              |
| 16  | POST /households/merge — should merge two households                 | 200              |
| 17  | POST /households/split — should split household                      | 200              |
| 18  | GET /households/:id/preview — should return preview data             | 200              |

### 2.2 Parents (`apps/api/test/parents.e2e-spec.ts`)

| #   | Test                                                  | Status |
| --- | ----------------------------------------------------- | ------ |
| 1   | POST /parents — should create parent                  | 201    |
| 2   | POST /parents — should reject without students.manage | 403    |
| 3   | GET /parents — should list parents                    | 200    |
| 4   | GET /parents/:id — should return detail               | 200    |
| 5   | PATCH /parents/:id — should update                    | 200    |
| 6   | POST /parents/:id/students — should link student      | 201    |
| 7   | DELETE /parents/:pid/students/:sid — should unlink    | 204    |

### 2.3 Students (`apps/api/test/students.e2e-spec.ts`)

| #   | Test                                                          | Status |
| --- | ------------------------------------------------------------- | ------ |
| 1   | POST /students — should create student                        | 201    |
| 2   | POST /students — should reject without students.manage        | 403    |
| 3   | POST /students — should validate allergy details              | 400    |
| 4   | GET /students — should list with filters                      | 200    |
| 5   | GET /students/:id — should return detail                      | 200    |
| 6   | PATCH /students/:id — should update                           | 200    |
| 7   | PATCH /students/:id/status — applicant → active               | 200    |
| 8   | PATCH /students/:id/status — active → withdrawn with reason   | 200    |
| 9   | PATCH /students/:id/status — reject invalid transition        | 400    |
| 10  | PATCH /students/:id/status — reject withdrawal without reason | 400    |
| 11  | GET /students/:id/preview — should return preview             | 200    |
| 12  | GET /students/:id/export-pack — should return pack            | 200    |
| 13  | GET /students/allergy-report — should return report           | 200    |

### 2.4 Staff Profiles (`apps/api/test/staff-profiles.e2e-spec.ts`)

| #   | Test                                                                            | Status |
| --- | ------------------------------------------------------------------------------- | ------ |
| 1   | POST /staff-profiles — should create                                            | 201    |
| 2   | POST /staff-profiles — should reject duplicate                                  | 409    |
| 3   | POST /staff-profiles — should reject without users.manage                       | 403    |
| 4   | GET /staff-profiles — should list with masked bank details                      | 200    |
| 5   | GET /staff-profiles/:id — should return detail                                  | 200    |
| 6   | PATCH /staff-profiles/:id — should update                                       | 200    |
| 7   | GET /staff-profiles/:id/bank-details — should return masked details             | 200    |
| 8   | GET /staff-profiles/:id/bank-details — reject without payroll.view_bank_details | 403    |
| 9   | GET /staff-profiles/:id/preview — should return preview                         | 200    |

### 2.5 Academic Years (`apps/api/test/academic-years.e2e-spec.ts`)

| #   | Test                                                         | Status |
| --- | ------------------------------------------------------------ | ------ |
| 1   | POST /academic-years — should create                         | 201    |
| 2   | POST /academic-years — should reject overlapping dates       | 409    |
| 3   | GET /academic-years — should list                            | 200    |
| 4   | GET /academic-years/:id — should return with periods         | 200    |
| 5   | PATCH /academic-years/:id/status — planned → active          | 200    |
| 6   | PATCH /academic-years/:id/status — reject invalid transition | 400    |

### 2.6 Academic Periods (`apps/api/test/academic-periods.e2e-spec.ts`)

| #   | Test                                                         | Status |
| --- | ------------------------------------------------------------ | ------ |
| 1   | POST /academic-years/:id/periods — should create             | 201    |
| 2   | POST /academic-years/:id/periods — reject dates outside year | 400    |
| 3   | GET /academic-years/:id/periods — should list                | 200    |

### 2.7 Year Groups (`apps/api/test/year-groups.e2e-spec.ts`)

| #   | Test                                               | Status |
| --- | -------------------------------------------------- | ------ |
| 1   | POST /year-groups — should create                  | 201    |
| 2   | GET /year-groups — should list ordered             | 200    |
| 3   | DELETE /year-groups/:id — should delete unused     | 204    |
| 4   | DELETE /year-groups/:id — should block when in use | 400    |

### 2.8 Subjects (`apps/api/test/subjects.e2e-spec.ts`)

| #   | Test                                            | Status |
| --- | ----------------------------------------------- | ------ |
| 1   | POST /subjects — should create                  | 201    |
| 2   | GET /subjects — should list with filters        | 200    |
| 3   | DELETE /subjects/:id — should delete unused     | 204    |
| 4   | DELETE /subjects/:id — should block when in use | 400    |

### 2.9 Classes (`apps/api/test/classes.e2e-spec.ts`)

| #   | Test                                                           | Status |
| --- | -------------------------------------------------------------- | ------ |
| 1   | POST /classes — should create                                  | 201    |
| 2   | GET /classes — should list with filters                        | 200    |
| 3   | GET /classes/:id — should return detail                        | 200    |
| 4   | POST /classes/:id/staff — should assign staff                  | 201    |
| 5   | DELETE /classes/:id/staff/:sid/role/:r — should remove         | 204    |
| 6   | POST /classes/:id/enrolments — should enrol student            | 201    |
| 7   | POST /classes/:id/enrolments — reject already enrolled         | 409    |
| 8   | POST /classes/:id/enrolments/bulk — should bulk enrol          | 200    |
| 9   | PATCH /class-enrolments/:id/status — active → dropped          | 200    |
| 10  | PATCH /class-enrolments/:id/status — reject completed → active | 400    |
| 11  | GET /classes/:id/preview — should return preview               | 200    |

### 2.10 Promotion (`apps/api/test/promotion.e2e-spec.ts`)

| #   | Test                                                         | Status |
| --- | ------------------------------------------------------------ | ------ |
| 1   | GET /promotion/preview — should return grouped by year group | 200    |
| 2   | POST /promotion/commit — should promote students             | 200    |
| 3   | POST /promotion/commit — should graduate students            | 200    |

### 2.11 Search (`apps/api/test/search.e2e-spec.ts`)

| #   | Test                                        | Status |
| --- | ------------------------------------------- | ------ |
| 1   | GET /search?q=test — should return results  | 200    |
| 2   | GET /search — should require authentication | 401    |

### 2.12 Dashboard (`apps/api/test/dashboard.e2e-spec.ts`)

| #   | Test                                                        | Status |
| --- | ----------------------------------------------------------- | ------ |
| 1   | GET /dashboard/school-admin — should return stats           | 200    |
| 2   | GET /dashboard/school-admin — should reject unauthenticated | 401    |
| 3   | GET /dashboard/parent — should return linked students       | 200    |

---

## Section 3 — RLS Leakage Tests

### API-Level RLS (`apps/api/test/rls-leakage-p2.e2e-spec.ts`)

For each of the following, authenticate as Tenant B (e.g., Cedar) and verify Tenant A (e.g., Al Noor) data is NOT visible:

| #   | Test                                                              |
| --- | ----------------------------------------------------------------- |
| 1   | GET /households as Cedar should not return Al Noor households     |
| 2   | GET /parents as Cedar should not return Al Noor parents           |
| 3   | GET /students as Cedar should not return Al Noor students         |
| 4   | GET /staff-profiles as Cedar should not return Al Noor staff      |
| 5   | GET /academic-years as Cedar should not return Al Noor years      |
| 6   | GET /year-groups as Cedar should not return Al Noor groups        |
| 7   | GET /subjects as Cedar should not return Al Noor subjects         |
| 8   | GET /classes as Cedar should not return Al Noor classes           |
| 9   | GET /search?q=\* as Cedar should not return Al Noor entities      |
| 10  | GET /dashboard/school-admin as Cedar should show Cedar stats only |

### Table-Level RLS (direct DB with SET LOCAL)

For each new table, run a query with SET LOCAL app.current_tenant_id = Tenant B's ID and verify Tenant A's data is invisible:

| #   | Table                        |
| --- | ---------------------------- |
| 1   | households                   |
| 2   | household_emergency_contacts |
| 3   | parents                      |
| 4   | household_parents            |
| 5   | students                     |
| 6   | student_parents              |
| 7   | staff_profiles               |
| 8   | academic_years               |
| 9   | academic_periods             |
| 10  | year_groups                  |
| 11  | subjects                     |
| 12  | classes                      |
| 13  | class_staff                  |
| 14  | class_enrolments             |

---

## Section 4 — Manual QA Checklist

### Students Flow

- [ ] Navigate to Students list page
- [ ] Verify empty state shows when no students
- [ ] Create a new student with all fields
- [ ] Verify allergy details required when "Has Allergy" checked
- [ ] Verify student appears in list
- [ ] Click student row → student hub loads
- [ ] Verify Overview, Classes, Medical tabs work
- [ ] Edit student → changes saved
- [ ] Change status: applicant → active
- [ ] Change status: active → withdrawn (with reason)
- [ ] Verify withdrawal drops active enrolments
- [ ] View allergy report page, verify filters work
- [ ] Hover over student name in list → preview card appears after 300ms

### Households Flow

- [ ] Navigate to Households list page
- [ ] Create household with 1-3 emergency contacts
- [ ] Verify min 1 contact enforced
- [ ] Verify max 3 contacts enforced
- [ ] Set billing parent
- [ ] Link/unlink parents
- [ ] Test merge: select two households, merge
- [ ] Verify source archived, data moved to target
- [ ] Test split: select students/parents, create new household
- [ ] Verify needs_completion banner when appropriate

### Staff Flow

- [ ] Create staff profile for existing user
- [ ] Verify bank details encrypted and masked
- [ ] View bank details (with payroll.view_bank_details permission)
- [ ] Edit staff profile
- [ ] Verify preview card on hover

### Classes Flow

- [ ] Create class linked to academic year
- [ ] Assign staff (teacher, assistant)
- [ ] Enrol students (single and bulk)
- [ ] Change enrolment status (active → dropped, dropped → active, active → completed)
- [ ] Verify completed → active is blocked
- [ ] Remove staff assignment

### Academic Settings

- [ ] Create academic year
- [ ] Verify overlapping years rejected
- [ ] Create periods within year
- [ ] Verify period dates must be within year range
- [ ] Status transitions: planned → active → closed
- [ ] Create year groups with display_order
- [ ] Set next_year_group chain
- [ ] Create subjects with types
- [ ] Delete unused year group/subject
- [ ] Verify in-use deletion blocked

### Promotion Wizard

- [ ] Select academic year
- [ ] Preview shows students grouped by year group
- [ ] Override individual student actions
- [ ] Review summary
- [ ] Commit and verify results
- [ ] Verify student year_group_id updated (promote)
- [ ] Verify graduated students status changed
- [ ] Verify active enrolments dropped

### Dashboards

- [ ] School admin dashboard shows greeting + stats
- [ ] Stat cards show correct counts
- [ ] Households needing completion listed
- [ ] Parent dashboard shows linked students
- [ ] Placeholder sections visible

### Search

- [ ] Open command palette (Cmd+K)
- [ ] Type search query
- [ ] Results appear grouped by entity type
- [ ] Click result navigates to correct page

### RTL / i18n

- [ ] Switch to Arabic locale
- [ ] Verify all P2 pages render correctly in RTL
- [ ] Verify all new translation keys display Arabic text
- [ ] Verify no physical left/right styling breaks
- [ ] Verify LTR enforcement on email addresses and phone numbers

### Cross-Tenant (as staff of second school)

- [ ] Switch to second tenant
- [ ] Verify no data from first tenant visible
- [ ] Verify dashboard shows second tenant's stats
- [ ] Verify search only returns second tenant's entities
