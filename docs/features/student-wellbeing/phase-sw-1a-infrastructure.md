---
name: 'SW-1A: Infrastructure & Foundation'
description: 'Global app.current_user_id, all pastoral tables, RLS policies with tiered CP access, immutability triggers, permissions, Zod schemas, NestJS module scaffolding, worker scaffolding, tenant sequences'
phase: 'SW-1A'
parent_phase: 'SW-1 (Credible Core)'
dependencies:
  - Behaviour management phases A-H (complete)
  - Existing RLS middleware (apps/api/src/common/middleware/rls.middleware.ts)
  - Existing TenantAwareJob base class (apps/worker/src/base/tenant-aware-job.ts)
  - Existing permissions seed (packages/prisma/seed/permissions.ts)
  - Existing tenant_sequences infrastructure
status: not_started
---

# SW-1A: Infrastructure & Foundation

## What this sub-phase delivers

Everything that must exist before any pastoral care feature code is written:

1. **Global `app.current_user_id`** set in every transaction (API and worker) -- the backbone for CP RLS policies
2. **All 20 Prisma models** for the pastoral care data layer (pastoral_concerns through critical_incident_affected)
3. **post_migrate.sql** with standard RLS, tiered RLS, CP-specific RLS, immutability triggers, tier enforcement triggers, auto-escalation triggers, and updated_at triggers
4. **All pastoral permissions** seeded into the RBAC system with default role assignments
5. **Shared Zod schemas** for every DTO, event payload, and tenant settings block
6. **NestJS module scaffolding** -- five empty modules wired into app.module.ts so the app compiles
7. **Worker scaffolding** -- pastoral queue registered, empty processor stubs
8. **Tenant sequence** -- `pastoral_case` sequence type registered

After this sub-phase, the application compiles, all tests pass, the database has all pastoral tables with full RLS enforcement, and implementers can begin building feature logic in SW-1B.

---

## Prerequisites

- Main branch is green (all existing tests pass)
- Behaviour management phases A-H are complete and merged
- Access to `packages/prisma/schema.prisma` for schema additions
- No other schema migrations in flight (avoid merge conflicts on schema.prisma)

---

## 1. Global `app.current_user_id` implementation

### 1.1 Modify RLS middleware

**File:** `apps/api/src/common/middleware/rls.middleware.ts`

**Current signature:**

```typescript
export function createRlsClient(prisma: PrismaClient, tenant: { tenant_id: string });
```

**Required change:** Expand the context parameter to accept `user_id` alongside `tenant_id`. The `user_id` value comes from `request.currentUser.sub` (see `JwtPayload` in `packages/shared/src/types/auth.ts`).

**New signature:**

```typescript
export function createRlsClient(
  prisma: PrismaClient,
  context: { tenant_id: string; user_id: string },
);
```

**Implementation requirements:**

- Add a second `set_config` call inside the `$transaction` wrapper, immediately after the tenant_id one:
  ```sql
  SELECT set_config('app.current_user_id', $1::text, true)
  ```
- Use the same parameterised `set_config()` pattern as the existing tenant_id call (never string interpolation)
- Validate `user_id` format with the same `UUID_RE` regex that validates `tenant_id`. Throw with `Invalid user_id format` if it fails.
- The existing `$allOperations` passthrough remains unchanged

**Callers that must be updated:**

Every service that calls `createRlsClient(this.prisma, { tenant_id: ... })` must now pass `user_id` as well. The implementer must search the codebase for all call sites:

```
grep -rn "createRlsClient" apps/api/src/
```

Each call site currently passes `{ tenant_id: tenantId }` and must be changed to `{ tenant_id: tenantId, user_id: userId }`. The `userId` is available via:

- Controllers: `request.currentUser.sub` (from JWT)
- Services: passed down from the controller as a parameter

**Important:** Many existing services do NOT call `createRlsClient` directly -- they use the Prisma middleware pipeline which sets RLS context automatically. Only services that create their own RLS client (e.g., report services, compliance services) need updating. The implementer must audit every call site.

**Regression strategy:**

- Run `turbo test` after the change -- no existing module uses `app.current_user_id`, so the addition of a second `SET LOCAL` call is purely additive
- Verify that the extra `set_config` call does not break existing transaction patterns by running the full API test suite
- Specifically verify that PgBouncer transaction mode affinity is maintained (both `SET LOCAL` calls are within the same interactive transaction)

### 1.2 Modify TenantAwareJob base class

**File:** `apps/worker/src/base/tenant-aware-job.ts`

**Current `TenantJobPayload`:**

```typescript
export interface TenantJobPayload {
  tenant_id: string;
  [key: string]: unknown;
}
```

**Required change:** Add optional `user_id` to the payload. System jobs (cron, background processors) will not have a user_id and must use the sentinel value.

**New interface:**

```typescript
export interface TenantJobPayload {
  tenant_id: string;
  user_id?: string;
  [key: string]: unknown;
}
```

**Sentinel value:** `00000000-0000-0000-0000-000000000000`

This UUID is used for system-initiated operations where no human user is acting. The sentinel value will never match any `cp_access_grants` row, ensuring system jobs cannot accidentally access CP records through RLS. Define this as a named constant:

```typescript
export const SYSTEM_USER_SENTINEL = '00000000-0000-0000-0000-000000000000';
```

**Implementation in `execute()` method:**

After the existing `set_config('app.current_tenant_id', ...)` call, add:

```typescript
const userId = data.user_id || SYSTEM_USER_SENTINEL;
await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}::text, true)`;
```

Validate `userId` format with the same `UUID_RE` regex if `data.user_id` is provided.

**Regression:** Run worker test suite. Existing jobs do not provide `user_id`, so they will use the sentinel. No behaviour change for existing jobs.

### 1.3 Export the sentinel constant from shared

**File:** `packages/shared/src/constants/system.ts` (create if it does not exist)

Export `SYSTEM_USER_SENTINEL` from the shared package so both the API and worker can import it. Check whether a `constants/` directory already exists in `packages/shared/src/` -- if so, follow the existing pattern; if not, create it.

---

## 2. Prisma schema -- all pastoral tables

**File:** `packages/prisma/schema.prisma`

**Migration name:** `add_pastoral_care_tables`

All 20 models defined below follow existing EduPod conventions:

- UUID PK: `@id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`
- `tenant_id`: `String @db.Uuid` with FK to `tenants(id)`, `onDelete: Cascade`
- `created_at`: `DateTime @default(now()) @db.Timestamptz()`
- `updated_at`: `DateTime @updatedAt @default(now()) @db.Timestamptz()` (omitted on append-only tables)
- Table name mapping via `@@map("snake_case_plural")`
- All FK user references point to `users(id)` (the platform-level users table, not tenant-scoped)
- All FK student references point to `students(id)`

### 2.1 Enums to add

Add these enums to the Prisma schema (place them in the enums section, following the existing grouping pattern):

```
// ─── Pastoral Care Enums ───────────────────────────────────────────────────

PastoralConcernSeverity: routine, elevated, urgent, critical
PastoralCaseStatus: open, active, monitoring, resolved, closed
PastoralInterventionStatus: active, achieved, partially_achieved, not_achieved, escalated, withdrawn
PastoralActionStatus: pending, in_progress, completed, overdue, cancelled
PastoralReferralStatus: draft, submitted, acknowledged, assessment_scheduled, assessment_complete, report_received, recommendations_implemented
PastoralReferralRecommendationStatus: pending, in_progress, implemented, not_applicable
SstMeetingStatus: scheduled, in_progress, completed, cancelled
CpRecordType: concern, mandated_report, tusla_correspondence, section_26, disclosure, retrospective_disclosure
MandatedReportStatus: draft, submitted, acknowledged, outcome_received
PastoralDsarDecision: include, redact, exclude
CriticalIncidentType: bereavement, serious_accident, community_trauma, other
CriticalIncidentScope: whole_school, year_group, class_group, individual
CriticalIncidentStatus: active, monitoring, closed
CriticalIncidentImpactLevel: direct, indirect
```

### 2.2 Models

Each model is listed with its exact columns, types, constraints, and indexes. The implementer translates these to Prisma syntax following existing conventions.

**Model 1: PastoralConcern**

```
@@map("pastoral_concerns")

id                      UUID PK
tenant_id               UUID NOT NULL FK -> tenants(id) CASCADE
student_id              UUID NOT NULL FK -> students(id) RESTRICT
logged_by_user_id       UUID NOT NULL FK -> users(id) RESTRICT
author_masked           Boolean NOT NULL DEFAULT false
category                String @db.VarChar(50) NOT NULL
severity                PastoralConcernSeverity NOT NULL
tier                    Int @db.SmallInt NOT NULL DEFAULT 1
occurred_at             DateTime @db.Timestamptz() NOT NULL
location                String? @db.VarChar(255)
witnesses               Json?        -- [{type: 'staff'|'student', id: UUID, name: text}]
actions_taken           String? @db.Text
follow_up_needed        Boolean NOT NULL DEFAULT false
follow_up_suggestion    String? @db.Text
case_id                 UUID? FK -> pastoral_cases(id) SET NULL
behaviour_incident_id   UUID? FK -> behaviour_incidents(id) SET NULL
parent_shareable        Boolean NOT NULL DEFAULT false
parent_share_level      String? @db.VarChar(20) @default("category_only")
shared_by_user_id       UUID? FK -> users(id) SET NULL
shared_at               DateTime? @db.Timestamptz()
legal_hold              Boolean NOT NULL DEFAULT false
imported                Boolean NOT NULL DEFAULT false
acknowledged_at         DateTime? @db.Timestamptz()
acknowledged_by_user_id UUID? FK -> users(id) SET NULL
created_at              DateTime @default(now()) @db.Timestamptz()
updated_at              DateTime @updatedAt @default(now()) @db.Timestamptz()

Indexes:
  @@index([tenant_id, student_id, created_at(sort: Desc)], map: "idx_pastoral_concerns_tenant_student_created")
  @@index([tenant_id, tier, created_at(sort: Desc)], map: "idx_pastoral_concerns_tenant_tier_created")
  @@index([tenant_id, case_id], map: "idx_pastoral_concerns_tenant_case")
  @@index([tenant_id, severity, acknowledged_at], map: "idx_pastoral_concerns_tenant_severity_ack")
```

**Model 2: PastoralConcernVersion (append-only -- no updated_at)**

```
@@map("pastoral_concern_versions")

id                      UUID PK
tenant_id               UUID NOT NULL FK -> tenants(id) CASCADE
concern_id              UUID NOT NULL FK -> pastoral_concerns(id) CASCADE
version_number          Int NOT NULL
narrative               String @db.Text NOT NULL
amended_by_user_id      UUID NOT NULL FK -> users(id) RESTRICT
amendment_reason        String? @db.Text
created_at              DateTime @default(now()) @db.Timestamptz()

Constraints:
  @@unique([concern_id, version_number])
  -- CHECK (version_number >= 1) via post_migrate.sql
  -- CHECK (version_number = 1 OR amendment_reason IS NOT NULL) via post_migrate.sql

Indexes:
  @@index([tenant_id, concern_id, version_number], map: "idx_pastoral_concern_versions_tenant_concern_ver")
```

**Model 3: CpRecord**

```
@@map("cp_records")

id                      UUID PK
tenant_id               UUID NOT NULL FK -> tenants(id) CASCADE
student_id              UUID NOT NULL FK -> students(id) RESTRICT
concern_id              UUID? FK -> pastoral_concerns(id) SET NULL
record_type             CpRecordType NOT NULL
logged_by_user_id       UUID NOT NULL FK -> users(id) RESTRICT
narrative               String @db.Text NOT NULL
mandated_report_status  MandatedReportStatus?
mandated_report_ref     String? @db.VarChar(100)
tusla_contact_name      String? @db.VarChar(255)
tusla_contact_date      DateTime? @db.Timestamptz()
legal_hold              Boolean NOT NULL DEFAULT false
created_at              DateTime @default(now()) @db.Timestamptz()
updated_at              DateTime @updatedAt @default(now()) @db.Timestamptz()

Indexes:
  @@index([tenant_id, student_id, created_at(sort: Desc)], map: "idx_cp_records_tenant_student_created")
  @@index([tenant_id, record_type], map: "idx_cp_records_tenant_type")
```

**Model 4: CpAccessGrant**

```
@@map("cp_access_grants")

id                      UUID PK
tenant_id               UUID NOT NULL FK -> tenants(id) CASCADE
user_id                 UUID NOT NULL FK -> users(id) RESTRICT
granted_by_user_id      UUID NOT NULL FK -> users(id) RESTRICT
granted_at              DateTime @default(now()) @db.Timestamptz()
revoked_at              DateTime? @db.Timestamptz()
revoked_by_user_id      UUID? FK -> users(id) SET NULL
revocation_reason       String? @db.Text

Constraints:
  @@unique([tenant_id, user_id], map: "uq_cp_access_grants_tenant_user_active")
  -- Note: This unique constraint should ideally be partial (WHERE revoked_at IS NULL).
  -- Prisma does not support partial unique indexes natively. Create the partial unique
  -- index in post_migrate.sql and use @@ignore on the Prisma @@unique, or define
  -- the @@unique as shown and add the partial version in post_migrate.sql as the
  -- actual enforcement (DROP the Prisma-generated one, CREATE the partial one).

Indexes:
  @@index([tenant_id, user_id, revoked_at], map: "idx_cp_access_grants_tenant_user_revoked")
```

**Model 5: PastoralCase**

```
@@map("pastoral_cases")

id                      UUID PK
tenant_id               UUID NOT NULL FK -> tenants(id) CASCADE
student_id              UUID NOT NULL FK -> students(id) RESTRICT
case_number             String @db.VarChar(20) NOT NULL
status                  PastoralCaseStatus NOT NULL @default(open)
owner_user_id           UUID NOT NULL FK -> users(id) RESTRICT
opened_by_user_id       UUID NOT NULL FK -> users(id) RESTRICT
opened_reason           String @db.Text NOT NULL
next_review_date        DateTime? @db.Date
tier                    Int @db.SmallInt NOT NULL DEFAULT 1
legal_hold              Boolean NOT NULL DEFAULT false
resolved_at             DateTime? @db.Timestamptz()
closed_at               DateTime? @db.Timestamptz()
created_at              DateTime @default(now()) @db.Timestamptz()
updated_at              DateTime @updatedAt @default(now()) @db.Timestamptz()

Constraints:
  @@unique([tenant_id, case_number])

Indexes:
  @@index([tenant_id, student_id, status], map: "idx_pastoral_cases_tenant_student_status")
  @@index([tenant_id, owner_user_id, status], map: "idx_pastoral_cases_tenant_owner_status")
  @@index([tenant_id, next_review_date], map: "idx_pastoral_cases_tenant_review_date")
```

**Model 6: PastoralCaseStudent**

```
@@map("pastoral_case_students")

case_id                 UUID NOT NULL FK -> pastoral_cases(id) CASCADE
student_id              UUID NOT NULL FK -> students(id) RESTRICT
tenant_id               UUID NOT NULL FK -> tenants(id) CASCADE
added_at                DateTime @default(now()) @db.Timestamptz()

@@id([case_id, student_id])
```

**Model 7: PastoralIntervention**

```
@@map("pastoral_interventions")

id                      UUID PK
tenant_id               UUID NOT NULL FK -> tenants(id) CASCADE
case_id                 UUID NOT NULL FK -> pastoral_cases(id) CASCADE
student_id              UUID NOT NULL FK -> students(id) RESTRICT
intervention_type       String @db.VarChar(50) NOT NULL
continuum_level         Int @db.SmallInt NOT NULL -- 1, 2, or 3
target_outcomes         Json NOT NULL -- [{description, measurable_target}]
review_cycle_weeks      Int NOT NULL @default(6)
next_review_date        DateTime @db.Date NOT NULL
parent_informed         Boolean NOT NULL DEFAULT false
parent_consented        Boolean?
parent_input            String? @db.Text
student_voice           String? @db.Text
status                  PastoralInterventionStatus NOT NULL @default(active)
outcome_notes           String? @db.Text
created_by_user_id      UUID NOT NULL FK -> users(id) RESTRICT
created_at              DateTime @default(now()) @db.Timestamptz()
updated_at              DateTime @updatedAt @default(now()) @db.Timestamptz()

Indexes:
  @@index([tenant_id, case_id], map: "idx_pastoral_interventions_tenant_case")
  @@index([tenant_id, student_id, status], map: "idx_pastoral_interventions_tenant_student_status")
  @@index([tenant_id, next_review_date], map: "idx_pastoral_interventions_tenant_review")
```

**Model 8: PastoralInterventionAction**

```
@@map("pastoral_intervention_actions")

id                      UUID PK
tenant_id               UUID NOT NULL FK -> tenants(id) CASCADE
intervention_id         UUID NOT NULL FK -> pastoral_interventions(id) CASCADE
description             String @db.Text NOT NULL
assigned_to_user_id     UUID NOT NULL FK -> users(id) RESTRICT
frequency               String? @db.VarChar(50) -- 'once'|'daily'|'weekly'|'fortnightly'|'as_needed'
start_date              DateTime @db.Date NOT NULL
due_date                DateTime? @db.Date
completed_at            DateTime? @db.Timestamptz()
completed_by_user_id    UUID? FK -> users(id) SET NULL
status                  PastoralActionStatus NOT NULL @default(pending)
created_at              DateTime @default(now()) @db.Timestamptz()
updated_at              DateTime @updatedAt @default(now()) @db.Timestamptz()

Indexes:
  @@index([tenant_id, intervention_id], map: "idx_pastoral_intervention_actions_tenant_intervention")
  @@index([tenant_id, assigned_to_user_id, status], map: "idx_pastoral_intervention_actions_tenant_assignee_status")
```

**Model 9: PastoralInterventionProgress (append-only -- no updated_at)**

```
@@map("pastoral_intervention_progress")

id                      UUID PK
tenant_id               UUID NOT NULL FK -> tenants(id) CASCADE
intervention_id         UUID NOT NULL FK -> pastoral_interventions(id) CASCADE
note                    String @db.Text NOT NULL
recorded_by_user_id     UUID NOT NULL FK -> users(id) RESTRICT
created_at              DateTime @default(now()) @db.Timestamptz()

Indexes:
  @@index([tenant_id, intervention_id, created_at(sort: Desc)], map: "idx_pastoral_intervention_progress_tenant_intervention")
```

**Model 10: PastoralReferral**

```
@@map("pastoral_referrals")

id                      UUID PK
tenant_id               UUID NOT NULL FK -> tenants(id) CASCADE
case_id                 UUID? FK -> pastoral_cases(id) SET NULL
student_id              UUID NOT NULL FK -> students(id) RESTRICT
referral_type           String @db.VarChar(50) NOT NULL -- 'neps'|'camhs'|'tusla_family_support'|'jigsaw'|'pieta_house'|'other_external'
referral_body_name      String? @db.VarChar(255)
status                  PastoralReferralStatus NOT NULL @default(draft)
submitted_at            DateTime? @db.Timestamptz()
submitted_by_user_id    UUID? FK -> users(id) SET NULL
pre_populated_data      Json?
manual_additions        Json?
external_reference      String? @db.VarChar(100)
report_received_at      DateTime? @db.Timestamptz()
report_summary          String? @db.Text
created_at              DateTime @default(now()) @db.Timestamptz()
updated_at              DateTime @updatedAt @default(now()) @db.Timestamptz()

Indexes:
  @@index([tenant_id, student_id, status], map: "idx_pastoral_referrals_tenant_student_status")
  @@index([tenant_id, referral_type, status], map: "idx_pastoral_referrals_tenant_type_status")
```

**Model 11: PastoralReferralRecommendation**

```
@@map("pastoral_referral_recommendations")

id                      UUID PK
tenant_id               UUID NOT NULL FK -> tenants(id) CASCADE
referral_id             UUID NOT NULL FK -> pastoral_referrals(id) CASCADE
recommendation          String @db.Text NOT NULL
assigned_to_user_id     UUID? FK -> users(id) SET NULL
review_date             DateTime? @db.Date
status                  PastoralReferralRecommendationStatus NOT NULL @default(pending)
status_note             String? @db.Text
created_at              DateTime @default(now()) @db.Timestamptz()
updated_at              DateTime @updatedAt @default(now()) @db.Timestamptz()

Indexes:
  @@index([tenant_id, referral_id], map: "idx_pastoral_referral_recs_tenant_referral")
```

**Model 12: SstMember**

```
@@map("sst_members")

id                      UUID PK
tenant_id               UUID NOT NULL FK -> tenants(id) CASCADE
user_id                 UUID NOT NULL FK -> users(id) RESTRICT
role_description        String? @db.VarChar(100)
active                  Boolean NOT NULL DEFAULT true
created_at              DateTime @default(now()) @db.Timestamptz()
updated_at              DateTime @updatedAt @default(now()) @db.Timestamptz()

Constraints:
  @@unique([tenant_id, user_id])
```

**Model 13: SstMeeting**

```
@@map("sst_meetings")

id                      UUID PK
tenant_id               UUID NOT NULL FK -> tenants(id) CASCADE
scheduled_at            DateTime @db.Timestamptz() NOT NULL
status                  SstMeetingStatus NOT NULL @default(scheduled)
attendees               Json? -- [{user_id, name, present: bool}]
general_notes           String? @db.Text
agenda_precomputed_at   DateTime? @db.Timestamptz()
created_by_user_id      UUID NOT NULL FK -> users(id) RESTRICT
created_at              DateTime @default(now()) @db.Timestamptz()
updated_at              DateTime @updatedAt @default(now()) @db.Timestamptz()

Indexes:
  @@index([tenant_id, scheduled_at], map: "idx_sst_meetings_tenant_scheduled")
  @@index([tenant_id, status], map: "idx_sst_meetings_tenant_status")
```

**Model 14: SstMeetingAgendaItem**

```
@@map("sst_meeting_agenda_items")

id                      UUID PK
tenant_id               UUID NOT NULL FK -> tenants(id) CASCADE
meeting_id              UUID NOT NULL FK -> sst_meetings(id) CASCADE
source                  String @db.VarChar(30) NOT NULL -- see master spec for enum values
student_id              UUID? FK -> students(id) SET NULL
case_id                 UUID? FK -> pastoral_cases(id) SET NULL
concern_id              UUID? FK -> pastoral_concerns(id) SET NULL
description             String @db.Text NOT NULL
discussion_notes        String? @db.Text
decisions               String? @db.Text
display_order           Int NOT NULL @default(0)
created_at              DateTime @default(now()) @db.Timestamptz()
updated_at              DateTime @updatedAt @default(now()) @db.Timestamptz()

Indexes:
  @@index([tenant_id, meeting_id, display_order], map: "idx_sst_agenda_items_tenant_meeting_order")
```

**Model 15: SstMeetingAction**

```
@@map("sst_meeting_actions")

id                      UUID PK
tenant_id               UUID NOT NULL FK -> tenants(id) CASCADE
meeting_id              UUID NOT NULL FK -> sst_meetings(id) CASCADE
agenda_item_id          UUID? FK -> sst_meeting_agenda_items(id) SET NULL
student_id              UUID? FK -> students(id) SET NULL
case_id                 UUID? FK -> pastoral_cases(id) SET NULL
description             String @db.Text NOT NULL
assigned_to_user_id     UUID NOT NULL FK -> users(id) RESTRICT
due_date                DateTime @db.Date NOT NULL
completed_at            DateTime? @db.Timestamptz()
completed_by_user_id    UUID? FK -> users(id) SET NULL
status                  PastoralActionStatus NOT NULL @default(pending)
created_at              DateTime @default(now()) @db.Timestamptz()
updated_at              DateTime @updatedAt @default(now()) @db.Timestamptz()

Indexes:
  @@index([tenant_id, meeting_id], map: "idx_sst_meeting_actions_tenant_meeting")
  @@index([tenant_id, assigned_to_user_id, status], map: "idx_sst_meeting_actions_tenant_assignee_status")
  @@index([tenant_id, due_date, status], map: "idx_sst_meeting_actions_tenant_due_status")
```

**Model 16: PastoralParentContact (append-only -- no updated_at)**

```
@@map("pastoral_parent_contacts")

id                      UUID PK
tenant_id               UUID NOT NULL FK -> tenants(id) CASCADE
student_id              UUID NOT NULL FK -> students(id) RESTRICT
concern_id              UUID? FK -> pastoral_concerns(id) SET NULL
case_id                 UUID? FK -> pastoral_cases(id) SET NULL
parent_id               UUID NOT NULL FK -> parents(id) RESTRICT
contacted_by_user_id    UUID NOT NULL FK -> users(id) RESTRICT
contact_method          String @db.VarChar(30) NOT NULL -- 'phone'|'in_person'|'email'|'portal_message'|'letter'
contact_date            DateTime @db.Timestamptz() NOT NULL
outcome                 String @db.Text NOT NULL
parent_response         String? @db.Text
created_at              DateTime @default(now()) @db.Timestamptz()

Indexes:
  @@index([tenant_id, student_id, created_at(sort: Desc)], map: "idx_pastoral_parent_contacts_tenant_student")
```

**Model 17: PastoralEvent (append-only -- no updated_at)**

```
@@map("pastoral_events")

id                      UUID PK
tenant_id               UUID NOT NULL FK -> tenants(id) CASCADE
event_type              String @db.VarChar(60) NOT NULL
entity_type             String @db.VarChar(30) NOT NULL
entity_id               String @db.Uuid NOT NULL -- cross-table reference, not a formal FK
student_id              UUID? FK -> students(id) SET NULL
actor_user_id           UUID NOT NULL FK -> users(id) RESTRICT
tier                    Int @db.SmallInt NOT NULL
payload                 Json NOT NULL
ip_address              String? @db.Inet
created_at              DateTime @default(now()) @db.Timestamptz()

Indexes:
  @@index([tenant_id, student_id, created_at(sort: Desc)], map: "idx_pastoral_events_tenant_student_created")
  @@index([tenant_id, entity_type, entity_id, created_at(sort: Desc)], map: "idx_pastoral_events_tenant_entity_created")
  @@index([tenant_id, event_type, created_at(sort: Desc)], map: "idx_pastoral_events_tenant_type_created")
```

**Model 18: PastoralDsarReview**

```
@@map("pastoral_dsar_reviews")

id                      UUID PK
tenant_id               UUID NOT NULL FK -> tenants(id) CASCADE
compliance_request_id   UUID NOT NULL FK -> compliance_requests(id) CASCADE
entity_type             String @db.VarChar(30) NOT NULL
entity_id               String @db.Uuid NOT NULL
tier                    Int @db.SmallInt NOT NULL
decision                PastoralDsarDecision?
legal_basis             String? @db.VarChar(100)
justification           String? @db.Text
reviewed_by_user_id     UUID? FK -> users(id) SET NULL
reviewed_at             DateTime? @db.Timestamptz()
created_at              DateTime @default(now()) @db.Timestamptz()
updated_at              DateTime @updatedAt @default(now()) @db.Timestamptz()

Indexes:
  @@index([tenant_id, compliance_request_id], map: "idx_pastoral_dsar_reviews_tenant_request")
```

**Model 19: CriticalIncident**

```
@@map("critical_incidents")

id                      UUID PK
tenant_id               UUID NOT NULL FK -> tenants(id) CASCADE
incident_type           CriticalIncidentType NOT NULL
description             String @db.Text NOT NULL
occurred_at             DateTime @db.Timestamptz() NOT NULL
scope                   CriticalIncidentScope NOT NULL
scope_ids               Json? -- year_group_ids or class_ids
declared_by_user_id     UUID NOT NULL FK -> users(id) RESTRICT
status                  CriticalIncidentStatus NOT NULL @default(active)
response_plan           Json? -- checklist items per phase
external_support_log    Json? -- [{provider, contact, dates, notes}]
created_at              DateTime @default(now()) @db.Timestamptz()
updated_at              DateTime @updatedAt @default(now()) @db.Timestamptz()

Indexes:
  @@index([tenant_id, status], map: "idx_critical_incidents_tenant_status")
```

**Model 20: CriticalIncidentAffected**

```
@@map("critical_incident_affected")

id                      UUID PK
tenant_id               UUID NOT NULL FK -> tenants(id) CASCADE
incident_id             UUID NOT NULL FK -> critical_incidents(id) CASCADE
affected_type           String @db.VarChar(10) NOT NULL -- 'student' | 'staff'
student_id              UUID? FK -> students(id) SET NULL
staff_profile_id        UUID? FK -> staff_profiles(id) SET NULL
impact_level            CriticalIncidentImpactLevel NOT NULL
notes                   String? @db.Text
support_offered         Boolean NOT NULL DEFAULT false
created_at              DateTime @default(now()) @db.Timestamptz()
updated_at              DateTime @updatedAt @default(now()) @db.Timestamptz()

Indexes:
  @@index([tenant_id, incident_id], map: "idx_critical_incident_affected_tenant_incident")
```

### 2.3 Relations

The Prisma relations must be defined so that:

- `PastoralConcern` has relations to `Tenant`, `Student`, `User` (logged_by, shared_by, acknowledged_by), `PastoralCase`, `BehaviourIncident`
- `PastoralConcernVersion` has a relation to `PastoralConcern`
- `CpRecord` has relations to `PastoralConcern`, `Student`, `User`
- `PastoralCase` has relations to `PastoralConcern[]` (back-reference), `PastoralCaseStudent[]`, `PastoralIntervention[]`, `User` (owner, opened_by), `Student`
- All relations follow the existing naming patterns (see `BehaviourIncident` relations as the template)

The `User` model in the schema must be extended with the new relation arrays (e.g., `pastoralConcernsLogged`, `pastoralCasesOwned`). Use the same naming pattern as existing behaviour relations on User.

### 2.4 Migration generation

Run:

```bash
cd packages/prisma
npx prisma migrate dev --name add_pastoral_care_tables
```

After generation, verify the migration SQL contains all 20 tables, all indexes, and all foreign keys.

---

## 3. post_migrate.sql -- RLS policies, triggers, immutability

**File:** `packages/prisma/migrations/{timestamp}_add_pastoral_care_tables/post_migrate.sql`

All statements must be idempotent (use `DROP ... IF EXISTS` before `CREATE`). Follow the exact pattern used in `packages/prisma/migrations/20260326200000_add_behaviour_management_tables/post_migrate.sql`.

### 3.1 Standard RLS policies (14 tables)

Apply the standard tenant isolation pattern to these tables:

1. `pastoral_concern_versions`
2. `cp_access_grants`
3. `pastoral_cases`
4. `pastoral_case_students`
5. `pastoral_interventions`
6. `pastoral_intervention_actions`
7. `pastoral_intervention_progress`
8. `pastoral_referrals`
9. `pastoral_referral_recommendations`
10. `sst_members`
11. `sst_meetings`
12. `sst_meeting_agenda_items`
13. `sst_meeting_actions`
14. `pastoral_parent_contacts`
15. `pastoral_events`
16. `pastoral_dsar_reviews`
17. `critical_incidents`
18. `critical_incident_affected`

Pattern (identical for each):

```sql
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {table_name} FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS {table_name}_tenant_isolation ON {table_name};
CREATE POLICY {table_name}_tenant_isolation ON {table_name}
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

### 3.2 Tiered RLS for pastoral_concerns

`pastoral_concerns` gets a **different** RLS policy that filters Tier 3 rows based on `cp_access_grants`. Non-DLP users see `tier < 3` rows only. DLP users (those with active `cp_access_grants`) see all tiers.

```sql
ALTER TABLE pastoral_concerns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_concerns FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pastoral_concerns_tiered_access ON pastoral_concerns;
CREATE POLICY pastoral_concerns_tiered_access ON pastoral_concerns
  USING (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND (
      tier < 3
      OR EXISTS (
        SELECT 1 FROM cp_access_grants
        WHERE cp_access_grants.tenant_id = pastoral_concerns.tenant_id
          AND cp_access_grants.user_id = current_setting('app.current_user_id')::uuid
          AND cp_access_grants.revoked_at IS NULL
      )
    )
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id')::uuid
  );
```

This is the zero-discoverability enforcement: a user without CP access querying `pastoral_concerns` will never see Tier 3 rows -- the database silently excludes them.

### 3.3 CP-specific RLS for cp_records

`cp_records` requires BOTH tenant match AND an active `cp_access_grants` entry for the current user:

```sql
ALTER TABLE cp_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cp_records_tenant_and_grant ON cp_records;
CREATE POLICY cp_records_tenant_and_grant ON cp_records
  USING (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND EXISTS (
      SELECT 1 FROM cp_access_grants
      WHERE cp_access_grants.tenant_id = cp_records.tenant_id
        AND cp_access_grants.user_id = current_setting('app.current_user_id')::uuid
        AND cp_access_grants.revoked_at IS NULL
    )
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND EXISTS (
      SELECT 1 FROM cp_access_grants
      WHERE cp_access_grants.tenant_id = cp_records.tenant_id
        AND cp_access_grants.user_id = current_setting('app.current_user_id')::uuid
        AND cp_access_grants.revoked_at IS NULL
    )
  );
```

### 3.4 Immutability trigger function

Create a reusable trigger function (idempotent):

```sql
CREATE OR REPLACE FUNCTION prevent_immutable_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only. UPDATE and DELETE operations are prohibited.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
```

Apply to the 4 append-only tables:

```sql
DROP TRIGGER IF EXISTS trg_immutable_pastoral_events ON pastoral_events;
CREATE TRIGGER trg_immutable_pastoral_events
  BEFORE UPDATE OR DELETE ON pastoral_events
  FOR EACH ROW EXECUTE FUNCTION prevent_immutable_modification();

DROP TRIGGER IF EXISTS trg_immutable_concern_versions ON pastoral_concern_versions;
CREATE TRIGGER trg_immutable_concern_versions
  BEFORE UPDATE OR DELETE ON pastoral_concern_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_immutable_modification();

DROP TRIGGER IF EXISTS trg_immutable_intervention_progress ON pastoral_intervention_progress;
CREATE TRIGGER trg_immutable_intervention_progress
  BEFORE UPDATE OR DELETE ON pastoral_intervention_progress
  FOR EACH ROW EXECUTE FUNCTION prevent_immutable_modification();

DROP TRIGGER IF EXISTS trg_immutable_parent_contacts ON pastoral_parent_contacts;
CREATE TRIGGER trg_immutable_parent_contacts
  BEFORE UPDATE OR DELETE ON pastoral_parent_contacts
  FOR EACH ROW EXECUTE FUNCTION prevent_immutable_modification();
```

### 3.5 Tier downgrade prevention trigger

```sql
CREATE OR REPLACE FUNCTION prevent_tier_downgrade()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tier < OLD.tier THEN
    RAISE EXCEPTION 'Pastoral concern tier cannot be downgraded (% -> %)', OLD.tier, NEW.tier;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_tier_downgrade ON pastoral_concerns;
CREATE TRIGGER trg_prevent_tier_downgrade
  BEFORE UPDATE OF tier ON pastoral_concerns
  FOR EACH ROW
  EXECUTE FUNCTION prevent_tier_downgrade();
```

### 3.6 Auto-tier escalation for CP categories

```sql
CREATE OR REPLACE FUNCTION auto_escalate_cp_category()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.category IN ('child_protection', 'self_harm') AND NEW.tier < 3 THEN
    NEW.tier := 3;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_escalate_cp_category ON pastoral_concerns;
CREATE TRIGGER trg_auto_escalate_cp_category
  BEFORE INSERT OR UPDATE OF category ON pastoral_concerns
  FOR EACH ROW
  EXECUTE FUNCTION auto_escalate_cp_category();
```

### 3.7 CHECK constraints

```sql
-- Concern version requires amendment reason after v1
ALTER TABLE pastoral_concern_versions
  DROP CONSTRAINT IF EXISTS chk_amendment_reason;
ALTER TABLE pastoral_concern_versions
  ADD CONSTRAINT chk_amendment_reason
  CHECK (version_number = 1 OR amendment_reason IS NOT NULL);

-- Version number must be >= 1
ALTER TABLE pastoral_concern_versions
  DROP CONSTRAINT IF EXISTS chk_version_number_positive;
ALTER TABLE pastoral_concern_versions
  ADD CONSTRAINT chk_version_number_positive
  CHECK (version_number >= 1);

-- Tier must be 1, 2, or 3
ALTER TABLE pastoral_concerns
  DROP CONSTRAINT IF EXISTS chk_concern_tier;
ALTER TABLE pastoral_concerns
  ADD CONSTRAINT chk_concern_tier
  CHECK (tier IN (1, 2, 3));

-- Continuum level must be 1, 2, or 3
ALTER TABLE pastoral_interventions
  DROP CONSTRAINT IF EXISTS chk_continuum_level;
ALTER TABLE pastoral_interventions
  ADD CONSTRAINT chk_continuum_level
  CHECK (continuum_level IN (1, 2, 3));

-- Mood score range (for Phase 4, but table is created now)
ALTER TABLE student_checkins
  DROP CONSTRAINT IF EXISTS chk_mood_score_range;
ALTER TABLE student_checkins
  ADD CONSTRAINT chk_mood_score_range
  CHECK (mood_score BETWEEN 1 AND 5);
```

### 3.8 Partial unique index for cp_access_grants

```sql
-- One active grant per user per tenant
DROP INDEX IF EXISTS uq_cp_access_grants_active;
CREATE UNIQUE INDEX uq_cp_access_grants_active
  ON cp_access_grants (tenant_id, user_id)
  WHERE revoked_at IS NULL;
```

### 3.9 set_updated_at() triggers for mutable tables

Apply the `set_updated_at()` trigger (already exists as a function from P1 migration) to all pastoral tables that have `updated_at`:

```sql
DO $$ BEGIN
  -- pastoral_concerns
  DROP TRIGGER IF EXISTS trg_pastoral_concerns_updated_at ON pastoral_concerns;
  CREATE TRIGGER trg_pastoral_concerns_updated_at
    BEFORE UPDATE ON pastoral_concerns
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- cp_records
  DROP TRIGGER IF EXISTS trg_cp_records_updated_at ON cp_records;
  CREATE TRIGGER trg_cp_records_updated_at
    BEFORE UPDATE ON cp_records
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- pastoral_cases
  DROP TRIGGER IF EXISTS trg_pastoral_cases_updated_at ON pastoral_cases;
  CREATE TRIGGER trg_pastoral_cases_updated_at
    BEFORE UPDATE ON pastoral_cases
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- pastoral_interventions
  DROP TRIGGER IF EXISTS trg_pastoral_interventions_updated_at ON pastoral_interventions;
  CREATE TRIGGER trg_pastoral_interventions_updated_at
    BEFORE UPDATE ON pastoral_interventions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- pastoral_intervention_actions
  DROP TRIGGER IF EXISTS trg_pastoral_intervention_actions_updated_at ON pastoral_intervention_actions;
  CREATE TRIGGER trg_pastoral_intervention_actions_updated_at
    BEFORE UPDATE ON pastoral_intervention_actions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- pastoral_referrals
  DROP TRIGGER IF EXISTS trg_pastoral_referrals_updated_at ON pastoral_referrals;
  CREATE TRIGGER trg_pastoral_referrals_updated_at
    BEFORE UPDATE ON pastoral_referrals
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- pastoral_referral_recommendations
  DROP TRIGGER IF EXISTS trg_pastoral_referral_recommendations_updated_at ON pastoral_referral_recommendations;
  CREATE TRIGGER trg_pastoral_referral_recommendations_updated_at
    BEFORE UPDATE ON pastoral_referral_recommendations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- sst_members
  DROP TRIGGER IF EXISTS trg_sst_members_updated_at ON sst_members;
  CREATE TRIGGER trg_sst_members_updated_at
    BEFORE UPDATE ON sst_members
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- sst_meetings
  DROP TRIGGER IF EXISTS trg_sst_meetings_updated_at ON sst_meetings;
  CREATE TRIGGER trg_sst_meetings_updated_at
    BEFORE UPDATE ON sst_meetings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- sst_meeting_agenda_items
  DROP TRIGGER IF EXISTS trg_sst_meeting_agenda_items_updated_at ON sst_meeting_agenda_items;
  CREATE TRIGGER trg_sst_meeting_agenda_items_updated_at
    BEFORE UPDATE ON sst_meeting_agenda_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- sst_meeting_actions
  DROP TRIGGER IF EXISTS trg_sst_meeting_actions_updated_at ON sst_meeting_actions;
  CREATE TRIGGER trg_sst_meeting_actions_updated_at
    BEFORE UPDATE ON sst_meeting_actions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- pastoral_dsar_reviews
  DROP TRIGGER IF EXISTS trg_pastoral_dsar_reviews_updated_at ON pastoral_dsar_reviews;
  CREATE TRIGGER trg_pastoral_dsar_reviews_updated_at
    BEFORE UPDATE ON pastoral_dsar_reviews
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- critical_incidents
  DROP TRIGGER IF EXISTS trg_critical_incidents_updated_at ON critical_incidents;
  CREATE TRIGGER trg_critical_incidents_updated_at
    BEFORE UPDATE ON critical_incidents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- critical_incident_affected
  DROP TRIGGER IF EXISTS trg_critical_incident_affected_updated_at ON critical_incident_affected;
  CREATE TRIGGER trg_critical_incident_affected_updated_at
    BEFORE UPDATE ON critical_incident_affected
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
END $$;
```

**Tables that do NOT get updated_at triggers** (append-only):

- `pastoral_concern_versions`
- `pastoral_intervention_progress`
- `pastoral_parent_contacts`
- `pastoral_events`

---

## 4. Permissions seed

**File:** `packages/prisma/seed/permissions.ts`

Add a new section after the existing `// ─── Behaviour Management` section:

```typescript
// ─── Pastoral Care ────────────────────────────────────────────────────────
{ permission_key: 'pastoral.log_concern', description: 'Create a concern for any student', permission_tier: 'staff' },
{ permission_key: 'pastoral.view_tier1', description: 'View Tier 1 (general pastoral) concerns', permission_tier: 'staff' },
{ permission_key: 'pastoral.view_tier2', description: 'View Tier 2 (sensitive pastoral) concerns and cases', permission_tier: 'staff' },
{ permission_key: 'pastoral.manage_cases', description: 'Create/edit cases, assign owners, change status', permission_tier: 'admin' },
{ permission_key: 'pastoral.manage_interventions', description: 'Create/edit intervention plans and actions', permission_tier: 'admin' },
{ permission_key: 'pastoral.manage_referrals', description: 'Create/edit NEPS and external referrals', permission_tier: 'admin' },
{ permission_key: 'pastoral.manage_sst', description: 'Manage SST roster, schedule meetings, manage agenda', permission_tier: 'admin' },
{ permission_key: 'pastoral.manage_checkins', description: 'Configure self-check-in settings, view individual check-ins', permission_tier: 'admin' },
{ permission_key: 'pastoral.view_checkin_aggregate', description: 'View anonymised aggregate check-in analytics', permission_tier: 'admin' },
{ permission_key: 'pastoral.export_tier1_2', description: 'Export Tier 1/2 records (standard flow)', permission_tier: 'admin' },
{ permission_key: 'pastoral.manage_critical_incidents', description: 'Declare and manage critical incidents', permission_tier: 'admin' },
{ permission_key: 'pastoral.view_reports', description: 'View pastoral reports and analytics', permission_tier: 'admin' },
{ permission_key: 'pastoral.dsar_review', description: 'Review pastoral records for DSAR responses', permission_tier: 'admin' },
{ permission_key: 'pastoral.import_historical', description: 'Import historical concerns via CSV', permission_tier: 'admin' },

// ─── Pastoral Care — Tier 3 / CP operations ──────────────────────────────
{ permission_key: 'pastoral.manage_cp_access', description: 'Grant/revoke CP access to other users', permission_tier: 'admin' },
{ permission_key: 'pastoral.export_tier3', description: 'Export Tier 3 records (purpose/confirm/watermark flow)', permission_tier: 'admin' },
{ permission_key: 'pastoral.manage_mandated_reports', description: 'Create/submit mandated reports', permission_tier: 'admin' },

// ─── Pastoral Care — Parent tier ─────────────────────────────────────────
{ permission_key: 'pastoral.parent_self_referral', description: 'Submit a concern about own child (parent)', permission_tier: 'parent' },
```

**Default role assignments:** The implementer must check how existing permissions are assigned to default roles (look for the role-permission seeding logic in `packages/prisma/seed/` or the RBAC setup). The default assignments per the master spec are:

| Permission                           | Default roles                                                         |
| ------------------------------------ | --------------------------------------------------------------------- |
| `pastoral.log_concern`               | All staff roles                                                       |
| `pastoral.view_tier1`                | Year head, form tutor, class teachers, guidance, pastoral coordinator |
| `pastoral.view_tier2`                | SST members, guidance, deputy principal, principal                    |
| `pastoral.manage_cases`              | SST members, deputy principal, principal                              |
| `pastoral.manage_interventions`      | SST members, guidance, deputy principal, principal                    |
| `pastoral.manage_referrals`          | Guidance counsellor, SENCO, deputy principal, principal               |
| `pastoral.manage_sst`                | Deputy principal, principal                                           |
| `pastoral.manage_checkins`           | Designated monitoring owner(s), guidance counsellor                   |
| `pastoral.view_checkin_aggregate`    | Principal, deputy principal                                           |
| `pastoral.export_tier1_2`            | Deputy principal, principal, guidance                                 |
| `pastoral.manage_critical_incidents` | Principal, deputy principal                                           |
| `pastoral.view_reports`              | Principal, deputy principal, SST members                              |
| `pastoral.dsar_review`               | DLP, data protection contact, principal                               |
| `pastoral.import_historical`         | Deputy principal, principal                                           |
| `pastoral.manage_cp_access`          | DLP, principal                                                        |
| `pastoral.export_tier3`              | DLP, principal                                                        |
| `pastoral.manage_mandated_reports`   | DLP, deputy DLP                                                       |
| `pastoral.parent_self_referral`      | Parent roles                                                          |

Note: The DLP, Deputy DLP, and similar roles may not exist as fixed system roles -- they may be school-configured. The implementer must check how behaviour module permissions handle similar role-assignment patterns and follow the same approach.

---

## 5. Shared Zod schemas

**Directory:** `packages/shared/src/pastoral/`

Follow the existing pattern from `packages/shared/src/behaviour/` -- a directory with schema files and an `index.ts` barrel export.

### 5.1 Directory structure

```
packages/shared/src/pastoral/
  index.ts                          -- barrel export
  enums.ts                          -- severity, tier, status string unions
  schemas/
    index.ts                        -- barrel export for schemas
    concern.schema.ts               -- CreateConcern, UpdateConcern, ConcernFilters DTOs
    concern-version.schema.ts       -- AmendNarrative DTO
    case.schema.ts                  -- CreateCase, UpdateCase, CaseFilters DTOs
    intervention.schema.ts          -- CreateIntervention, UpdateIntervention DTOs
    intervention-action.schema.ts   -- CreateAction, UpdateAction DTOs
    referral.schema.ts              -- CreateReferral, UpdateReferral DTOs
    sst.schema.ts                   -- CreateMeeting, SstMember, AgendaItem DTOs
    parent-contact.schema.ts        -- CreateParentContact DTO
    cp-record.schema.ts             -- CreateCpRecord, UpdateCpRecord DTOs
    cp-access.schema.ts             -- GrantAccess, RevokeAccess DTOs
    pastoral-event.schema.ts        -- All event payload schemas (26 event types from master spec)
    tenant-settings.schema.ts       -- pastoral tenant settings Zod object (section 1408 of master spec)
    dsar-review.schema.ts           -- DsarReviewDecision DTO
    critical-incident.schema.ts     -- CreateCriticalIncident, UpdateCriticalIncident DTOs
    checkin.schema.ts               -- SubmitCheckin, CheckinFilters DTOs
    export.schema.ts                -- ExportRequest (purpose, tier, entity scope) DTOs
```

### 5.2 Enums (packages/shared/src/pastoral/enums.ts)

Define as `const` arrays + `z.enum()` for runtime validation + TypeScript type inference:

```typescript
// Severity
export const CONCERN_SEVERITIES = ['routine', 'elevated', 'urgent', 'critical'] as const;
export const concernSeveritySchema = z.enum(CONCERN_SEVERITIES);
export type ConcernSeverity = z.infer<typeof concernSeveritySchema>;

// Tiers
export const PASTORAL_TIERS = [1, 2, 3] as const;
export const pastoralTierSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type PastoralTier = z.infer<typeof pastoralTierSchema>;

// Case status
export const CASE_STATUSES = ['open', 'active', 'monitoring', 'resolved', 'closed'] as const;
export const caseStatusSchema = z.enum(CASE_STATUSES);

// Intervention status
export const INTERVENTION_STATUSES = [
  'active',
  'achieved',
  'partially_achieved',
  'not_achieved',
  'escalated',
  'withdrawn',
] as const;

// Action status
export const ACTION_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'overdue',
  'cancelled',
] as const;

// Referral status
export const REFERRAL_STATUSES = [
  'draft',
  'submitted',
  'acknowledged',
  'assessment_scheduled',
  'assessment_complete',
  'report_received',
  'recommendations_implemented',
] as const;

// CP record type
export const CP_RECORD_TYPES = [
  'concern',
  'mandated_report',
  'tusla_correspondence',
  'section_26',
  'disclosure',
  'retrospective_disclosure',
] as const;

// Contact method
export const CONTACT_METHODS = ['phone', 'in_person', 'email', 'portal_message', 'letter'] as const;

// Parent share level
export const PARENT_SHARE_LEVELS = ['category_only', 'category_summary', 'full_detail'] as const;

// Action frequency
export const ACTION_FREQUENCIES = ['once', 'daily', 'weekly', 'fortnightly', 'as_needed'] as const;

// Referral types
export const REFERRAL_TYPES = [
  'neps',
  'camhs',
  'tusla_family_support',
  'jigsaw',
  'pieta_house',
  'other_external',
] as const;

// Agenda item source
export const AGENDA_ITEM_SOURCES = [
  'auto_new_concern',
  'auto_case_review',
  'auto_overdue_action',
  'auto_early_warning',
  'auto_neps',
  'auto_intervention_review',
  'manual',
] as const;

// Export purposes
export const EXPORT_PURPOSES = [
  'tusla_request',
  'section_26_inquiry',
  'legal_proceedings',
  'school_transfer_cp',
  'board_of_management',
  'other',
] as const;
```

### 5.3 Default concern categories

```typescript
export const DEFAULT_CONCERN_CATEGORIES = [
  { key: 'academic', label: 'Academic', auto_tier: undefined, active: true },
  { key: 'social', label: 'Social', auto_tier: undefined, active: true },
  { key: 'emotional', label: 'Emotional', auto_tier: undefined, active: true },
  { key: 'behavioural', label: 'Behavioural', auto_tier: undefined, active: true },
  { key: 'attendance', label: 'Attendance', auto_tier: undefined, active: true },
  { key: 'family_home', label: 'Family / Home', auto_tier: undefined, active: true },
  { key: 'health', label: 'Health', auto_tier: undefined, active: true },
  { key: 'child_protection', label: 'Child Protection', auto_tier: 3, active: true },
  { key: 'bullying', label: 'Bullying', auto_tier: undefined, active: true },
  { key: 'self_harm', label: 'Self-harm / Suicidal ideation', auto_tier: 3, active: true },
  { key: 'other', label: 'Other', auto_tier: undefined, active: true },
];
```

### 5.4 Default intervention types

```typescript
export const DEFAULT_INTERVENTION_TYPES = [
  { key: 'academic_support', label: 'Academic Support', active: true },
  { key: 'behavioural_support', label: 'Behavioural Support', active: true },
  { key: 'social_emotional', label: 'Social-Emotional Support', active: true },
  { key: 'attendance_support', label: 'Attendance Support', active: true },
  { key: 'external_referral', label: 'External Referral', active: true },
  { key: 'reasonable_accommodation', label: 'Reasonable Accommodation', active: true },
  { key: 'safety_plan', label: 'Safety Plan', active: true },
];
```

### 5.5 Tenant settings schema

The full `pastoral` settings Zod schema as defined in master spec section (lines 1408-1468). This must be integrated into the existing tenant settings schema (check where `tenantSettingsSchema` is defined and add the `pastoral` key).

### 5.6 Event payload schemas

All 26 event types from the master spec's event schema table (lines 1044-1076) must have corresponding Zod schemas in `pastoral-event.schema.ts`. Each schema validates the structure of `pastoral_events.payload` for its event type. Define them as a discriminated union on `event_type`.

### 5.7 Barrel exports

- `packages/shared/src/pastoral/index.ts` must re-export all schemas
- The shared package's main `index.ts` (or equivalent barrel) must export from `./pastoral`

---

## 6. NestJS module scaffolding

### 6.1 Module directory structure

Create the following directories and files. Each module starts as an empty shell with the `@Module({})` decorator, no controllers or services -- just enough that the app compiles.

```
apps/api/src/modules/pastoral/
  pastoral.module.ts

apps/api/src/modules/child-protection/
  child-protection.module.ts

apps/api/src/modules/pastoral-dsar/
  pastoral-dsar.module.ts

apps/api/src/modules/pastoral-checkins/
  pastoral-checkins.module.ts

apps/api/src/modules/critical-incidents/
  critical-incidents.module.ts
```

### 6.2 Module registration

**File:** `apps/api/src/app.module.ts`

Add imports for all 5 new modules. Follow the alphabetical ordering pattern used in the existing imports list:

```typescript
import { ChildProtectionModule } from './modules/child-protection/child-protection.module';
import { CriticalIncidentsModule } from './modules/critical-incidents/critical-incidents.module';
import { PastoralCheckinsModule } from './modules/pastoral-checkins/pastoral-checkins.module';
import { PastoralDsarModule } from './modules/pastoral-dsar/pastoral-dsar.module';
import { PastoralModule } from './modules/pastoral/pastoral.module';
```

Add them to the `imports` array in the `@Module({})` decorator.

### 6.3 Each module file pattern

Follow the existing `BehaviourModule` pattern. Each module starts empty:

```typescript
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class PastoralModule {}
```

The `imports`, `controllers`, `providers`, and `exports` arrays will be populated in subsequent sub-phases (SW-1B through SW-1D).

### 6.4 BullMQ queue registration in API

If the `pastoral` queue does not already exist, register it in the relevant location where queues are configured for the API service (check how `behaviour` queue is registered in the API -- likely in `BullModule.registerQueue()` inside `app.module.ts` or a shared queue module).

The `notifications` queue already exists (used by communications and behaviour modules).

---

## 7. Worker scaffolding

### 7.1 Queue constant

**File:** `apps/worker/src/base/queue.constants.ts`

Add `PASTORAL` to the `QUEUE_NAMES` constant:

```typescript
export const QUEUE_NAMES = {
  // ... existing
  PASTORAL: 'pastoral',
} as const;
```

### 7.2 Queue registration in worker module

**File:** `apps/worker/src/worker.module.ts`

Add the pastoral queue to `BullModule.registerQueue()`:

```typescript
{
  name: QUEUE_NAMES.PASTORAL,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
},
```

### 7.3 Empty processor stubs

Create empty processor files that will be populated in later sub-phases. Each processor extends `TenantAwareJob`.

**Files to create:**

```
apps/worker/src/processors/pastoral/
  notify-concern.processor.ts       -- pastoral:notify-concern
  escalation-timeout.processor.ts   -- pastoral:escalation-timeout
  precompute-agenda.processor.ts    -- pastoral:precompute-agenda
  overdue-actions.processor.ts      -- pastoral:overdue-actions
  intervention-review-reminder.processor.ts  -- pastoral:intervention-review-reminder
  checkin-alert.processor.ts        -- pastoral:checkin-alert (Phase 4)
```

Each stub follows the pattern:

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

interface NotifyConcernPayload extends TenantJobPayload {
  concern_id: string;
}

@Processor(QUEUE_NAMES.PASTORAL)
export class NotifyConcernProcessor extends WorkerHost {
  private readonly tenantJob: NotifyConcernTenantJob;

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
    this.tenantJob = new NotifyConcernTenantJob(prisma);
  }

  async process(job: Job<NotifyConcernPayload>): Promise<void> {
    if (job.name === 'pastoral:notify-concern') {
      await this.tenantJob.execute(job.data);
    }
  }
}

class NotifyConcernTenantJob extends TenantAwareJob<NotifyConcernPayload> {
  protected async processJob(_data: NotifyConcernPayload, _tx: PrismaClient): Promise<void> {
    // Stub -- implementation in SW-1C
  }
}
```

**Important:** Since multiple job types share the `pastoral` queue, the implementer must decide between:

- (a) A single processor class that routes by `job.name` (like existing behaviour processors), or
- (b) Multiple processor classes with job-name filtering

Check how the existing `behaviour` queue handles multiple job types and follow the same pattern.

### 7.4 Register processors in worker module

**File:** `apps/worker/src/worker.module.ts`

Import and add all pastoral processor classes to the `providers` array:

```typescript
// Pastoral queue processors
NotifyConcernProcessor,
EscalationTimeoutProcessor,
PrecomputeAgendaProcessor,
OverdueActionsProcessor,
InterventionReviewReminderProcessor,
CheckinAlertProcessor,
```

---

## 8. Tenant sequence registration

### 8.1 Seed file update

**File:** `packages/prisma/seed/behaviour-seed.ts` (or create a new `packages/prisma/seed/pastoral-seed.ts` following the same pattern)

If creating a new pastoral-specific seed file:

- Define `pastoral_case` as a sequence type
- Register it via `prisma.tenantSequence.upsert()` for each tenant, following the exact pattern from `behaviour-seed.ts` lines 400-425

If extending the existing base seed file `packages/prisma/seed.ts`:

- Add `'pastoral_case'` to the `SEQUENCE_TYPES` array (line 41)

The prefix `PC` and format `PC-YYYYMM-NNN` will be derived at the application layer (same pattern as behaviour sequences).

---

## Verification checklist

Before this sub-phase is considered complete, all of the following must pass:

### Compilation

- [ ] `turbo build` completes without errors
- [ ] `turbo type-check` completes without errors
- [ ] `turbo lint` completes without errors

### Regression

- [ ] `turbo test` passes with zero regressions (all pre-existing tests still pass)
- [ ] Specifically: all existing tests that call `createRlsClient` still pass after the signature change

### Database

- [ ] Migration `add_pastoral_care_tables` applies cleanly
- [ ] All 20 tables exist in the database
- [ ] All indexes exist
- [ ] All foreign keys are correct
- [ ] All CHECK constraints are enforced (manually test: insert a concern with tier=4, expect failure)
- [ ] RLS is enabled and forced on all 20 tables
- [ ] `pastoral_concerns` tiered RLS works: query without CP access returns only tier < 3 rows
- [ ] `cp_records` RLS works: query without CP access returns zero rows
- [ ] Immutability triggers work: attempt UPDATE on `pastoral_events`, expect exception
- [ ] Tier downgrade trigger works: attempt to change tier 3 -> 2 on `pastoral_concerns`, expect exception
- [ ] Auto-escalation trigger works: insert concern with category `child_protection` and tier=1, verify tier is set to 3
- [ ] `set_updated_at()` triggers fire on all mutable tables

### RLS infrastructure

- [ ] `app.current_user_id` is set in every API transaction (verify by querying `current_setting('app.current_user_id')` inside a transaction)
- [ ] `app.current_user_id` is set in every worker job transaction
- [ ] System sentinel `00000000-0000-0000-0000-000000000000` is used when no user_id is provided to worker jobs
- [ ] System sentinel does NOT grant CP access (query `cp_records` with sentinel user_id, expect zero rows)

### Permissions

- [ ] All 18 pastoral permissions exist in the `permissions` table after seeding
- [ ] Permission tiers are correct (staff vs admin vs parent)

### Module scaffolding

- [ ] All 5 NestJS modules are registered in `app.module.ts`
- [ ] The API application starts without errors
- [ ] The worker application starts without errors
- [ ] The `pastoral` queue is registered

### Tenant sequences

- [ ] `pastoral_case` sequence type exists for seeded tenants

---

## Files created/modified summary

| Action | File path                                                                          | Description                                                        |
| ------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Modify | `apps/api/src/common/middleware/rls.middleware.ts`                                 | Add `user_id` to context, add second `set_config` call             |
| Modify | `apps/worker/src/base/tenant-aware-job.ts`                                         | Add optional `user_id`, set sentinel, add second `set_config` call |
| Modify | `apps/worker/src/base/queue.constants.ts`                                          | Add `PASTORAL` queue name                                          |
| Modify | `apps/worker/src/worker.module.ts`                                                 | Register pastoral queue, import processor stubs                    |
| Modify | `packages/prisma/schema.prisma`                                                    | Add 14 enums + 20 models                                           |
| Create | `packages/prisma/migrations/{timestamp}_add_pastoral_care_tables/migration.sql`    | Auto-generated by Prisma                                           |
| Create | `packages/prisma/migrations/{timestamp}_add_pastoral_care_tables/post_migrate.sql` | RLS, triggers, constraints                                         |
| Modify | `packages/prisma/seed/permissions.ts`                                              | Add 18 pastoral permissions                                        |
| Modify | `packages/prisma/seed.ts` (or create `packages/prisma/seed/pastoral-seed.ts`)      | Add `pastoral_case` sequence                                       |
| Create | `packages/shared/src/pastoral/index.ts`                                            | Barrel export                                                      |
| Create | `packages/shared/src/pastoral/enums.ts`                                            | All pastoral enums and constants                                   |
| Create | `packages/shared/src/pastoral/schemas/index.ts`                                    | Schema barrel export                                               |
| Create | `packages/shared/src/pastoral/schemas/concern.schema.ts`                           | Concern DTOs                                                       |
| Create | `packages/shared/src/pastoral/schemas/concern-version.schema.ts`                   | Narrative version DTOs                                             |
| Create | `packages/shared/src/pastoral/schemas/case.schema.ts`                              | Case DTOs                                                          |
| Create | `packages/shared/src/pastoral/schemas/intervention.schema.ts`                      | Intervention DTOs                                                  |
| Create | `packages/shared/src/pastoral/schemas/intervention-action.schema.ts`               | Intervention action DTOs                                           |
| Create | `packages/shared/src/pastoral/schemas/referral.schema.ts`                          | Referral DTOs                                                      |
| Create | `packages/shared/src/pastoral/schemas/sst.schema.ts`                               | SST DTOs                                                           |
| Create | `packages/shared/src/pastoral/schemas/parent-contact.schema.ts`                    | Parent contact DTOs                                                |
| Create | `packages/shared/src/pastoral/schemas/cp-record.schema.ts`                         | CP record DTOs                                                     |
| Create | `packages/shared/src/pastoral/schemas/cp-access.schema.ts`                         | CP access DTOs                                                     |
| Create | `packages/shared/src/pastoral/schemas/pastoral-event.schema.ts`                    | 26 event payload schemas                                           |
| Create | `packages/shared/src/pastoral/schemas/tenant-settings.schema.ts`                   | Pastoral tenant settings                                           |
| Create | `packages/shared/src/pastoral/schemas/dsar-review.schema.ts`                       | DSAR review DTOs                                                   |
| Create | `packages/shared/src/pastoral/schemas/critical-incident.schema.ts`                 | Critical incident DTOs                                             |
| Create | `packages/shared/src/pastoral/schemas/checkin.schema.ts`                           | Check-in DTOs                                                      |
| Create | `packages/shared/src/pastoral/schemas/export.schema.ts`                            | Export request DTOs                                                |
| Create | `packages/shared/src/constants/system.ts`                                          | `SYSTEM_USER_SENTINEL` constant                                    |
| Create | `apps/api/src/modules/pastoral/pastoral.module.ts`                                 | Empty module shell                                                 |
| Create | `apps/api/src/modules/child-protection/child-protection.module.ts`                 | Empty module shell                                                 |
| Create | `apps/api/src/modules/pastoral-dsar/pastoral-dsar.module.ts`                       | Empty module shell                                                 |
| Create | `apps/api/src/modules/pastoral-checkins/pastoral-checkins.module.ts`               | Empty module shell                                                 |
| Create | `apps/api/src/modules/critical-incidents/critical-incidents.module.ts`             | Empty module shell                                                 |
| Modify | `apps/api/src/app.module.ts`                                                       | Import and register 5 new modules                                  |
| Create | `apps/worker/src/processors/pastoral/notify-concern.processor.ts`                  | Stub processor                                                     |
| Create | `apps/worker/src/processors/pastoral/escalation-timeout.processor.ts`              | Stub processor                                                     |
| Create | `apps/worker/src/processors/pastoral/precompute-agenda.processor.ts`               | Stub processor                                                     |
| Create | `apps/worker/src/processors/pastoral/overdue-actions.processor.ts`                 | Stub processor                                                     |
| Create | `apps/worker/src/processors/pastoral/intervention-review-reminder.processor.ts`    | Stub processor                                                     |
| Create | `apps/worker/src/processors/pastoral/checkin-alert.processor.ts`                   | Stub processor                                                     |
| Modify | Multiple service files calling `createRlsClient`                                   | Pass `user_id` alongside `tenant_id`                               |

**Estimated files modified:** ~10 existing files
**Estimated files created:** ~30 new files
**Estimated lines of code:** ~2000 (schema + SQL + Zod schemas + stubs)

---

## References

- Master spec: `Next_Feature/student-wellbeing/master-spec.md`
  - Infrastructure prerequisites: lines 437-517
  - Database tables: lines 521-1041
  - Event schema: lines 1044-1077
  - Permission matrix: lines 1081-1111
  - Tier 3 access control: lines 1103-1119
  - Service boundaries: lines 1132-1244
  - BullMQ jobs: lines 1248-1258
  - Non-negotiable invariants: lines 1261-1404
  - Tenant settings: lines 1408-1468
- Existing patterns:
  - Behaviour post_migrate.sql: `packages/prisma/migrations/20260326200000_add_behaviour_management_tables/post_migrate.sql`
  - Behaviour schemas: `packages/shared/src/behaviour/schemas/`
  - Behaviour seed: `packages/prisma/seed/behaviour-seed.ts`
  - Worker module: `apps/worker/src/worker.module.ts`
  - Queue constants: `apps/worker/src/base/queue.constants.ts`
