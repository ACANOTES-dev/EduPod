# SEN Sub-Plan 01 — Data Model Foundation

## Overview

Create all Prisma models, enums, RLS policies, shared types, Zod schemas, and state machine definitions for the SEN module. This phase produces no API endpoints — it establishes the data layer that all subsequent phases build on.

---

## Proposed Changes

### Prisma Schema

#### [MODIFY] [schema.prisma](file:///Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/packages/prisma/schema.prisma)

**New Enums (9):**

| Enum                  | Values                                                                                                                        | Notes                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `SenCategory`         | `learning`, `emotional_behavioural`, `physical`, `sensory`, `asd`, `speech_language`, `multiple`, `other`                     | Irish NCSE categories               |
| `SenSupportLevel`     | `school_support`, `school_support_plus`                                                                                       | Irish continuum of support          |
| `SupportPlanStatus`   | `draft`, `active`, `under_review`, `closed`, `archived`                                                                       | State machine — see below           |
| `SenGoalStatus`       | `not_started`, `in_progress`, `partially_achieved`, `achieved`, `discontinued`                                                | State machine — see below           |
| `SenProfessionalType` | `educational_psychologist`, `speech_therapist`, `occupational_therapist`, `camhs`, `physiotherapist`, `seno`, `neps`, `other` | External professionals              |
| `SenReferralStatus`   | `pending`, `scheduled`, `completed`, `report_received`                                                                        | Referral lifecycle                  |
| `AccommodationType`   | `exam`, `classroom`, `assistive_technology`                                                                                   | Accommodation classification        |
| `SnaAssignmentStatus` | `active`, `ended`                                                                                                             | SNA assignment lifecycle            |
| `SenResourceSource`   | `seno`, `school`                                                                                                              | Source of resource hours allocation |

**New Models (11):**

#### 1. `SenProfile`

```
id                       UUID       PK, gen_random_uuid()
tenant_id                UUID       NOT NULL, FK → tenants
student_id               UUID       NOT NULL, FK → students
sen_coordinator_user_id  UUID?      FK → users (assigned SEN coordinator)
sen_categories           JSONB      Array of SenCategory values
primary_category         SenCategory
support_level            SenSupportLevel
diagnosis                String?
diagnosis_date           DateTime?  @db.Date
diagnosis_source         String?
assessment_notes         String?
is_active                Boolean    DEFAULT true
flagged_date             DateTime?  @db.Date
unflagged_date           DateTime?  @db.Date
created_at               DateTime   DEFAULT now()
updated_at               DateTime   DEFAULT now() + trigger

@@unique([tenant_id, student_id])  // one profile per student per tenant
@@index([tenant_id, is_active])
@@index([tenant_id, primary_category])
@@index([tenant_id, support_level])
```

> **Decision applied**: Using `is_active: Boolean` instead of a `SenProfileStatus` enum. There are no intermediate states — a student either has an active SEN profile or doesn't.

#### 2. `SenSupportPlan`

```
id                    UUID       PK
tenant_id             UUID       NOT NULL, FK → tenants
sen_profile_id        UUID       NOT NULL, FK → sen_profiles
academic_year_id      UUID       NOT NULL, FK → academic_years
academic_period_id    UUID?      FK → academic_periods
plan_number           String     NOT NULL (SSP-YYYYMM-NNNNNN via SequenceService)
version               Int        DEFAULT 1
parent_version_id     UUID?      FK → sen_support_plans (self-reference for cloning)
status                SupportPlanStatus DEFAULT draft
review_date           DateTime?  @db.Date
next_review_date      DateTime?  @db.Date
reviewed_by_user_id   UUID?      FK → users
review_notes          String?
parent_input          String?    (parent-contributed text)
student_voice         String?
staff_notes           String?
created_by_user_id    UUID       NOT NULL, FK → users
created_at            DateTime   DEFAULT now()
updated_at            DateTime   DEFAULT now() + trigger

@@index([tenant_id, sen_profile_id])
@@index([tenant_id, status])
@@index([tenant_id, academic_year_id])
```

#### 3. `SenGoal`

```
id                UUID       PK
tenant_id         UUID       NOT NULL, FK → tenants
support_plan_id   UUID       NOT NULL, FK → sen_support_plans
title             String     NOT NULL
description       String?
target            String     NOT NULL (SMART target — what the student should achieve)
baseline          String     NOT NULL (where the student is now)
current_level     String?    (freeform current progress description)
target_date       DateTime   NOT NULL @db.Date
status            SenGoalStatus DEFAULT not_started
display_order     SmallInt   NOT NULL DEFAULT 0
created_at        DateTime   DEFAULT now()
updated_at        DateTime   DEFAULT now() + trigger

@@index([tenant_id, support_plan_id])
```

> **Decision applied**: `current_level` is `String` (freeform text, e.g., "Can read 3-letter CVC words independently"), not numeric.

#### 4. `SenGoalStrategy`

```
id                    UUID       PK
tenant_id             UUID       NOT NULL, FK → tenants
goal_id               UUID       NOT NULL, FK → sen_goals
description           String     NOT NULL
responsible_user_id   UUID?      FK → users
frequency             String?
is_active             Boolean    DEFAULT true
created_at            DateTime   DEFAULT now()
updated_at            DateTime   DEFAULT now() + trigger

@@index([tenant_id, goal_id])
```

#### 5. `SenGoalProgress` (append-only — no `updated_at`)

```
id                    UUID       PK
tenant_id             UUID       NOT NULL, FK → tenants
goal_id               UUID       NOT NULL, FK → sen_goals
note                  String     NOT NULL
current_level         String?
recorded_by_user_id   UUID       NOT NULL, FK → users
created_at            DateTime   DEFAULT now()

@@index([tenant_id, goal_id])
```

#### 6. `SenResourceAllocation`

```
id                UUID       PK
tenant_id         UUID       NOT NULL, FK → tenants
academic_year_id  UUID       NOT NULL, FK → academic_years
total_hours       Decimal    NOT NULL @db.Decimal(8, 2)
source            SenResourceSource NOT NULL
notes             String?
created_at        DateTime   DEFAULT now()
updated_at        DateTime   DEFAULT now() + trigger

@@unique([tenant_id, academic_year_id, source])
@@index([tenant_id, academic_year_id])
```

> **Decision applied**: `source` uses a proper `SenResourceSource` enum instead of inline string values.

#### 7. `SenStudentHours`

```
id                       UUID       PK
tenant_id                UUID       NOT NULL, FK → tenants
resource_allocation_id   UUID       NOT NULL, FK → sen_resource_allocations
student_id               UUID       NOT NULL, FK → students
sen_profile_id           UUID       NOT NULL, FK → sen_profiles
allocated_hours          Decimal    NOT NULL @db.Decimal(6, 2)
used_hours               Decimal    NOT NULL DEFAULT 0 @db.Decimal(6, 2)
notes                    String?
created_at               DateTime   DEFAULT now()
updated_at               DateTime   DEFAULT now() + trigger

@@unique([tenant_id, resource_allocation_id, student_id])
@@index([tenant_id, sen_profile_id])
```

#### 8. `SenSnaAssignment`

```
id                     UUID       PK
tenant_id              UUID       NOT NULL, FK → tenants
sna_staff_profile_id   UUID       NOT NULL, FK → staff_profiles
student_id             UUID       NOT NULL, FK → students
sen_profile_id         UUID       NOT NULL, FK → sen_profiles
schedule               JSONB      NOT NULL (weekly schedule)
status                 SnaAssignmentStatus DEFAULT active
start_date             DateTime   NOT NULL @db.Date
end_date               DateTime?  @db.Date
notes                  String?
created_at             DateTime   DEFAULT now()
updated_at             DateTime   DEFAULT now() + trigger

@@index([tenant_id, status])
@@index([tenant_id, sna_staff_profile_id])
@@index([tenant_id, student_id])
```

#### 9. `SenProfessionalInvolvement`

```
id                     UUID       PK
tenant_id              UUID       NOT NULL, FK → tenants
sen_profile_id         UUID       NOT NULL, FK → sen_profiles
professional_type      SenProfessionalType NOT NULL
professional_name      String?
organisation           String?
referral_date          DateTime?  @db.Date
assessment_date        DateTime?  @db.Date
report_received_date   DateTime?  @db.Date
recommendations        String?
status                 SenReferralStatus DEFAULT pending
pastoral_referral_id   UUID?      FK → pastoral_referrals (nullable integration link)
notes                  String?
created_at             DateTime   DEFAULT now()
updated_at             DateTime   DEFAULT now() + trigger

@@index([tenant_id, sen_profile_id])
@@index([tenant_id, status])
```

#### 10. `SenAccommodation`

```
id                     UUID       PK
tenant_id              UUID       NOT NULL, FK → tenants
sen_profile_id         UUID       NOT NULL, FK → sen_profiles
accommodation_type     AccommodationType NOT NULL
description            String     NOT NULL
details                JSONB      DEFAULT '{}' (flexible per type)
start_date             DateTime?  @db.Date
end_date               DateTime?  @db.Date
is_active              Boolean    DEFAULT true
approved_by_user_id    UUID?      FK → users
approved_at            DateTime?
created_at             DateTime   DEFAULT now()
updated_at             DateTime   DEFAULT now() + trigger

@@index([tenant_id, sen_profile_id])
@@index([tenant_id, accommodation_type])
```

#### 11. `SenTransitionNote`

```
id                     UUID       PK
tenant_id              UUID       NOT NULL, FK → tenants
sen_profile_id         UUID       NOT NULL, FK → sen_profiles
note_type              String     NOT NULL (e.g. 'class_to_class', 'school_to_school', 'year_to_year')
content                String     NOT NULL
created_by_user_id     UUID       NOT NULL, FK → users
created_at             DateTime   DEFAULT now()

@@index([tenant_id, sen_profile_id])
```

> **Decision applied**: Transition notes use a dedicated table instead of JSONB on `SenProfile`. This supports the endpoint design (individual CRUD) and is cleaner for querying/reporting.

**Student model change:** Add `sen_profile SenProfile?` relation to the existing `Student` model (one-to-one optional).

---

### Migration

#### [NEW] `packages/prisma/migrations/YYYYMMDDHHMMSS_add_sen_tables/`

- `migration.sql` — DDL for all 11 tables + 9 enums + indexes + FKs
- `post_migrate.sql` — RLS policies for all 11 tables:

```sql
-- Example for each table (all follow this pattern):
ALTER TABLE sen_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sen_profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sen_profiles_tenant_isolation ON sen_profiles;
CREATE POLICY sen_profiles_tenant_isolation ON sen_profiles
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Repeat for: sen_support_plans, sen_goals, sen_goal_strategies,
-- sen_goal_progress, sen_resource_allocations, sen_student_hours,
-- sen_sna_assignments, sen_professional_involvements, sen_accommodations,
-- sen_transition_notes
```

Note: `sen_professional_involvements.pastoral_referral_id` FK must be nullable. The `pastoral_referrals` table already exists in the DB, so the FK constraint will work. No data dependency — null is the default.

---

### Shared Types & Schemas

#### [NEW] `packages/shared/src/sen/`

```
packages/shared/src/sen/
├── enums.ts
├── state-machine.ts
├── schemas/
│   ├── sen-profile.schema.ts
│   ├── support-plan.schema.ts
│   ├── sen-goal.schema.ts
│   ├── resource-allocation.schema.ts
│   ├── professional-involvement.schema.ts
│   ├── accommodation.schema.ts
│   ├── sna-assignment.schema.ts
│   └── transition-note.schema.ts
└── index.ts
```

**`enums.ts`** — Re-export all SEN-specific enum values as TypeScript const objects (matching existing pattern in `packages/shared/src/constants/`).

**`state-machine.ts`** — State transition maps + `isValidTransition()` helpers:

```typescript
// ─── Support Plan Status transitions ──────────────────────────────────────────
export const SUPPORT_PLAN_TRANSITIONS: Record<string, string[]> = {
  draft: ['active'],
  active: ['under_review', 'closed'],
  under_review: ['active', 'closed'],
  closed: ['archived'],
  // archived: terminal
};

// ─── Goal Status transitions ─────────────────────────────────────────────────
export const GOAL_STATUS_TRANSITIONS: Record<string, string[]> = {
  not_started: ['in_progress'],
  in_progress: ['partially_achieved', 'achieved', 'discontinued'],
  partially_achieved: ['in_progress', 'achieved', 'discontinued'],
  // achieved: terminal
  // discontinued: terminal
};
```

**Zod schemas** — Follow existing pattern: `create*Schema`, `update*Schema` with `.optional()` fields, `list*QuerySchema` for filters.

---

### Tenant Settings Extension

#### [MODIFY] [tenant.schema.ts](file:///Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/packages/shared/src/schemas/tenant.schema.ts)

Add `sen` section to `tenantSettingsSchema`:

```typescript
sen: z
  .object({
    module_enabled: z.boolean().default(false),
    default_review_cycle_weeks: z.number().int().min(1).default(12),
    auto_flag_on_referral: z.boolean().default(true),
    sna_schedule_format: z.enum(['weekly', 'daily']).default('weekly'),
    enable_parent_portal_access: z.boolean().default(true),
    plan_number_prefix: z.string().default('SSP'),
  })
  .default({}),
```

---

### Permission Seeds

#### [MODIFY] `packages/prisma/seed/permissions.ts`

Add 5 new permissions:

| Permission             | Tier  | Description                                         |
| ---------------------- | ----- | --------------------------------------------------- |
| `sen.view`             | staff | View SEN profiles and support plans within scope    |
| `sen.manage`           | staff | Create/update SEN profiles, support plans, goals    |
| `sen.manage_resources` | admin | Manage SENO resource allocation and SNA assignments |
| `sen.view_sensitive`   | staff | View diagnosis details and professional reports     |
| `sen.admin`            | admin | Full SEN module administration                      |

---

### Sequence Type Registration

Register `sen_support_plan` as a new sequence type in SequenceService for plan number generation (`SSP-YYYYMM-NNNNNN`, where prefix is configurable via tenant settings).

---

## Verification

```bash
# Generate migration
cd packages/prisma && npx prisma migrate dev --name add_sen_tables

# Run post-migrate SQL
npx ts-node scripts/post-migrate.ts

# Verify schema compiles
npx turbo type-check

# Verify no lint errors
npx turbo lint

# Verify shared package exports
cd packages/shared && npx tsc --noEmit
```

---

## Architecture Updates

After implementation, update:

- `architecture/state-machines.md` — Add SupportPlanStatus and SenGoalStatus machines
- `architecture/feature-map.md` — Add SEN Module section (placeholder, endpoints added in later phases)
