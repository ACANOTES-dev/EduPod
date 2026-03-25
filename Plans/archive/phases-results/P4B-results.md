# Phase 4B Results — Auto-Scheduling

## Summary

Phase 4B delivers intelligent timetable generation for the school operating system. It adds a period grid configuration system, class scheduling requirements management, teacher availability and preference tracking, a CSP (Constraint Satisfaction Problem) solver engine, solver execution infrastructure via BullMQ, a proposed timetable review screen with manual adjustment support, an apply/discard workflow with attendance-safe deletion, pin/unpin management for schedule entries, and a comprehensive scheduling dashboard with workload analytics. The solver is a pure TypeScript module with zero database dependencies, supporting auto and hybrid modes. All auto-scheduling UI is conditionally visible based on `tenant_settings.scheduling.autoSchedulerEnabled`.

---

## Database Migrations

**Migration**: `20260316160000_add_p4b_auto_scheduling`

### New Enums (6)
- `SchedulePeriodType` (teaching, break_supervision, assembly, lunch_duty, free)
- `SpreadPreference` (spread_evenly, cluster, no_preference)
- `SchedulingPreferenceType` (subject, class_pref, time_slot)
- `SchedulingPreferencePriority` (low, medium, high)
- `SchedulingRunMode` (auto, hybrid)
- `SchedulingRunStatus` (queued, running, completed, failed, applied, discarded)

### New Tables (5)
| Table | Columns | RLS | Trigger |
|-------|---------|-----|---------|
| `schedule_period_templates` | 12 | Yes | set_updated_at |
| `class_scheduling_requirements` | 12 | Yes | set_updated_at |
| `staff_availability` | 9 | Yes | set_updated_at |
| `staff_scheduling_preferences` | 9 | Yes | set_updated_at |
| `scheduling_runs` | 21 | Yes | set_updated_at |

### Modified Tables
- `schedules` — Added FK relations to `schedule_period_templates` and `scheduling_runs` (columns already existed from P4A). Added 3 partial indexes (pinned, auto_generated, run).

### Post-Migration
- RLS policies for all 5 tables
- `set_updated_at()` triggers for all 5 tables
- CHECK constraints (weekday range, time ordering, consecutive period bounds)
- Custom `timerange` type + GIST exclusion constraint on `schedule_period_templates`
- Partial unique index `idx_scheduling_runs_active` (one active run per tenant/year)
- MD5-based unique index `idx_staff_sched_prefs_unique` on preferences
- FK constraints from `schedules` to new tables

---

## API Endpoints

### Period Grid — `PeriodGridController`
| Method | Path | Permission |
|--------|------|-----------|
| GET | `/v1/period-grid` | `schedule.configure_period_grid` |
| POST | `/v1/period-grid` | `schedule.configure_period_grid` |
| PATCH | `/v1/period-grid/:id` | `schedule.configure_period_grid` |
| DELETE | `/v1/period-grid/:id` | `schedule.configure_period_grid` |
| POST | `/v1/period-grid/copy-day` | `schedule.configure_period_grid` |

### Class Requirements — `ClassRequirementsController`
| Method | Path | Permission |
|--------|------|-----------|
| GET | `/v1/class-scheduling-requirements` | `schedule.configure_requirements` |
| POST | `/v1/class-scheduling-requirements` | `schedule.configure_requirements` |
| PATCH | `/v1/class-scheduling-requirements/:id` | `schedule.configure_requirements` |
| DELETE | `/v1/class-scheduling-requirements/:id` | `schedule.configure_requirements` |
| POST | `/v1/class-scheduling-requirements/bulk` | `schedule.configure_requirements` |

### Staff Availability — `StaffAvailabilityController`
| Method | Path | Permission |
|--------|------|-----------|
| GET | `/v1/staff-availability` | `schedule.configure_availability` |
| PUT | `/v1/staff-availability/staff/:staffId/year/:yearId` | `schedule.configure_availability` |
| DELETE | `/v1/staff-availability/:id` | `schedule.configure_availability` |

### Staff Preferences — `StaffPreferencesController`
| Method | Path | Permission |
|--------|------|-----------|
| GET | `/v1/staff-scheduling-preferences` | `schedule.manage_preferences` |
| GET | `/v1/staff-scheduling-preferences/own` | `schedule.manage_own_preferences` |
| POST | `/v1/staff-scheduling-preferences` | `schedule.manage_preferences` / `schedule.manage_own_preferences` |
| PATCH | `/v1/staff-scheduling-preferences/:id` | `schedule.manage_preferences` / `schedule.manage_own_preferences` |
| DELETE | `/v1/staff-scheduling-preferences/:id` | `schedule.manage_preferences` / `schedule.manage_own_preferences` |

### Scheduling Runs — `SchedulingRunsController`
| Method | Path | Permission |
|--------|------|-----------|
| GET | `/v1/scheduling-runs/prerequisites` | `schedule.run_auto` |
| POST | `/v1/scheduling-runs` | `schedule.run_auto` |
| GET | `/v1/scheduling-runs` | `schedule.view_auto_reports` |
| GET | `/v1/scheduling-runs/:id` | `schedule.view_auto_reports` |
| GET | `/v1/scheduling-runs/:id/progress` | `schedule.run_auto` |
| POST | `/v1/scheduling-runs/:id/cancel` | `schedule.run_auto` |
| PATCH | `/v1/scheduling-runs/:id/adjustments` | `schedule.apply_auto` |
| POST | `/v1/scheduling-runs/:id/apply` | `schedule.apply_auto` |
| POST | `/v1/scheduling-runs/:id/discard` | `schedule.apply_auto` |

### Pin Management — `SchedulesController` (extended)
| Method | Path | Permission |
|--------|------|-----------|
| POST | `/v1/schedules/bulk-pin` | `schedule.pin_entries` |
| POST | `/v1/schedules/:id/pin` | `schedule.pin_entries` |
| POST | `/v1/schedules/:id/unpin` | `schedule.pin_entries` |

### Dashboard — `SchedulingDashboardController`
| Method | Path | Permission |
|--------|------|-----------|
| GET | `/v1/scheduling-dashboard/overview` | `schedule.view_auto_reports` |
| GET | `/v1/scheduling-dashboard/workload` | `schedule.view_auto_reports` |
| GET | `/v1/scheduling-dashboard/unassigned` | `schedule.view_auto_reports` |
| GET | `/v1/scheduling-dashboard/preferences` | `schedule.view_auto_reports` / `schedule.view_own_satisfaction` |

**Total: 30 endpoints**

---

## Services

| Service | Module | Responsibilities |
|---------|--------|-----------------|
| `PeriodGridService` | PeriodGridModule | CRUD for period templates, copy-day, grid hash for drift detection |
| `ClassRequirementsService` | ClassRequirementsModule | CRUD + bulk upsert for class scheduling requirements, completeness counting |
| `StaffAvailabilityService` | StaffAvailabilityModule | Atomic replace availability per teacher, list with staff join |
| `StaffPreferencesService` | StaffPreferencesModule | CRUD with dual-permission (admin/self-service), preference conflict validation |
| `SchedulingPrerequisitesService` | SchedulingRunsModule | 6 prerequisite checks before solver launch |
| `SchedulingRunsService` | SchedulingRunsModule | Run lifecycle (create/cancel/discard), progress, adjustment management |
| `SchedulingApplyService` | SchedulingRunsModule | Apply flow with FOR UPDATE lock, period grid drift check, attendance-safe deletion |
| `SchedulingDashboardService` | SchedulingRunsModule | Overview, workload, unassigned, preference satisfaction aggregation |
| `SchedulesService` (extended) | SchedulesModule | Added pin, unpin, bulkPin methods |

---

## Frontend

### Pages (10)
| Route | Component | Role |
|-------|-----------|------|
| `/scheduling/layout` | Tab navigation | All scheduling roles |
| `/scheduling/period-grid` | Visual weekday grid editor | Admin |
| `/scheduling/requirements` | Class requirements table + bulk edit | Admin |
| `/scheduling/availability` | Weekly availability grid per teacher | Admin |
| `/scheduling/preferences` | Admin preference management (3 tabs) | Admin |
| `/scheduling/my-preferences` | Teacher self-service preferences | Teacher |
| `/scheduling/auto` | Solver launch + prerequisites + progress + run history | Admin |
| `/scheduling/runs/[id]/review` | Proposed timetable review + adjustments + apply/discard | Admin |
| `/scheduling/dashboard` | Multi-tab dashboard (overview, workload, unassigned, satisfaction, history) | Admin |
| `/scheduling/my-satisfaction` | Teacher preference satisfaction view | Teacher |

### Components (1)
| Component | Path |
|-----------|------|
| `PinToggle` | `apps/web/src/components/scheduling/pin-toggle.tsx` |

---

## Background Jobs

| Job Name | Queue | Processor | Trigger |
|----------|-------|-----------|---------|
| `scheduling:solve` | `scheduling` | `SchedulingSolverProcessor` | Creating a scheduling run |
| `scheduling:reap-stale-runs` | `scheduling` | `SchedulingStaleReaperProcessor` | Repeatable (daily) |

---

## CSP Solver

Pure TypeScript module at `packages/shared/src/scheduler/`:
- `types.ts` — Input/output type definitions
- `constraints.ts` — Hard constraint checkers (teacher/room/student booking, availability, period type, consecutive)
- `preferences.ts` — Soft preference scoring (teacher prefs + global soft weights)
- `domain.ts` — Variable generation, initial domain computation, forward checking
- `heuristics.ts` — MRV variable ordering, preference-weighted value ordering
- `solver.ts` — Backtracking search with forward checking, timeout, cancellation, progress callbacks
- `index.ts` — Public exports

Test fixtures: small school (10 teachers, 20 classes, 5 rooms).

---

## Configuration

- Tenant settings already include all needed fields: `scheduling.autoSchedulerEnabled`, `scheduling.maxSolverDurationSeconds`, `scheduling.preferenceWeights`, `scheduling.globalSoftWeights`
- All 11 permissions already seeded from P0-P1 (`schedule.configure_period_grid`, `schedule.configure_requirements`, etc.)
- Queue `SCHEDULING` added to `QUEUE_NAMES`

---

## Files Created (56)

### Prisma & Migrations (2)
- `packages/prisma/migrations/20260316160000_add_p4b_auto_scheduling/migration.sql`
- `packages/prisma/migrations/20260316160000_add_p4b_auto_scheduling/post_migrate.sql`

### Shared Types (5)
- `packages/shared/src/types/schedule-period-template.ts`
- `packages/shared/src/types/class-scheduling-requirement.ts`
- `packages/shared/src/types/staff-availability.ts`
- `packages/shared/src/types/staff-scheduling-preference.ts`
- `packages/shared/src/types/scheduling-run.ts`

### Shared Schemas (5)
- `packages/shared/src/schemas/schedule-period-template.schema.ts`
- `packages/shared/src/schemas/class-scheduling-requirement.schema.ts`
- `packages/shared/src/schemas/staff-availability.schema.ts`
- `packages/shared/src/schemas/staff-scheduling-preference.schema.ts`
- `packages/shared/src/schemas/scheduling-run.schema.ts`

### CSP Solver (10)
- `packages/shared/src/scheduler/types.ts`
- `packages/shared/src/scheduler/constraints.ts`
- `packages/shared/src/scheduler/preferences.ts`
- `packages/shared/src/scheduler/domain.ts`
- `packages/shared/src/scheduler/heuristics.ts`
- `packages/shared/src/scheduler/solver.ts`
- `packages/shared/src/scheduler/index.ts`
- `packages/shared/src/scheduler/__tests__/constraints.test.ts`
- `packages/shared/src/scheduler/__tests__/solver.test.ts`
- `packages/shared/src/scheduler/__tests__/fixtures/small-school.ts`

### Backend Modules (19)
- `apps/api/src/modules/period-grid/period-grid.module.ts`
- `apps/api/src/modules/period-grid/period-grid.controller.ts`
- `apps/api/src/modules/period-grid/period-grid.service.ts`
- `apps/api/src/modules/class-requirements/class-requirements.module.ts`
- `apps/api/src/modules/class-requirements/class-requirements.controller.ts`
- `apps/api/src/modules/class-requirements/class-requirements.service.ts`
- `apps/api/src/modules/staff-availability/staff-availability.module.ts`
- `apps/api/src/modules/staff-availability/staff-availability.controller.ts`
- `apps/api/src/modules/staff-availability/staff-availability.service.ts`
- `apps/api/src/modules/staff-preferences/staff-preferences.module.ts`
- `apps/api/src/modules/staff-preferences/staff-preferences.controller.ts`
- `apps/api/src/modules/staff-preferences/staff-preferences.service.ts`
- `apps/api/src/modules/scheduling-runs/scheduling-runs.module.ts`
- `apps/api/src/modules/scheduling-runs/scheduling-runs.controller.ts`
- `apps/api/src/modules/scheduling-runs/scheduling-runs.service.ts`
- `apps/api/src/modules/scheduling-runs/scheduling-apply.service.ts`
- `apps/api/src/modules/scheduling-runs/scheduling-prerequisites.service.ts`
- `apps/api/src/modules/scheduling-runs/scheduling-dashboard.controller.ts`
- `apps/api/src/modules/scheduling-runs/scheduling-dashboard.service.ts`

### Worker Processors (2)
- `apps/worker/src/processors/scheduling-solver.processor.ts`
- `apps/worker/src/processors/scheduling-stale-reaper.processor.ts`

### Frontend Pages (10)
- `apps/web/src/app/[locale]/(school)/scheduling/layout.tsx`
- `apps/web/src/app/[locale]/(school)/scheduling/period-grid/page.tsx`
- `apps/web/src/app/[locale]/(school)/scheduling/requirements/page.tsx`
- `apps/web/src/app/[locale]/(school)/scheduling/availability/page.tsx`
- `apps/web/src/app/[locale]/(school)/scheduling/preferences/page.tsx`
- `apps/web/src/app/[locale]/(school)/scheduling/my-preferences/page.tsx`
- `apps/web/src/app/[locale]/(school)/scheduling/my-satisfaction/page.tsx`
- `apps/web/src/app/[locale]/(school)/scheduling/auto/page.tsx`
- `apps/web/src/app/[locale]/(school)/scheduling/runs/[id]/review/page.tsx`
- `apps/web/src/app/[locale]/(school)/scheduling/dashboard/page.tsx`

### Frontend Components (1)
- `apps/web/src/components/scheduling/pin-toggle.tsx`

---

## Files Modified (8)

- `packages/prisma/schema.prisma` — 6 enums, 5 models, relations on Schedule/Tenant/User/AcademicYear/StaffProfile/Class/Room
- `packages/shared/src/index.ts` — Exports for new types and schemas
- `packages/shared/src/schemas/schedule.schema.ts` — Added pinScheduleSchema, bulkPinSchema
- `apps/api/src/app.module.ts` — Imported PeriodGridModule, ClassRequirementsModule, StaffAvailabilityModule, StaffPreferencesModule, SchedulingRunsModule
- `apps/api/src/modules/schedules/schedules.service.ts` — Added pin, unpin, bulkPin methods
- `apps/api/src/modules/schedules/schedules.controller.ts` — Added pin/unpin/bulk-pin endpoints
- `apps/worker/src/base/queue.constants.ts` — Added SCHEDULING queue
- `apps/worker/src/worker.module.ts` — Registered scheduling processors and queue
- `apps/web/src/app/[locale]/(school)/layout.tsx` — Added auto-scheduling nav item
- `apps/web/messages/en.json` — ~90 new scheduling.auto.* keys
- `apps/web/messages/ar.json` — Arabic translations for all new keys

---

## Known Limitations

1. **No full drag-and-drop in review**: The review page uses click-to-select + click-target swap instead of HTML5 DnD. This simplifies RTL handling and works reliably across browsers. Can be upgraded to full DnD in a future iteration.

2. **Solver progress stored in DB, not Redis**: For simplicity, solver progress is updated in the `scheduling_runs` DB row rather than a Redis key. The frontend polls every 2 seconds. This adds minor DB load but avoids requiring a Redis client in the API service.

3. **No approval workflow integration for apply**: The plan specified routing through approval workflow for non-school_owner users. This requires deeper integration with the existing approval engine from Phase 1. Currently, the `schedule.apply_auto` permission gates the apply action directly. Approval integration is deferred.

4. **Stale run reaper requires repeatable job registration**: The `SchedulingStaleReaperProcessor` is registered as a BullMQ processor but the repeatable job schedule (daily at 03:00 UTC) needs to be configured at application startup or via a seed script.

5. **Solver cancellation via DB polling**: The solver checks for cancellation by detecting if the run status has been set to 'failed'. Since the solver runs synchronously within the worker transaction, real-time cancellation requires the worker to periodically break out and check status.

---

## Deviations from Plan

1. **No separate component files for frontend**: The plan listed 10 shared components. In practice, most UI logic was embedded directly in the page files to reduce file count and keep components self-contained. Only `PinToggle` was extracted as a standalone component since it's reused across pages.

2. **Solver import path**: The worker processor imports the solver directly from the relative path `../../../../packages/shared/src/scheduler` rather than `@school/shared/scheduler`, since the scheduler module is not re-exported from the shared package's main barrel export.

3. **No BullMQ queue injection in API service**: The `SchedulingRunsService` creates the DB row with `status: 'queued'` but does not directly enqueue a BullMQ job. The worker is expected to poll for queued runs. This avoids adding BullMQ as a dependency to the API service.
