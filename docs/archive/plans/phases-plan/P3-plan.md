# Phase 3 Implementation Plan — Admissions

---

## Section 1 — Overview

Phase 3 delivers the configurable admissions system: a form builder for defining application forms with versioning, a public-facing application page, an application review workflow with internal notes, approval-gated acceptance, duplicate detection, application-to-student conversion, application number sequence generation, and basic admissions funnel analytics.

**Key dependencies on prior phases:**

| Phase | What P3 uses                                                                                                                                                                                                                                                                                                                                             |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1    | `tenants`, `tenant_settings` (admissions.requireApprovalForAcceptance), `tenant_sequences` (application type), `approval_workflows` + `approval_requests` (application_accept action type), `ApprovalActionType.application_accept` enum value, auth guards, RBAC decorators, `users` table, `roles`, `permissions` (admissions.manage, admissions.view) |
| P2    | `students`, `parents`, `households`, `household_parents`, `student_parents`, `year_groups`, Meilisearch search-index infrastructure, `SearchIndexService`, `createRlsClient` pattern, `RecordHub` component, `HoverPreviewCard` component, pagination schema                                                                                             |

**Modules this phase imports or extends:**

- `ApprovalRequestsService` from `modules/approvals` — for `checkAndCreateIfNeeded()`
- `SearchIndexService` from `modules/search` — for indexing applications
- `PrismaService` from `modules/prisma` — for RLS-aware DB access
- `RedisService` from `modules/redis` — for rate limiting on public endpoint
- `DashboardService` from `modules/dashboard` — to add admissions counts to admin dashboard

---

## Section 2 — Database Changes

### 2.1 New Enums

#### `FormDefinitionStatus`

```prisma
enum FormDefinitionStatus {
  draft
  published
  archived
}
```

#### `ApplicationFieldType`

```prisma
enum ApplicationFieldType {
  short_text
  long_text
  number
  date
  boolean
  single_select
  multi_select
  phone
  email
  country
  yes_no
}
```

#### `ApplicationStatus`

```prisma
enum ApplicationStatus {
  draft
  submitted
  under_review
  pending_acceptance_approval
  accepted
  rejected
  withdrawn
}
```

### 2.2 Table: `admission_form_definitions`

| Column           | Type                 | Constraints                                       |
| ---------------- | -------------------- | ------------------------------------------------- |
| `id`             | UUID                 | PK, `@default(dbgenerated("gen_random_uuid()"))`  |
| `tenant_id`      | UUID                 | FK -> tenants, NOT NULL                           |
| `name`           | VARCHAR(255)         | NOT NULL                                          |
| `base_form_id`   | UUID                 | NULL, FK -> admission_form_definitions (self-ref) |
| `version_number` | INT                  | NOT NULL, default 1                               |
| `status`         | FormDefinitionStatus | NOT NULL, default `draft`                         |
| `created_at`     | TIMESTAMPTZ          | NOT NULL, `@default(now())`                       |
| `updated_at`     | TIMESTAMPTZ          | NOT NULL, `@default(now())`, `@updatedAt`         |

**Unique constraints:**

- `UNIQUE (tenant_id, base_form_id, version_number)` — no duplicate versions
- `UNIQUE (tenant_id, name) WHERE base_form_id IS NULL AND status != 'archived'` — partial unique for root (v1) forms only

**Indexes:**

```sql
CREATE INDEX idx_form_definitions_tenant ON admission_form_definitions(tenant_id, status);
CREATE INDEX idx_form_definitions_base ON admission_form_definitions(base_form_id) WHERE base_form_id IS NOT NULL;
CREATE UNIQUE INDEX idx_form_definitions_version ON admission_form_definitions(tenant_id, base_form_id, version_number);
CREATE UNIQUE INDEX idx_form_definitions_name_root ON admission_form_definitions(tenant_id, name) WHERE base_form_id IS NULL AND status != 'archived';
```

**RLS policy:** Standard tenant isolation policy.

```sql
ALTER TABLE admission_form_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_form_definitions FORCE ROW LEVEL SECURITY;
CREATE POLICY admission_form_definitions_tenant_isolation ON admission_form_definitions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

**`set_updated_at()` trigger:** Yes — `updated_at` column is present and mutable.

**Seed data:** None required — forms are created by school admins.

### 2.3 Table: `admission_form_fields`

| Column                        | Type                 | Constraints                                                   |
| ----------------------------- | -------------------- | ------------------------------------------------------------- |
| `id`                          | UUID                 | PK, `@default(dbgenerated("gen_random_uuid()"))`              |
| `tenant_id`                   | UUID                 | FK -> tenants, NOT NULL                                       |
| `form_definition_id`          | UUID                 | FK -> admission_form_definitions, NOT NULL, ON DELETE CASCADE |
| `field_key`                   | VARCHAR(100)         | NOT NULL                                                      |
| `label`                       | VARCHAR(255)         | NOT NULL                                                      |
| `help_text`                   | TEXT                 | NULL                                                          |
| `field_type`                  | ApplicationFieldType | NOT NULL                                                      |
| `required`                    | BOOLEAN              | NOT NULL, default false                                       |
| `visible_to_parent`           | BOOLEAN              | NOT NULL, default true                                        |
| `visible_to_staff`            | BOOLEAN              | NOT NULL, default true                                        |
| `searchable`                  | BOOLEAN              | NOT NULL, default false                                       |
| `reportable`                  | BOOLEAN              | NOT NULL, default false                                       |
| `options_json`                | JSONB                | NULL                                                          |
| `validation_rules_json`       | JSONB                | NULL                                                          |
| `conditional_visibility_json` | JSONB                | NULL                                                          |
| `display_order`               | INT                  | NOT NULL                                                      |
| `active`                      | BOOLEAN              | NOT NULL, default true                                        |

**Indexes:**

```sql
CREATE INDEX idx_form_fields_definition ON admission_form_fields(form_definition_id);
```

**RLS policy:** Standard tenant isolation policy.

```sql
ALTER TABLE admission_form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_form_fields FORCE ROW LEVEL SECURITY;
CREATE POLICY admission_form_fields_tenant_isolation ON admission_form_fields
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

**`set_updated_at()` trigger:** No — fields are immutable once the form version is published. Edits create a new form version with new field records.

**JSONB schemas:**

`options_json`:

```typescript
z.array(
  z.object({
    value: z.string(),
    label: z.string(),
  }),
).nullable();
```

`validation_rules_json`:

```typescript
z.object({
  min_length: z.number().int().optional(),
  max_length: z.number().int().optional(),
  min_value: z.number().optional(),
  max_value: z.number().optional(),
  pattern: z.string().optional(),
}).nullable();
```

`conditional_visibility_json`:

```typescript
z.object({
  depends_on_field_key: z.string(),
  show_when_value: z.union([z.string(), z.array(z.string())]),
}).nullable();
```

### 2.4 Table: `applications`

| Column                   | Type              | Constraints                                      |
| ------------------------ | ----------------- | ------------------------------------------------ |
| `id`                     | UUID              | PK, `@default(dbgenerated("gen_random_uuid()"))` |
| `tenant_id`              | UUID              | FK -> tenants, NOT NULL                          |
| `form_definition_id`     | UUID              | FK -> admission_form_definitions, NOT NULL       |
| `application_number`     | VARCHAR(50)       | NOT NULL                                         |
| `submitted_by_parent_id` | UUID              | NULL, FK -> parents                              |
| `student_first_name`     | VARCHAR(100)      | NOT NULL                                         |
| `student_last_name`      | VARCHAR(100)      | NOT NULL                                         |
| `date_of_birth`          | DATE              | NULL                                             |
| `status`                 | ApplicationStatus | NOT NULL, default `draft`                        |
| `submitted_at`           | TIMESTAMPTZ       | NULL                                             |
| `reviewed_at`            | TIMESTAMPTZ       | NULL                                             |
| `reviewed_by_user_id`    | UUID              | NULL, FK -> users                                |
| `payload_json`           | JSONB             | NOT NULL                                         |
| `created_at`             | TIMESTAMPTZ       | NOT NULL, `@default(now())`                      |
| `updated_at`             | TIMESTAMPTZ       | NOT NULL, `@default(now())`, `@updatedAt`        |

**Unique constraints:**

- `UNIQUE (tenant_id, application_number)`

**Indexes:**

```sql
CREATE INDEX idx_applications_tenant_status ON applications(tenant_id, status);
CREATE UNIQUE INDEX idx_applications_number ON applications(tenant_id, application_number);
CREATE INDEX idx_applications_tenant_form ON applications(tenant_id, form_definition_id);
CREATE INDEX idx_application_notes_application ON application_notes(application_id);
```

**RLS policy:** Standard tenant isolation policy.

```sql
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications FORCE ROW LEVEL SECURITY;
CREATE POLICY applications_tenant_isolation ON applications
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

**`set_updated_at()` trigger:** Yes — status changes, review timestamps, etc. mutate the row.

**`payload_json` schema:**

```typescript
// Dynamic — validated against the form_definition's fields at submission time
z.record(z.string(), z.unknown());
```

### 2.5 Table: `application_notes`

| Column           | Type        | Constraints                                      |
| ---------------- | ----------- | ------------------------------------------------ |
| `id`             | UUID        | PK, `@default(dbgenerated("gen_random_uuid()"))` |
| `tenant_id`      | UUID        | FK -> tenants, NOT NULL                          |
| `application_id` | UUID        | FK -> applications, NOT NULL, ON DELETE CASCADE  |
| `author_user_id` | UUID        | FK -> users, NOT NULL                            |
| `note`           | TEXT        | NOT NULL                                         |
| `is_internal`    | BOOLEAN     | NOT NULL, default true                           |
| `created_at`     | TIMESTAMPTZ | NOT NULL, `@default(now())`                      |

**Indexes:**

```sql
CREATE INDEX idx_application_notes_application ON application_notes(application_id);
```

**RLS policy:** Standard tenant isolation policy.

```sql
ALTER TABLE application_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY application_notes_tenant_isolation ON application_notes
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

**`set_updated_at()` trigger:** No — append-only table (notes are never edited).

---

## Section 3 — API Endpoints

### 3.1 Form Definition Endpoints

#### `POST /api/v1/admission-forms`

**Permission:** `admissions.manage`
**Request schema:**

```typescript
const createFormDefinitionSchema = z.object({
  name: z.string().min(1).max(255),
  fields: z
    .array(
      z.object({
        field_key: z.string().min(1).max(100),
        label: z.string().min(1).max(255),
        help_text: z.string().max(1000).nullable().optional(),
        field_type: z.nativeEnum(ApplicationFieldType),
        required: z.boolean().default(false),
        visible_to_parent: z.boolean().default(true),
        visible_to_staff: z.boolean().default(true),
        searchable: z.boolean().default(false),
        reportable: z.boolean().default(false),
        options_json: fieldOptionsSchema.nullable().optional(),
        validation_rules_json: validationRulesSchema.nullable().optional(),
        conditional_visibility_json: conditionalVisibilitySchema.nullable().optional(),
        display_order: z.number().int().min(0),
        active: z.boolean().default(true),
      }),
    )
    .min(1),
});
```

**Response:** `{ data: FormDefinition }` (201)
**Business logic:**

1. Validate field_keys are unique within the form
2. Validate conditional_visibility references point to existing field_keys in the same form
3. For single_select/multi_select fields, validate options_json is non-null and non-empty
4. Create form definition with status `draft`, version_number 1, base_form_id NULL
5. Create all fields in order
6. If `date_of_birth` field is not marked required, include warning in response: `warnings: ["date_of_birth is recommended as required for student conversion"]`
   **Error cases:**

- `DUPLICATE_FORM_NAME` (409) — another active root form with same name exists in tenant
- `INVALID_FIELD_KEY` (400) — duplicate field_key within form
- `INVALID_CONDITIONAL_REF` (400) — conditional visibility references non-existent field_key
- `MISSING_OPTIONS` (400) — single_select/multi_select without options_json

#### `GET /api/v1/admission-forms`

**Permission:** `admissions.view`
**Request schema:**

```typescript
const listFormDefinitionsSchema = paginationQuerySchema.extend({
  status: z.nativeEnum(FormDefinitionStatus).optional(),
});
```

**Response:** `{ data: FormDefinition[], meta: { page, pageSize, total } }`
**Business logic:**

1. List form definitions for tenant
2. Only return the latest version of each form (group by base_form_id or id where base_form_id is null)
3. Include field count per form
4. Apply status filter if provided
5. Order by created_at desc

#### `GET /api/v1/admission-forms/:id`

**Permission:** `admissions.view`
**Response:** `{ data: FormDefinition }` with all fields included
**Error cases:**

- `FORM_NOT_FOUND` (404)

#### `PUT /api/v1/admission-forms/:id`

**Permission:** `admissions.manage`
**Request schema:** Same as create, plus `expected_updated_at` for optimistic concurrency on draft forms.
**Business logic:**

1. If form status is `draft`:
   - Update in-place (delete existing fields, re-create with new data)
   - Check optimistic concurrency via `expected_updated_at`
2. If form status is `published`:
   - Archive current version (status -> archived)
   - Create NEW form definition record with:
     - `base_form_id` = original form's id (or original's base_form_id if this is already a version)
     - `version_number` = previous version + 1
     - `status` = `draft`
   - Create new field records for the new version
   - Return the new version
3. If form status is `archived`: reject with error
   **Error cases:**

- `FORM_NOT_FOUND` (404)
- `FORM_ARCHIVED` (400) — cannot edit archived form
- `CONCURRENT_MODIFICATION` (409) — expected_updated_at mismatch

#### `POST /api/v1/admission-forms/:id/publish`

**Permission:** `admissions.manage`
**Business logic:**

1. Form must be in `draft` status
2. Validate at least one field exists
3. Archive any other published form with the same base_form_id (or same id lineage)
4. Set status to `published`
5. Return updated form
   **Error cases:**

- `FORM_NOT_FOUND` (404)
- `FORM_NOT_DRAFT` (400)
- `FORM_EMPTY` (400) — no fields defined

#### `POST /api/v1/admission-forms/:id/archive`

**Permission:** `admissions.manage`
**Business logic:**

1. Set status to `archived`
2. Any existing draft applications against this form remain accessible but form cannot accept new submissions
   **Error cases:**

- `FORM_NOT_FOUND` (404)
- `FORM_ALREADY_ARCHIVED` (400)

#### `GET /api/v1/admission-forms/:id/versions`

**Permission:** `admissions.view`
**Response:** `{ data: FormDefinitionSummary[] }` — all versions of this form lineage
**Business logic:**

1. Find the root form (base_form_id is null)
2. Return all versions ordered by version_number desc

### 3.2 Application Endpoints

#### `POST /api/v1/public/admissions/form`

**Permission:** None (public endpoint, no auth required)
**Request:** None (tenant resolved from domain)
**Response:** `{ data: { form_definition: FormDefinition, fields: FormField[] } }` — the currently published form for the tenant, with only `visible_to_parent = true` fields
**Business logic:**

1. Find the latest published form definition for the tenant
2. Return form with fields filtered to `visible_to_parent = true`
3. If no published form exists, return `{ data: null }`
   **Error cases:**

- `NO_PUBLISHED_FORM` (404) — no published form available

#### `POST /api/v1/public/admissions/applications`

**Permission:** None (public endpoint, no auth required)
**Rate limit:** 3 per IP per tenant per hour (Redis key: `ratelimit:admissions:{tenant_id}:{ip}`, TTL 1 hour)
**Honeypot:** Request includes a `website_url` field — if non-empty, silently accept but don't create application
**Request schema:**

```typescript
const createPublicApplicationSchema = z.object({
  form_definition_id: z.string().uuid(),
  student_first_name: z.string().min(1).max(100),
  student_last_name: z.string().min(1).max(100),
  date_of_birth: z.string().date().nullable().optional(),
  payload_json: z.record(z.string(), z.unknown()),
  website_url: z.string().optional(), // honeypot
});
```

**Response:** `{ data: { id: string, application_number: string } }` (201)
**Business logic:**

1. Check honeypot — if `website_url` is non-empty, return 201 with fake id/number (silent rejection)
2. Check rate limit — if exceeded, return 429
3. Verify form_definition_id exists, is published, and belongs to the tenant
4. Validate payload_json against the form definition's required fields (only parent-visible fields)
5. Generate application_number using `SequenceService.nextNumber(tenantId, 'application')` — format: `APP-{YYYY}-{padded_sequence}`
6. Create application with status `draft`, no parent link
7. Return id and application_number
   **Error cases:**

- `RATE_LIMIT_EXCEEDED` (429)
- `FORM_NOT_FOUND` (404) — invalid or non-published form
- `VALIDATION_ERROR` (400) — missing required fields in payload

#### `POST /api/v1/public/admissions/applications/:id/submit`

**Permission:** Requires authentication (parent role)
**Request schema:**

```typescript
const submitApplicationSchema = z.object({
  application_id: z.string().uuid(), // path param
});
```

**Response:** `{ data: Application }`
**Business logic:**

1. Application must be in `draft` status
2. Application must belong to the tenant
3. Link the authenticated parent to the application (`submitted_by_parent_id`)
4. If no parent record exists for the authenticated user in this tenant, create one from user profile
5. Check for duplicate applications (matching student_first_name + student_last_name + date_of_birth in same tenant)
6. Set status to `submitted`, `submitted_at` to now()
7. If duplicates found, flag application (add metadata to response: `{ duplicates: [{ application_id, application_number }] }`)
8. Enqueue Meilisearch index job for the application
   **Error cases:**

- `APPLICATION_NOT_FOUND` (404)
- `APPLICATION_NOT_DRAFT` (400) — already submitted
- `PARENT_NOT_FOUND` (400) — user has no parent record and creation failed

#### `GET /api/v1/applications`

**Permission:** `admissions.view`
**Request schema:**

```typescript
const listApplicationsSchema = paginationQuerySchema.extend({
  status: z.nativeEnum(ApplicationStatus).optional(),
  form_definition_id: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
});
```

**Response:** `{ data: Application[], meta: { page, pageSize, total } }`
**Business logic:**

1. List applications for tenant with filtering
2. Include form definition name, submitted_by parent name
3. If search is provided, filter by student name or application_number (ILIKE)
4. Order by created_at desc (newest first)

#### `GET /api/v1/applications/:id`

**Permission:** `admissions.view`
**Response:** `{ data: Application }` with form definition, fields, notes, and duplicate flags
**Business logic:**

1. Fetch application with all related data
2. Include form definition with fields (for rendering the submitted answers)
3. Include notes (internal + non-internal based on requester role)
4. Include duplicate detection results (re-check on view)
   **Error cases:**

- `APPLICATION_NOT_FOUND` (404)

#### `GET /api/v1/applications/:id/preview`

**Permission:** `admissions.view`
**Response:** Preview data for hover card

```typescript
{
  data: {
    primary_label: string,    // "Ahmed Al-Hassan"
    secondary_label: string,  // "APP-2026-000042"
    status: { label: string, variant: StatusVariant },
    facts: [
      { label: "Form", value: "2026-27 Admissions" },
      { label: "Submitted", value: "2 days ago" },
    ]
  }
}
```

#### `POST /api/v1/applications/:id/review`

**Permission:** `admissions.manage`
**Request schema:**

```typescript
const reviewApplicationSchema = z.object({
  status: z.enum(['under_review', 'pending_acceptance_approval', 'rejected']),
  expected_updated_at: z.string().datetime(),
});
```

**Response:** `{ data: Application }`
**Business logic — status transitions:**

1. `submitted -> under_review`: Simple status change, set reviewed_by_user_id and reviewed_at
2. `under_review -> pending_acceptance_approval`:
   - Check tenant_settings.admissions.requireApprovalForAcceptance
   - If true: call `ApprovalRequestsService.checkAndCreateIfNeeded(tenantId, 'application_accept', 'application', applicationId, requesterId, hasDirectAuthority)`
     - If approval needed: set status to `pending_acceptance_approval`, return approval_request_id
     - If auto-approved (no workflow or direct authority): set status to `accepted`
   - If false: set status to `accepted` directly
3. `under_review -> rejected`: Set status, reviewed_at, reviewed_by
4. `submitted -> rejected`: Also valid (direct rejection without review)

**Error cases:**

- `APPLICATION_NOT_FOUND` (404)
- `INVALID_STATUS_TRANSITION` (400) — e.g., draft -> rejected
- `CONCURRENT_MODIFICATION` (409)
- `NO_ELIGIBLE_APPROVER` (400) — approval workflow enabled but no approver role has members

#### `POST /api/v1/applications/:id/withdraw`

**Permission:** Authenticated parent (must be the submitting parent) OR `admissions.manage`
**Business logic:**

1. Application must be in `submitted`, `under_review`, or `pending_acceptance_approval` status
2. Set status to `withdrawn`
   **Error cases:**

- `APPLICATION_NOT_FOUND` (404)
- `INVALID_STATUS_TRANSITION` (400)
- `NOT_AUTHORIZED` (403) — parent trying to withdraw someone else's application

#### `GET /api/v1/applications/:id/conversion-preview`

**Permission:** `admissions.manage`
**Response:**

```typescript
{
  data: {
    application: Application,
    pre_populated: {
      student_first_name: string,
      student_last_name: string,
      date_of_birth: string | null,
      parent1_first_name: string | null, // extracted from payload or parent record
      parent1_last_name: string | null,
      parent1_email: string | null,
      parent2_first_name: string | null,
      parent2_last_name: string | null,
      parent2_email: string | null,
    },
    matching_parents: Array<{
      parent_id: string,
      name: string,
      email: string,
      household_name: string,
    }>,
    missing_required: string[], // fields that must be filled before conversion
    missing_recommended: string[], // fields that should be filled (warnings)
  }
}
```

**Business logic:**

1. Application must be in `accepted` status
2. Extract student name, DOB from application
3. Extract parent info from payload_json (look for fields with field_key matching common parent patterns) and from submitted_by_parent record
4. Search for existing parents by email match (if parent emails provided)
5. Return pre-populated data with match results and missing field indicators

#### `POST /api/v1/applications/:id/convert`

**Permission:** `admissions.manage`
**Request schema:**

```typescript
const convertApplicationSchema = z.object({
  student_first_name: z.string().min(1).max(100),
  student_last_name: z.string().min(1).max(100),
  date_of_birth: z.string().date(),
  year_group_id: z.string().uuid(),
  parent1_first_name: z.string().min(1).max(100),
  parent1_last_name: z.string().min(1).max(100),
  parent1_email: z.string().email().nullable().optional(),
  parent1_phone: z.string().max(50).nullable().optional(),
  parent1_link_existing_id: z.string().uuid().nullable().optional(), // link to existing parent
  parent2_first_name: z.string().max(100).nullable().optional(),
  parent2_last_name: z.string().max(100).nullable().optional(),
  parent2_email: z.string().email().nullable().optional(),
  parent2_link_existing_id: z.string().uuid().nullable().optional(),
  household_name: z.string().min(1).max(255).optional(), // defaults to "{last_name} Family"
  expected_updated_at: z.string().datetime(),
});
```

**Response:** `{ data: { student_id, household_id, parent_ids: string[] } }` (201)
**Business logic (single interactive transaction):**

1. Application must be in `accepted` status (reject if not)
2. Verify year_group_id exists in tenant
3. Create or link parent 1:
   - If `parent1_link_existing_id` provided: verify parent exists and is in same tenant, use it
   - Else: create new parent record. If no email provided, set `preferred_contact_channels: ['email']` (communication-restricted — no channels available)
4. Create or link parent 2 (if provided) — same logic
5. Create household:
   - `household_name` defaults to `"{student_last_name} Family"`
   - `needs_completion = true` (no emergency contacts yet)
   - `primary_billing_parent_id` = parent 1
6. Create `household_parents` junction(s)
7. Create student:
   - `status = 'active'`
   - `entry_date = today`
   - `household_id` = new household
   - `year_group_id` from request
8. Create `student_parents` junction(s)
9. If parent has user_id, create `tenant_membership` if not exists (for parent portal access)
10. Enqueue Meilisearch index jobs: student, household, parent(s)
11. Audit log with all created entity IDs
12. Return created IDs
    **Error cases:**

- `APPLICATION_NOT_FOUND` (404)
- `APPLICATION_NOT_ACCEPTED` (400) — not in `accepted` status
- `CONCURRENT_MODIFICATION` (409)
- `YEAR_GROUP_NOT_FOUND` (404)
- `PARENT_NOT_FOUND` (404) — link_existing_id references non-existent parent
- `MISSING_REQUIRED_FIELDS` (400) — required conversion fields missing

### 3.3 Application Notes Endpoints

#### `POST /api/v1/applications/:applicationId/notes`

**Permission:** `admissions.manage`
**Request schema:**

```typescript
const createApplicationNoteSchema = z.object({
  note: z.string().min(1).max(5000),
  is_internal: z.boolean().default(true),
});
```

**Response:** `{ data: ApplicationNote }` (201)
**Business logic:**

1. Verify application exists in tenant
2. Create note with author_user_id from authenticated user
   **Error cases:**

- `APPLICATION_NOT_FOUND` (404)

#### `GET /api/v1/applications/:applicationId/notes`

**Permission:** `admissions.view`
**Response:** `{ data: ApplicationNote[] }`
**Business logic:**

1. Return all notes for the application
2. If requester is a parent: filter to `is_internal = false` only
3. Include author name from users table join
4. Order by created_at desc

### 3.4 Analytics Endpoint

#### `GET /api/v1/admissions/analytics`

**Permission:** `admissions.view`
**Request schema:**

```typescript
const admissionsAnalyticsSchema = z.object({
  form_definition_id: z.string().uuid().optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
});
```

**Response:**

```typescript
{
  data: {
    funnel: {
      draft: number,
      submitted: number,
      under_review: number,
      pending_acceptance_approval: number,
      accepted: number,
      rejected: number,
      withdrawn: number,
    },
    conversion_rate: number, // accepted / (accepted + rejected) * 100
    avg_days_to_decision: number | null, // avg days from submitted_at to reviewed_at for decided apps
    total_applications: number,
    recent_submissions: number, // submitted in last 7 days
  }
}
```

### 3.5 Parent-Facing Application Endpoints

#### `GET /api/v1/parent/applications`

**Permission:** Authenticated parent
**Response:** `{ data: Application[] }` — applications submitted by this parent
**Business logic:**

1. Find parent record for authenticated user in tenant
2. Return applications where `submitted_by_parent_id = parent.id`
3. Include status, application_number, student name, submitted_at

#### `GET /api/v1/parent/applications/:id`

**Permission:** Authenticated parent (must be submitter)
**Response:** `{ data: Application }` with form and payload (parent-visible fields only)
**Business logic:**

1. Verify parent owns this application
2. Return application with non-internal notes only

---

## Section 4 — Service Layer

### 4.1 `AdmissionFormsService`

**Class:** `AdmissionFormsService`
**Module:** `admissions`
**File:** `apps/api/src/modules/admissions/admission-forms.service.ts`
**Dependencies:** `PrismaService`

**Public methods:**

| Method             | Signature                                                                                         | Responsibility                                            |
| ------------------ | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `create`           | `(tenantId: string, dto: CreateFormDefinitionDto) => Promise<FormDefinition>`                     | Create form + fields, validate uniqueness, warn about DOB |
| `findAll`          | `(tenantId: string, query: ListFormDefinitionsQuery) => Promise<PaginatedResult<FormDefinition>>` | List latest versions with filters, pagination             |
| `findOne`          | `(tenantId: string, id: string) => Promise<FormDefinition>`                                       | Get form with all fields                                  |
| `update`           | `(tenantId: string, id: string, dto: UpdateFormDefinitionDto) => Promise<FormDefinition>`         | Edit draft in-place or create new version from published  |
| `publish`          | `(tenantId: string, id: string) => Promise<FormDefinition>`                                       | Draft -> published, archive other published in lineage    |
| `archive`          | `(tenantId: string, id: string) => Promise<FormDefinition>`                                       | Set status to archived                                    |
| `getVersions`      | `(tenantId: string, id: string) => Promise<FormDefinition[]>`                                     | Get all versions of a form lineage                        |
| `getPublishedForm` | `(tenantId: string) => Promise<FormDefinition \| null>`                                           | Get the currently published form for public page          |

**Form versioning logic (in `update`):**

1. Find form by id
2. If `draft`: delete existing fields, re-create with new data, update form name/metadata
3. If `published`:
   a. Determine the root form id: if `base_form_id` is null, root = this form's id. Otherwise root = `base_form_id`.
   b. Find max version_number for this root
   c. Archive current form (set status `archived`)
   d. Create new form record with `base_form_id = root`, `version_number = max + 1`, `status = draft`
   e. Create new field records for new version
   f. Return new version
4. If `archived`: throw `FORM_ARCHIVED`

**Field validation logic (in `create` and `update`):**

1. Check all `field_key` values are unique within the form
2. For fields with `conditional_visibility_json`: verify `depends_on_field_key` matches another field_key in the same form
3. For `single_select` / `multi_select` fields: verify `options_json` is non-null and has at least one option
4. Check if any field has `field_key = 'date_of_birth'` AND `required = true`. If no such field, include warning in response.

### 4.2 `ApplicationsService`

**Class:** `ApplicationsService`
**Module:** `admissions`
**File:** `apps/api/src/modules/admissions/applications.service.ts`
**Dependencies:** `PrismaService`, `SequenceService`, `ApprovalRequestsService`, `SearchIndexService`, `RedisService`

**Public methods:**

| Method                 | Signature                                                                                                 | Responsibility                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `createPublic`         | `(tenantId: string, dto: CreatePublicApplicationDto, ip: string) => Promise<{id, application_number}>`    | Public submission: rate limit, honeypot, validate, generate number, create draft |
| `submit`               | `(tenantId: string, applicationId: string, userId: string) => Promise<Application>`                       | Link parent, check duplicates, set submitted                                     |
| `findAll`              | `(tenantId: string, query: ListApplicationsQuery) => Promise<PaginatedResult<Application>>`               | List with filters, search, pagination                                            |
| `findOne`              | `(tenantId: string, id: string) => Promise<Application>`                                                  | Get with form, fields, notes, duplicates                                         |
| `preview`              | `(tenantId: string, id: string) => Promise<PreviewData>`                                                  | Hover card preview data                                                          |
| `review`               | `(tenantId: string, id: string, dto: ReviewApplicationDto, userId: string) => Promise<Application>`       | Status transitions with approval integration                                     |
| `withdraw`             | `(tenantId: string, id: string, userId: string, isParent: boolean) => Promise<Application>`               | Withdraw application                                                             |
| `getConversionPreview` | `(tenantId: string, id: string) => Promise<ConversionPreview>`                                            | Pre-populate conversion screen                                                   |
| `convert`              | `(tenantId: string, id: string, dto: ConvertApplicationDto, userId: string) => Promise<ConversionResult>` | Full conversion transaction                                                      |
| `getAnalytics`         | `(tenantId: string, query: AnalyticsQuery) => Promise<AnalyticsResult>`                                   | Funnel analytics                                                                 |
| `findByParent`         | `(tenantId: string, parentId: string) => Promise<Application[]>`                                          | Parent's own applications                                                        |

**Duplicate detection logic (in `submit`):**

1. Query applications in same tenant where:
   - `student_first_name ILIKE dto.student_first_name`
   - `student_last_name ILIKE dto.student_last_name`
   - `date_of_birth = dto.date_of_birth` (if provided)
   - `id != current application id`
   - `status NOT IN ('draft', 'withdrawn')`
2. If matches found, flag but don't block. Include match info in response.

**Review status transition rules:**
| From | To | Condition |
|------|-----|-----------|
| `submitted` | `under_review` | Always allowed |
| `submitted` | `rejected` | Always allowed (direct rejection) |
| `under_review` | `pending_acceptance_approval` | Only if requireApprovalForAcceptance = true |
| `under_review` | `accepted` | If requireApprovalForAcceptance = false, OR if approval auto-approved |
| `under_review` | `rejected` | Always allowed |
| `pending_acceptance_approval` | `accepted` | Only via approval workflow execution callback |
| `pending_acceptance_approval` | `rejected` | Via approval rejection callback |
| Any active status | `withdrawn` | Allowed by parent or admin |

**Approval callback handling:**
When an approval request for `application_accept` is approved:

1. The approval module calls back (or the review endpoint checks approval status)
2. Application status transitions: `pending_acceptance_approval` -> `accepted`

**Conversion logic (in `convert` — single interactive transaction):**

1. Lock application row with `SELECT ... FOR UPDATE`
2. Verify status = `accepted`
3. Verify `expected_updated_at` matches (optimistic concurrency)
4. Verify year_group_id exists in tenant
5. Handle parent 1:
   - If `parent1_link_existing_id`: verify parent exists, use it
   - Else: create new parent record
6. Handle parent 2 (if provided): same logic
7. Create household with `needs_completion = true`
8. Create `household_parents` junctions
9. Create student with `status = 'active'`, `entry_date = today`
10. Create `student_parents` junctions
11. Enqueue search-index jobs for new entities
12. Return created entity IDs

### 4.3 `ApplicationNotesService`

**Class:** `ApplicationNotesService`
**Module:** `admissions`
**File:** `apps/api/src/modules/admissions/application-notes.service.ts`
**Dependencies:** `PrismaService`

**Public methods:**

| Method              | Signature                                                                                                   | Responsibility                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `create`            | `(tenantId: string, applicationId: string, userId: string, dto: CreateNoteDto) => Promise<ApplicationNote>` | Create note                     |
| `findByApplication` | `(tenantId: string, applicationId: string, includeInternal: boolean) => Promise<ApplicationNote[]>`         | List notes with internal filter |

### 4.4 `SequenceService`

**Class:** `SequenceService`
**Module:** `tenants` (extends existing module — reusable for invoices/receipts/payslips in later phases)
**File:** `apps/api/src/modules/tenants/sequence.service.ts`
**Dependencies:** `PrismaService`

**Public methods:**

| Method       | Signature                                                                                   | Responsibility                     |
| ------------ | ------------------------------------------------------------------------------------------- | ---------------------------------- |
| `nextNumber` | `(tenantId: string, sequenceType: string, tx?: PrismaTransactionClient) => Promise<string>` | Atomic sequence increment + format |

**Sequence generation logic:**

1. Within an interactive transaction (use provided `tx` or create new one):
   ```sql
   SELECT current_value FROM tenant_sequences
   WHERE tenant_id = :tenantId AND sequence_type = :sequenceType
   FOR UPDATE
   ```
2. Increment: `new_value = current_value + 1`
3. Update: `UPDATE tenant_sequences SET current_value = :new_value WHERE ...`
4. Format based on sequence type:
   - `application`: `APP-{YYYY}-{padded_to_6_digits}` (e.g., `APP-2026-000042`)
   - `receipt`: `{tenant_branding.receipt_prefix}-{YYYYMM}-{padded_to_6_digits}`
   - `invoice`: `{tenant_branding.invoice_prefix}-{YYYYMM}-{padded_to_6_digits}`
   - `payslip`: `{tenant_branding.payslip_prefix}-{YYYYMM}-{padded_to_6_digits}`
5. Return formatted string

**Note:** The application format uses `YYYY` not `YYYYMM` per the spec: `APP-{YYYY}-{padded_sequence}`.

### 4.5 `AdmissionsRateLimitService`

**Class:** `AdmissionsRateLimitService`
**Module:** `admissions`
**File:** `apps/api/src/modules/admissions/admissions-rate-limit.service.ts`
**Dependencies:** `RedisService`

**Public methods:**

| Method              | Signature                                                                            | Responsibility                      |
| ------------------- | ------------------------------------------------------------------------------------ | ----------------------------------- |
| `checkAndIncrement` | `(tenantId: string, ip: string) => Promise<{ allowed: boolean, remaining: number }>` | Check rate limit, increment counter |

**Logic:**

1. Key: `ratelimit:admissions:{tenantId}:{ip}`
2. `INCR` the key
3. If the result is 1 (first request), set `EXPIRE` to 3600 (1 hour)
4. If result > 3, return `{ allowed: false, remaining: 0 }`
5. Return `{ allowed: true, remaining: 3 - count }`

---

## Section 5 — Frontend Pages and Components

### 5.1 Form Builder Page — List

**File:** `apps/web/src/app/[locale]/(school)/admissions/forms/page.tsx`
**Route:** `/{locale}/admissions/forms`
**Type:** Server component
**Data fetching:** `GET /api/v1/admission-forms`
**Role visibility:** `admissions.view` permission
**Key UI elements:**

- Page header: "Admission Forms" with "Create Form" button (if `admissions.manage`)
- Table: form name, status badge (draft/published/archived), version number, field count, created date
- Status filter tabs: All | Draft | Published | Archived
- Row actions: Edit (draft), Create New Version (published), Archive, View
- Empty state: "No admission forms yet. Create your first form to start accepting applications."

### 5.2 Form Builder Page — Create/Edit

**File:** `apps/web/src/app/[locale]/(school)/admissions/forms/[id]/page.tsx` + `apps/web/src/app/[locale]/(school)/admissions/forms/new/page.tsx`
**Route:** `/{locale}/admissions/forms/new` and `/{locale}/admissions/forms/{id}`
**Type:** Client component (`'use client'`) — heavy interactivity
**Data fetching:** `GET /api/v1/admission-forms/:id` (for edit)
**Role visibility:** `admissions.manage`
**Key UI elements:**

- Form name input at top
- Field list — sortable via drag-and-drop (display_order)
- "Add Field" button at bottom of list
- Each field card shows: label, type badge, required indicator, drag handle
- Clicking a field card opens its configuration panel (side panel or inline expansion):
  - Label, help text
  - Field type selector
  - Required toggle
  - Visible to parent / visible to staff toggles
  - Searchable / reportable toggles
  - Options editor (for single_select / multi_select) — add/remove/reorder options
  - Conditional visibility: "Show this field when [field_key dropdown] equals [value input]"
  - Validation rules (min/max length, min/max value for number)
- Warning banner if no `date_of_birth` field is marked required
- Action buttons: Save Draft, Publish, Preview
- If editing a published form: info banner "Editing will create a new version. Existing applications remain on the current version."

### 5.3 Form Preview Page

**File:** `apps/web/src/app/[locale]/(school)/admissions/forms/[id]/preview/page.tsx`
**Route:** `/{locale}/admissions/forms/{id}/preview`
**Type:** Server component
**Key UI elements:**

- Renders the form exactly as parents would see it
- Read-only (no submission)
- Shows only parent-visible fields
- Conditional visibility fields show/hide based on form interactions
- Back button to return to form builder

### 5.4 Public Admissions Page

**File:** `apps/web/src/app/[locale]/(public)/admissions/page.tsx`
**Route:** `/{locale}/admissions`
**Type:** Client component (`'use client'`) — form interactivity, conditional visibility
**Data fetching:** `GET /api/v1/public/admissions/form`
**Role visibility:** Public (no authentication required)
**Key UI elements:**

- School branding header (logo + name from tenant_branding)
- Form title from form definition name
- Dynamic form rendering based on field definitions:
  - `short_text` → text input
  - `long_text` → textarea
  - `number` → number input
  - `date` → date picker
  - `boolean` → checkbox
  - `single_select` → select dropdown
  - `multi_select` → multi-select/checkbox group
  - `phone` → phone input with LTR enforcement
  - `email` → email input with LTR enforcement
  - `country` → country select dropdown
  - `yes_no` → radio group (Yes/No)
- Required field indicators (emerald asterisk)
- Help text below fields
- Conditional visibility: fields show/hide dynamically based on other field values
- Hidden honeypot field (`website_url`) — positioned offscreen with CSS
- Student name fields (first_name, last_name) and date_of_birth at the top (always present, not from form definition)
- Submit button → if not authenticated, redirect to login/register with return URL preserving form state
- After auth: submit application, show confirmation with application number
- Error handling: rate limit exceeded message, validation errors inline

### 5.5 Application List Page

**File:** `apps/web/src/app/[locale]/(school)/admissions/page.tsx`
**Route:** `/{locale}/admissions`
**Type:** Server component
**Data fetching:** `GET /api/v1/applications`
**Role visibility:** `admissions.view`
**Key UI elements:**

- Page header: "Admissions" with funnel summary metrics strip (total, submitted, under review, accepted, rejected)
- Tabs: All | Submitted | Under Review | Pending Approval | Accepted | Rejected | Withdrawn
- Table columns: application number, student name, form name, status badge, submitted date, actions
- Search bar for student name / application number
- Row click → navigate to application detail
- HoverPreviewCard on student names and application numbers
- Empty state per tab

### 5.6 Application Detail Page (Record Hub)

**File:** `apps/web/src/app/[locale]/(school)/admissions/[id]/page.tsx`
**Route:** `/{locale}/admissions/{id}`
**Type:** Client component (interactivity for status actions)
**Data fetching:** `GET /api/v1/applications/:id`
**Role visibility:** `admissions.view`
**Key UI elements (Record Hub pattern):**

- **Header:** Student name, application number (mono reference), status badge, action buttons
- **Actions** (based on current status):
  - Submitted: "Start Review" (→ under_review), "Reject"
  - Under Review: "Accept" (→ pending_acceptance_approval or accepted), "Reject"
  - Pending Approval: (read-only — waiting for approver)
  - Accepted: "Convert to Student" (→ conversion page)
- **Metrics strip:** Submitted date, days since submission, form version, duplicate warning badge
- **Tabs:**
  - **Application** — renders the submitted form data against the form definition fields
  - **Notes** — internal notes with add note form
  - **Timeline** — status change history (derived from audit log or application timestamps)
- Duplicate warning banner: if duplicates detected, show warning with links to matching applications

### 5.7 Conversion Page

**File:** `apps/web/src/app/[locale]/(school)/admissions/[id]/convert/page.tsx`
**Route:** `/{locale}/admissions/{id}/convert`
**Type:** Client component
**Data fetching:** `GET /api/v1/applications/:id/conversion-preview`
**Role visibility:** `admissions.manage`
**Key UI elements:**

- Page header: "Convert Application to Student — {student_name}"
- Pre-populated form with editable fields:
  - Student section: first name, last name, date of birth, year group (dropdown)
  - Parent 1 section: first name, last name, email, phone
    - If matching parents found: banner "A parent with this email already exists: {name} in {household}" with "Link to existing" button
  - Parent 2 section (optional): same as parent 1
  - Household section: household name (defaults to "{last_name} Family")
- Required field indicators and validation
- Warning banners for:
  - Missing recommended fields (parent emails)
  - `needs_completion` notice ("Emergency contacts will need to be added to the household")
- Review summary before submit (sensitive action pattern from UI brief)
- Submit button: "Convert to Student"
- Success: redirect to new student record with success toast

### 5.8 Admissions Analytics Page

**File:** `apps/web/src/app/[locale]/(school)/admissions/analytics/page.tsx`
**Route:** `/{locale}/admissions/analytics`
**Type:** Server component with client chart component
**Data fetching:** `GET /api/v1/admissions/analytics`
**Role visibility:** `admissions.view`
**Key UI elements:**

- Funnel visualization (Recharts): vertical funnel showing count at each stage
- Summary cards: total applications, conversion rate %, avg days to decision
- Date range filter
- Form definition filter (if multiple forms exist)

### 5.9 Parent Application Status Page

**File:** `apps/web/src/app/[locale]/(school)/applications/page.tsx`
**Route:** `/{locale}/applications` (parent-facing, within school shell)
**Type:** Server component
**Data fetching:** `GET /api/v1/parent/applications`
**Role visibility:** Parent role
**Key UI elements:**

- List of parent's own applications
- Status badges
- Click to view application detail (read-only, non-internal notes only)

---

## Section 6 — Background Jobs

### 6.1 Application Search Index Job

**Job name:** `search:index-application`
**Queue:** `search` (existing queue)
**Processor file:** Update existing `apps/worker/src/processors/search-index.processor.ts`
**Trigger:** Application submission (in `ApplicationsService.submit`) and conversion
**Payload:**

```typescript
{
  tenant_id: string,
  entity_type: 'applications',
  entity_id: string,
  action: 'upsert' | 'delete',
}
```

**Processing logic:**

1. Set RLS context for tenant
2. Fetch application data
3. Format as search document: `{ id, tenant_id, student_first_name, student_last_name, application_number, status }`
4. Upsert to Meilisearch index
   **Retry:** 3 attempts with exponential backoff

---

## Section 7 — Implementation Order

### Step 1: Database Migrations and Seed Data

1. Add three new enums to Prisma schema: `FormDefinitionStatus`, `ApplicationFieldType`, `ApplicationStatus`
2. Add four new tables to Prisma schema: `admission_form_definitions`, `admission_form_fields`, `applications`, `application_notes`
3. Generate Prisma migration: `npx prisma migrate dev --name add-admissions-tables`
4. Create `post_migrate.sql` with RLS policies for all four tables
5. Add `set_updated_at()` triggers for `admission_form_definitions` and `applications`
6. Run post-migrate script
7. Verify `application` sequence type is already seeded in `tenant_sequences` for existing tenants (it is — SEQUENCE_TYPES constant includes it)

### Step 2: Shared Types and Zod Schemas

1. Add JSONB schemas: `fieldOptionsSchema`, `validationRulesSchema`, `conditionalVisibilitySchema`
2. Add form definition schemas: `createFormDefinitionSchema`, `updateFormDefinitionSchema`, `listFormDefinitionsSchema`
3. Add application schemas: `createPublicApplicationSchema`, `submitApplicationSchema`, `reviewApplicationSchema`, `convertApplicationSchema`, `listApplicationsSchema`
4. Add note schemas: `createApplicationNoteSchema`
5. Add analytics schema: `admissionsAnalyticsSchema`
6. Export all types inferred from schemas

### Step 3: Backend Services (in dependency order)

1. `SequenceService` — reusable sequence number generator (in tenants module)
2. `AdmissionsRateLimitService` — Redis-based rate limiter
3. `AdmissionFormsService` — form CRUD, versioning, validation
4. `ApplicationNotesService` — note CRUD
5. `ApplicationsService` — full application lifecycle (depends on SequenceService, AdmissionFormsService, ApprovalRequestsService, SearchIndexService)

### Step 4: Backend Controllers

1. `AdmissionFormsController` — form management endpoints (authenticated, `admissions.manage`/`admissions.view`)
2. `PublicAdmissionsController` — public form + submission endpoints (no auth, rate limited)
3. `ApplicationsController` — application management endpoints (authenticated, `admissions.manage`/`admissions.view`)
4. `ParentApplicationsController` — parent-facing application endpoints (authenticated parent)
5. `AdmissionsAnalyticsController` — analytics endpoint

### Step 5: Background Job Updates

1. Add `applications` entity type to `SearchIndexService.formatDocument()`
2. Update search index worker to handle `applications` entity type

### Step 6: Frontend Pages and Components

1. Dynamic form renderer component (shared between form preview and public page)
2. Form builder page (list + create/edit + preview)
3. Public admissions page
4. Application list page
5. Application detail page (record hub)
6. Conversion page
7. Analytics page
8. Parent application status page
9. Update sidebar navigation to include Admissions section
10. Update admin dashboard to show admissions counts

---

## Section 8 — Files to Create

### Backend (apps/api/)

```
apps/api/src/modules/admissions/
├── admissions.module.ts
├── admission-forms.controller.ts
├── admission-forms.service.ts
├── applications.controller.ts
├── applications.service.ts
├── application-notes.service.ts
├── admissions-rate-limit.service.ts
├── public-admissions.controller.ts
├── parent-applications.controller.ts
├── admissions-analytics.controller.ts
└── dto/
    (Zod schemas live in packages/shared — DTOs imported from there)

apps/api/src/modules/tenants/
└── sequence.service.ts
```

### Shared schemas (packages/shared/)

```
packages/shared/src/schemas/
├── admission-form.schema.ts
├── application.schema.ts
└── admissions-analytics.schema.ts
```

### Database migration

```
packages/prisma/migrations/XXXXXXXXX_add-admissions-tables/
├── migration.sql          (Prisma-generated)
└── post_migrate.sql       (RLS policies + triggers)
```

### Frontend (apps/web/)

```
apps/web/src/app/[locale]/(school)/admissions/
├── page.tsx                        (application list)
├── analytics/
│   └── page.tsx                    (funnel analytics)
├── forms/
│   ├── page.tsx                    (form list)
│   ├── new/
│   │   └── page.tsx                (create form)
│   └── [id]/
│       ├── page.tsx                (edit form)
│       └── preview/
│           └── page.tsx            (form preview)
└── [id]/
    ├── page.tsx                    (application detail / record hub)
    └── convert/
        └── page.tsx                (conversion page)

apps/web/src/app/[locale]/(public)/admissions/
└── page.tsx                        (public application form)

apps/web/src/app/[locale]/(school)/applications/
└── page.tsx                        (parent-facing application list)

apps/web/src/components/admissions/
├── dynamic-form-renderer.tsx       (renders form from field definitions)
├── form-field-editor.tsx           (field configuration panel in builder)
├── form-field-card.tsx             (field card in builder list)
├── application-status-badge.tsx    (status-aware badge component)
├── duplicate-warning-banner.tsx    (duplicate detection UI)
├── conversion-form.tsx             (conversion page form)
└── admissions-funnel-chart.tsx     (Recharts funnel visualization)
```

### i18n

```
apps/web/messages/en.json   (add admissions keys)
apps/web/messages/ar.json   (add admissions keys)
```

---

## Section 9 — Files to Modify

### Prisma Schema

- **`packages/prisma/schema.prisma`** — Add 3 enums, 4 tables, all relations and indexes

### Backend Modules

- **`apps/api/src/app.module.ts`** — Import `AdmissionsModule`
- **`apps/api/src/modules/tenants/tenants.module.ts`** — Export `SequenceService`
- **`apps/api/src/modules/search/search-index.service.ts`** — Add `applications` case to `formatDocument()`
- **`apps/api/src/modules/dashboard/dashboard.service.ts`** — Add admissions counts (recent applications, pending review) to admin dashboard response

### Worker

- **`apps/worker/src/processors/search-index.processor.ts`** — Handle `applications` entity type

### Frontend

- **`apps/web/src/components/sidebar.tsx`** (or equivalent navigation component) — Add Admissions nav item under OPERATIONS section
- **`apps/web/messages/en.json`** — Add admissions translation keys
- **`apps/web/messages/ar.json`** — Add admissions Arabic translation keys

### Shared

- **`packages/shared/src/index.ts`** (or barrel export) — Export new schemas and types

---

## Section 10 — Key Context for Executor

### Pattern: RLS Client Usage

All tenant-scoped queries use `createRlsClient()` from `apps/api/src/modules/prisma/prisma.service.ts`. Pattern:

```typescript
const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
const result = await prismaWithRls.$transaction(async (tx) => {
  const db = tx as unknown as PrismaService;
  // ... queries using db
});
```

### Pattern: Controller Structure

Follow `apps/api/src/modules/staff-profiles/staff-profiles.controller.ts`:

- Class-level `@UseGuards(AuthGuard, PermissionGuard)`
- Method-level `@RequiresPermission('admissions.manage')`
- `@CurrentTenant()` for tenant context
- `ZodValidationPipe` for input validation

### Pattern: Pagination Response

Follow the standard response format from `households.service.ts`:

```typescript
return { data: items, meta: { page, pageSize, total } };
```

### Pattern: Public Endpoints

The `PublicAdmissionsController` should NOT have `@UseGuards(AuthGuard)` at the class level. Instead, it uses the tenant resolution middleware (which runs on all non-excluded routes) for tenant context. The controller path should be `v1/public/admissions` to clearly separate from authenticated routes.

The tenant resolution middleware runs on all routes except `/api/v1/admin`, `/api/v1/auth`, `/api/v1/invitations/accept`. Public admissions routes will pass through tenant resolution correctly.

### Pattern: Approval Integration

When moving application to acceptance:

```typescript
const result = await this.approvalRequestsService.checkAndCreateIfNeeded(
  tenantId,
  'application_accept', // matches ApprovalActionType.application_accept
  'application', // target entity type
  applicationId, // target entity id
  requesterId, // user making the request
  hasDirectAuthority, // true if user has school_owner role
);
if (result.approved) {
  // Set status to accepted directly
} else {
  // Set status to pending_acceptance_approval
  // Return approval_request_id to frontend
}
```

### Pattern: Sequence Number Generation (FOR UPDATE locking)

The `SequenceService` uses the same `SELECT ... FOR UPDATE` pattern established in `households.service.ts` for merge/split operations:

```typescript
const rawTx = tx as unknown as { $queryRaw: (sql: Prisma.Sql) => Promise<unknown> };
const [seq] = await rawTx.$queryRaw(
  Prisma.sql`SELECT current_value FROM tenant_sequences WHERE tenant_id = ${tenantId}::uuid AND sequence_type = ${sequenceType} FOR UPDATE`,
);
```

### Pattern: Meilisearch Index

Add `applications` to the `formatDocument` switch in `search-index.service.ts`:

```typescript
case 'applications':
  return {
    ...base,
    student_first_name: entity.student_first_name,
    student_last_name: entity.student_last_name,
    application_number: entity.application_number,
    status: entity.status,
  };
```

### Pattern: RecordHub Component

The application detail page uses the `RecordHub` component from `apps/web/src/components/record-hub.tsx`:

```tsx
<RecordHub
  title={`${application.student_first_name} ${application.student_last_name}`}
  subtitle={application.form_definition.name}
  status={{ label: statusLabel, variant: statusVariant }}
  reference={application.application_number}
  actions={<ActionButtons />}
  metrics={[
    { label: 'Submitted', value: formatDate(application.submitted_at) },
    { label: 'Days Pending', value: daysSinceSubmission },
  ]}
  tabs={[
    { key: 'application', label: 'Application', content: <ApplicationTab /> },
    { key: 'notes', label: 'Notes', content: <NotesTab /> },
    { key: 'timeline', label: 'Timeline', content: <TimelineTab /> },
  ]}
/>
```

### Pattern: HoverPreviewCard

Use on application list and anywhere application references appear:

```tsx
<HoverPreviewCard entityType="application" entityId={app.id}>
  <Link href={`/admissions/${app.id}`}>{app.application_number}</Link>
</HoverPreviewCard>
```

### Gotchas and Edge Cases

1. **Form versioning and published uniqueness**: When creating a new version from a published form, the old version must be archived BEFORE the new published version is created, otherwise the partial unique index on `(tenant_id, name) WHERE base_form_id IS NULL AND status != 'archived'` could conflict if the new version is published immediately. The flow is: edit published → creates new draft → admin publishes new draft → old published is archived atomically.

2. **Public endpoint RLS**: The public submission endpoint still needs RLS context. The tenant resolution middleware injects the tenant, and the RLS middleware sets `SET LOCAL`. The public controller gets tenant context from `@CurrentTenant()` decorator. No auth is needed, but tenant resolution is required.

3. **Application number generation must be inside the transaction**: The sequence increment and application creation must happen in the same interactive transaction to prevent number gaps on failed insertions.

4. **Conversion is a multi-entity transaction**: The conversion creates student, parent(s), household, and junction records all in one transaction. If any step fails, everything rolls back. The Meilisearch indexing is enqueued AFTER the transaction commits successfully (not inside the transaction).

5. **Parent linking during conversion**: When matching an existing parent by email, the parent may already belong to a different household. The conversion should NOT move the parent — it creates a new `household_parents` junction linking the existing parent to the new household as well. A parent can belong to multiple households.

6. **Draft application cleanup**: Draft applications created by the public endpoint but never submitted should be cleaned up. This is NOT in scope for P3 (can be a scheduled job in a later phase). For now, drafts persist indefinitely.

7. **RTL-safe form builder**: The form builder UI must use logical Tailwind utilities (ms-, me-, ps-, pe-, text-start, text-end). Drag-and-drop reordering must work in both LTR and RTL layouts. Use `start`/`end` instead of `left`/`right` for drag handle positioning.

8. **Rate limiting is per IP per tenant**: The key is `ratelimit:admissions:{tenant_id}:{ip}`. This means the same IP can submit 3 applications to Tenant A and 3 to Tenant B without hitting the limit. Redis TTL ensures automatic cleanup.

9. **Honeypot must not leak**: The honeypot field `website_url` should be rendered in the HTML but hidden with CSS (`position: absolute; left: -9999px` or similar). It must NOT use `display: none` or `visibility: hidden` as sophisticated bots check for these. The form submission should include this field, and the API should silently accept (return 201) but not create the record.

10. **No new permissions needed**: `admissions.manage` and `admissions.view` already exist in the seeded permissions. The `application_accept` approval action type already exists in the `ApprovalActionType` enum.

---

## Validation Checklist

- [x] Every table in the phase instruction file has a corresponding entry in Section 2 (`admission_form_definitions`, `admission_form_fields`, `applications`, `application_notes`)
- [x] Every functional requirement has at least one endpoint in Section 3:
  - 4.5.1 Configurable Form Builder → form CRUD endpoints
  - 4.5.2 Form Versioning → PUT endpoint versioning logic
  - 4.5.3 Public Admissions Page → public form + submission endpoints
  - 4.5.4 Application Review → review endpoint with status transitions
  - 4.5.5 Approval-Gated Acceptance → review endpoint with approval integration
  - 4.5.6 Application-to-Student Conversion → conversion-preview + convert endpoints
  - 4.5.7 Duplicate Application Detection → submit endpoint duplicate check
  - Admissions funnel analytics → analytics endpoint
- [x] Every endpoint has a service method in Section 4
- [x] Every service method is reachable from a controller or job processor
- [x] No tables, endpoints, or features are planned that aren't in the phase spec
- [x] Implementation order in Section 7 has no forward dependencies
