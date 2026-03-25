# Phase 4B-v2 Implementation Plan — Auto-Scheduler Redesign

## Section 1 — Overview

This plan implements the comprehensive auto-scheduler redesign specified in `plans/phases-instruction/P4B-v2.md`. The work builds on the existing Phase 4B infrastructure (CSP solver, schedule tables, conflict detection) and extends it with: year-group-scoped period grids, curriculum requirements, teacher competency matrices, break supervision model, 3-tier constraints, and 7 major enhancements.

**Dependencies on prior phases**:
- P0: Prisma, RLS middleware, tenant resolution, auth/permission guards
- P1: RBAC, permissions seeding, approval workflows
- P2: staff_profiles, year_groups, subjects, classes, class_staff, class_enrolments, rooms
- P4A: schedules table, conflict detection, timetable views, rooms with room_type, school_closures
- P4B (original): CSP solver in packages/shared/src/scheduler/, SchedulePeriodTemplate, ClassSchedulingRequirement, StaffAvailability, StaffSchedulingPreference, SchedulingRun, scheduling-related enums

## Section 2 — Implementation Steps

### Step 1: Database Migration — New Enums
- Add `SupervisionMode` enum: `none`, `yard`, `classroom_previous`, `classroom_next`

### Step 2: Database Migration — Modify SchedulePeriodTemplate
- Add `year_group_id` (UUID, nullable initially for backward compat, FK → year_groups)
- Add `supervision_mode` (SupervisionMode, NOT NULL DEFAULT 'none')
- Add `break_group_id` (UUID?, FK → break_groups)
- Update unique constraints to include year_group_id (conditional — handled in post_migrate.sql)

### Step 3: Database Migration — New Tables
- `curriculum_requirements`: year_group + subject frequencies
- `teacher_competencies`: teacher + subject + year_group eligibility
- `break_groups`: yard grouping config
- `break_group_year_groups`: join table for break groups ↔ year groups
- `room_closures`: room unavailability periods
- `teacher_scheduling_config`: load limits per teacher per year
- All with tenant_id, RLS policies, appropriate indexes

### Step 4: Database Migration — Relations
- Add relations from new tables to existing models (Tenant, AcademicYear, YearGroup, Subject, StaffProfile, Room)
- Add reverse relations on existing models

### Step 5: Run Migration + Post-Migrate SQL
- Generate migration: `npx prisma migrate dev --name add-p4b-v2-auto-scheduler-redesign`
- Post-migrate SQL: RLS policies, triggers, partial unique indexes

### Step 6: Shared Types — Solver Input V2
- Create `packages/shared/src/scheduler/types-v2.ts` with `SolverInputV2`, `CurriculumEntry`, `TeacherWithCompetencies`, `BreakGroupConfig`, `ValidationResult`, `ConstraintViolation`, `ConstraintTier`
- Create Zod schemas for new types in `packages/shared/src/schemas/scheduling.schema.ts`
- Export from `packages/shared/src/index.ts`

### Step 7: Solver — New Constraints
- `packages/shared/src/scheduler/constraints-v2.ts`:
  - `checkTeacherCompetency()` — teacher has competency for subject + year group
  - `checkSubjectMaxPerDay()` — subject not exceeding max per day for year group
  - `checkTeacherDailyLoad()` — teacher not exceeding daily period limit
  - `checkTeacherWeeklyLoad()` — teacher not exceeding weekly period limit
  - `checkClassroomBreakAdjacency()` — extended availability for classroom breaks
  - `checkDoublePeriod()` — min consecutive enforcement for double periods
  - `checkBreakSupervisionStaffing()` — yard break has enough supervisors
  - `checkBreakDutyWeeklyCap()` — teacher not exceeding supervision duty limit

### Step 8: Solver — Variable Generation V2
- `packages/shared/src/scheduler/domain-v2.ts`:
  - Generate teaching variables from curriculum requirements × class sections
  - Generate yard supervision variables from break groups
  - Classroom breaks: no variables, constraints on adjacent slots
  - Domain values now include teacher selection (not pre-assigned)

### Step 9: Solver — Main Solver V2
- `packages/shared/src/scheduler/solver-v2.ts`:
  - Extended MRV ordering: supervision first, double-periods, then singles
  - Value ordering: primary teachers first, load-balanced, preference-weighted
  - Two-pass: mandatory periods first, then fill spare slots with preferred extras
  - Integrate all new constraints

### Step 10: Solver Tests
- Unit tests for each new constraint in isolation
- Integration tests with fixture schools that include:
  - Multiple year groups with different period grids
  - Curriculum requirements with min/max
  - Teacher competency restrictions
  - Yard breaks with grouping
  - Classroom breaks (both modes)
  - Double periods
  - Teacher load limits

### Step 11: Validation Service (Shared)
- `packages/shared/src/scheduler/validation.ts`:
  - `validateSchedule()` — takes a complete schedule + all config, returns violations per cell
  - Each violation tagged with tier (1/2/3), cell coordinates, message
  - Used by both the "Validate" button and the "Save" pre-check

### Step 12: Backend — CRUD Services & Controllers
- `CurriculumRequirementsService` + controller (CRUD for curriculum_requirements)
- `TeacherCompetenciesService` + controller (CRUD for teacher_competencies)
- `BreakGroupsService` + controller (CRUD for break_groups + break_group_year_groups)
- `RoomClosuresService` + controller (CRUD for room_closures)
- `TeacherSchedulingConfigService` + controller (CRUD for teacher_scheduling_config)
- Modified `SchedulePeriodTemplatesService` — year group scope, supervision mode
- All with proper permissions, RLS, Zod validation

### Step 13: Backend — Orchestration Service
- `SchedulerOrchestrationService`:
  - `assembleSolverInput(tenantId, academicYearId)` — queries all config tables, assembles `SolverInputV2`
  - `checkPrerequisites(tenantId, academicYearId)` — validates all solver prerequisites
  - `triggerSolverRun(tenantId, academicYearId, userId)` — enqueues BullMQ job
  - `applyRun(tenantId, runId, userId)` — atomic transaction: end-date old entries, insert new

### Step 14: Backend — Validation Endpoint
- `POST /api/v1/scheduling/runs/:id/validate` — runs full 3-tier validation on current draft
- Returns: `{ violations: ConstraintViolation[], health_score: number, summary: { tier1: number, tier2: number, tier3: number } }`

### Step 15: Backend — Cover Teacher Finder
- `GET /api/v1/scheduling/cover-teacher?weekday=X&period_order=Y&subject_id=Z&year_group_id=W`
- Returns eligible available teachers sorted by suitability

### Step 16: Backend — Export Endpoints
- PDF + CSV export per teacher, room, year group, full school
- Uses existing PdfRenderingService + Puppeteer templates

### Step 17: Backend — What-If Mode
- Allow multiple completed runs per academic year
- Comparison endpoint: `GET /api/v1/scheduling/runs/compare?run_a=X&run_b=Y`

### Step 18: Worker — Solver Job V2
- Modified `scheduling:solve` processor to use `SolverInputV2` and solver-v2
- Progress reporting via Redis
- Notification dispatch on complete/fail

### Step 19: Frontend — Config Screens
- Period grid editor (per year group, owner-level)
- Curriculum requirements editor
- Teacher competency matrix (two views: by-teacher, by-subject+year)
- Break group configuration
- Teacher scheduling config
- Room closures management
- "Copy from" buttons on all config screens

### Step 20: Frontend — Solver Review & Manual Editing
- Grid view rendered from result_json + proposed_adjustments
- Drag/drop/swap/add/remove operations
- Validate button → paints red/amber cells
- Health score dashboard
- Teacher workload sidebar
- Save with Tier 2 acknowledgement dialog

### Step 21: Frontend — Enhancements
- Cover teacher finder dialog
- What-if comparison view
- Export buttons (PDF/CSV)

### Step 22: Notifications
- Domain event triggers on apply, complete, fail
- Notification templates for teacher schedule updates

### Step 23: Translation Keys
- Add all scheduling translation keys to messages/en.json and messages/ar.json

## Section 3 — Files to Create

### Database
1. `packages/prisma/migrations/{timestamp}_p4b_v2_auto_scheduler_redesign/migration.sql`
2. `packages/prisma/migrations/{timestamp}_p4b_v2_auto_scheduler_redesign/post_migrate.sql`

### Shared Package
3. `packages/shared/src/scheduler/types-v2.ts`
4. `packages/shared/src/scheduler/constraints-v2.ts`
5. `packages/shared/src/scheduler/domain-v2.ts`
6. `packages/shared/src/scheduler/solver-v2.ts`
7. `packages/shared/src/scheduler/validation.ts`
8. `packages/shared/src/scheduler/__tests__/constraints-v2.test.ts`
9. `packages/shared/src/scheduler/__tests__/solver-v2.test.ts`
10. `packages/shared/src/scheduler/__tests__/validation.test.ts`
11. `packages/shared/src/scheduler/__tests__/fixtures/multi-year-school.ts`
12. `packages/shared/src/schemas/scheduling.schema.ts`

### Backend Services
13. `apps/api/src/modules/scheduling/scheduling.module.ts`
14. `apps/api/src/modules/scheduling/curriculum-requirements.service.ts`
15. `apps/api/src/modules/scheduling/curriculum-requirements.controller.ts`
16. `apps/api/src/modules/scheduling/teacher-competencies.service.ts`
17. `apps/api/src/modules/scheduling/teacher-competencies.controller.ts`
18. `apps/api/src/modules/scheduling/break-groups.service.ts`
19. `apps/api/src/modules/scheduling/break-groups.controller.ts`
20. `apps/api/src/modules/scheduling/room-closures.service.ts`
21. `apps/api/src/modules/scheduling/room-closures.controller.ts`
22. `apps/api/src/modules/scheduling/teacher-scheduling-config.service.ts`
23. `apps/api/src/modules/scheduling/teacher-scheduling-config.controller.ts`
24. `apps/api/src/modules/scheduling/scheduler-orchestration.service.ts`
25. `apps/api/src/modules/scheduling/scheduler-orchestration.controller.ts`
26. `apps/api/src/modules/scheduling/scheduler-validation.service.ts`
27. `apps/api/src/modules/scheduling/cover-teacher.service.ts`
28. `apps/api/src/modules/scheduling/cover-teacher.controller.ts`
29. `apps/api/src/modules/scheduling/scheduling-export.service.ts`
30. `apps/api/src/modules/scheduling/scheduling-export.controller.ts`

### Worker
31. `apps/worker/src/processors/scheduling/solver-v2.processor.ts`

### Frontend Pages
32. `apps/web/src/app/[locale]/(school)/scheduling/page.tsx` (dashboard)
33. `apps/web/src/app/[locale]/(school)/scheduling/period-grid/page.tsx`
34. `apps/web/src/app/[locale]/(school)/scheduling/curriculum/page.tsx`
35. `apps/web/src/app/[locale]/(school)/scheduling/competencies/page.tsx`
36. `apps/web/src/app/[locale]/(school)/scheduling/break-groups/page.tsx`
37. `apps/web/src/app/[locale]/(school)/scheduling/teacher-config/page.tsx`
38. `apps/web/src/app/[locale]/(school)/scheduling/room-closures/page.tsx`
39. `apps/web/src/app/[locale]/(school)/scheduling/runs/[id]/page.tsx` (review + edit)
40. `apps/web/src/app/[locale]/(school)/scheduling/runs/[id]/_components/schedule-grid.tsx`
41. `apps/web/src/app/[locale]/(school)/scheduling/runs/[id]/_components/workload-sidebar.tsx`
42. `apps/web/src/app/[locale]/(school)/scheduling/runs/[id]/_components/health-score.tsx`
43. `apps/web/src/app/[locale]/(school)/scheduling/runs/[id]/_components/validate-results.tsx`
44. `apps/web/src/app/[locale]/(school)/scheduling/runs/compare/page.tsx` (what-if)

## Section 4 — Files to Modify

1. `packages/prisma/schema.prisma` — new enums, new models, modified SchedulePeriodTemplate, new relations
2. `packages/shared/src/index.ts` — export new types and schemas
3. `packages/shared/src/scheduler/index.ts` — export new solver and validation
4. `apps/api/src/app.module.ts` — register SchedulingModule
5. `apps/api/src/modules/schedules/schedules.module.ts` — import new services
6. `apps/worker/src/worker.module.ts` — register solver-v2 processor
7. `apps/web/messages/en.json` — scheduling translation keys
8. `apps/web/messages/ar.json` — scheduling translation keys (Arabic)
9. Navigation config — add scheduling menu items
