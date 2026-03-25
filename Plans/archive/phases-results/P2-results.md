# P2 Results — Households, Parents, Students, Staff, Academics

## Summary

Phase 2 delivers the core domain entities of the school operating system: households, parents, students, staff profiles, and the full academic structure (academic years, periods, year groups, subjects, classes, enrolments). It includes Meilisearch indexing with PostgreSQL ILIKE fallback, preview endpoints with Redis caching, the promotion/rollover wizard, household merge/split workflows, the allergy report, initial school admin and parent dashboards, and full frontend pages for all entities. 14 new database tables were created with RLS policies, triggers, generated columns, and exclusion constraints.

---

## Database Migrations

### Migration: `20260316100000_add_p2_core_entities`

**New Enums (13):**
HouseholdStatus, ParentStatus, StudentStatus, Gender, AcademicYearStatus, AcademicPeriodStatus, AcademicPeriodType, SubjectType, ClassStatus, ClassStaffRole, EmploymentStatus, EmploymentType, ClassEnrolmentStatus

**New Tables (14):**
| Table | Columns | PK | Notes |
|-------|---------|----|----|
| `households` | 13 | UUID | tenant-scoped, billing parent FK |
| `household_emergency_contacts` | 8 | UUID | max 3 per household |
| `parents` | 14 | UUID | CITEXT email, JSONB preferred_contact_channels |
| `household_parents` | 5 | composite (household_id, parent_id) | join table |
| `students` | 20 | UUID | generated full_name/full_name_ar columns |
| `student_parents` | 5 | composite (student_id, parent_id) | join table |
| `staff_profiles` | 13 | UUID | encrypted bank fields, unique (tenant_id, user_id) |
| `academic_years` | 7 | UUID | exclusion constraint for date overlap |
| `academic_periods` | 9 | UUID | exclusion constraint for date overlap within year |
| `year_groups` | 7 | UUID | self-referencing next_year_group_id |
| `subjects` | 8 | UUID | unique (tenant_id, name) |
| `classes` | 10 | UUID | unique (tenant_id, name, academic_year_id) |
| `class_staff` | 4 | composite (class_id, staff_profile_id, assignment_role) | no updated_at |
| `class_enrolments` | 8 | UUID | status transitions enforced |

**Post-Migration SQL:**
- RLS policies for all 14 tables (ENABLE + FORCE + tenant isolation policy)
- `set_updated_at()` triggers for 13 tables (all except class_staff)
- Generated columns: students.full_name, students.full_name_ar
- Exclusion constraints: academic_years overlap, academic_periods overlap
- Partial index: idx_students_allergy (WHERE has_allergy = true)

---

## API Endpoints

### Households (14 endpoints)
| Method | Path | Permission |
|--------|------|-----------|
| POST | /v1/households | students.manage |
| GET | /v1/households | students.view |
| GET | /v1/households/:id | students.view |
| PATCH | /v1/households/:id | students.manage |
| PATCH | /v1/households/:id/status | students.manage |
| PUT | /v1/households/:id/billing-parent | students.manage |
| POST | /v1/households/:id/emergency-contacts | students.manage |
| PATCH | /v1/households/:householdId/emergency-contacts/:contactId | students.manage |
| DELETE | /v1/households/:householdId/emergency-contacts/:contactId | students.manage |
| POST | /v1/households/:id/parents | students.manage |
| DELETE | /v1/households/:householdId/parents/:parentId | students.manage |
| POST | /v1/households/merge | students.manage |
| POST | /v1/households/split | students.manage |
| GET | /v1/households/:id/preview | students.view |

### Parents (6 endpoints)
| Method | Path | Permission |
|--------|------|-----------|
| POST | /v1/parents | students.manage |
| GET | /v1/parents | students.view |
| GET | /v1/parents/:id | students.view |
| PATCH | /v1/parents/:id | students.manage |
| POST | /v1/parents/:id/students | students.manage |
| DELETE | /v1/parents/:parentId/students/:studentId | students.manage |

### Students (8 endpoints)
| Method | Path | Permission |
|--------|------|-----------|
| POST | /v1/students | students.manage |
| GET | /v1/students | students.view |
| GET | /v1/students/:id | students.view |
| PATCH | /v1/students/:id | students.manage |
| PATCH | /v1/students/:id/status | students.manage |
| GET | /v1/students/:id/preview | students.view |
| GET | /v1/students/:id/export-pack | students.manage |
| GET | /v1/students/allergy-report | students.view |

### Staff Profiles (6 endpoints)
| Method | Path | Permission |
|--------|------|-----------|
| POST | /v1/staff-profiles | users.manage |
| GET | /v1/staff-profiles | users.view |
| GET | /v1/staff-profiles/:id | users.view |
| PATCH | /v1/staff-profiles/:id | users.manage |
| GET | /v1/staff-profiles/:id/bank-details | payroll.view_bank_details |
| GET | /v1/staff-profiles/:id/preview | users.view |

### Academic Years (5 endpoints)
| Method | Path | Permission |
|--------|------|-----------|
| POST | /v1/academic-years | students.manage |
| GET | /v1/academic-years | students.view |
| GET | /v1/academic-years/:id | students.view |
| PATCH | /v1/academic-years/:id | students.manage |
| PATCH | /v1/academic-years/:id/status | students.manage |

### Academic Periods (4 endpoints)
| Method | Path | Permission |
|--------|------|-----------|
| POST | /v1/academic-years/:yearId/periods | students.manage |
| GET | /v1/academic-years/:yearId/periods | students.view |
| PATCH | /v1/academic-periods/:id | students.manage |
| PATCH | /v1/academic-periods/:id/status | students.manage |

### Year Groups (4 endpoints)
| Method | Path | Permission |
|--------|------|-----------|
| POST | /v1/year-groups | students.manage |
| GET | /v1/year-groups | students.view |
| PATCH | /v1/year-groups/:id | students.manage |
| DELETE | /v1/year-groups/:id | students.manage |

### Subjects (4 endpoints)
| Method | Path | Permission |
|--------|------|-----------|
| POST | /v1/subjects | students.manage |
| GET | /v1/subjects | students.view |
| PATCH | /v1/subjects/:id | students.manage |
| DELETE | /v1/subjects/:id | students.manage |

### Classes (8 endpoints)
| Method | Path | Permission |
|--------|------|-----------|
| POST | /v1/classes | students.manage |
| GET | /v1/classes | students.view |
| GET | /v1/classes/:id | students.view |
| PATCH | /v1/classes/:id | students.manage |
| PATCH | /v1/classes/:id/status | students.manage |
| POST | /v1/classes/:id/staff | students.manage |
| DELETE | /v1/classes/:classId/staff/:staffProfileId/role/:role | students.manage |
| GET | /v1/classes/:id/preview | students.view |

### Class Enrolments (4 endpoints)
| Method | Path | Permission |
|--------|------|-----------|
| GET | /v1/classes/:classId/enrolments | students.view |
| POST | /v1/classes/:classId/enrolments | students.manage |
| POST | /v1/classes/:classId/enrolments/bulk | students.manage |
| PATCH | /v1/class-enrolments/:id/status | students.manage |

### Promotion (2 endpoints)
| Method | Path | Permission |
|--------|------|-----------|
| GET | /v1/promotion/preview | students.manage |
| POST | /v1/promotion/commit | students.manage |

### Search (1 endpoint)
| Method | Path | Permission |
|--------|------|-----------|
| GET | /v1/search | Authenticated |

### Dashboard (2 endpoints)
| Method | Path | Permission |
|--------|------|-----------|
| GET | /v1/dashboard/school-admin | students.view |
| GET | /v1/dashboard/parent | parent.view_own_students |

**Total: 68 API endpoints**

---

## Services

| Service | Module | Responsibilities |
|---------|--------|-----------------|
| HouseholdsService | HouseholdsModule | CRUD, merge/split, emergency contacts, billing parent, preview, needs_completion |
| ParentsService | ParentsModule | CRUD, student/household linking, user auto-linking by email |
| StudentsService | StudentsModule | CRUD, status state machine, allergy report, export pack, preview |
| StaffProfilesService | StaffProfilesModule | CRUD, bank encryption/masking, preview |
| AcademicYearsService | AcademicsModule | CRUD, status transitions, exclusion constraint handling |
| AcademicPeriodsService | AcademicsModule | CRUD, date-within-year validation, status transitions |
| YearGroupsService | AcademicsModule | CRUD, in-use delete guard |
| SubjectsService | AcademicsModule | CRUD, in-use delete guard |
| ClassesService | ClassesModule | CRUD, staff assignment, preview |
| ClassEnrolmentsService | ClassesModule | Enrol, bulk enrol, status transitions, drop active for student |
| PromotionService | AcademicsModule | Preview proposed actions, batch commit |
| SearchService | SearchModule | Meilisearch query + PostgreSQL ILIKE fallback |
| SearchIndexService | SearchModule | Index/remove entities for Meilisearch |
| MeilisearchClient | SearchModule | Graceful Meilisearch connection with fallback |
| DashboardService | DashboardModule | School admin stats, parent linked students |

---

## Frontend

### Shared Components
| Component | File | Description |
|-----------|------|-------------|
| HoverPreviewCard | apps/web/src/components/hover-preview-card.tsx | 300ms hover delay, floating preview card |
| RecordHub | apps/web/src/components/record-hub.tsx | Entity detail layout with tabs |
| EntityLink | apps/web/src/components/entity-link.tsx | Link with HoverPreviewCard |
| GlobalSearch | apps/web/src/components/global-search.tsx | Search integration for command palette |

### Pages
| Route | File | Type |
|-------|------|------|
| /students | students/page.tsx | List with filters |
| /students/new | students/new/page.tsx | Create form |
| /students/[id] | students/[id]/page.tsx | Hub with tabs |
| /students/[id]/edit | students/[id]/edit/page.tsx | Edit form |
| /students/allergy-report | students/allergy-report/page.tsx | Allergy report |
| /households | households/page.tsx | List |
| /households/new | households/new/page.tsx | Create with emergency contacts |
| /households/[id] | households/[id]/page.tsx | Hub with merge/split |
| /households/[id]/edit | households/[id]/edit/page.tsx | Edit |
| /staff | staff/page.tsx | List |
| /staff/new | staff/new/page.tsx | Create |
| /staff/[id] | staff/[id]/page.tsx | Hub with bank details |
| /staff/[id]/edit | staff/[id]/edit/page.tsx | Edit |
| /classes | classes/page.tsx | List |
| /classes/new | classes/new/page.tsx | Create |
| /classes/[id] | classes/[id]/page.tsx | Hub with enrolments/staff |
| /classes/[id]/edit | classes/[id]/edit/page.tsx | Edit |
| /settings/academic-years | settings/academic-years/page.tsx | Academic years + periods |
| /settings/year-groups | settings/year-groups/page.tsx | Year groups management |
| /settings/subjects | settings/subjects/page.tsx | Subjects management |
| /promotion | promotion/page.tsx | Multi-step promotion wizard |
| /dashboard | dashboard/page.tsx | School admin dashboard |
| /dashboard/parent | dashboard/parent/page.tsx | Parent dashboard |

---

## Background Jobs

| Job Name | Queue | Trigger | Payload |
|----------|-------|---------|---------|
| search:index-entity | search-sync | Entity create/update/delete | tenant_id, entity_type, entity_id, action |
| search:full-reindex | search-sync | Nightly cron | tenant_id |

---

## Configuration

- No new environment variables required (MEILISEARCH_URL and MEILISEARCH_API_KEY are optional — fallback to PostgreSQL)
- No new permissions seeded (uses existing: students.manage, students.view, users.manage, users.view, payroll.view_bank_details, parent.view_own_students)
- EncryptionService reused from P1 ConfigurationModule

---

## Files Created

### Database (2 files)
- packages/prisma/migrations/20260316100000_add_p2_core_entities/migration.sql
- packages/prisma/migrations/20260316100000_add_p2_core_entities/post_migrate.sql

### Shared Types (9 files)
- packages/shared/src/types/household.ts
- packages/shared/src/types/parent.ts
- packages/shared/src/types/student.ts
- packages/shared/src/types/staff-profile.ts
- packages/shared/src/types/academic.ts
- packages/shared/src/types/class.ts
- packages/shared/src/types/preview.ts
- packages/shared/src/types/search.ts
- packages/shared/src/types/dashboard.ts

### Shared Schemas (8 files)
- packages/shared/src/schemas/household.schema.ts
- packages/shared/src/schemas/parent.schema.ts
- packages/shared/src/schemas/student.schema.ts
- packages/shared/src/schemas/staff-profile.schema.ts
- packages/shared/src/schemas/academic.schema.ts
- packages/shared/src/schemas/class.schema.ts
- packages/shared/src/schemas/search.schema.ts
- packages/shared/src/schemas/promotion.schema.ts

### Shared Constants (2 files)
- packages/shared/src/constants/student-status.ts
- packages/shared/src/constants/class-enrolment-status.ts

### Backend Modules (43 files)
- apps/api/src/modules/households/ (8 files: module, controller, service, 5 DTOs)
- apps/api/src/modules/parents/ (5 files: module, controller, service, 2 DTOs)
- apps/api/src/modules/students/ (6 files: module, controller, service, 3 DTOs)
- apps/api/src/modules/staff-profiles/ (5 files: module, controller, service, 2 DTOs)
- apps/api/src/modules/academics/ (19 files: module, 4 controllers, 4 services, promotion controller+service, 9 DTOs)
- apps/api/src/modules/classes/ (12 files: module, 2 controllers, 2 services, 6 DTOs)
- apps/api/src/modules/search/ (5 files: module, controller, service, index service, meilisearch client)
- apps/api/src/modules/dashboard/ (3 files: module, controller, service)

### Worker (2 files)
- apps/worker/src/processors/search-index.processor.ts
- apps/worker/src/processors/search-reindex.processor.ts

### Frontend Components (4 files)
- apps/web/src/components/hover-preview-card.tsx
- apps/web/src/components/record-hub.tsx
- apps/web/src/components/entity-link.tsx
- apps/web/src/components/global-search.tsx

### Frontend Pages (38 files)
- students/ — 5 pages + 1 form component
- households/ — 4 pages + 4 component files (form, merge, split, emergency contacts)
- staff/ — 4 pages + 1 form component
- classes/ — 4 pages + 3 component files (form, enrolments, staff assignment)
- settings/academic-years/ — 1 page + 2 components
- settings/year-groups/ — 1 page + 1 component
- settings/subjects/ — 1 page + 1 component
- promotion/ — 1 page + 3 components
- dashboard/ — 1 page (replaced) + 1 parent page

---

## Files Modified

- packages/prisma/schema.prisma — 14 new models, 13 new enums, relations on Tenant and User
- packages/shared/src/index.ts — exports for all new types, schemas, constants
- apps/api/src/app.module.ts — 8 new module imports
- apps/api/src/common/middleware/rls.middleware.ts — relaxed parameter type
- apps/worker/src/worker.module.ts — search processors registered
- apps/web/src/app/[locale]/(school)/layout.tsx — Promotion nav link, GlobalSearch
- apps/web/src/app/[locale]/(school)/settings/layout.tsx — 3 new setting tabs
- apps/web/messages/en.json — all P2 translation keys
- apps/web/messages/ar.json — all P2 Arabic translations

---

## Known Limitations

- **Meilisearch integration is stub**: The search processors have TODO markers for actual Meilisearch push calls. PostgreSQL ILIKE fallback is fully functional.
- **Student export pack**: Returns empty arrays for attendance, grades, and report cards (placeholders for P4a/P5).
- **Parent dashboard**: Outstanding invoices and announcements are placeholder arrays (populated in P6/P8).
- **Search index sync**: Entity services do not yet call SearchIndexService.indexEntity() after mutations — this should be wired in when Meilisearch is deployed.
- **Visual regression tests**: Not included (deferred to P9 with Playwright).

---

## Deviations from Plan

- **Allergy report URL**: Implemented at `/v1/students/allergy-report` instead of `/v1/reports/allergy` for cleaner controller scoping.
- **RLS middleware type**: `createRlsClient` parameter type relaxed from full `TenantContext` to `{ tenant_id: string }` since only tenant_id is used — this is a minor improvement, not a scope change.
