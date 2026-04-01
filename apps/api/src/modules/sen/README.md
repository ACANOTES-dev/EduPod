# SEN (Special Educational Needs)

## Purpose

Manages the full SEN lifecycle for students: SEN profiles, support plans, goals, resources, SNA assignments, professional involvements, exam accommodations, transition planning, and NCSE/compliance reporting.

## Public API (Exports)

- `SenProfileService` — SEN profile CRUD, status transitions, scope-aware queries
- `SenScopeService` — resolves which SEN records a user can view based on role and class assignments
- `SenSupportPlanService` — support plan versioning, review cycles, plan number generation

## Inbound Dependencies (What this module imports)

- `AuthModule` — guards and permission cache
- `ConfigurationModule` — `SettingsService` for SEN-specific settings: `sen.default_review_cycle_weeks`, `sen.plan_number_prefix`, `sen.sna_schedule_format`
- `SequenceModule` — support plan sequence numbers

## Outbound Consumers (Who imports this module)

- No NestJS module currently imports SenModule
- `SenScopeService` is consumed internally across all SEN controllers for permission-aware data access

## BullMQ Queues

None — SenModule has no background job queues.

## Cross-Module Prisma Reads

- `students` — scope chain, reporting, handover packs, student-hour/SNA joins
- `staff_profiles` — SNA staff context
- `class_staff` — class-scoped visibility resolution in `SenScopeService`
- `class_enrolments` — class-scoped student visibility
- `academic_years`, `academic_periods` — NCSE and overview reports, resource allocation
- `year_groups` — exam accommodation reporting (`SenAccommodationService.getExamReport()`)
- `users` — user context for scope resolution
- `pastoral_referrals` — optional FK link from professional involvements (`SenProfessionalService`)

## Key Danger Zones

- `SenScopeService` depends on `staff_profiles`, `class_staff`, and `class_enrolments` being current. Stale or missing class assignments silently hide SEN records from class-scoped teachers.
- `SenSupportPlanService` uses `sen.plan_number_prefix` from tenant settings. Changing the settings schema without updating the service and shared defaults will misformat plan numbers.
- `SenTransitionService` assembles handover packs from 8 data sources (plans, goals, accommodations, professional involvements, student-hours, SNA assignments, transition notes). Schema changes to any of those shapes can silently omit information from handover payloads.
- `SenSnaService` validates assignment schedules against `sen.sna_schedule_format`. Changing that settings schema without updating the validator can reject valid assignments or accept malformed ones.
- `SenReportsService` reads `students.gender`, `students.year_group_id`, and `academic_years` directly for statutory NCSE/compliance outputs. Schema changes there can skew regulatory reporting.
