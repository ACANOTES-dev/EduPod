# SEN / Additional Needs Module — Implementation Plan

## Overview

Build a dedicated **SEN (Special Educational Needs) / Additional Needs** module for managing students with special educational needs under the Irish framework. This module covers student support profiles, IEP/Student Support Plan building with SMART goal tracking, SENO resource hour allocation, SNA assignment, professional involvement tracking, accommodation records, transition planning, and NCSE compliance reporting.

> [!IMPORTANT]
> This is a **large, multi-sub-plan feature** (~Medium-High effort per spec). The plan below breaks it into **7 implementation phases** to be executed sequentially. Each phase is independently deployable and testable.

## User Review Required

> [!IMPORTANT]
> **Relation to Pastoral Module**: The existing Pastoral module already has referrals (including NEPS/SENO), interventions, cases, and SST meetings. The SEN module should **integrate with** rather than duplicate this infrastructure. SEN Support Plans link to Pastoral Cases, and Professional Assessments link to Pastoral Referrals. Please confirm this integration approach vs. building a standalone module.

> [!WARNING]
> **Parent Portal Access**: The spec says "parents view and contribute to plans via portal." This requires a parent-facing SEN portal (new routes in the [(school)](file:///Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/apps/api/src/modules/pastoral/services/concern.service.ts#342-438) layout under `/parent/sen/`). The scope of "contribute" needs clarification — is this view-only + comments, or can parents add goals/input sections directly?

> [!IMPORTANT]
> **Confidentiality Model**: The spec requires "tiered access — only assigned teachers, resource teachers, SEN coordinator, and principal see full records." This is **row-level application logic** (not RLS, which is tenant-scoped). We need to confirm whether this is:
> - **Option A**: Permission-based (new `sen.view`, `sen.manage`, `sen.view_sensitive` permissions where SEN coordinator + principal have full access, and other staff see only their assigned students)
> - **Option B**: Assignment-based (like Pastoral tier model — staff only see SEN records for students they are explicitly assigned to via `SenStudentAssignment`)
>
> **Recommendation**: Option A with scope filtering (same pattern as Behaviour's `BehaviourScopeService` — SEN coordinators see all, class teachers see their students, resource teachers see assigned students).

---

## Proposed Changes

The implementation is broken into **7 phases**, ordered by dependency and value delivery:

```
Phase 1: Data Model + Enums + Shared Types (foundation)
Phase 2: SEN Profile Service + Controller (core student SEN data)
Phase 3: Support Plan / IEP Builder (goals, strategies, progress)
Phase 4: Resource Allocation (SENO hours, SNA assignment)
Phase 5: Professional Involvement + Accommodations
Phase 6: Compliance Reporting + Transition Planning
Phase 7: Parent Portal + Cross-Module Integration
```

---

### Phase 1: Data Model Foundation

New Prisma models, enums, RLS policies, shared types, and Zod schemas.

#### [NEW] Prisma Schema Additions — [packages/prisma/schema.prisma](file:///Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/packages/prisma/schema.prisma)

**New Enums:**
- `SenCategory` — `learning`, `emotional_behavioural`, `physical`, `sensory`, `asd`, `speech_language`, `multiple`, `other`
- `SenSupportLevel` — `school_support`, `school_support_plus`
- `SupportPlanStatus` — `draft`, `active`, `under_review`, `closed`, `archived`
- `SenGoalStatus` — `not_started`, `in_progress`, `partially_achieved`, `achieved`, `discontinued`
- `SenProfessionalType` — `educational_psychologist`, `speech_therapist`, `occupational_therapist`, `camhs`, `physiotherapist`, `seno`, `neps`, `other`
- `SenReferralStatus` — `pending`, `scheduled`, `completed`, `report_received`
- `AccommodationType` — `exam`, `classroom`, `assistive_technology`
- `SnaAssignmentStatus` — `active`, `ended`

**New Models (10):**
1. `SenProfile` — one-per-student SEN profile (category, diagnosis, support level, SEN flag, SEN coordinator assignment, notes)
2. `SenSupportPlan` — IEP/Student Support Plan with version tracking (academic year, period, status, review dates)
3. `SenGoal` — SMART goals within a support plan (target, baseline, current level, target date, status)
4. `SenGoalStrategy` — strategies/interventions linked to each goal
5. `SenGoalProgress` — append-only progress recordings against goals
6. `SenResourceAllocation` — SENO-level resource hours allocated to the school per academic year
7. `SenStudentHours` — hours assigned to individual students from the school allocation
8. `SenSnaAssignment` — SNA-to-student assignment with schedule
9. `SenProfessionalInvolvement` — external professional records (referral dates, assessment dates, recommendations)
10. `SenAccommodation` — exam/classroom accommodations and assistive technology records

**Student model change:** Add `SenProfile` relation to [Student](file:///Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/apps/api/src/modules/pastoral/services/concern.service.ts#1158-1196) model.

#### [NEW] Migration — `packages/prisma/migrations/YYYYMMDDHHMMSS_add_sen_tables/`
- `migration.sql` — DDL for all new tables
- `post_migrate.sql` — RLS policies for all 10 new tables

#### [NEW] Shared Types — `packages/shared/src/sen/`
- `enums.ts` — SEN-specific enums and constants
- `state-machine.ts` — `SupportPlanStatus` transitions, `SenGoalStatus` transitions
- `schemas/sen-profile.schema.ts` — Zod schemas for SEN profile CRUD
- `schemas/support-plan.schema.ts` — Zod schemas for support plan CRUD
- `schemas/sen-goal.schema.ts` — Zod schemas for goal CRUD + progress recording
- `schemas/resource-allocation.schema.ts` — Zod schemas for resource allocation
- `schemas/professional-involvement.schema.ts` — Zod schemas for professional involvement
- `schemas/accommodation.schema.ts` — Zod schemas for accommodation records
- `schemas/sna-assignment.schema.ts` — Zod schemas for SNA assignment
- `index.ts` — barrel export

---

### Phase 2: SEN Profile Service + Controller

Core CRUD for student SEN profiles with scoped access.

#### [NEW] `apps/api/src/modules/sen/`

Module structure following the flat NestJS convention:
```
modules/sen/
├── dto/                              # Thin re-exports from @school/shared
│   ├── create-sen-profile.dto.ts
│   ├── update-sen-profile.dto.ts
│   └── ... (all DTO re-exports)
├── sen.module.ts
├── sen-profile.controller.ts
├── sen-profile.controller.spec.ts
├── sen-profile.service.ts
├── sen-profile.service.spec.ts
├── sen-scope.service.ts              # Scope resolution (who can see what)
└── sen-scope.service.spec.ts
```

**Key endpoints (SEN Profile):**
| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/sen/profiles` | Create SEN profile for a student | `sen.manage` |
| GET | `v1/sen/profiles` | List SEN profiles (with student/year group/category filters) | `sen.view` |
| GET | `v1/sen/profiles/:id` | SEN profile detail with all linked data | `sen.view` |
| PATCH | `v1/sen/profiles/:id` | Update SEN profile | `sen.manage` |
| GET | `v1/sen/students/:studentId/profile` | Get SEN profile by student ID | `sen.view` |
| GET | `v1/sen/overview` | Dashboard summary (total SEN students, by category, by support level) | `sen.view` |

**New permissions (seeded):**
| Permission | Tier | Description |
|------------|------|-------------|
| `sen.view` | staff | View SEN profiles and support plans within scope |
| `sen.manage` | staff | Create/update SEN profiles, support plans, goals |
| `sen.manage_resources` | admin | Manage SENO resource allocation and SNA assignments |
| `sen.view_sensitive` | staff | View diagnosis details and professional reports |
| `sen.admin` | admin | Full SEN module administration |

---

### Phase 3: IEP / Student Support Plan Builder

The core of the module — goal-based support plans with progress tracking.

#### [NEW] `apps/api/src/modules/sen/`

Additional files:
```
├── sen-support-plan.controller.ts
├── sen-support-plan.controller.spec.ts
├── sen-support-plan.service.ts
├── sen-support-plan.service.spec.ts
├── sen-goal.controller.ts
├── sen-goal.controller.spec.ts
├── sen-goal.service.ts
├── sen-goal.service.spec.ts
```

**Key endpoints (Support Plans):**
| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/sen/profiles/:profileId/plans` | Create a new support plan | `sen.manage` |
| GET | `v1/sen/profiles/:profileId/plans` | List plans for a student profile | `sen.view` |
| GET | `v1/sen/plans/:id` | Plan detail with goals, strategies, progress | `sen.view` |
| PATCH | `v1/sen/plans/:id` | Update plan metadata | `sen.manage` |
| PATCH | `v1/sen/plans/:id/status` | Transition plan status (state machine) | `sen.manage` |
| POST | `v1/sen/plans/:id/clone` | Clone a plan as a new draft (for new term/year) | `sen.manage` |

**Key endpoints (Goals):**
| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/sen/plans/:planId/goals` | Create a SMART goal | `sen.manage` |
| GET | `v1/sen/plans/:planId/goals` | List goals for a plan | `sen.view` |
| PATCH | `v1/sen/goals/:id` | Update goal | `sen.manage` |
| PATCH | `v1/sen/goals/:id/status` | Transition goal status | `sen.manage` |
| POST | `v1/sen/goals/:id/progress` | Record progress against a goal | `sen.manage` |
| GET | `v1/sen/goals/:id/progress` | List progress entries for a goal | `sen.view` |
| POST | `v1/sen/goals/:id/strategies` | Add strategy/intervention to a goal | `sen.manage` |
| GET | `v1/sen/goals/:id/strategies` | List strategies for a goal | `sen.view` |
| PATCH | `v1/sen/strategies/:id` | Update a strategy | `sen.manage` |
| DELETE | `v1/sen/strategies/:id` | Remove a strategy | `sen.manage` |

**State machines (shared):**

Support Plan Status:
```
draft        -> [active]
active       -> [under_review, closed]
under_review -> [active, closed]
closed       -> [archived]
archived*
```

Goal Status:
```
not_started        -> [in_progress]
in_progress        -> [partially_achieved, achieved, discontinued]
partially_achieved -> [in_progress, achieved, discontinued]
achieved*
discontinued*
```

---

### Phase 4: Resource Allocation

SENO hours tracking, student-level hour assignment, SNA assignment management.

#### Additional files in `apps/api/src/modules/sen/`:
```
├── sen-resource.controller.ts
├── sen-resource.controller.spec.ts
├── sen-resource.service.ts
├── sen-resource.service.spec.ts
├── sen-sna.controller.ts
├── sen-sna.controller.spec.ts
├── sen-sna.service.ts
├── sen-sna.service.spec.ts
```

**Key endpoints (Resource Allocation):**
| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/sen/resource-allocations` | Set school-level SENO hours for an academic year | `sen.manage_resources` |
| GET | `v1/sen/resource-allocations` | List allocations by academic year | `sen.view` |
| PATCH | `v1/sen/resource-allocations/:id` | Update allocation | `sen.manage_resources` |
| POST | `v1/sen/student-hours` | Assign hours to a student from the allocation | `sen.manage_resources` |
| GET | `v1/sen/student-hours` | List student hour assignments (with utilisation) | `sen.view` |
| PATCH | `v1/sen/student-hours/:id` | Update student hours | `sen.manage_resources` |
| GET | `v1/sen/resource-utilisation` | Utilisation dashboard (hours used vs allocated) | `sen.view` |

**Key endpoints (SNA Assignment):**
| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/sen/sna-assignments` | Assign SNA to student(s) | `sen.manage_resources` |
| GET | `v1/sen/sna-assignments` | List active SNA assignments | `sen.view` |
| PATCH | `v1/sen/sna-assignments/:id` | Update assignment (schedule, notes) | `sen.manage_resources` |
| PATCH | `v1/sen/sna-assignments/:id/end` | End an SNA assignment | `sen.manage_resources` |
| GET | `v1/sen/sna-assignments/by-sna/:staffId` | Assignments for a specific SNA | `sen.view` |
| GET | `v1/sen/sna-assignments/by-student/:studentId` | SNA assignments for a student | `sen.view` |

---

### Phase 5: Professional Involvement + Accommodations

External professional tracking and accommodation records.

#### Additional files in `apps/api/src/modules/sen/`:
```
├── sen-professional.controller.ts
├── sen-professional.controller.spec.ts
├── sen-professional.service.ts
├── sen-professional.service.spec.ts
├── sen-accommodation.controller.ts
├── sen-accommodation.controller.spec.ts
├── sen-accommodation.service.ts
├── sen-accommodation.service.spec.ts
```

**Key endpoints (Professional Involvement):**
| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/sen/profiles/:profileId/professionals` | Add professional involvement record | `sen.manage` |
| GET | `v1/sen/profiles/:profileId/professionals` | List professional involvement for a student | `sen.view_sensitive` |
| PATCH | `v1/sen/professionals/:id` | Update professional record | `sen.manage` |
| DELETE | `v1/sen/professionals/:id` | Remove professional record | `sen.manage` |

**Key endpoints (Accommodations):**
| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/sen/profiles/:profileId/accommodations` | Create accommodation record | `sen.manage` |
| GET | `v1/sen/profiles/:profileId/accommodations` | List accommodations for a student | `sen.view` |
| PATCH | `v1/sen/accommodations/:id` | Update accommodation | `sen.manage` |
| DELETE | `v1/sen/accommodations/:id` | Remove accommodation | `sen.manage` |
| GET | `v1/sen/accommodations/exam-report` | Exam accommodations report (for RACE/SEC) | `sen.admin` |

---

### Phase 6: Compliance Reporting + Transition Planning

NCSE return data and transition documentation.

#### Additional files in `apps/api/src/modules/sen/`:
```
├── sen-reports.controller.ts
├── sen-reports.controller.spec.ts
├── sen-reports.service.ts
├── sen-reports.service.spec.ts
├── sen-transition.controller.ts
├── sen-transition.controller.spec.ts
├── sen-transition.service.ts
├── sen-transition.service.spec.ts
```

**Key endpoints (Compliance):**
| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| GET | `v1/sen/reports/ncse-return` | NCSE return data (aggregated SEN statistics) | `sen.admin` |
| GET | `v1/sen/reports/overview` | SEN overview (by category, support level, year group) | `sen.view` |
| GET | `v1/sen/reports/resource-utilisation` | Resource allocation vs utilisation report | `sen.admin` |
| GET | `v1/sen/reports/plan-compliance` | Plans due for review, overdue goals | `sen.view` |
| GET | `v1/sen/reports/professional-involvement` | Pending referrals, completed assessments | `sen.admin` |

**Key endpoints (Transition):**
| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/sen/profiles/:profileId/transition-notes` | Add transition note (class-to-class or school-to-school) | `sen.manage` |
| GET | `v1/sen/profiles/:profileId/transition-notes` | List transition notes for a student | `sen.view` |
| GET | `v1/sen/transition/handover-pack/:studentId` | Generate transition handover pack (profile + plans + accommodations + professionals) | `sen.manage` |

**Note**: Transition is handled as JSONB notes on the SEN profile rather than a separate table — keeping it simple for Phase 1 with room to expand.

---

### Phase 7: Frontend + Parent Portal + Cross-Module Integration

#### [NEW] Frontend Pages — `apps/web/src/app/[locale]/(school)/sen/`

| Route | Description |
|-------|-------------|
| `/sen` | SEN dashboard (KPI cards: total SEN students, by category, overdue reviews) |
| `/sen/students` | SEN student directory with category/level/year group filters |
| `/sen/students/[studentId]` | Student SEN profile with tabs: Profile, Plans, Resources, Professionals, Accommodations, History |
| `/sen/plans/[planId]` | Support plan detail with goals, strategies, progress timeline |
| `/sen/plans/[planId]/goals/new` | Create/edit SMART goal form |
| `/sen/resource-allocation` | School-level SENO hour management |
| `/sen/sna-assignments` | SNA assignment management |
| `/sen/reports` | SEN reporting hub |
| `/settings/sen` | SEN module settings |

#### Parent Portal (7 phase):
| Route | Description |
|-------|-------------|
| `/parent/sen` | Parent-facing SEN overview for linked students |
| `/parent/sen/[planId]` | Read-only plan view with progress timeline |

#### Cross-Module Integration (Phase 7):

These are lightweight integration points — not full features:

1. **Student detail page** — Add "SEN" badge and tab on existing student detail page showing SEN profile summary
2. **Attendance** — SEN flag visible on attendance marking for context
3. **Behaviour** — SEN profile summary visible to behaviour staff for incident context
4. **Reports module** — Add SEN data source to Reports analytics
5. **Search** — Index SEN profiles in Meilisearch
6. **Predictive Early Warning** (future Expansion-B item) — SEN status as a risk factor input

> [!IMPORTANT]
> The Gradebook and Timetabling integrations (track academic progress in IEP goal context, resource teacher scheduling) are deferred to post-MVP — they require deeper coupling with those modules and would significantly increase scope.

---

## Data Model Detail

### SenProfile
```
id, tenant_id, student_id (unique per tenant+student), sen_coordinator_user_id?,
sen_categories (JSONB array of SenCategory), primary_category (SenCategory),
support_level (SenSupportLevel), diagnosis?, diagnosis_date?, diagnosis_source?,
assessment_notes?, status (active/inactive), flagged_date?, unflagged_date?,
transition_notes (JSONB), created_at, updated_at
```

### SenSupportPlan
```
id, tenant_id, sen_profile_id, academic_year_id, academic_period_id?,
plan_number (SenSP-YYYYMM-NNNNNN via SequenceService), version (Int),
parent_version_id? (previous plan this was cloned from),
status (SupportPlanStatus), review_date?, next_review_date?,
reviewed_by_user_id?, review_notes?,
parent_input?, student_voice?, staff_notes?,
created_by_user_id, created_at, updated_at
```

### SenGoal
```
id, tenant_id, support_plan_id, title, description?,
target (what the student should achieve — SMART format),
baseline (where the student is now), current_level?,
target_date (Date), status (SenGoalStatus),
display_order (SmallInt), created_at, updated_at
```

### SenGoalStrategy
```
id, tenant_id, goal_id, description, responsible_user_id?,
frequency?, active (Boolean), created_at, updated_at
```

### SenGoalProgress (append-only, no updated_at)
```
id, tenant_id, goal_id, note, current_level?,
recorded_by_user_id, created_at
```

### SenResourceAllocation
```
id, tenant_id, academic_year_id, total_hours (Decimal),
source ('seno' | 'school'), notes?, created_at, updated_at
```

### SenStudentHours
```
id, tenant_id, resource_allocation_id, student_id, sen_profile_id,
allocated_hours (Decimal), used_hours (Decimal default 0),
notes?, created_at, updated_at
```

### SenSnaAssignment
```
id, tenant_id, sna_staff_profile_id, student_id, sen_profile_id,
schedule (JSONB — weekly schedule), status (SnaAssignmentStatus),
start_date (Date), end_date? (Date), notes?,
created_at, updated_at
```

### SenProfessionalInvolvement
```
id, tenant_id, sen_profile_id, professional_type (SenProfessionalType),
professional_name?, organisation?, referral_date?, assessment_date?,
report_received_date?, recommendations?, status (SenReferralStatus),
pastoral_referral_id? (FK to PastoralReferral — integration point),
notes?, created_at, updated_at
```

### SenAccommodation
```
id, tenant_id, sen_profile_id, accommodation_type (AccommodationType),
description, details (JSONB — flexible per type),
start_date? (Date), end_date? (Date), active (Boolean),
approved_by_user_id?, approved_at?
created_at, updated_at
```

---

## Tenant Settings Addition

Add `sen` section to `tenantSettingsSchema` in [packages/shared/src/schemas/tenant.schema.ts](file:///Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/packages/shared/src/schemas/tenant.schema.ts):

```typescript
sen: z.object({
  module_enabled: z.boolean().default(false),
  default_review_cycle_weeks: z.number().default(12), // termly review
  auto_flag_on_referral: z.boolean().default(true),
  sna_schedule_format: z.enum(['weekly', 'daily']).default('weekly'),
  enable_parent_portal_access: z.boolean().default(true),
  plan_number_prefix: z.string().default('SSP'),
}).default({}),
```

---

## Architecture File Updates

The following architecture files must be updated on implementation:

- [architecture/feature-map.md](file:///Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/architecture/feature-map.md) — Add SEN Module section (#29)
- [architecture/module-blast-radius.md](file:///Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/architecture/module-blast-radius.md) — Add SEN Module (Tier 4 initially, escalates to Tier 3 with cross-module integration)
- [architecture/state-machines.md](file:///Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/architecture/state-machines.md) — Add SupportPlanStatus and SenGoalStatus machines
- [architecture/event-job-catalog.md](file:///Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/architecture/event-job-catalog.md) — Add SEN review reminder cron job (if implemented)

---

## Verification Plan

### Automated Tests

Each phase produces co-located unit tests following existing patterns (`*.service.spec.ts`, `*.controller.spec.ts`):

**Phase 1 verification:**
```bash
# After migration, verify schema compiles
cd /Users/ram/Library/Mobile\ Documents/com~apple~CloudDocs/Shared/GitHub\ Repos/SDB
npx turbo type-check
```

**Phase 2–6 verification (per-phase):**
```bash
# Run SEN module tests (once test files exist)
cd /Users/ram/Library/Mobile\ Documents/com~apple~CloudDocs/Shared/GitHub\ Repos/SDB
npx jest --config apps/api/jest.config.ts --testPathPattern="modules/sen" --verbose

# Full regression suite
npx turbo test

# Lint + type-check (CI pre-flight)
npx turbo type-check && npx turbo lint
```

**Test coverage per service (minimum):**
- `sen-profile.service.spec.ts` — create, findAll with filters, findOne, update, not-found handling, scope filtering
- `sen-support-plan.service.spec.ts` — create, list by profile, detail, status transitions (valid + invalid), clone
- `sen-goal.service.spec.ts` — create, update, status transitions, progress recording, strategy CRUD
- `sen-resource.service.spec.ts` — create allocation, assign hours, utilisation calculation, over-allocation guard
- `sen-sna.service.spec.ts` — create assignment, end assignment, list by student/SNA
- `sen-professional.service.spec.ts` — CRUD, pastoral referral linking
- `sen-accommodation.service.spec.ts` — CRUD, exam report aggregation

Each spec file follows the project pattern:
- `buildMockPrisma()` factory
- `jest.mock('../../common/middleware/rls.middleware')` for RLS mocking
- `TENANT_ID`, `STUDENT_ID` etc. as module-scope fixtures
- `afterEach(() => jest.clearAllMocks())`
- `describe('ClassName — methodName')` blocks

### Manual Verification

> [!NOTE]
> Frontend testing deferred to Phase 7. Backend-only phases can be verified via the test suite and type-check. Once the API is deployed, manual verification with curl/Postman against the running API is recommended but not required at the plan stage. I'll ask you to verify the frontend once Phase 7 is implemented.
