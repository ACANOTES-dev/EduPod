# Phase 2 — Implementation Plan

# Households, Parents, Students, Staff, Academics

---

## Section 1 — Overview

Phase 2 builds the core domain entities of the school operating system: households, parents, students, staff profiles, and the full academic structure (academic years, periods, year groups, subjects, classes, enrolments). It also delivers Meilisearch indexing for searchable entities, preview endpoints with hover cards, record hub pages, initial dashboards (school admin and parent), the promotion/rollover wizard, household merge/split workflows, and the allergy report.

**Dependencies on Phase 1:**

- `Tenant`, `TenantMembership`, `User`, `Role`, `Permission`, `RolePermission`, `MembershipRole` — all exist and are fully operational
- RLS middleware (`apps/api/src/common/middleware/rls.middleware.ts`) — `createRlsClient()` pattern for tenant-scoped queries
- Auth guards (`AuthGuard`), permission guards (`PermissionGuard`), decorators (`@CurrentUser()`, `@CurrentTenant()`, `@RequiresPermission()`)
- Permission cache service (`apps/api/src/common/services/permission-cache.service.ts`)
- `ZodValidationPipe` for input validation
- Shared API response types (`ApiSuccessResponse<T>`, `ApiErrorResponse`)
- Frontend: school layout with sidebar (already lists Students, Staff, Households, Classes), API client (`apps/web/src/lib/api-client.ts`), i18n setup
- Worker service with `TenantAwareJob` base class
- Permissions already seeded: `students.manage`, `students.view`, `attendance.manage`, `attendance.view`, `gradebook.manage`, `gradebook.view` etc.

**Prior-phase services/modules this phase imports or extends:**

- `PrismaModule` / `PrismaService` — database access
- `RedisModule` / `RedisService` — caching for previews
- `AuthModule` — guards and decorators
- `RbacModule` — permission checking
- `TenantsModule` / `TenantsService` — tenant context
- `AppModule` — new modules registered here
- `TenantAwareJob` base class in worker service

---

## Section 2 — Database Changes

### 2.1 New Enums

```prisma
enum HouseholdStatus {
  active
  inactive
  archived
}

enum ParentStatus {
  active
  inactive
}

enum StudentStatus {
  applicant
  active
  withdrawn
  graduated
  archived
}

enum Gender {
  male
  female
  other
  prefer_not_to_say
}

enum AcademicYearStatus {
  planned
  active
  closed
}

enum AcademicPeriodStatus {
  planned
  active
  closed
}

enum AcademicPeriodType {
  term
  semester
  quarter
  custom
}

enum SubjectType {
  academic
  supervision
  duty
  other
}

enum ClassStatus {
  active
  inactive
  archived
}

enum ClassStaffRole {
  teacher
  assistant
  homeroom
  substitute
}

enum EmploymentStatus {
  active
  inactive
}

enum EmploymentType {
  full_time
  part_time
  contract
}

enum ClassEnrolmentStatus {
  active
  dropped
  completed
}
```

### 2.2 Table: `households`

| Column                    | Type            | Constraints            | Default             |
| ------------------------- | --------------- | ---------------------- | ------------------- |
| id                        | UUID            | PK                     | `gen_random_uuid()` |
| tenant_id                 | UUID            | FK → tenants, NOT NULL | —                   |
| household_name            | VARCHAR(255)    | NOT NULL               | —                   |
| primary_billing_parent_id | UUID            | NULL, FK → parents     | —                   |
| address_line_1            | VARCHAR(255)    | NULL                   | —                   |
| address_line_2            | VARCHAR(255)    | NULL                   | —                   |
| city                      | VARCHAR(100)    | NULL                   | —                   |
| country                   | VARCHAR(100)    | NULL                   | —                   |
| postal_code               | VARCHAR(30)     | NULL                   | —                   |
| needs_completion          | BOOLEAN         | NOT NULL               | `false`             |
| status                    | HouseholdStatus | NOT NULL               | `active`            |
| created_at                | TIMESTAMPTZ     | NOT NULL               | `now()`             |
| updated_at                | TIMESTAMPTZ     | NOT NULL               | `now()`             |

**Indexes:**

- `idx_households_tenant` — `(tenant_id)`
- `idx_households_tenant_status` — `(tenant_id, status)`

**RLS:** Standard tenant isolation policy.
**`set_updated_at()` trigger:** Yes.
**Seed data:** None (created dynamically).

### 2.3 Table: `household_emergency_contacts`

| Column             | Type         | Constraints               | Default             |
| ------------------ | ------------ | ------------------------- | ------------------- |
| id                 | UUID         | PK                        | `gen_random_uuid()` |
| tenant_id          | UUID         | FK → tenants, NOT NULL    | —                   |
| household_id       | UUID         | FK → households, NOT NULL | —                   |
| contact_name       | VARCHAR(200) | NOT NULL                  | —                   |
| phone              | VARCHAR(50)  | NOT NULL                  | —                   |
| relationship_label | VARCHAR(100) | NOT NULL                  | —                   |
| display_order      | SMALLINT     | NOT NULL                  | `1`                 |
| created_at         | TIMESTAMPTZ  | NOT NULL                  | `now()`             |
| updated_at         | TIMESTAMPTZ  | NOT NULL                  | `now()`             |

**Indexes:**

- `idx_emergency_contacts_household` — `(tenant_id, household_id)`

**RLS:** Standard tenant isolation policy.
**`set_updated_at()` trigger:** Yes.
**Validation rules:** Max 3 per household (application-level). Min 1 at household creation. `display_order` values: 1, 2, 3.

### 2.4 Table: `parents`

| Column                     | Type         | Constraints            | Default             |
| -------------------------- | ------------ | ---------------------- | ------------------- |
| id                         | UUID         | PK                     | `gen_random_uuid()` |
| tenant_id                  | UUID         | FK → tenants, NOT NULL | —                   |
| user_id                    | UUID         | NULL, FK → users       | —                   |
| first_name                 | VARCHAR(100) | NOT NULL               | —                   |
| last_name                  | VARCHAR(100) | NOT NULL               | —                   |
| email                      | CITEXT       | NULL                   | —                   |
| phone                      | VARCHAR(50)  | NULL                   | —                   |
| whatsapp_phone             | VARCHAR(50)  | NULL                   | —                   |
| preferred_contact_channels | JSONB        | NOT NULL               | —                   |
| relationship_label         | VARCHAR(100) | NULL                   | —                   |
| is_primary_contact         | BOOLEAN      | NOT NULL               | `false`             |
| is_billing_contact         | BOOLEAN      | NOT NULL               | `false`             |
| status                     | ParentStatus | NOT NULL               | `active`            |
| created_at                 | TIMESTAMPTZ  | NOT NULL               | `now()`             |
| updated_at                 | TIMESTAMPTZ  | NOT NULL               | `now()`             |

**Indexes:**

- `idx_parents_tenant` — `(tenant_id)`
- `idx_parents_tenant_email` — `(tenant_id, email)`
- `idx_parents_user` — `(user_id)`

**RLS:** Standard tenant isolation policy.
**`set_updated_at()` trigger:** Yes.
**`preferred_contact_channels` Zod schema:**

```typescript
z.array(z.enum(['email', 'whatsapp']))
  .min(1)
  .max(2);
// If includes 'whatsapp', whatsapp_phone must be non-null
```

### 2.5 Table: `household_parents` (join table)

| Column       | Type         | Constraints               | Default |
| ------------ | ------------ | ------------------------- | ------- |
| household_id | UUID         | FK → households, NOT NULL | —       |
| parent_id    | UUID         | FK → parents, NOT NULL    | —       |
| role_label   | VARCHAR(100) | NULL                      | —       |
| tenant_id    | UUID         | FK → tenants, NOT NULL    | —       |
| updated_at   | TIMESTAMPTZ  | NOT NULL                  | `now()` |

**PK:** `(household_id, parent_id)`

**RLS:** Standard tenant isolation policy.
**`set_updated_at()` trigger:** Yes (role_label is mutable).

### 2.6 Table: `students`

| Column            | Type          | Constraints                                                                                                                                     | Default             |
| ----------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| id                | UUID          | PK                                                                                                                                              | `gen_random_uuid()` |
| tenant_id         | UUID          | FK → tenants, NOT NULL                                                                                                                          | —                   |
| household_id      | UUID          | FK → households, NOT NULL                                                                                                                       | —                   |
| student_number    | VARCHAR(50)   | NULL                                                                                                                                            | —                   |
| first_name        | VARCHAR(100)  | NOT NULL                                                                                                                                        | —                   |
| last_name         | VARCHAR(100)  | NOT NULL                                                                                                                                        | —                   |
| full_name         | VARCHAR(255)  | GENERATED ALWAYS AS (first_name \|\| ' ' \|\| last_name) STORED                                                                                 | —                   |
| first_name_ar     | VARCHAR(100)  | NULL                                                                                                                                            | —                   |
| last_name_ar      | VARCHAR(100)  | NULL                                                                                                                                            | —                   |
| full_name_ar      | VARCHAR(255)  | GENERATED (CASE WHEN first_name_ar IS NOT NULL AND last_name_ar IS NOT NULL THEN first_name_ar \|\| ' ' \|\| last_name_ar ELSE NULL END) STORED | —                   |
| date_of_birth     | DATE          | NOT NULL                                                                                                                                        | —                   |
| gender            | Gender        | NULL                                                                                                                                            | —                   |
| status            | StudentStatus | NOT NULL                                                                                                                                        | —                   |
| entry_date        | DATE          | NULL                                                                                                                                            | —                   |
| exit_date         | DATE          | NULL                                                                                                                                            | —                   |
| year_group_id     | UUID          | NULL, FK → year_groups                                                                                                                          | —                   |
| class_homeroom_id | UUID          | NULL, FK → classes                                                                                                                              | —                   |
| medical_notes     | TEXT          | NULL                                                                                                                                            | —                   |
| has_allergy       | BOOLEAN       | NOT NULL                                                                                                                                        | `false`             |
| allergy_details   | TEXT          | NULL                                                                                                                                            | —                   |
| created_at        | TIMESTAMPTZ   | NOT NULL                                                                                                                                        | `now()`             |
| updated_at        | TIMESTAMPTZ   | NOT NULL                                                                                                                                        | `now()`             |

**Indexes:**

- `idx_students_tenant` — `(tenant_id)`
- `idx_students_tenant_status` — `(tenant_id, status)`
- `idx_students_tenant_household` — `(tenant_id, household_id)`
- `idx_students_tenant_year_group` — `(tenant_id, year_group_id)`
- `idx_students_allergy` — `(tenant_id) WHERE has_allergy = true` (partial)

**RLS:** Standard tenant isolation policy.
**`set_updated_at()` trigger:** Yes.

**Generated columns note:** Prisma does not natively support `GENERATED ALWAYS AS ... STORED` columns. These must be created via raw SQL in the `post_migrate.sql` file. In the Prisma schema, mark `full_name` and `full_name_ar` as optional fields that are never set in application code — they are read-only. Use `@default(dbgenerated("''"))` as a placeholder and create the actual generated column definition in the post-migration SQL.

**Status transitions (enforced at service layer):**

- `applicant → active` (admission conversion)
- `active → withdrawn` (requires reason, audit-logged)
- `active → graduated` (promotion wizard)
- `active → archived` (admin edge case)
- `withdrawn → active` (re-enrollment)
- `graduated → archived` (end-of-lifecycle)
- BLOCKED: `applicant → graduated`, `archived → active`

### 2.7 Table: `student_parents` (join table)

| Column             | Type         | Constraints             | Default |
| ------------------ | ------------ | ----------------------- | ------- |
| student_id         | UUID         | FK → students, NOT NULL | —       |
| parent_id          | UUID         | FK → parents, NOT NULL  | —       |
| relationship_label | VARCHAR(100) | NULL                    | —       |
| tenant_id          | UUID         | FK → tenants, NOT NULL  | —       |
| updated_at         | TIMESTAMPTZ  | NOT NULL                | `now()` |

**PK:** `(student_id, parent_id)`

**RLS:** Standard tenant isolation policy.
**`set_updated_at()` trigger:** Yes (relationship_label is mutable).

### 2.8 Table: `academic_years`

| Column     | Type               | Constraints            | Default             |
| ---------- | ------------------ | ---------------------- | ------------------- |
| id         | UUID               | PK                     | `gen_random_uuid()` |
| tenant_id  | UUID               | FK → tenants, NOT NULL | —                   |
| name       | VARCHAR(100)       | NOT NULL               | —                   |
| start_date | DATE               | NOT NULL               | —                   |
| end_date   | DATE               | NOT NULL               | —                   |
| status     | AcademicYearStatus | NOT NULL               | —                   |
| created_at | TIMESTAMPTZ        | NOT NULL               | `now()`             |
| updated_at | TIMESTAMPTZ        | NOT NULL               | `now()`             |

**Indexes:**

- `idx_academic_years_tenant` — `(tenant_id)`

**Unique constraints:**

- `idx_academic_years_tenant_name` — `UNIQUE (tenant_id, name)`

**Exclusion constraints (btree_gist, in post_migrate.sql):**

```sql
ALTER TABLE academic_years ADD CONSTRAINT excl_academic_years_overlap
  EXCLUDE USING gist (tenant_id WITH =, daterange(start_date, end_date, '[]') WITH &&);
```

**RLS:** Standard tenant isolation policy.
**`set_updated_at()` trigger:** Yes.

**Status transitions:**

- `planned → active`
- `active → closed`
- BLOCKED: `closed → active`, `closed → planned`

### 2.9 Table: `academic_periods`

| Column           | Type                 | Constraints                   | Default             |
| ---------------- | -------------------- | ----------------------------- | ------------------- |
| id               | UUID                 | PK                            | `gen_random_uuid()` |
| tenant_id        | UUID                 | FK → tenants, NOT NULL        | —                   |
| academic_year_id | UUID                 | FK → academic_years, NOT NULL | —                   |
| name             | VARCHAR(100)         | NOT NULL                      | —                   |
| period_type      | AcademicPeriodType   | NOT NULL                      | —                   |
| start_date       | DATE                 | NOT NULL                      | —                   |
| end_date         | DATE                 | NOT NULL                      | —                   |
| status           | AcademicPeriodStatus | NOT NULL                      | —                   |
| created_at       | TIMESTAMPTZ          | NOT NULL                      | `now()`             |
| updated_at       | TIMESTAMPTZ          | NOT NULL                      | `now()`             |

**Indexes:**

- `idx_academic_periods_tenant_year` — `(tenant_id, academic_year_id)`

**Unique constraints:**

- `idx_academic_periods_tenant_year_name` — `UNIQUE (tenant_id, academic_year_id, name)`

**Exclusion constraints (btree_gist, in post_migrate.sql):**

```sql
ALTER TABLE academic_periods ADD CONSTRAINT excl_academic_periods_overlap
  EXCLUDE USING gist (tenant_id WITH =, academic_year_id WITH =, daterange(start_date, end_date, '[]') WITH &&);
```

**RLS:** Standard tenant isolation policy.
**`set_updated_at()` trigger:** Yes.

**Status transitions:** Same as academic_years: `planned → active → closed`.

### 2.10 Table: `year_groups`

| Column             | Type         | Constraints                       | Default             |
| ------------------ | ------------ | --------------------------------- | ------------------- |
| id                 | UUID         | PK                                | `gen_random_uuid()` |
| tenant_id          | UUID         | FK → tenants, NOT NULL            | —                   |
| name               | VARCHAR(100) | NOT NULL                          | —                   |
| display_order      | SMALLINT     | NOT NULL                          | `0`                 |
| next_year_group_id | UUID         | NULL, FK → year_groups (self-ref) | —                   |
| created_at         | TIMESTAMPTZ  | NOT NULL                          | `now()`             |
| updated_at         | TIMESTAMPTZ  | NOT NULL                          | `now()`             |

**Indexes:**

- `idx_year_groups_tenant` — `(tenant_id)`

**Unique constraints:**

- `idx_year_groups_tenant_name` — `UNIQUE (tenant_id, name)`

**RLS:** Standard tenant isolation policy.
**`set_updated_at()` trigger:** Yes.

### 2.11 Table: `subjects`

| Column       | Type         | Constraints            | Default             |
| ------------ | ------------ | ---------------------- | ------------------- |
| id           | UUID         | PK                     | `gen_random_uuid()` |
| tenant_id    | UUID         | FK → tenants, NOT NULL | —                   |
| name         | VARCHAR(150) | NOT NULL               | —                   |
| code         | VARCHAR(50)  | NULL                   | —                   |
| subject_type | SubjectType  | NOT NULL               | `academic`          |
| active       | BOOLEAN      | NOT NULL               | `true`              |
| created_at   | TIMESTAMPTZ  | NOT NULL               | `now()`             |
| updated_at   | TIMESTAMPTZ  | NOT NULL               | `now()`             |

**Indexes:**

- `idx_subjects_tenant` — `(tenant_id)`

**Unique constraints:**

- `idx_subjects_tenant_name` — `UNIQUE (tenant_id, name)`

**RLS:** Standard tenant isolation policy.
**`set_updated_at()` trigger:** Yes.

### 2.12 Table: `staff_profiles`

| Column                        | Type             | Constraints            | Default             |
| ----------------------------- | ---------------- | ---------------------- | ------------------- |
| id                            | UUID             | PK                     | `gen_random_uuid()` |
| tenant_id                     | UUID             | FK → tenants, NOT NULL | —                   |
| user_id                       | UUID             | FK → users, NOT NULL   | —                   |
| staff_number                  | VARCHAR(50)      | NULL                   | —                   |
| job_title                     | VARCHAR(150)     | NULL                   | —                   |
| employment_status             | EmploymentStatus | NOT NULL               | —                   |
| department                    | VARCHAR(150)     | NULL                   | —                   |
| employment_type               | EmploymentType   | NOT NULL               | `full_time`         |
| bank_name                     | VARCHAR(150)     | NULL                   | —                   |
| bank_account_number_encrypted | TEXT             | NULL                   | —                   |
| bank_iban_encrypted           | TEXT             | NULL                   | —                   |
| bank_encryption_key_ref       | VARCHAR(255)     | NULL                   | —                   |
| created_at                    | TIMESTAMPTZ      | NOT NULL               | `now()`             |
| updated_at                    | TIMESTAMPTZ      | NOT NULL               | `now()`             |

**Indexes:**

- `idx_staff_profiles_tenant` — `(tenant_id)`
- `idx_staff_profiles_user` — `(user_id)`

**Unique constraints:**

- `idx_staff_profiles_tenant_user` — `UNIQUE (tenant_id, user_id)`

**RLS:** Standard tenant isolation policy.
**`set_updated_at()` trigger:** Yes.

**Bank detail rules:**

- Bank details encrypted using AES-256 (same pattern as `tenant_stripe_configs` from P1)
- Only users with `payroll.view_bank_details` can decrypt/view
- API responses show only last 4 characters
- All bank detail access is audit-logged

### 2.13 Table: `classes`

| Column                    | Type         | Constraints                   | Default             |
| ------------------------- | ------------ | ----------------------------- | ------------------- |
| id                        | UUID         | PK                            | `gen_random_uuid()` |
| tenant_id                 | UUID         | FK → tenants, NOT NULL        | —                   |
| academic_year_id          | UUID         | FK → academic_years, NOT NULL | —                   |
| year_group_id             | UUID         | NULL, FK → year_groups        | —                   |
| subject_id                | UUID         | NULL, FK → subjects           | —                   |
| homeroom_teacher_staff_id | UUID         | NULL, FK → staff_profiles     | —                   |
| name                      | VARCHAR(150) | NOT NULL                      | —                   |
| status                    | ClassStatus  | NOT NULL                      | —                   |
| created_at                | TIMESTAMPTZ  | NOT NULL                      | `now()`             |
| updated_at                | TIMESTAMPTZ  | NOT NULL                      | `now()`             |

**Indexes:**

- `idx_classes_tenant_year` — `(tenant_id, academic_year_id)`
- `idx_classes_tenant_status` — `(tenant_id, status)`

**Unique constraints:**

- `idx_classes_tenant_name_year` — `UNIQUE (tenant_id, name, academic_year_id)`

**RLS:** Standard tenant isolation policy.
**`set_updated_at()` trigger:** Yes.

### 2.14 Table: `class_staff` (join table)

| Column           | Type           | Constraints                   | Default |
| ---------------- | -------------- | ----------------------------- | ------- |
| class_id         | UUID           | FK → classes, NOT NULL        | —       |
| staff_profile_id | UUID           | FK → staff_profiles, NOT NULL | —       |
| assignment_role  | ClassStaffRole | NOT NULL                      | —       |
| tenant_id        | UUID           | FK → tenants, NOT NULL        | —       |

**PK:** `(class_id, staff_profile_id, assignment_role)`

**RLS:** Standard tenant isolation policy.
**`set_updated_at()` trigger:** No (no updated_at column; rows are replaced, not mutated).

### 2.15 Table: `class_enrolments`

| Column     | Type                 | Constraints             | Default             |
| ---------- | -------------------- | ----------------------- | ------------------- |
| id         | UUID                 | PK                      | `gen_random_uuid()` |
| tenant_id  | UUID                 | FK → tenants, NOT NULL  | —                   |
| class_id   | UUID                 | FK → classes, NOT NULL  | —                   |
| student_id | UUID                 | FK → students, NOT NULL | —                   |
| status     | ClassEnrolmentStatus | NOT NULL                | —                   |
| start_date | DATE                 | NOT NULL                | —                   |
| end_date   | DATE                 | NULL                    | —                   |
| created_at | TIMESTAMPTZ          | NOT NULL                | `now()`             |
| updated_at | TIMESTAMPTZ          | NOT NULL                | `now()`             |

**Indexes:**

- `idx_class_enrolments_tenant_class` — `(tenant_id, class_id, status)`
- `idx_class_enrolments_tenant_student` — `(tenant_id, student_id, status)`

**RLS:** Standard tenant isolation policy.
**`set_updated_at()` trigger:** Yes.

**Status transitions (enforced at service layer):**

- `active → dropped`
- `active → completed`
- `dropped → active` (re-enrolment)
- BLOCKED: `completed → active`

### 2.16 Prisma Relations to Add to Existing Models

The `Tenant` model needs new relation fields:

```prisma
households          Household[]
parents             Parent[]
students            Student[]
staffProfiles       StaffProfile[]
academicYears       AcademicYear[]
academicPeriods     AcademicPeriod[]
yearGroups          YearGroup[]
subjects            Subject[]
classes             Class[]
classStaff          ClassStaff[]
classEnrolments     ClassEnrolment[]
householdParents    HouseholdParent[]
studentParents      StudentParent[]
householdEmergencyContacts HouseholdEmergencyContact[]
```

The `User` model needs new relation fields:

```prisma
staffProfiles       StaffProfile[]
parents             Parent[]
```

### 2.17 RLS Policies (post_migrate.sql)

For every new table with `tenant_id`, add the standard policy:

```sql
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS {table_name}_tenant_isolation ON {table_name};
CREATE POLICY {table_name}_tenant_isolation ON {table_name}
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

Tables requiring this policy:

- `households`
- `household_emergency_contacts`
- `parents`
- `household_parents`
- `students`
- `student_parents`
- `academic_years`
- `academic_periods`
- `year_groups`
- `subjects`
- `staff_profiles`
- `classes`
- `class_staff`
- `class_enrolments`

### 2.18 Generated Columns (post_migrate.sql)

After Prisma creates the base `students` table, alter it:

```sql
-- Drop the placeholder columns Prisma created
ALTER TABLE students DROP COLUMN IF EXISTS full_name;
ALTER TABLE students DROP COLUMN IF EXISTS full_name_ar;

-- Add generated columns
ALTER TABLE students ADD COLUMN full_name VARCHAR(255) GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED;
ALTER TABLE students ADD COLUMN full_name_ar VARCHAR(255) GENERATED ALWAYS AS (
  CASE WHEN first_name_ar IS NOT NULL AND last_name_ar IS NOT NULL
    THEN first_name_ar || ' ' || last_name_ar
    ELSE NULL
  END
) STORED;
```

### 2.19 set_updated_at() Triggers (post_migrate.sql)

Apply trigger to all new tables with `updated_at`:

```sql
CREATE TRIGGER set_updated_at BEFORE UPDATE ON households FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON household_emergency_contacts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON parents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON household_parents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON student_parents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON academic_years FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON academic_periods FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON year_groups FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON subjects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON staff_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON classes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON class_enrolments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

Note: `class_staff` does NOT get this trigger (no `updated_at` column).

### 2.20 Exclusion Constraints (post_migrate.sql)

```sql
ALTER TABLE academic_years ADD CONSTRAINT excl_academic_years_overlap
  EXCLUDE USING gist (tenant_id WITH =, daterange(start_date, end_date, '[]') WITH &&);

ALTER TABLE academic_periods ADD CONSTRAINT excl_academic_periods_overlap
  EXCLUDE USING gist (tenant_id WITH =, academic_year_id WITH =, daterange(start_date, end_date, '[]') WITH &&);
```

---

## Section 3 — API Endpoints

All endpoints prefixed with `/api/v1/`. All tenant-scoped endpoints require authentication via `AuthGuard` and tenant context via `TenantResolutionMiddleware`.

### 3.1 Households

#### `POST /api/v1/households`

- **Permission:** `students.manage`
- **Request:**
  ```typescript
  {
    household_name: string, // required, max 255
    address_line_1?: string,
    address_line_2?: string,
    city?: string,
    country?: string,
    postal_code?: string,
    emergency_contacts: Array<{  // required, min 1, max 3
      contact_name: string,
      phone: string,
      relationship_label: string,
      display_order: number // 1-3
    }>
  }
  ```
- **Response:** `{ data: Household }` — 201
- **Business logic:** Create household with status `active`. Create emergency contacts in same transaction. Set `needs_completion = false` if contacts exist (no billing parent yet, so it could be set to `true` — but spec says it's only set `true` via admissions conversion, default is `false`).
- **Errors:** `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403)
- **Service method:** `HouseholdsService.create()`

#### `GET /api/v1/households`

- **Permission:** `students.view`
- **Request (query):**
  ```
  ?page=1&pageSize=20&status=active&search=string&sort=household_name&order=asc
  ```
- **Response:** `{ data: Household[], meta: { page, pageSize, total } }`
- **Service method:** `HouseholdsService.findAll()`

#### `GET /api/v1/households/:id`

- **Permission:** `students.view` OR parent scoped to own household
- **Response:** `{ data: HouseholdDetail }` — includes parents, students, emergency contacts
- **Errors:** `NOT_FOUND` (404)
- **Service method:** `HouseholdsService.findOne()`

#### `PATCH /api/v1/households/:id`

- **Permission:** `students.manage`
- **Request:** Partial household fields (same shape as create, without emergency_contacts)
- **Response:** `{ data: Household }`
- **Service method:** `HouseholdsService.update()`

#### `PATCH /api/v1/households/:id/status`

- **Permission:** `students.manage`
- **Request:** `{ status: 'active' | 'inactive' | 'archived' }`
- **Response:** `{ data: Household }`
- **Service method:** `HouseholdsService.updateStatus()`

#### `PUT /api/v1/households/:id/billing-parent`

- **Permission:** `students.manage`
- **Request:** `{ parent_id: string }` — must be a parent linked to this household
- **Response:** `{ data: Household }`
- **Errors:** `PARENT_NOT_IN_HOUSEHOLD` (400)
- **Service method:** `HouseholdsService.setBillingParent()`

#### `POST /api/v1/households/:id/emergency-contacts`

- **Permission:** `students.manage`
- **Request:** `{ contact_name, phone, relationship_label, display_order }`
- **Response:** `{ data: HouseholdEmergencyContact }` — 201
- **Errors:** `MAX_CONTACTS_REACHED` (400) — if 3 already exist
- **Service method:** `HouseholdsService.addEmergencyContact()`

#### `PATCH /api/v1/households/:householdId/emergency-contacts/:contactId`

- **Permission:** `students.manage`
- **Request:** Partial emergency contact fields
- **Response:** `{ data: HouseholdEmergencyContact }`
- **Service method:** `HouseholdsService.updateEmergencyContact()`

#### `DELETE /api/v1/households/:householdId/emergency-contacts/:contactId`

- **Permission:** `students.manage`
- **Response:** 204
- **Errors:** `MIN_CONTACTS_REQUIRED` (400) — cannot delete if only 1 remains
- **Service method:** `HouseholdsService.removeEmergencyContact()`

#### `POST /api/v1/households/:id/parents`

- **Permission:** `students.manage`
- **Request:** `{ parent_id: string, role_label?: string }`
- **Response:** `{ data: HouseholdParent }` — 201
- **Service method:** `HouseholdsService.linkParent()`

#### `DELETE /api/v1/households/:householdId/parents/:parentId`

- **Permission:** `students.manage`
- **Response:** 204
- **Errors:** `IS_BILLING_PARENT` (400) — cannot unlink if they're the billing parent
- **Service method:** `HouseholdsService.unlinkParent()`

#### `POST /api/v1/households/merge`

- **Permission:** `students.manage`
- **Request:**
  ```typescript
  {
    source_household_id: string,
    target_household_id: string
  }
  ```
- **Response:** `{ data: Household }` — returns merged target household
- **Business logic:**
  1. `SELECT ... FOR UPDATE` on both households ordered by ID (prevent deadlock)
  2. Move all students from source to target (update `household_id`)
  3. Move all parent links from source to target (skip duplicates)
  4. Move all emergency contacts from source to target (respect max 3 — excess contacts logged but not moved)
  5. Archive source household (`status = 'archived'`)
  6. All in single transaction, audit-logged
- **Errors:** `HOUSEHOLD_NOT_FOUND` (404), `SAME_HOUSEHOLD` (400), `HOUSEHOLD_ARCHIVED` (400)
- **Service method:** `HouseholdsService.merge()`

#### `POST /api/v1/households/split`

- **Permission:** `students.manage`
- **Request:**
  ```typescript
  {
    source_household_id: string,
    new_household_name: string,
    student_ids: string[],     // students to move
    parent_ids: string[],      // parents to move
    emergency_contacts: Array<{  // required, min 1
      contact_name: string,
      phone: string,
      relationship_label: string,
      display_order: number
    }>
  }
  ```
- **Response:** `{ data: Household }` — returns new household
- **Business logic:**
  1. `SELECT ... FOR UPDATE` on source household
  2. Create new household with status `active`
  3. Create emergency contacts on new household
  4. Move selected students to new household
  5. Link selected parents to new household
  6. Update student_parents for moved students if their parents are in the moved set
  7. All in single transaction, audit-logged
- **Errors:** `HOUSEHOLD_NOT_FOUND` (404), `STUDENT_NOT_IN_HOUSEHOLD` (400), `MIN_CONTACTS_REQUIRED` (400)
- **Service method:** `HouseholdsService.split()`

#### `GET /api/v1/households/:id/preview`

- **Permission:** `students.view`
- **Response:**
  ```typescript
  {
    data: {
      id: string,
      entity_type: 'household',
      primary_label: string,       // household_name
      secondary_label: string,     // billing parent name or 'No billing parent'
      status: string,
      facts: [
        { label: string, value: string },  // e.g. "Students: 3"
        { label: string, value: string },  // e.g. "Parents: 2"
        { label: string, value: string }   // e.g. "Emergency contacts: 2/3"
      ]
    }
  }
  ```
- **Redis cache:** 30 seconds, key: `preview:household:{id}`
- **Service method:** `HouseholdsService.preview()`

### 3.2 Parents

#### `POST /api/v1/parents`

- **Permission:** `students.manage`
- **Request:**
  ```typescript
  {
    first_name: string,
    last_name: string,
    email?: string,         // CITEXT
    phone?: string,
    whatsapp_phone?: string,
    preferred_contact_channels: ('email' | 'whatsapp')[],
    relationship_label?: string,
    is_primary_contact?: boolean,
    is_billing_contact?: boolean,
    household_id?: string,   // optional — auto-link to household
    role_label?: string      // for household_parents join
  }
  ```
- **Response:** `{ data: Parent }` — 201
- **Business logic:** Create parent. If `household_id` provided, also create `household_parents` link. Validate WhatsApp phone requirement. If email matches existing user in tenant, link `user_id`.
- **Validation:** If `preferred_contact_channels` includes `'whatsapp'`, then `whatsapp_phone` must be non-null.
- **Service method:** `ParentsService.create()`

#### `GET /api/v1/parents`

- **Permission:** `students.view`
- **Request (query):** `?page=1&pageSize=20&status=active&search=string`
- **Response:** `{ data: Parent[], meta: { page, pageSize, total } }`
- **Service method:** `ParentsService.findAll()`

#### `GET /api/v1/parents/:id`

- **Permission:** `students.view` OR parent scoped to own record
- **Response:** `{ data: ParentDetail }` — includes linked households and students
- **Service method:** `ParentsService.findOne()`

#### `PATCH /api/v1/parents/:id`

- **Permission:** `students.manage` OR parent updating own profile (limited fields)
- **Request:** Partial parent fields
- **Response:** `{ data: Parent }`
- **Validation:** Same WhatsApp phone rule on update.
- **Service method:** `ParentsService.update()`

#### `POST /api/v1/parents/:id/students`

- **Permission:** `students.manage`
- **Request:** `{ student_id: string, relationship_label?: string }`
- **Response:** `{ data: StudentParent }` — 201
- **Service method:** `ParentsService.linkStudent()`

#### `DELETE /api/v1/parents/:parentId/students/:studentId`

- **Permission:** `students.manage`
- **Response:** 204
- **Service method:** `ParentsService.unlinkStudent()`

### 3.3 Students

#### `POST /api/v1/students`

- **Permission:** `students.manage`
- **Request:**
  ```typescript
  {
    household_id: string,       // required
    first_name: string,
    last_name: string,
    first_name_ar?: string,
    last_name_ar?: string,
    date_of_birth: string,      // ISO date
    gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say',
    status: 'applicant' | 'active',
    entry_date?: string,
    year_group_id?: string,
    class_homeroom_id?: string,
    student_number?: string,
    medical_notes?: string,
    has_allergy?: boolean,
    allergy_details?: string,
    parent_links?: Array<{       // optional — auto-link to parents
      parent_id: string,
      relationship_label?: string
    }>
  }
  ```
- **Response:** `{ data: Student }` — 201
- **Validation:** If `has_allergy = true`, `allergy_details` must be non-null. `household_id` must exist.
- **Service method:** `StudentsService.create()`

#### `GET /api/v1/students`

- **Permission:** `students.view` OR `parent.view_own_students` (scoped to own students)
- **Request (query):**
  ```
  ?page=1&pageSize=20&status=active&year_group_id=uuid&household_id=uuid&has_allergy=true&search=string&sort=last_name&order=asc
  ```
- **Response:** `{ data: Student[], meta: { page, pageSize, total } }`
- **Service method:** `StudentsService.findAll()`

#### `GET /api/v1/students/:id`

- **Permission:** `students.view` OR `parent.view_own_students` (scoped)
- **Response:** `{ data: StudentDetail }` — includes household, parents, year group, class, enrolments
- **Service method:** `StudentsService.findOne()`

#### `PATCH /api/v1/students/:id`

- **Permission:** `students.manage`
- **Request:** Partial student fields (excluding status — use dedicated endpoint)
- **Response:** `{ data: Student }`
- **Validation:** Same allergy rule on update.
- **Service method:** `StudentsService.update()`

#### `PATCH /api/v1/students/:id/status`

- **Permission:** `students.manage`
- **Request:**
  ```typescript
  {
    status: StudentStatus,
    reason?: string  // required for withdrawal
  }
  ```
- **Response:** `{ data: Student }`
- **Business logic:** Enforce status transition rules (see Section 2.6). On withdrawal: set all active `class_enrolments` to `dropped` with `end_date = today`. Audit-log with reason.
- **Errors:** `INVALID_STATUS_TRANSITION` (400), `WITHDRAWAL_REASON_REQUIRED` (400)
- **Service method:** `StudentsService.updateStatus()`

#### `GET /api/v1/students/:id/preview`

- **Permission:** `students.view`
- **Response:**
  ```typescript
  {
    data: {
      id: string,
      entity_type: 'student',
      primary_label: string,     // full_name
      secondary_label: string,   // year group name + homeroom class name
      status: string,
      facts: [
        { label: string, value: string },  // e.g. "Household: Al-Hassan"
        { label: string, value: string },  // e.g. "DOB: 2015-03-12"
        { label: string, value: string }   // e.g. "Allergy: Yes" or absent
      ]
    }
  }
  ```
- **Redis cache:** 30 seconds, key: `preview:student:{id}`
- **Service method:** `StudentsService.preview()`

#### `GET /api/v1/students/:id/export-pack`

- **Permission:** `students.manage`
- **Response:** JSON export containing: profile data, attendance summary (placeholder — empty until P4a), grades (placeholder — empty until P5), report cards (placeholder — empty until P5). Excludes internal notes, audit entries.
- **Service method:** `StudentsService.exportPack()`

#### `GET /api/v1/reports/allergy`

- **Permission:** `students.view`
- **Request (query):**
  ```
  ?year_group_id=uuid&class_id=uuid&format=json
  ```
- **Response:**
  ```typescript
  {
    data: Array<{
      student_id: string,
      student_name: string,
      year_group: string | null,
      homeroom_class: string | null,
      allergy_details: string
    }>,
    meta: { total: number }
  }
  ```
- **Business logic:** Query all students with `has_allergy = true`, filterable by year_group and class (via class_enrolments).
- **Service method:** `StudentsService.allergyReport()`

### 3.4 Staff Profiles

#### `POST /api/v1/staff-profiles`

- **Permission:** `users.manage`
- **Request:**
  ```typescript
  {
    user_id: string,             // must be existing user with active membership
    staff_number?: string,
    job_title?: string,
    employment_status: 'active' | 'inactive',
    department?: string,
    employment_type?: 'full_time' | 'part_time' | 'contract',
    bank_name?: string,
    bank_account_number?: string,   // encrypted before storage
    bank_iban?: string              // encrypted before storage
  }
  ```
- **Response:** `{ data: StaffProfile }` — 201 (bank details masked)
- **Errors:** `STAFF_PROFILE_EXISTS` (409), `USER_NOT_FOUND` (404)
- **Service method:** `StaffProfilesService.create()`

#### `GET /api/v1/staff-profiles`

- **Permission:** `users.view`
- **Request (query):** `?page=1&pageSize=20&employment_status=active&department=string&search=string`
- **Response:** `{ data: StaffProfile[], meta: { page, pageSize, total } }` — bank details always masked
- **Service method:** `StaffProfilesService.findAll()`

#### `GET /api/v1/staff-profiles/:id`

- **Permission:** `users.view`
- **Response:** `{ data: StaffProfileDetail }` — includes user info, class assignments. Bank details masked unless caller has `payroll.view_bank_details`.
- **Service method:** `StaffProfilesService.findOne()`

#### `PATCH /api/v1/staff-profiles/:id`

- **Permission:** `users.manage`
- **Request:** Partial staff profile fields. Bank fields require `payroll.view_bank_details`.
- **Response:** `{ data: StaffProfile }`
- **Service method:** `StaffProfilesService.update()`

#### `GET /api/v1/staff-profiles/:id/bank-details`

- **Permission:** `payroll.view_bank_details`
- **Response:** `{ data: { bank_name, account_last4, iban_last4 } }` — decrypted last 4 only
- **Audit:** Access is audit-logged.
- **Service method:** `StaffProfilesService.getBankDetails()`

#### `GET /api/v1/staff-profiles/:id/preview`

- **Permission:** `users.view`
- **Response:**
  ```typescript
  {
    data: {
      id: string,
      entity_type: 'staff',
      primary_label: string,     // user full name
      secondary_label: string,   // job_title or department
      status: string,            // employment_status
      facts: [
        { label: string, value: string },  // e.g. "Type: Full-time"
        { label: string, value: string },  // e.g. "Classes: 5"
        { label: string, value: string }   // e.g. "Department: Science"
      ]
    }
  }
  ```
- **Redis cache:** 30 seconds, key: `preview:staff:{id}`
- **Service method:** `StaffProfilesService.preview()`

### 3.5 Academic Years

#### `POST /api/v1/academic-years`

- **Permission:** `students.manage`
- **Request:**
  ```typescript
  {
    name: string,
    start_date: string,  // ISO date
    end_date: string,    // ISO date, must be after start_date
    status: 'planned' | 'active'
  }
  ```
- **Response:** `{ data: AcademicYear }` — 201
- **Errors:** `OVERLAPPING_ACADEMIC_YEAR` (409) — caught from exclusion constraint
- **Service method:** `AcademicYearsService.create()`

#### `GET /api/v1/academic-years`

- **Permission:** `students.view`
- **Request (query):** `?status=active`
- **Response:** `{ data: AcademicYear[], meta: { page, pageSize, total } }`
- **Service method:** `AcademicYearsService.findAll()`

#### `GET /api/v1/academic-years/:id`

- **Permission:** `students.view`
- **Response:** `{ data: AcademicYearDetail }` — includes periods
- **Service method:** `AcademicYearsService.findOne()`

#### `PATCH /api/v1/academic-years/:id`

- **Permission:** `students.manage`
- **Request:** Partial fields (name, dates)
- **Response:** `{ data: AcademicYear }`
- **Service method:** `AcademicYearsService.update()`

#### `PATCH /api/v1/academic-years/:id/status`

- **Permission:** `students.manage`
- **Request:** `{ status: AcademicYearStatus }`
- **Response:** `{ data: AcademicYear }`
- **Errors:** `INVALID_STATUS_TRANSITION` (400)
- **Service method:** `AcademicYearsService.updateStatus()`

### 3.6 Academic Periods

#### `POST /api/v1/academic-years/:yearId/periods`

- **Permission:** `students.manage`
- **Request:**
  ```typescript
  {
    name: string,
    period_type: 'term' | 'semester' | 'quarter' | 'custom',
    start_date: string,
    end_date: string,
    status: 'planned' | 'active'
  }
  ```
- **Response:** `{ data: AcademicPeriod }` — 201
- **Errors:** `OVERLAPPING_PERIOD` (409), `PERIOD_OUTSIDE_YEAR` (400)
- **Business logic:** Validate period dates fall within academic year date range.
- **Service method:** `AcademicPeriodsService.create()`

#### `GET /api/v1/academic-years/:yearId/periods`

- **Permission:** `students.view`
- **Response:** `{ data: AcademicPeriod[] }`
- **Service method:** `AcademicPeriodsService.findAllForYear()`

#### `PATCH /api/v1/academic-periods/:id`

- **Permission:** `students.manage`
- **Request:** Partial fields
- **Response:** `{ data: AcademicPeriod }`
- **Service method:** `AcademicPeriodsService.update()`

#### `PATCH /api/v1/academic-periods/:id/status`

- **Permission:** `students.manage`
- **Request:** `{ status: AcademicPeriodStatus }`
- **Response:** `{ data: AcademicPeriod }`
- **Service method:** `AcademicPeriodsService.updateStatus()`

### 3.7 Year Groups

#### `POST /api/v1/year-groups`

- **Permission:** `students.manage`
- **Request:**
  ```typescript
  {
    name: string,
    display_order: number,
    next_year_group_id?: string
  }
  ```
- **Response:** `{ data: YearGroup }` — 201
- **Service method:** `YearGroupsService.create()`

#### `GET /api/v1/year-groups`

- **Permission:** `students.view`
- **Response:** `{ data: YearGroup[] }` — ordered by display_order
- **Service method:** `YearGroupsService.findAll()`

#### `PATCH /api/v1/year-groups/:id`

- **Permission:** `students.manage`
- **Request:** Partial fields
- **Response:** `{ data: YearGroup }`
- **Service method:** `YearGroupsService.update()`

#### `DELETE /api/v1/year-groups/:id`

- **Permission:** `students.manage`
- **Response:** 204
- **Errors:** `YEAR_GROUP_IN_USE` (400) — if students or classes reference it
- **Service method:** `YearGroupsService.remove()`

### 3.8 Subjects

#### `POST /api/v1/subjects`

- **Permission:** `students.manage`
- **Request:**
  ```typescript
  {
    name: string,
    code?: string,
    subject_type?: 'academic' | 'supervision' | 'duty' | 'other'
  }
  ```
- **Response:** `{ data: Subject }` — 201
- **Service method:** `SubjectsService.create()`

#### `GET /api/v1/subjects`

- **Permission:** `students.view`
- **Request (query):** `?active=true&subject_type=academic`
- **Response:** `{ data: Subject[] }`
- **Service method:** `SubjectsService.findAll()`

#### `PATCH /api/v1/subjects/:id`

- **Permission:** `students.manage`
- **Response:** `{ data: Subject }`
- **Service method:** `SubjectsService.update()`

#### `DELETE /api/v1/subjects/:id`

- **Permission:** `students.manage`
- **Response:** 204
- **Errors:** `SUBJECT_IN_USE` (400)
- **Service method:** `SubjectsService.remove()`

### 3.9 Classes

#### `POST /api/v1/classes`

- **Permission:** `students.manage`
- **Request:**
  ```typescript
  {
    academic_year_id: string,
    year_group_id?: string,
    subject_id?: string,
    homeroom_teacher_staff_id?: string,
    name: string,
    status: 'active' | 'inactive'
  }
  ```
- **Response:** `{ data: Class }` — 201
- **Service method:** `ClassesService.create()`

#### `GET /api/v1/classes`

- **Permission:** `students.view`
- **Request (query):**
  ```
  ?page=1&pageSize=20&academic_year_id=uuid&year_group_id=uuid&status=active&search=string
  ```
- **Response:** `{ data: Class[], meta: { page, pageSize, total } }`
- **Service method:** `ClassesService.findAll()`

#### `GET /api/v1/classes/:id`

- **Permission:** `students.view`
- **Response:** `{ data: ClassDetail }` — includes staff assignments, enrolment count, year group, subject
- **Service method:** `ClassesService.findOne()`

#### `PATCH /api/v1/classes/:id`

- **Permission:** `students.manage`
- **Request:** Partial class fields
- **Response:** `{ data: Class }`
- **Service method:** `ClassesService.update()`

#### `PATCH /api/v1/classes/:id/status`

- **Permission:** `students.manage`
- **Request:** `{ status: ClassStatus }`
- **Response:** `{ data: Class }`
- **Service method:** `ClassesService.updateStatus()`

#### `POST /api/v1/classes/:id/staff`

- **Permission:** `students.manage`
- **Request:** `{ staff_profile_id: string, assignment_role: ClassStaffRole }`
- **Response:** `{ data: ClassStaff }` — 201
- **Service method:** `ClassesService.assignStaff()`

#### `DELETE /api/v1/classes/:classId/staff/:staffProfileId/role/:role`

- **Permission:** `students.manage`
- **Response:** 204
- **Service method:** `ClassesService.removeStaff()`

#### `GET /api/v1/classes/:id/enrolments`

- **Permission:** `students.view`
- **Request (query):** `?status=active`
- **Response:** `{ data: ClassEnrolment[] }` — includes student name
- **Service method:** `ClassEnrolmentsService.findAllForClass()`

#### `POST /api/v1/classes/:id/enrolments`

- **Permission:** `students.manage`
- **Request:**
  ```typescript
  {
    student_id: string,
    start_date: string  // ISO date
  }
  ```
- **Response:** `{ data: ClassEnrolment }` — 201
- **Errors:** `STUDENT_ALREADY_ENROLLED` (409)
- **Service method:** `ClassEnrolmentsService.create()`

#### `PATCH /api/v1/class-enrolments/:id/status`

- **Permission:** `students.manage`
- **Request:** `{ status: ClassEnrolmentStatus, end_date?: string }`
- **Response:** `{ data: ClassEnrolment }`
- **Errors:** `INVALID_STATUS_TRANSITION` (400)
- **Service method:** `ClassEnrolmentsService.updateStatus()`

#### `POST /api/v1/classes/:id/enrolments/bulk`

- **Permission:** `students.manage`
- **Request:**
  ```typescript
  {
    student_ids: string[],
    start_date: string
  }
  ```
- **Response:** `{ data: { enrolled: number, skipped: number, errors: Array<{ student_id: string, reason: string }> } }`
- **Service method:** `ClassEnrolmentsService.bulkEnrol()`

#### `GET /api/v1/classes/:id/preview`

- **Permission:** `students.view`
- **Response:**
  ```typescript
  {
    data: {
      id: string,
      entity_type: 'class',
      primary_label: string,     // class name
      secondary_label: string,   // academic year + year group
      status: string,
      facts: [
        { label: string, value: string },  // e.g. "Students: 28"
        { label: string, value: string },  // e.g. "Teacher: Ms. Sarah"
        { label: string, value: string }   // e.g. "Subject: Mathematics"
      ]
    }
  }
  ```
- **Redis cache:** 30 seconds, key: `preview:class:{id}`
- **Service method:** `ClassesService.preview()`

### 3.10 Promotion / Rollover Wizard

#### `GET /api/v1/promotion/preview`

- **Permission:** `students.manage`
- **Request (query):** `?academic_year_id=uuid`
- **Response:**
  ```typescript
  {
    data: {
      academic_year: { id: string, name: string },
      year_groups: Array<{
        year_group_id: string,
        year_group_name: string,
        next_year_group_id: string | null,
        next_year_group_name: string | null,
        students: Array<{
          student_id: string,
          student_name: string,
          current_status: string,
          proposed_action: 'promote' | 'graduate' | 'hold_back',
          proposed_year_group_id: string | null,
          proposed_year_group_name: string | null
        }>
      }>
    }
  }
  ```
- **Business logic:** For each student in the academic year: if their year_group has a `next_year_group_id`, propose `promote`; if no next year group, propose `graduate`; default `hold_back` if no year group assigned.
- **Service method:** `PromotionService.preview()`

#### `POST /api/v1/promotion/commit`

- **Permission:** `students.manage`
- **Request:**
  ```typescript
  {
    academic_year_id: string,
    actions: Array<{
      student_id: string,
      action: 'promote' | 'hold_back' | 'skip' | 'graduate' | 'withdraw',
      target_year_group_id?: string,  // required for promote/skip
      reason?: string                  // required for withdraw
    }>
  }
  ```
- **Response:** `{ data: { promoted: number, held_back: number, graduated: number, withdrawn: number, skipped: number } }`
- **Business logic:**
  1. Validate all student_ids belong to the academic year
  2. For each student, based on action:
     - `promote`: update `year_group_id` to `target_year_group_id`, close active enrolments
     - `hold_back`: keep same year_group, close active enrolments
     - `skip`: update `year_group_id` to specified target (allows skipping a grade)
     - `graduate`: set status to `graduated`, close active enrolments
     - `withdraw`: set status to `withdrawn`, close active enrolments, require reason
  3. All in single transaction, audit-logged as batch
- **Errors:** `ACADEMIC_YEAR_NOT_CLOSED` (400) — year must be in `closed` status or `active` (admin choice)
- **Service method:** `PromotionService.commit()`

### 3.11 Search (Meilisearch)

#### `GET /api/v1/search`

- **Permission:** Authenticated (results filtered by permissions)
- **Request (query):**
  ```
  ?q=string&types=students,parents,staff,households&page=1&pageSize=20
  ```
- **Response:**
  ```typescript
  {
    data: {
      results: Array<{
        entity_type: string,
        id: string,
        primary_label: string,
        secondary_label: string,
        status: string,
        highlight: string      // matched text with highlight markers
      }>,
      total: number
    }
  }
  ```
- **Business logic:** Query Meilisearch with `tenant_id` filter. Post-filter results based on user permissions (e.g., parent sees only own household entities). Fall back to PostgreSQL ILIKE + tsvector if Meilisearch is unavailable.
- **Service method:** `SearchService.search()`

### 3.12 Dashboards

#### `GET /api/v1/dashboard/school-admin`

- **Permission:** `students.view` (any admin/staff with view access)
- **Response:**
  ```typescript
  {
    data: {
      greeting: string,              // "Good morning, Ahmed"
      summary_line: string,          // assembled from pending actions
      stats: {
        total_students: number,
        total_staff: number,
        active_classes: number,
        pending_approvals: number
      },
      needs_completion_households: Array<{ id: string, name: string }>,
      recent_admissions_count: number,  // placeholder for P3
      today_attendance: null            // placeholder for P4a
    }
  }
  ```
- **Service method:** `DashboardService.schoolAdmin()`

#### `GET /api/v1/dashboard/parent`

- **Permission:** `parent.view_own_students`
- **Response:**
  ```typescript
  {
    data: {
      greeting: string,
      linked_students: Array<{
        id: string,
        name: string,
        year_group: string | null,
        status: string
      }>,
      outstanding_invoices: [],       // placeholder for P6
      recent_announcements: []        // placeholder for P8
    }
  }
  ```
- **Service method:** `DashboardService.parent()`

---

## Section 4 — Service Layer

### 4.1 HouseholdsService

- **Class:** `HouseholdsService`
- **Module:** `HouseholdsModule`
- **File:** `apps/api/src/modules/households/households.service.ts`
- **Dependencies:** `PrismaService`, `RedisService`, `SearchIndexService`

**Methods:**

- `create(tenantId, dto)` — Create household with emergency contacts in single transaction
- `findAll(tenantId, query)` — Paginated list with filters
- `findOne(tenantId, id)` — Full detail with relations
- `update(tenantId, id, dto)` — Update household fields
- `updateStatus(tenantId, id, status)` — Change household status
- `setBillingParent(tenantId, id, parentId)` — Set billing parent (validate parent is linked)
- `addEmergencyContact(tenantId, householdId, dto)` — Add contact (check max 3)
- `updateEmergencyContact(tenantId, householdId, contactId, dto)` — Update contact
- `removeEmergencyContact(tenantId, householdId, contactId)` — Remove contact (check min 1)
- `linkParent(tenantId, householdId, parentId, roleLabel?)` — Create household_parents record
- `unlinkParent(tenantId, householdId, parentId)` — Remove link (block if billing parent)
- `merge(tenantId, sourceId, targetId)` — Atomic merge with FOR UPDATE locks
- `split(tenantId, dto)` — Atomic split with FOR UPDATE lock
- `preview(tenantId, id)` — Lightweight preview (cached)
- `checkNeedsCompletion(tenantId, id)` — Recalculate needs_completion flag

**`needs_completion` recalculation logic:**

```
needs_completion = !(
  emergency_contacts.count >= 1
  AND primary_billing_parent_id IS NOT NULL
)
```

Called after: emergency contact add/remove, billing parent set/unset.

### 4.2 ParentsService

- **Class:** `ParentsService`
- **Module:** `ParentsModule`
- **File:** `apps/api/src/modules/parents/parents.service.ts`
- **Dependencies:** `PrismaService`, `SearchIndexService`

**Methods:**

- `create(tenantId, dto)` — Create parent, optionally link to household, auto-link user_id by email
- `findAll(tenantId, query)` — Paginated list
- `findOne(tenantId, id)` — Full detail with households and students
- `update(tenantId, id, dto)` — Update parent fields
- `linkStudent(tenantId, parentId, studentId, relationshipLabel?)` — Create student_parents record
- `unlinkStudent(tenantId, parentId, studentId)` — Remove student_parents record
- `linkUserByEmail(tenantId, parentId)` — Match parent email to existing user, set user_id

### 4.3 StudentsService

- **Class:** `StudentsService`
- **Module:** `StudentsModule`
- **File:** `apps/api/src/modules/students/students.service.ts`
- **Dependencies:** `PrismaService`, `RedisService`, `SearchIndexService`, `ClassEnrolmentsService`

**Methods:**

- `create(tenantId, dto)` — Create student, optionally link to parents
- `findAll(tenantId, query)` — Paginated list with filters (status, year_group, household, allergy)
- `findOne(tenantId, id)` — Full detail with relations
- `update(tenantId, id, dto)` — Update student fields (not status)
- `updateStatus(tenantId, id, status, reason?)` — Enforce state machine. On withdrawal: drop all active enrolments.
- `preview(tenantId, id)` — Lightweight preview (cached)
- `exportPack(tenantId, id)` — Export student data pack (profile, placeholder summaries)
- `allergyReport(tenantId, filters)` — Query students with has_allergy = true

**Status transition validation:**

```typescript
const VALID_TRANSITIONS: Record<StudentStatus, StudentStatus[]> = {
  applicant: ['active'],
  active: ['withdrawn', 'graduated', 'archived'],
  withdrawn: ['active'],
  graduated: ['archived'],
  archived: [],
};
```

### 4.4 StaffProfilesService

- **Class:** `StaffProfilesService`
- **Module:** `StaffProfilesModule`
- **File:** `apps/api/src/modules/staff-profiles/staff-profiles.service.ts`
- **Dependencies:** `PrismaService`, `RedisService`, `SearchIndexService`, `EncryptionService`

**Methods:**

- `create(tenantId, dto)` — Create profile, encrypt bank details if provided. Validate user exists with active membership.
- `findAll(tenantId, query)` — Paginated list (bank details masked)
- `findOne(tenantId, id, includeBank?)` — Full detail, bank masked unless flag + permission
- `update(tenantId, id, dto)` — Update profile, re-encrypt bank details if changed
- `getBankDetails(tenantId, id)` — Decrypt and return last 4 chars only. Audit-logged.
- `preview(tenantId, id)` — Lightweight preview (cached)

**Bank detail encryption:** Use the same AES-256 pattern as `TenantStripeConfig` from P1. The `EncryptionService` should already exist or be created as a shared utility.

### 4.5 AcademicYearsService

- **Class:** `AcademicYearsService`
- **Module:** `AcademicsModule`
- **File:** `apps/api/src/modules/academics/academic-years.service.ts`
- **Dependencies:** `PrismaService`

**Methods:**

- `create(tenantId, dto)` — Create year. Catch exclusion constraint violation → `OVERLAPPING_ACADEMIC_YEAR`
- `findAll(tenantId, query)` — List with optional status filter
- `findOne(tenantId, id)` — Detail with periods
- `update(tenantId, id, dto)` — Update fields
- `updateStatus(tenantId, id, status)` — Enforce transition: planned → active → closed

### 4.6 AcademicPeriodsService

- **Class:** `AcademicPeriodsService`
- **Module:** `AcademicsModule`
- **File:** `apps/api/src/modules/academics/academic-periods.service.ts`
- **Dependencies:** `PrismaService`, `AcademicYearsService`

**Methods:**

- `create(tenantId, yearId, dto)` — Create period. Validate dates within year range. Catch exclusion constraint → `OVERLAPPING_PERIOD`
- `findAllForYear(tenantId, yearId)` — List periods for a year
- `update(tenantId, id, dto)` — Update fields
- `updateStatus(tenantId, id, status)` — Enforce transition: planned → active → closed

### 4.7 YearGroupsService

- **Class:** `YearGroupsService`
- **Module:** `AcademicsModule`
- **File:** `apps/api/src/modules/academics/year-groups.service.ts`
- **Dependencies:** `PrismaService`

**Methods:**

- `create(tenantId, dto)` — Create year group
- `findAll(tenantId)` — List ordered by display_order
- `update(tenantId, id, dto)` — Update fields
- `remove(tenantId, id)` — Delete (block if referenced by students or classes)

### 4.8 SubjectsService

- **Class:** `SubjectsService`
- **Module:** `AcademicsModule`
- **File:** `apps/api/src/modules/academics/subjects.service.ts`
- **Dependencies:** `PrismaService`

**Methods:**

- `create(tenantId, dto)` — Create subject
- `findAll(tenantId, filters)` — List with optional type/active filters
- `update(tenantId, id, dto)` — Update fields
- `remove(tenantId, id)` — Delete (block if referenced by classes)

### 4.9 ClassesService

- **Class:** `ClassesService`
- **Module:** `ClassesModule`
- **File:** `apps/api/src/modules/classes/classes.service.ts`
- **Dependencies:** `PrismaService`, `RedisService`, `SearchIndexService`

**Methods:**

- `create(tenantId, dto)` — Create class
- `findAll(tenantId, query)` — Paginated list with filters
- `findOne(tenantId, id)` — Full detail with staff, enrolment count
- `update(tenantId, id, dto)` — Update fields
- `updateStatus(tenantId, id, status)` — Update status
- `assignStaff(tenantId, classId, staffProfileId, role)` — Add class_staff record
- `removeStaff(tenantId, classId, staffProfileId, role)` — Remove class_staff record
- `preview(tenantId, id)` — Lightweight preview (cached)

### 4.10 ClassEnrolmentsService

- **Class:** `ClassEnrolmentsService`
- **Module:** `ClassesModule`
- **File:** `apps/api/src/modules/classes/class-enrolments.service.ts`
- **Dependencies:** `PrismaService`

**Methods:**

- `create(tenantId, classId, dto)` — Enrol student. Check not already actively enrolled.
- `findAllForClass(tenantId, classId, statusFilter?)` — List enrolments for a class
- `updateStatus(tenantId, id, status, endDate?)` — Enforce transition rules
- `bulkEnrol(tenantId, classId, studentIds, startDate)` — Bulk enrol, skip already enrolled, return summary
- `dropAllActiveForStudent(tenantId, studentId)` — Used by student withdrawal. Sets all active → dropped with end_date = today.

### 4.11 PromotionService

- **Class:** `PromotionService`
- **Module:** `AcademicsModule`
- **File:** `apps/api/src/modules/academics/promotion.service.ts`
- **Dependencies:** `PrismaService`, `StudentsService`, `ClassEnrolmentsService`

**Methods:**

- `preview(tenantId, academicYearId)` — Generate promotion preview data
- `commit(tenantId, dto)` — Execute batch promotion/graduation/withdrawal in single transaction

**Preview logic:**

1. Load all year groups for tenant, ordered by display_order
2. Load all students with `status = 'active'` that are enrolled in classes for this academic year
3. For each student, determine proposed action based on year_group's `next_year_group_id`

**Commit logic:**

1. Open interactive transaction with RLS
2. For each action in batch:
   - `promote`: set student.year_group_id = target, drop active class enrolments
   - `hold_back`: keep year_group_id, drop active class enrolments
   - `skip`: set year_group_id = target (different from next), drop active class enrolments
   - `graduate`: set student.status = 'graduated', drop active class enrolments
   - `withdraw`: set student.status = 'withdrawn', drop active class enrolments, record reason
3. Audit log entire batch as single operation

### 4.12 SearchService

- **Class:** `SearchService`
- **Module:** `SearchModule`
- **File:** `apps/api/src/modules/search/search.service.ts`
- **Dependencies:** `MeilisearchClient`, `PrismaService`

**Methods:**

- `search(tenantId, query, types, permissions, page, pageSize)` — Query Meilisearch with tenant filter, post-filter by permissions
- `fallbackSearch(tenantId, query, types, permissions, page, pageSize)` — PostgreSQL ILIKE fallback

### 4.13 SearchIndexService

- **Class:** `SearchIndexService`
- **Module:** `SearchModule`
- **File:** `apps/api/src/modules/search/search-index.service.ts`
- **Dependencies:** `MeilisearchClient`

**Methods:**

- `indexEntity(entityType, entity)` — Index or update a single entity document
- `removeEntity(entityType, entityId)` — Remove from index
- `reindexAll(tenantId, entityType)` — Full reindex for a tenant+type

**Index configuration:**

- Index per entity type: `students`, `parents`, `staff`, `households`
- Every document includes `tenant_id` as filterable attribute
- Searchable attributes vary by type (e.g., students: first_name, last_name, full_name, full_name_ar, student_number)

### 4.14 DashboardService

- **Class:** `DashboardService`
- **Module:** `DashboardModule`
- **File:** `apps/api/src/modules/dashboard/dashboard.service.ts`
- **Dependencies:** `PrismaService`

**Methods:**

- `schoolAdmin(tenantId, userId)` — Aggregate stats: total students (active), total staff (active), active classes, pending approvals, households with needs_completion. Generate greeting based on time of day and user name.
- `parent(tenantId, userId)` — Load linked students via parent record → student_parents. Generate greeting. Return placeholder arrays for invoices/announcements.

**Greeting logic:**

```typescript
const hour = new Date().getHours();
const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
return `${greeting}, ${user.first_name}`;
```

### 4.15 EncryptionService (if not already from P1)

- **Class:** `EncryptionService`
- **Module:** Shared/common
- **File:** `apps/api/src/common/services/encryption.service.ts`
- **Dependencies:** Node.js crypto, AWS Secrets Manager (env config)

**Methods:**

- `encrypt(plaintext, keyRef)` — AES-256-GCM encrypt, return ciphertext
- `decrypt(ciphertext, keyRef)` — Decrypt using referenced key
- `maskLast4(plaintext)` — Return `****` + last 4 characters

---

## Section 5 — Frontend Pages and Components

### 5.1 Shared Components

#### HoverPreviewCard

- **File:** `apps/web/src/components/hover-preview-card.tsx`
- **Type:** Client component (`'use client'`)
- **Behaviour:** 300ms hover delay, fetches from preview endpoint, shows floating card. Micro-skeleton if loading > 200ms. 150ms fade-out on mouse leave. No touch devices (touch navigates directly).
- **Props:** `entityType`, `entityId`, `children` (the trigger element)
- **API:** `GET /api/v1/{entityType}/:id/preview`

#### RecordHub Layout

- **File:** `apps/web/src/components/record-hub.tsx`
- **Type:** Client component
- **Pattern:** Header (title, subtitle, status badge, reference, actions) + overview strip (key metrics) + tabbed sections
- **Props:** `title`, `subtitle`, `status`, `reference?`, `actions`, `metrics`, `tabs`

#### EntityLink

- **File:** `apps/web/src/components/entity-link.tsx`
- **Type:** Client component
- **Behaviour:** Renders a link that wraps text with `HoverPreviewCard`
- **Props:** `entityType`, `entityId`, `label`

#### StatusBadge (already exists in packages/ui — extend with new statuses)

- Add support for: `applicant`, `active`, `withdrawn`, `graduated`, `archived`, `inactive`, `planned`, `closed`, `dropped`, `completed`

### 5.2 Students Pages

#### Students List

- **File:** `apps/web/src/app/[locale]/(school)/students/page.tsx`
- **Type:** Server component (data fetch) + client table
- **Route:** `/[locale]/students`
- **Data:** `GET /api/v1/students`
- **Features:** Filterable by status, year group, allergy flag. Sortable. Search. Bulk actions (future). Row click → student hub. Hover preview on student names.
- **Roles:** `students.view`, `parent.view_own_students`

#### Student Hub (Detail)

- **File:** `apps/web/src/app/[locale]/(school)/students/[id]/page.tsx`
- **Type:** Server component (initial fetch) + client tabs
- **Route:** `/[locale]/students/:id`
- **Data:** `GET /api/v1/students/:id`
- **Tabs:** Overview, Classes & Enrolments, Medical/Allergy, Activity
- **Hub content:** Status badge, year group, homeroom class, household link (with preview), parent links (with preview), allergy flag, medical notes, enrolment list
- **Roles:** `students.view`

#### Student Create/Edit

- **File:** `apps/web/src/app/[locale]/(school)/students/new/page.tsx` and `apps/web/src/app/[locale]/(school)/students/[id]/edit/page.tsx`
- **Type:** Client component (form)
- **Roles:** `students.manage`

### 5.3 Households Pages

#### Households List

- **File:** `apps/web/src/app/[locale]/(school)/households/page.tsx`
- **Route:** `/[locale]/households`
- **Data:** `GET /api/v1/households`
- **Features:** Filter by status. Search. Row click → household hub.
- **Roles:** `students.view`

#### Household Hub (Detail)

- **File:** `apps/web/src/app/[locale]/(school)/households/[id]/page.tsx`
- **Route:** `/[locale]/households/:id`
- **Data:** `GET /api/v1/households/:id`
- **Tabs:** Overview, Students, Parents, Emergency Contacts, Activity
- **Hub content:** Status, billing parent, needs_completion banner, student list (with preview), parent list (with preview), emergency contacts, address
- **Actions:** Edit, Set Billing Parent, Merge, Split
- **Roles:** `students.view`, `parent.view_own_students` (scoped)

#### Household Create/Edit

- **File:** `apps/web/src/app/[locale]/(school)/households/new/page.tsx` and `apps/web/src/app/[locale]/(school)/households/[id]/edit/page.tsx`
- **Type:** Client component (form with emergency contacts sub-form)
- **Roles:** `students.manage`

#### Household Merge Dialog

- **File:** `apps/web/src/app/[locale]/(school)/households/_components/merge-dialog.tsx`
- **Type:** Client component (modal)
- **Flow:** Select source + target → preview what moves → confirm
- **Roles:** `students.manage`

#### Household Split Dialog

- **File:** `apps/web/src/app/[locale]/(school)/households/_components/split-dialog.tsx`
- **Type:** Client component (modal/full-page)
- **Flow:** Select students + parents to move → enter new household name + emergency contacts → preview → confirm
- **Roles:** `students.manage`

### 5.4 Staff Pages

#### Staff List

- **File:** `apps/web/src/app/[locale]/(school)/staff/page.tsx`
- **Route:** `/[locale]/staff`
- **Data:** `GET /api/v1/staff-profiles`
- **Roles:** `users.view`

#### Staff Hub (Detail)

- **File:** `apps/web/src/app/[locale]/(school)/staff/[id]/page.tsx`
- **Route:** `/[locale]/staff/:id`
- **Data:** `GET /api/v1/staff-profiles/:id`
- **Tabs:** Overview, Classes, Bank Details (conditional on permission)
- **Hub content:** Employment status, type, department, job title, class assignments, staff number
- **Roles:** `users.view`

#### Staff Create/Edit

- **File:** `apps/web/src/app/[locale]/(school)/staff/new/page.tsx` and `apps/web/src/app/[locale]/(school)/staff/[id]/edit/page.tsx`
- **Roles:** `users.manage`

### 5.5 Classes Pages

#### Classes List

- **File:** `apps/web/src/app/[locale]/(school)/classes/page.tsx`
- **Route:** `/[locale]/classes`
- **Data:** `GET /api/v1/classes`
- **Roles:** `students.view`

#### Class Hub (Detail)

- **File:** `apps/web/src/app/[locale]/(school)/classes/[id]/page.tsx`
- **Route:** `/[locale]/classes/:id`
- **Data:** `GET /api/v1/classes/:id`
- **Tabs:** Overview, Students (enrolments), Staff, Schedule (placeholder)
- **Hub content:** Status, academic year, year group, subject, teacher(s), student roster count, enrolment management
- **Roles:** `students.view`

#### Class Create/Edit

- **File:** `apps/web/src/app/[locale]/(school)/classes/new/page.tsx` and `apps/web/src/app/[locale]/(school)/classes/[id]/edit/page.tsx`
- **Roles:** `students.manage`

### 5.6 Academics Pages

#### Academic Years List + Detail

- **File:** `apps/web/src/app/[locale]/(school)/settings/academic-years/page.tsx`
- **Route:** `/[locale]/settings/academic-years`
- **Data:** `GET /api/v1/academic-years`
- **Features:** List of years, inline status management, nested period management
- **Roles:** `students.manage`

#### Year Groups Management

- **File:** `apps/web/src/app/[locale]/(school)/settings/year-groups/page.tsx`
- **Route:** `/[locale]/settings/year-groups`
- **Data:** `GET /api/v1/year-groups`
- **Features:** Reorderable list, next_year_group linking
- **Roles:** `students.manage`

#### Subjects Management

- **File:** `apps/web/src/app/[locale]/(school)/settings/subjects/page.tsx`
- **Route:** `/[locale]/settings/subjects`
- **Data:** `GET /api/v1/subjects`
- **Features:** CRUD list with type filter
- **Roles:** `students.manage`

### 5.7 Promotion Wizard

- **File:** `apps/web/src/app/[locale]/(school)/promotion/page.tsx`
- **Route:** `/[locale]/promotion`
- **Type:** Client component (multi-step wizard)
- **Steps:**
  1. Select academic year to close
  2. Preview proposed actions per year group
  3. Admin overrides (hold back, skip, graduate, withdraw per student)
  4. Summary review before commit
  5. Confirmation + results
- **Data:** `GET /api/v1/promotion/preview`, `POST /api/v1/promotion/commit`
- **Roles:** `students.manage`

### 5.8 Dashboards

#### School Admin Dashboard

- **File:** `apps/web/src/app/[locale]/(school)/dashboard/page.tsx` (replace current placeholder)
- **Type:** Client component
- **Data:** `GET /api/v1/dashboard/school-admin`
- **Content:**
  - Personalised greeting header with operational summary line
  - 4 stat cards (total students, total staff, active classes, pending approvals)
  - Households needing completion card
  - Attendance placeholder
  - Recent admissions placeholder
- **Roles:** Admin roles

#### Parent Dashboard

- **File:** `apps/web/src/app/[locale]/(school)/dashboard/parent/page.tsx`
- **Type:** Client component
- **Data:** `GET /api/v1/dashboard/parent`
- **Content:**
  - Personalised greeting
  - Linked student cards (name, year group, status)
  - Outstanding invoices placeholder
  - Recent announcements placeholder
- **Roles:** Parent role

### 5.9 Allergy Report

- **File:** `apps/web/src/app/[locale]/(school)/students/allergy-report/page.tsx`
- **Route:** `/[locale]/students/allergy-report`
- **Type:** Server component + client table
- **Data:** `GET /api/v1/reports/allergy`
- **Features:** Filter by year group, class. Table with student name, class, allergy details.
- **Roles:** `students.view`

### 5.10 Global Search

- **File:** `apps/web/src/components/global-search.tsx` (update existing command palette)
- **Type:** Client component
- **Behaviour:** Wire command palette to `GET /api/v1/search`. Group results by entity type. Show recent items and pinned items before typing.
- **Data:** `GET /api/v1/search`

### 5.11 i18n

Add translation keys to `apps/web/messages/en.json` and `apps/web/messages/ar.json` for:

- All new page titles, section labels, form labels, error messages, status labels
- Dashboard greeting patterns
- Promotion wizard steps
- Entity names (student, household, parent, staff, class, etc.)

---

## Section 6 — Background Jobs

### 6.1 Search Index Sync Job

- **Job name:** `search:index-entity`
- **Queue:** `search`
- **Processor file:** `apps/worker/src/processors/search-index.processor.ts`
- **Trigger:** Called by services after entity create/update/delete (enqueue from service layer)
- **Payload:**
  ```typescript
  {
    tenant_id: string,
    entity_type: 'student' | 'parent' | 'staff' | 'household',
    entity_id: string,
    action: 'upsert' | 'delete'
  }
  ```
- **Processing:**
  1. Set RLS context
  2. If `upsert`: load entity from DB, format as search document, push to Meilisearch
  3. If `delete`: remove document from Meilisearch index
- **Retry:** 3 attempts with exponential backoff
- **DLQ:** Yes

### 6.2 Nightly Full Reindex Job

- **Job name:** `search:full-reindex`
- **Queue:** `search`
- **Processor file:** `apps/worker/src/processors/search-reindex.processor.ts`
- **Trigger:** Cron (nightly, e.g., 2:00 AM)
- **Payload:** `{ tenant_id: string }` (one job per tenant)
- **Processing:**
  1. Set RLS context
  2. For each entity type: load all entities, batch push to Meilisearch
  3. Remove stale documents (entities deleted since last reindex)
- **Retry:** 1 attempt (nightly retry is sufficient)

---

## Section 7 — Implementation Order

### Step 1: Database Migration + Post-Migration SQL

1. Add all new enums to Prisma schema
2. Add all new models to Prisma schema (households, parents, students, staff_profiles, academics, classes, enrolments, join tables)
3. Add relation fields to existing Tenant and User models
4. Run `npx prisma migrate dev --name add-p2-core-entities`
5. Create `post_migrate.sql` with: RLS policies for all 14 tables, set_updated_at triggers for 13 tables, generated columns for students (full_name, full_name_ar), exclusion constraints for academic_years and academic_periods
6. Run post-migration script

### Step 2: Shared Types and Zod Schemas

1. Add new types to `packages/shared/src/types/` (household, parent, student, staff, academics, class, preview, search, dashboard)
2. Add new Zod schemas to `packages/shared/src/schemas/` (create/update schemas for each entity)
3. Add new constants (student status transitions, class staff roles, etc.)
4. Export all from `packages/shared/src/index.ts`

### Step 3: EncryptionService (if not already from P1)

1. Create or verify `apps/api/src/common/services/encryption.service.ts`
2. AES-256-GCM encrypt/decrypt with key ref pattern

### Step 4: Backend Services — Academic Foundation

1. `AcademicsModule` with `AcademicYearsService`, `AcademicPeriodsService`, `YearGroupsService`, `SubjectsService`
2. Controllers for each
3. These have no dependencies on other P2 entities

### Step 5: Backend Services — Staff Profiles

1. `StaffProfilesModule` with `StaffProfilesService`
2. Controller with bank detail access control
3. Depends on: User model (P1), EncryptionService

### Step 6: Backend Services — Households, Parents

1. `HouseholdsModule` with `HouseholdsService`
2. `ParentsModule` with `ParentsService`
3. Controllers for each
4. Merge/split logic in HouseholdsService

### Step 7: Backend Services — Students

1. `StudentsModule` with `StudentsService`
2. Controller with status transition endpoints, allergy report, export pack
3. Depends on: Households, Parents, Year Groups, Classes

### Step 8: Backend Services — Classes & Enrolments

1. `ClassesModule` with `ClassesService`, `ClassEnrolmentsService`
2. Controllers for classes and enrolments
3. Depends on: Academic Years, Year Groups, Subjects, Staff Profiles

### Step 9: Backend Services — Promotion

1. `PromotionService` in AcademicsModule
2. Promotion controller
3. Depends on: Students, Classes, Year Groups, Enrolments

### Step 10: Backend Services — Search

1. `SearchModule` with `SearchService`, `SearchIndexService`
2. Meilisearch client setup and configuration
3. Search controller
4. Integrate `SearchIndexService.indexEntity()` calls into entity services (students, parents, staff, households)

### Step 11: Backend Services — Dashboards

1. `DashboardModule` with `DashboardService`
2. Dashboard controller with school-admin and parent endpoints

### Step 12: Backend — Preview Endpoints

1. Add preview methods to: HouseholdsService, StudentsService, StaffProfilesService, ClassesService
2. Redis caching for previews (30s TTL)
3. Preview routes on each controller

### Step 13: Register All New Modules

1. Import all new modules in `apps/api/src/app.module.ts`

### Step 14: Worker — Search Index Jobs

1. Create search queue processor in worker service
2. `SearchIndexProcessor` for single entity upsert/delete
3. `SearchReindexProcessor` for nightly full reindex
4. Register processors in worker module

### Step 15: Frontend — Shared Components

1. `HoverPreviewCard` component
2. `RecordHub` layout component
3. `EntityLink` component
4. Extend `StatusBadge` with new statuses

### Step 16: Frontend — Academic Settings Pages

1. Academic Years management page (under settings)
2. Year Groups management page (under settings)
3. Subjects management page (under settings)

### Step 17: Frontend — Students Pages

1. Students list page
2. Student hub (detail) page with tabs
3. Student create/edit forms
4. Allergy report page

### Step 18: Frontend — Households Pages

1. Households list page
2. Household hub (detail) page with tabs
3. Household create/edit forms
4. Merge dialog
5. Split dialog

### Step 19: Frontend — Staff Pages

1. Staff list page
2. Staff hub (detail) page with tabs
3. Staff create/edit forms

### Step 20: Frontend — Classes Pages

1. Classes list page
2. Class hub (detail) page with tabs
3. Class create/edit forms
4. Enrolment management within class hub

### Step 21: Frontend — Promotion Wizard

1. Multi-step promotion wizard page

### Step 22: Frontend — Dashboards

1. Replace school admin dashboard placeholder with real implementation
2. Create parent dashboard page

### Step 23: Frontend — Search Integration

1. Wire command palette to search API
2. Add recent items and grouped results

### Step 24: Frontend — i18n

1. Add all translation keys for en and ar locales
2. Test RTL rendering on all new pages

### Step 25: Settings Layout Updates

1. Add Academic Years, Year Groups, Subjects links to settings layout/navigation

---

## Section 8 — Files to Create

### Backend — Modules

```
apps/api/src/modules/households/
├── households.module.ts
├── households.controller.ts
├── households.service.ts
└── dto/
    ├── create-household.dto.ts
    ├── update-household.dto.ts
    ├── merge-household.dto.ts
    ├── split-household.dto.ts
    └── emergency-contact.dto.ts

apps/api/src/modules/parents/
├── parents.module.ts
├── parents.controller.ts
├── parents.service.ts
└── dto/
    ├── create-parent.dto.ts
    └── update-parent.dto.ts

apps/api/src/modules/students/
├── students.module.ts
├── students.controller.ts
├── students.service.ts
└── dto/
    ├── create-student.dto.ts
    ├── update-student.dto.ts
    └── update-student-status.dto.ts

apps/api/src/modules/staff-profiles/
├── staff-profiles.module.ts
├── staff-profiles.controller.ts
├── staff-profiles.service.ts
└── dto/
    ├── create-staff-profile.dto.ts
    └── update-staff-profile.dto.ts

apps/api/src/modules/academics/
├── academics.module.ts
├── academic-years.controller.ts
├── academic-years.service.ts
├── academic-periods.controller.ts
├── academic-periods.service.ts
├── year-groups.controller.ts
├── year-groups.service.ts
├── subjects.controller.ts
├── subjects.service.ts
├── promotion.controller.ts
├── promotion.service.ts
└── dto/
    ├── create-academic-year.dto.ts
    ├── update-academic-year.dto.ts
    ├── create-academic-period.dto.ts
    ├── update-academic-period.dto.ts
    ├── create-year-group.dto.ts
    ├── update-year-group.dto.ts
    ├── create-subject.dto.ts
    ├── update-subject.dto.ts
    └── promotion-commit.dto.ts

apps/api/src/modules/classes/
├── classes.module.ts
├── classes.controller.ts
├── classes.service.ts
├── class-enrolments.controller.ts
├── class-enrolments.service.ts
└── dto/
    ├── create-class.dto.ts
    ├── update-class.dto.ts
    ├── assign-class-staff.dto.ts
    ├── create-enrolment.dto.ts
    ├── bulk-enrol.dto.ts
    └── update-enrolment-status.dto.ts

apps/api/src/modules/search/
├── search.module.ts
├── search.controller.ts
├── search.service.ts
├── search-index.service.ts
└── meilisearch.client.ts

apps/api/src/modules/dashboard/
├── dashboard.module.ts
├── dashboard.controller.ts
└── dashboard.service.ts
```

### Backend — Common (if not already existing)

```
apps/api/src/common/services/encryption.service.ts  (verify — may already exist from P1)
```

### Worker

```
apps/worker/src/processors/search-index.processor.ts
apps/worker/src/processors/search-reindex.processor.ts
apps/worker/src/queues/search.queue.ts
```

### Shared Types & Schemas

```
packages/shared/src/types/household.ts
packages/shared/src/types/parent.ts
packages/shared/src/types/student.ts
packages/shared/src/types/staff-profile.ts
packages/shared/src/types/academic.ts
packages/shared/src/types/class.ts
packages/shared/src/types/preview.ts
packages/shared/src/types/search.ts
packages/shared/src/types/dashboard.ts

packages/shared/src/schemas/household.schema.ts
packages/shared/src/schemas/parent.schema.ts
packages/shared/src/schemas/student.schema.ts
packages/shared/src/schemas/staff-profile.schema.ts
packages/shared/src/schemas/academic.schema.ts
packages/shared/src/schemas/class.schema.ts
packages/shared/src/schemas/search.schema.ts
packages/shared/src/schemas/promotion.schema.ts

packages/shared/src/constants/student-status.ts
packages/shared/src/constants/class-enrolment-status.ts
```

### Prisma Migration

```
packages/prisma/migrations/{timestamp}_add-p2-core-entities/
├── migration.sql
└── post_migrate.sql
```

### Frontend — Components

```
apps/web/src/components/hover-preview-card.tsx
apps/web/src/components/record-hub.tsx
apps/web/src/components/entity-link.tsx
```

### Frontend — Pages

```
apps/web/src/app/[locale]/(school)/students/page.tsx                    (replace if placeholder)
apps/web/src/app/[locale]/(school)/students/new/page.tsx
apps/web/src/app/[locale]/(school)/students/[id]/page.tsx
apps/web/src/app/[locale]/(school)/students/[id]/edit/page.tsx
apps/web/src/app/[locale]/(school)/students/allergy-report/page.tsx
apps/web/src/app/[locale]/(school)/students/_components/student-form.tsx
apps/web/src/app/[locale]/(school)/students/_components/student-table.tsx

apps/web/src/app/[locale]/(school)/households/page.tsx                  (replace if placeholder)
apps/web/src/app/[locale]/(school)/households/new/page.tsx
apps/web/src/app/[locale]/(school)/households/[id]/page.tsx
apps/web/src/app/[locale]/(school)/households/[id]/edit/page.tsx
apps/web/src/app/[locale]/(school)/households/_components/household-form.tsx
apps/web/src/app/[locale]/(school)/households/_components/household-table.tsx
apps/web/src/app/[locale]/(school)/households/_components/merge-dialog.tsx
apps/web/src/app/[locale]/(school)/households/_components/split-dialog.tsx
apps/web/src/app/[locale]/(school)/households/_components/emergency-contacts-form.tsx

apps/web/src/app/[locale]/(school)/staff/page.tsx                       (replace if placeholder)
apps/web/src/app/[locale]/(school)/staff/new/page.tsx
apps/web/src/app/[locale]/(school)/staff/[id]/page.tsx
apps/web/src/app/[locale]/(school)/staff/[id]/edit/page.tsx
apps/web/src/app/[locale]/(school)/staff/_components/staff-form.tsx
apps/web/src/app/[locale]/(school)/staff/_components/staff-table.tsx

apps/web/src/app/[locale]/(school)/classes/page.tsx                     (replace if placeholder)
apps/web/src/app/[locale]/(school)/classes/new/page.tsx
apps/web/src/app/[locale]/(school)/classes/[id]/page.tsx
apps/web/src/app/[locale]/(school)/classes/[id]/edit/page.tsx
apps/web/src/app/[locale]/(school)/classes/_components/class-form.tsx
apps/web/src/app/[locale]/(school)/classes/_components/class-table.tsx
apps/web/src/app/[locale]/(school)/classes/_components/enrolment-management.tsx
apps/web/src/app/[locale]/(school)/classes/_components/staff-assignment.tsx

apps/web/src/app/[locale]/(school)/promotion/page.tsx
apps/web/src/app/[locale]/(school)/promotion/_components/promotion-wizard.tsx
apps/web/src/app/[locale]/(school)/promotion/_components/promotion-preview.tsx
apps/web/src/app/[locale]/(school)/promotion/_components/promotion-summary.tsx

apps/web/src/app/[locale]/(school)/settings/academic-years/page.tsx
apps/web/src/app/[locale]/(school)/settings/academic-years/_components/academic-year-form.tsx
apps/web/src/app/[locale]/(school)/settings/academic-years/_components/period-management.tsx
apps/web/src/app/[locale]/(school)/settings/year-groups/page.tsx
apps/web/src/app/[locale]/(school)/settings/year-groups/_components/year-group-form.tsx
apps/web/src/app/[locale]/(school)/settings/subjects/page.tsx
apps/web/src/app/[locale]/(school)/settings/subjects/_components/subject-form.tsx

apps/web/src/app/[locale]/(school)/dashboard/parent/page.tsx
```

---

## Section 9 — Files to Modify

### Prisma Schema

- `packages/prisma/schema.prisma` — Add all new enums, models, and relation fields to Tenant/User

### Backend App Module

- `apps/api/src/app.module.ts` — Import and register: `HouseholdsModule`, `ParentsModule`, `StudentsModule`, `StaffProfilesModule`, `AcademicsModule`, `ClassesModule`, `SearchModule`, `DashboardModule`

### Shared Package Index

- `packages/shared/src/index.ts` — Export all new types, schemas, constants

### Worker Module

- `apps/worker/src/worker.module.ts` (or equivalent) — Register search queue processors

### Frontend — Dashboard

- `apps/web/src/app/[locale]/(school)/dashboard/page.tsx` — Replace placeholder with real school admin dashboard

### Frontend — Layout/Navigation

- `apps/web/src/app/[locale]/(school)/layout.tsx` — Potentially add promotion link under Academics section. Verify existing Students, Staff, Households, Classes links point to correct routes.

### Frontend — Settings Layout

- `apps/web/src/app/[locale]/(school)/settings/layout.tsx` — Add navigation links for Academic Years, Year Groups, Subjects

### Frontend — Command Palette / Global Search

- `apps/web/src/components/command-palette.tsx` (or equivalent existing file) — Wire to search API

### Frontend — i18n Files

- `apps/web/messages/en.json` — Add all new translation keys
- `apps/web/messages/ar.json` — Add all new Arabic translations

### Seed Data

- `packages/prisma/seed.ts` — Optionally add dev seed data for academic years, year groups, subjects, sample households, students, staff profiles, classes (for development convenience)

---

## Section 10 — Key Context for Executor

### Pattern References (from existing codebase)

1. **Service pattern:** Follow `apps/api/src/modules/tenants/tenants.service.ts` — inject PrismaService, use interactive transactions with RLS, throw typed HttpExceptions.

2. **Controller pattern:** Follow `apps/api/src/modules/tenants/tenants.controller.ts` — thin controllers, `@Controller('v1/...')`, `@UseGuards(AuthGuard)`, `@RequiresPermission(...)`, `@UsePipes(new ZodValidationPipe(schema))`, `@CurrentUser()`, `@CurrentTenant()`.

3. **Module pattern:** Follow `apps/api/src/modules/tenants/tenants.module.ts` — NestJS Module decorator with providers and controllers.

4. **RLS pattern:** Follow `apps/api/src/common/middleware/rls.middleware.ts` — `createRlsClient(prisma, tenantContext)` then `prismaWithRls.$transaction(async (tx) => { ... })`.

5. **Zod schema pattern:** Follow `packages/shared/src/schemas/auth.schema.ts` — define schema, export both schema and inferred type.

6. **API response pattern:** Follow `packages/shared/src/types/api-response.ts` — `ApiSuccessResponse<T>`, `ApiErrorResponse`.

7. **Frontend API client:** Follow `apps/web/src/lib/api-client.ts` — `apiClient<T>()` generic function.

8. **Worker job pattern:** Follow `apps/worker/src/base/tenant-aware-job.ts` — extend `TenantAwareJob`, implement `processJob()`.

### Gotchas and Non-Obvious Requirements

1. **Generated columns in Prisma:** Prisma doesn't support `GENERATED ALWAYS AS ... STORED`. The `full_name` and `full_name_ar` columns on `students` must be:
   - Declared in Prisma schema as optional `String?` fields (never set by application code)
   - Marked with `@ignore` or handled via a raw SQL migration that adds the generated column AFTER Prisma creates the base table
   - The `post_migrate.sql` must drop the Prisma-created placeholder and recreate as a generated column
   - In application code, these fields are read-only — never include them in create/update DTOs

2. **Exclusion constraints:** `btree_gist` extension must be enabled (it was created in P0's first `post_migrate.sql`). Verify it exists. The exclusion constraints for `academic_years` and `academic_periods` must be in `post_migrate.sql`, not in the Prisma schema.

3. **Composite primary keys:** `household_parents` and `student_parents` use composite PKs `(household_id, parent_id)` and `(student_id, parent_id)` respectively. `class_staff` uses a 3-column PK `(class_id, staff_profile_id, assignment_role)`. In Prisma, use `@@id([col1, col2])`.

4. **Parent-user linking:** When a parent record is created with an email, the service should check if a `User` with that email exists and has an active membership in this tenant. If so, set `parent.user_id = user.id`. This is important for parent portal access.

5. **Household `needs_completion` flag:** Only set to `true` when created via admissions conversion (Phase 3). For P2, households created manually default to `needs_completion = false`. However, the recalculation logic should still be implemented so it works when P3 calls it.

6. **Student export pack:** In P2, attendance and grades data won't exist yet. Return empty arrays for those sections with a structure that P4a and P5 will populate.

7. **Meilisearch configuration:** If Meilisearch is not available in the dev environment, the `SearchService` must gracefully fall back to PostgreSQL ILIKE queries. Never fail hard if Meilisearch is down.

8. **Bank detail encryption:** Check if `EncryptionService` already exists from P1 (it was used for Stripe keys in `TenantStripeConfig`). If it does, reuse it. If not, create it as a shared service.

9. **Preview endpoint caching:** Use Redis with 30-second TTL. Cache key pattern: `preview:{entityType}:{id}`. Invalidate on entity update (call `RedisService.del(key)` in the update method).

10. **Pagination convention:** The codebase uses offset-based pagination: `?page=1&pageSize=20`. Response includes `meta: { page, pageSize, total }`. Follow the existing `PaginationMeta` type from `packages/shared/src/types/api-response.ts`.

11. **Permission keys already seeded:** `students.manage`, `students.view`, `users.manage`, `users.view`, `payroll.view_bank_details` — all already exist in the permissions seed. No new permissions need to be created for P2.

12. **RTL styling:** All frontend components must use logical directional classes (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`). Never use `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`. This is enforced by a lint rule.

13. **Parent dashboard routing:** Parents need a different dashboard view. The school layout should detect the user's active role context and route to the appropriate dashboard variant. If the user has `parent.view_own_students` permission and is in parent context, show the parent dashboard.

14. **Merge/split concurrency:** Both household merge and split use `SELECT ... FOR UPDATE`. For merge, lock both households ordered by ID to prevent deadlocks. For split, lock only the source household. These must use interactive transactions.

---

## Validation Checklist

- [x] Every table in the phase instruction file has a corresponding entry in Section 2 (households, household_emergency_contacts, parents, household_parents, students, student_parents, staff_profiles, academic_years, academic_periods, year_groups, subjects, classes, class_staff, class_enrolments — `rooms` and `schedules` explicitly excluded as Phase 4)
- [x] Every functional requirement has at least one endpoint in Section 3 (4.6.1-4.6.7 households/parents/students, 4.7.1-4.7.3 academics/classes/promotion, dashboards, Meilisearch, preview endpoints)
- [x] Every endpoint has a service method in Section 4
- [x] Every service method is reachable from a controller or job processor
- [x] No tables, endpoints, or features are planned that aren't in the phase spec
- [x] Implementation order in Section 7 has no forward dependencies
