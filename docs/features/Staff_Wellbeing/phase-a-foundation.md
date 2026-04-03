# Phase A: Foundation & Shared Infrastructure

**Module:** Staff Wellbeing & Workload Intelligence
**Master Spec:** `Next_Feature/Staff_Wellbeing/staff-wellbeing-spec-v1-master.md`
**Identity:** The skeleton everything hangs on. No business logic.
**Dependencies:** None (greenfield)
**Blocks:** All subsequent phases

---

## Prerequisites

- Read master spec Sections 3 (Non-Negotiable Rules), 6 (Data Model), 11 (Module Registration), 12 (Prerequisites)
- Read `architecture/pre-flight-checklist.md`
- Read `architecture/danger-zones.md` (will be updated)
- Read `architecture/module-blast-radius.md` (will be updated)

---

## Deliverables

### A1. `@BlockImpersonation()` Guard — Shared Infrastructure

**Location:** `apps/api/src/common/guards/block-impersonation.guard.ts` + `apps/api/src/common/decorators/block-impersonation.decorator.ts`

This is NOT a wellbeing-specific component. It is shared infrastructure that any privacy-sensitive module can reuse.

**Behaviour:**

- Reads `req.user.isImpersonating`
- If `true`, return 403 with body: `{ error: { code: 'IMPERSONATION_BLOCKED', message: 'This endpoint cannot be accessed during impersonation.' } }`
- If `false` or absent, proceed normally
- Implemented as a NestJS guard with a companion `@BlockImpersonation()` decorator for clean controller usage

**Test:**

- Unit test: verify 403 when `isImpersonating = true`
- Unit test: verify pass-through when `isImpersonating = false`
- Unit test: verify pass-through when `isImpersonating` is absent

### A2. Database Migration

**Migration name:** `add-staff-wellbeing-tables`

Create 4 tables exactly as specified in master spec Section 6.1:

#### `staff_surveys`

```sql
id                      UUID PK DEFAULT gen_random_uuid()
tenant_id               UUID NOT NULL FK -> tenants(id)
title                   VARCHAR(255) NOT NULL
description             TEXT
status                  VARCHAR(20) NOT NULL DEFAULT 'draft'
                        -- draft | active | closed | archived
frequency               VARCHAR(20) NOT NULL DEFAULT 'fortnightly'
                        -- weekly | fortnightly | monthly | ad_hoc
window_opens_at         TIMESTAMPTZ NOT NULL
window_closes_at        TIMESTAMPTZ NOT NULL
results_released        BOOLEAN NOT NULL DEFAULT FALSE
min_response_threshold  INT NOT NULL DEFAULT 5
dept_drill_down_threshold INT NOT NULL DEFAULT 10
moderation_enabled      BOOLEAN NOT NULL DEFAULT TRUE
created_by              UUID NOT NULL FK -> users(id)
created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()

CONSTRAINT chk_threshold_floor CHECK (dept_drill_down_threshold >= 8)
CONSTRAINT chk_min_threshold_floor CHECK (min_response_threshold >= 3)
CONSTRAINT chk_window CHECK (window_closes_at > window_opens_at)

INDEX: idx_staff_surveys_tenant_status (tenant_id, status)
RLS: tenant_id = current_setting('app.current_tenant_id')
```

#### `survey_questions`

```sql
id                  UUID PK DEFAULT gen_random_uuid()
tenant_id           UUID NOT NULL FK -> tenants(id)
survey_id           UUID NOT NULL FK -> staff_surveys(id) ON DELETE CASCADE
question_text       TEXT NOT NULL
question_type       VARCHAR(20) NOT NULL
                    -- likert_5 | single_choice | freeform
display_order       INT NOT NULL
options             JSONB           -- for single_choice: ["option1", "option2", ...]
is_required         BOOLEAN NOT NULL DEFAULT TRUE
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()

INDEX: idx_survey_questions_survey (survey_id, display_order)
RLS: tenant_id = current_setting('app.current_tenant_id')
```

#### `survey_responses` — CRITICAL ANONYMITY TABLE

```sql
id                  UUID PK DEFAULT gen_random_uuid()
survey_id           UUID NOT NULL FK -> staff_surveys(id) ON DELETE CASCADE
question_id         UUID NOT NULL FK -> survey_questions(id) ON DELETE CASCADE
answer_value        INT             -- for likert/single_choice
answer_text         TEXT            -- for freeform
submitted_date      DATE NOT NULL   -- DATE ONLY, no timestamp
moderation_status   VARCHAR(20) DEFAULT 'pending'
                    -- pending | approved | flagged | redacted
                    -- only applies to freeform; likert/choice auto-approved

INDEX: idx_survey_responses_survey (survey_id)
INDEX: idx_survey_responses_question (question_id)
```

**ARCHITECTURAL EXCEPTION:** This table intentionally has:

- NO `tenant_id` column
- NO `user_id` / `staff_profile_id` column
- NO `session_id` / `ip_address` column
- NO `created_at` TIMESTAMPTZ (only `submitted_date DATE`)
- NO RLS policy
- NO foreign key to any user-related table

Tenant isolation is enforced at the application layer via mandatory join through `staff_surveys.tenant_id`. This MUST be documented in `architecture/danger-zones.md`.

#### `survey_participation_tokens`

```sql
survey_id           UUID NOT NULL FK -> staff_surveys(id)
token_hash          VARCHAR(128) NOT NULL
created_date        DATE NOT NULL

PK (survey_id, token_hash)
```

Tokens are auto-deleted 7 days after the parent survey closes (Phase B cron job).

### A3. NestJS Module Skeleton

**Location:** `apps/api/src/modules/staff-wellbeing/`

```
staff-wellbeing/
├── staff-wellbeing.module.ts
├── controllers/           # empty, populated in B/C/D
├── services/              # empty, populated in B/C/D
├── dto/                   # imports from @school/shared
└── guards/                # module-level guard setup
```

- Module decorated with `@BlockImpersonation()` on all controllers (applied at module level or per-controller)
- Module decorated with `@ModuleEnabled('staff_wellbeing')` guard
- Import `PrismaModule`, `RedisModule`, `AuthModule` as baseline dependencies

### A4. Per-Tenant HMAC Secret Infrastructure

**What:** Each tenant needs an independent HMAC secret for survey participation token computation.

**Storage:** Encrypted field in tenant configuration, using the same AES-256 mechanism as Stripe keys and bank details (existing `EncryptionService`).

**Generation:** `crypto.randomBytes(32).toString('hex')` — auto-generated on first survey creation if not present.

**Implementation:**

- Add `hmac_secret` encrypted field to tenant wellbeing configuration
- Service method: `getOrCreateHmacSecret(tenantId)` — reads from config, generates if absent, encrypts and stores
- Secret is decrypted only in-memory during participation token computation
- Never logged, never returned in API responses

### A5. Module Registry Seed

Add to `packages/prisma/seed/`:

```typescript
{
  key: 'staff_wellbeing',
  name: 'Staff Wellbeing & Workload Intelligence',
  description: 'Aggregate workload dashboards, anonymous pulse surveys, cover fairness, EAP resources',
  is_enabled: false, // tenant activates when ready
}
```

### A6. Permission Seeds

Register all 7 permissions with default role assignments:

| Permission Key                  | Default Roles                             |
| ------------------------------- | ----------------------------------------- |
| `wellbeing.view_own_workload`   | All staff roles                           |
| `wellbeing.view_aggregate`      | principal, deputy_principal               |
| `wellbeing.manage_surveys`      | principal, deputy_principal               |
| `wellbeing.view_survey_results` | principal, deputy_principal               |
| `wellbeing.moderate_surveys`    | principal, deputy_principal               |
| `wellbeing.view_board_report`   | principal, deputy_principal, board_member |
| `wellbeing.manage_resources`    | principal, deputy_principal               |

### A7. Tenant Settings JSONB Schema

Add `staff_wellbeing` key to tenant settings Zod definition in `packages/shared`:

```typescript
staffWellbeing: z.object({
  enabled: z.boolean().default(true),
  survey_default_frequency: z
    .enum(['weekly', 'fortnightly', 'monthly', 'ad_hoc'])
    .default('fortnightly'),
  survey_min_response_threshold: z.number().int().min(3).default(5),
  survey_dept_drill_down_threshold: z.number().int().min(8).default(10),
  survey_moderation_enabled: z.boolean().default(true),
  workload_high_threshold_periods: z.number().int().default(22),
  workload_high_threshold_covers: z.number().int().default(8),
  eap_provider_name: z.string().default(''),
  eap_phone: z.string().default(''),
  eap_website: z.string().default(''),
  eap_hours: z.string().default(''),
  eap_management_body: z.string().default(''),
  eap_last_verified_date: z.string().nullable().default(null),
  external_resources: z
    .array(
      z.object({
        name: z.string(),
        phone: z.string().optional(),
        website: z.string().optional(),
      }),
    )
    .default([]),
}).default({});
```

All keys use `.default()` — no backfill migration needed.

### A8. Zod DTO Schemas

Define all V1 DTOs in `packages/shared/src/staff-wellbeing/`:

- `createSurveySchema` — title, description, frequency, window dates, questions array, threshold overrides
- `updateSurveySchema` — partial of create (draft only)
- `submitSurveyResponseSchema` — array of `{ questionId, answerValue?, answerText? }`
- `moderateResponseSchema` — `{ status: 'approved' | 'flagged' | 'redacted', reason?: string }`
- `surveyResultsQuerySchema` — optional department filter
- Survey status enum: `draft | active | closed | archived`
- Question type enum: `likert_5 | single_choice | freeform`
- Moderation status enum: `pending | approved | flagged | redacted`
- Suggestion category enum (V2 prep): `workload | facilities | policy | professional_development | wellbeing | communication | other`

### A9. Architecture Documentation Updates

**`architecture/module-blast-radius.md`:**

- Add `StaffWellbeingModule`
- Exports: none (no other module depends on it)
- Reads from: `SchedulingModule` (Schedule, SchedulePeriodTemplate), `SubstitutionModule` (SubstitutionRecord), `StaffProfilesModule` (staff_profiles), `PayrollModule` (compensation_records — V2 reports)
- Note: read-only dependencies only, no writes to other modules

**`architecture/danger-zones.md`:**

- Add `survey_responses` tenant isolation exception
- Document: NO tenant_id, NO RLS, access ONLY through survey join via `StaffWellbeingSurveyService`
- Mark as CRITICAL
- Cross-reference: integration tests in Phase G verify no cross-tenant path exists

---

## Verification Checklist

- [ ] `@BlockImpersonation()` guard works (unit tests pass)
- [ ] Migration applies cleanly (`npx prisma migrate dev`)
- [ ] `survey_responses` table has NO `tenant_id` column (verified in schema)
- [ ] `staff_surveys` and `survey_questions` have RLS policies
- [ ] `survey_participation_tokens` has correct composite PK
- [ ] CHECK constraints on thresholds are enforced (dept >= 8, min >= 3, window valid)
- [ ] Module skeleton loads without errors
- [ ] HMAC secret generation + encryption round-trips correctly
- [ ] Module seed entry exists (disabled by default)
- [ ] All 7 permissions seeded with correct role assignments
- [ ] Tenant settings schema validates with defaults
- [ ] All Zod DTOs compile and validate correctly
- [ ] Architecture docs updated
- [ ] `turbo lint` passes
- [ ] `turbo type-check` passes
