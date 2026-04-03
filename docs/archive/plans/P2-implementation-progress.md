# P2 Implementation Progress — Paused for P1 Testing

## What Was Completed

### Step 1: Prisma Schema Updated (DONE)

The file `packages/prisma/schema.prisma` has been fully updated with all P2 entities:

**New Enums Added:**

- `HouseholdStatus` (active, inactive, archived)
- `ParentStatus` (active, inactive)
- `StudentStatus` (applicant, active, withdrawn, graduated, archived)
- `Gender` (male, female, other, prefer_not_to_say)
- `AcademicYearStatus` (planned, active, closed)
- `AcademicPeriodStatus` (planned, active, closed)
- `AcademicPeriodType` (term, semester, quarter, custom)
- `SubjectType` (academic, supervision, duty, other)
- `ClassStatus` (active, inactive, archived)
- `ClassStaffRole` (teacher, assistant, homeroom, substitute)
- `EmploymentStatus` (active, inactive)
- `EmploymentType` (full_time, part_time, contract)
- `ClassEnrolmentStatus` (active, dropped, completed)

**New Models Added:**

- `Household` — with all columns, indexes, billing parent FK
- `HouseholdEmergencyContact` — with household FK, display_order
- `Parent` — with CITEXT email, JSONB preferred_contact_channels, user linking
- `HouseholdParent` — composite PK (household_id, parent_id)
- `Student` — with full_name/full_name_ar (nullable placeholders for generated columns), allergy fields, status
- `StudentParent` — composite PK (student_id, parent_id)
- `StaffProfile` — with encrypted bank fields, unique (tenant_id, user_id)
- `AcademicYear` — with unique (tenant_id, name)
- `AcademicPeriod` — with unique (tenant_id, academic_year_id, name)
- `YearGroup` — with self-referencing next_year_group_id
- `Subject` — with subject_type, unique (tenant_id, name)
- `Class` — with unique (tenant_id, name, academic_year_id)
- `ClassStaff` — composite PK (class_id, staff_profile_id, assignment_role), no updated_at
- `ClassEnrolment` — with status, start/end dates

**Relations Added to Existing Models:**

- `Tenant` model: 14 new relation fields (households, parents, students, etc.)
- `User` model: 2 new relation fields (staff_profiles, parents)

**Schema validated** with `npx prisma@6 format` — passes.

---

## What Still Needs To Be Done

### Step 1 (remaining): Post-Migration SQL

Create `packages/prisma/migrations/20260316100000_add_p2_core_entities/post_migrate.sql` with:

1. **RLS policies** for all 14 new tables:
   - `households`, `household_emergency_contacts`, `parents`, `household_parents`
   - `students`, `student_parents`, `staff_profiles`
   - `academic_years`, `academic_periods`, `year_groups`, `subjects`
   - `classes`, `class_staff`, `class_enrolments`
   - Pattern: `ALTER TABLE {t} ENABLE ROW LEVEL SECURITY; ALTER TABLE {t} FORCE ROW LEVEL SECURITY; DROP POLICY IF EXISTS {t}_tenant_isolation ON {t}; CREATE POLICY {t}_tenant_isolation ON {t} USING (tenant_id = current_setting('app.current_tenant_id')::uuid) WITH CHECK (...);`

2. **set_updated_at() triggers** for 13 tables (all except `class_staff`):
   - Pattern: `DROP TRIGGER IF EXISTS trg_{t}_updated_at ON {t}; CREATE TRIGGER trg_{t}_updated_at BEFORE UPDATE ON {t} FOR EACH ROW EXECUTE FUNCTION set_updated_at();`

3. **Generated columns** on `students`:

   ```sql
   ALTER TABLE students DROP COLUMN IF EXISTS full_name;
   ALTER TABLE students DROP COLUMN IF EXISTS full_name_ar;
   ALTER TABLE students ADD COLUMN full_name VARCHAR(255) GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED;
   ALTER TABLE students ADD COLUMN full_name_ar VARCHAR(255) GENERATED ALWAYS AS (
     CASE WHEN first_name_ar IS NOT NULL AND last_name_ar IS NOT NULL
       THEN first_name_ar || ' ' || last_name_ar ELSE NULL END
   ) STORED;
   ```

4. **Exclusion constraints** (btree_gist already enabled from P1):

   ```sql
   ALTER TABLE academic_years ADD CONSTRAINT excl_academic_years_overlap
     EXCLUDE USING gist (tenant_id WITH =, daterange(start_date, end_date, '[]') WITH &&);
   ALTER TABLE academic_periods ADD CONSTRAINT excl_academic_periods_overlap
     EXCLUDE USING gist (tenant_id WITH =, academic_year_id WITH =, daterange(start_date, end_date, '[]') WITH &&);
   ```

5. **Partial index** for allergy:

   ```sql
   CREATE INDEX idx_students_allergy ON students(tenant_id) WHERE has_allergy = true;
   ```

6. Run `npx prisma migrate dev --name add-p2-core-entities` to generate the migration SQL.

### Step 2: Shared Types and Zod Schemas

Create in `packages/shared/src/`:

**Types files:**

- `types/household.ts` — Household, HouseholdDetail, HouseholdEmergencyContact, HouseholdParent
- `types/parent.ts` — Parent, ParentDetail
- `types/student.ts` — Student, StudentDetail, StudentExportPack, AllergyReportEntry
- `types/staff-profile.ts` — StaffProfile, StaffProfileDetail, BankDetails
- `types/academic.ts` — AcademicYear, AcademicYearDetail, AcademicPeriod, YearGroup, Subject
- `types/class.ts` — Class, ClassDetail, ClassStaff, ClassEnrolment
- `types/preview.ts` — PreviewResponse, PreviewFact
- `types/search.ts` — SearchResult, SearchResponse
- `types/dashboard.ts` — SchoolAdminDashboard, ParentDashboard

**Schema files:**

- `schemas/household.schema.ts` — createHouseholdSchema, updateHouseholdSchema, mergeHouseholdSchema, splitHouseholdSchema, emergencyContactSchema
- `schemas/parent.schema.ts` — createParentSchema, updateParentSchema
- `schemas/student.schema.ts` — createStudentSchema, updateStudentSchema, updateStudentStatusSchema
- `schemas/staff-profile.schema.ts` — createStaffProfileSchema, updateStaffProfileSchema
- `schemas/academic.schema.ts` — createAcademicYearSchema, updateAcademicYearSchema, createAcademicPeriodSchema, updateAcademicPeriodSchema, createYearGroupSchema, updateYearGroupSchema, createSubjectSchema, updateSubjectSchema
- `schemas/class.schema.ts` — createClassSchema, updateClassSchema, assignClassStaffSchema, createEnrolmentSchema, bulkEnrolSchema, updateEnrolmentStatusSchema
- `schemas/search.schema.ts` — searchQuerySchema
- `schemas/promotion.schema.ts` — promotionCommitSchema

**Constants files:**

- `constants/student-status.ts` — VALID_STUDENT_TRANSITIONS map
- `constants/class-enrolment-status.ts` — VALID_ENROLMENT_TRANSITIONS map

**Update `packages/shared/src/index.ts`** to export all new types, schemas, constants.

### Step 3: EncryptionService

**Already exists** at `apps/api/src/modules/configuration/encryption.service.ts` — reuse it. Just ensure it's exported from a module that other modules can import (it's in `ConfigurationModule`).

### Step 4: Backend — Academics Module

Create `apps/api/src/modules/academics/`:

- `academics.module.ts` — imports PrismaModule, exports all services
- `academic-years.controller.ts` — `@Controller('v1/academic-years')`, guards: AuthGuard, PermissionGuard
- `academic-years.service.ts` — CRUD + status transitions (planned→active→closed), catch exclusion constraint
- `academic-periods.controller.ts` — `@Controller('v1/academic-years/:yearId/periods')` and `@Controller('v1/academic-periods')`
- `academic-periods.service.ts` — CRUD + date-within-year validation + status transitions
- `year-groups.controller.ts` — `@Controller('v1/year-groups')`
- `year-groups.service.ts` — CRUD + delete guard (in-use check)
- `subjects.controller.ts` — `@Controller('v1/subjects')`
- `subjects.service.ts` — CRUD + delete guard (in-use check)
- `promotion.controller.ts` — `@Controller('v1/promotion')`
- `promotion.service.ts` — preview() and commit() methods
- `dto/` — all DTO files per schemas above

### Step 5: Backend — Staff Profiles Module

Create `apps/api/src/modules/staff-profiles/`:

- `staff-profiles.module.ts`
- `staff-profiles.controller.ts` — `@Controller('v1/staff-profiles')`
- `staff-profiles.service.ts` — CRUD + bank encryption/masking + preview
- `dto/` — create/update DTOs

### Step 6: Backend — Households and Parents Modules

Create `apps/api/src/modules/households/`:

- `households.module.ts`
- `households.controller.ts` — `@Controller('v1/households')`
- `households.service.ts` — Full CRUD + emergency contacts + link/unlink parents + merge + split + preview + needs_completion
- `dto/` — create, update, merge, split, emergency contact DTOs

Create `apps/api/src/modules/parents/`:

- `parents.module.ts`
- `parents.controller.ts` — `@Controller('v1/parents')`
- `parents.service.ts` — CRUD + link/unlink students + auto user linking by email
- `dto/` — create, update DTOs

### Step 7: Backend — Students Module

Create `apps/api/src/modules/students/`:

- `students.module.ts`
- `students.controller.ts` — `@Controller('v1/students')`
- `students.service.ts` — CRUD + status state machine + preview + export pack + allergy report
- `dto/` — create, update, update-status DTOs
- Status transitions: applicant→active, active→withdrawn/graduated/archived, withdrawn→active, graduated→archived
- Withdrawal side-effect: drop all active class enrolments

### Step 8: Backend — Classes and Enrolments Module

Create `apps/api/src/modules/classes/`:

- `classes.module.ts`
- `classes.controller.ts` — `@Controller('v1/classes')`
- `classes.service.ts` — CRUD + assign/remove staff + preview
- `class-enrolments.controller.ts` — enrolment endpoints (nested under classes + standalone)
- `class-enrolments.service.ts` — create, bulkEnrol, updateStatus, dropAllActiveForStudent, findAllForClass
- `dto/` — class DTOs, enrolment DTOs, staff assignment DTOs
- Enrolment transitions: active→dropped, active→completed, dropped→active, BLOCKED: completed→active

### Step 9: Backend — Promotion Service

Add to Academics module:

- `promotion.controller.ts` — GET /promotion/preview, POST /promotion/commit
- `promotion.service.ts`:
  - `preview(tenantId, academicYearId)` — load year groups + students, propose promote/graduate/hold_back
  - `commit(tenantId, dto)` — batch: promote/hold_back/skip/graduate/withdraw, single transaction

### Step 10: Backend — Search Module

Create `apps/api/src/modules/search/`:

- `search.module.ts`
- `search.controller.ts` — `@Controller('v1/search')`
- `search.service.ts` — Meilisearch query with tenant filter + PostgreSQL ILIKE fallback
- `search-index.service.ts` — indexEntity, removeEntity, reindexAll
- `meilisearch.client.ts` — Meilisearch connection setup, graceful degradation

### Step 11: Backend — Dashboard Module

Create `apps/api/src/modules/dashboard/`:

- `dashboard.module.ts`
- `dashboard.controller.ts` — `@Controller('v1/dashboard')`
- `dashboard.service.ts`:
  - `schoolAdmin(tenantId, userId)` — greeting, stats (students, staff, classes, approvals), needs_completion households
  - `parent(tenantId, userId)` — greeting, linked students, placeholder invoices/announcements

### Step 12: Backend — Preview Endpoints

Add to each entity service:

- `HouseholdsService.preview()` — Redis 30s cache, key: `preview:household:{id}`
- `StudentsService.preview()` — Redis 30s cache, key: `preview:student:{id}`
- `StaffProfilesService.preview()` — Redis 30s cache, key: `preview:staff:{id}`
- `ClassesService.preview()` — Redis 30s cache, key: `preview:class:{id}`
- Invalidate cache on entity update (del key in update methods)

### Step 13: Register All Modules

Update `apps/api/src/app.module.ts` imports:

```typescript
imports: [
  // ... existing
  HouseholdsModule,
  ParentsModule,
  StudentsModule,
  StaffProfilesModule,
  AcademicsModule,
  ClassesModule,
  SearchModule,
  DashboardModule,
];
```

### Step 14: Worker — Search Index Jobs

Create in `apps/worker/src/`:

- `processors/search-index.processor.ts` — extends TenantAwareJob, handles search:index-entity
- `processors/search-reindex.processor.ts` — extends TenantAwareJob, handles search:full-reindex (nightly)
- `queues/search.queue.ts` — queue definition
- Register in worker module

### Step 15: Frontend — Shared Components

Create:

- `apps/web/src/components/hover-preview-card.tsx` — 300ms delay, floating card, micro-skeleton, 150ms fade-out
- `apps/web/src/components/record-hub.tsx` — header + overview strip + tabbed sections
- `apps/web/src/components/entity-link.tsx` — link wrapped with HoverPreviewCard
- Extend StatusBadge in `packages/ui/` with new statuses

### Step 16: Frontend — Academic Settings Pages

Create:

- `apps/web/src/app/[locale]/(school)/settings/academic-years/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/academic-years/_components/academic-year-form.tsx`
- `apps/web/src/app/[locale]/(school)/settings/academic-years/_components/period-management.tsx`
- `apps/web/src/app/[locale]/(school)/settings/year-groups/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/year-groups/_components/year-group-form.tsx`
- `apps/web/src/app/[locale]/(school)/settings/subjects/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/subjects/_components/subject-form.tsx`

### Step 17: Frontend — Students Pages

Create:

- `apps/web/src/app/[locale]/(school)/students/page.tsx` — list with filters, search, hover preview
- `apps/web/src/app/[locale]/(school)/students/new/page.tsx` — create form
- `apps/web/src/app/[locale]/(school)/students/[id]/page.tsx` — hub with tabs (Overview, Classes, Medical, Activity)
- `apps/web/src/app/[locale]/(school)/students/[id]/edit/page.tsx` — edit form
- `apps/web/src/app/[locale]/(school)/students/allergy-report/page.tsx` — allergy report table
- `apps/web/src/app/[locale]/(school)/students/_components/student-form.tsx`
- `apps/web/src/app/[locale]/(school)/students/_components/student-table.tsx`

### Step 18: Frontend — Households Pages

Create:

- `apps/web/src/app/[locale]/(school)/households/page.tsx` — list
- `apps/web/src/app/[locale]/(school)/households/new/page.tsx` — create with emergency contacts
- `apps/web/src/app/[locale]/(school)/households/[id]/page.tsx` — hub (Overview, Students, Parents, Emergency, Activity)
- `apps/web/src/app/[locale]/(school)/households/[id]/edit/page.tsx`
- `apps/web/src/app/[locale]/(school)/households/_components/household-form.tsx`
- `apps/web/src/app/[locale]/(school)/households/_components/household-table.tsx`
- `apps/web/src/app/[locale]/(school)/households/_components/merge-dialog.tsx`
- `apps/web/src/app/[locale]/(school)/households/_components/split-dialog.tsx`
- `apps/web/src/app/[locale]/(school)/households/_components/emergency-contacts-form.tsx`

### Step 19: Frontend — Staff Pages

Create:

- `apps/web/src/app/[locale]/(school)/staff/page.tsx` — list
- `apps/web/src/app/[locale]/(school)/staff/new/page.tsx`
- `apps/web/src/app/[locale]/(school)/staff/[id]/page.tsx` — hub (Overview, Classes, Bank Details)
- `apps/web/src/app/[locale]/(school)/staff/[id]/edit/page.tsx`
- `apps/web/src/app/[locale]/(school)/staff/_components/staff-form.tsx`
- `apps/web/src/app/[locale]/(school)/staff/_components/staff-table.tsx`

### Step 20: Frontend — Classes Pages

Create:

- `apps/web/src/app/[locale]/(school)/classes/page.tsx` — list
- `apps/web/src/app/[locale]/(school)/classes/new/page.tsx`
- `apps/web/src/app/[locale]/(school)/classes/[id]/page.tsx` — hub (Overview, Students, Staff, Schedule placeholder)
- `apps/web/src/app/[locale]/(school)/classes/[id]/edit/page.tsx`
- `apps/web/src/app/[locale]/(school)/classes/_components/class-form.tsx`
- `apps/web/src/app/[locale]/(school)/classes/_components/class-table.tsx`
- `apps/web/src/app/[locale]/(school)/classes/_components/enrolment-management.tsx`
- `apps/web/src/app/[locale]/(school)/classes/_components/staff-assignment.tsx`

### Step 21: Frontend — Promotion Wizard

Create:

- `apps/web/src/app/[locale]/(school)/promotion/page.tsx`
- `apps/web/src/app/[locale]/(school)/promotion/_components/promotion-wizard.tsx` — multi-step
- `apps/web/src/app/[locale]/(school)/promotion/_components/promotion-preview.tsx`
- `apps/web/src/app/[locale]/(school)/promotion/_components/promotion-summary.tsx`

### Step 22: Frontend — Dashboards

- Replace `apps/web/src/app/[locale]/(school)/dashboard/page.tsx` with real school admin dashboard
- Create `apps/web/src/app/[locale]/(school)/dashboard/parent/page.tsx`

### Step 23: Frontend — Search Integration

- Update command palette to wire to `GET /api/v1/search`
- Group results by entity type, show highlights

### Step 24: Frontend — i18n

- Update `apps/web/messages/en.json` with all new keys
- Update `apps/web/messages/ar.json` with all Arabic translations

### Step 25: Settings Layout + Navigation

- Add Academic Years, Year Groups, Subjects links to settings navigation
- Add Promotion link to school sidebar

### Final: Generate Output Files

- Create `plans/phases-results/P2-results.md`
- Create `plans/phases-testing-instruction/P2-testing.md`

---

## Key Patterns Learned From P1 Codebase

### Controller Pattern

- `@Controller('v1/...')`, `@UseGuards(AuthGuard, PermissionGuard)`
- `@RequiresPermission('domain.action')` on methods
- `@UsePipes(new ZodValidationPipe(schema))` for body validation
- `@Query(new ZodValidationPipe(schema))` for query validation
- `@Param('id', ParseUUIDPipe)` for UUID params
- `@CurrentUser()`, `@CurrentTenant()` decorators

### Service Pattern

- `@Injectable()`, inject PrismaService, RedisService
- Throw `ConflictException`, `NotFoundException`, `BadRequestException`, `ForbiddenException`
- Error shape: `{ code: 'ERROR_CODE', message: 'Human message' }`
- Pagination: offset-based, return `{ data, meta: { page, pageSize, total } }`

### RLS Pattern

- `createRlsClient(prisma, tenantContext)` returns extended Prisma client
- All tenant-scoped queries via interactive transaction: `prismaWithRls.$transaction(async (tx) => { ... })`

### EncryptionService (already exists)

- Located at `apps/api/src/modules/configuration/encryption.service.ts`
- `encrypt(plaintext)` → returns `{ encrypted, keyRef }`
- `decrypt(encrypted, keyRef)` → plaintext
- `mask(value)` → `****{last4}`

### Permission Keys Already Seeded

- `students.manage`, `students.view` (admin tier)
- `users.manage`, `users.view` (admin tier)
- `payroll.view_bank_details` (admin tier)
- `parent.view_own_students` (parent tier)
- No new permissions needed for P2.

### Frontend Patterns

- Server components by default, `'use client'` only for interactivity
- `useTranslations()` from next-intl in client components
- Logical Tailwind only: `ms-`, `me-`, `ps-`, `pe-`, `text-start`, `text-end`
- API calls via `apiClient<T>(path, options)` from `apps/web/src/lib/api-client.ts`
- Components from `@school/ui` package (shadcn/Radix)

---

## How to Resume

Run `/implement-phase P2` in a fresh session and provide this file as context. The executor should:

1. Skip re-reading context files (patterns are documented above)
2. Note that the Prisma schema is already updated — do NOT re-add enums/models
3. Start from "Step 1 (remaining): Post-Migration SQL" and continue sequentially
4. The migration directory `packages/prisma/migrations/20260316100000_add_p2_core_entities/` already exists (empty)
