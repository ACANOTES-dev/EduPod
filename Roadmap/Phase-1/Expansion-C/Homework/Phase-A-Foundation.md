# Phase A — Foundation

**Wave**: 1
**Deploy Order**: d1
**Depends On**: None

## Scope

Creates all database tables, enums, RLS policies, shared Zod schemas, constants, and tenant settings for the homework and diary feature. This is the infrastructure layer — no API endpoints, no frontend, no jobs. Everything else depends on this phase.

## Deliverables

### Prisma Schema
- [ ] New enums: `HomeworkType`, `HomeworkStatus`, `CompletionStatus`, `RecurrenceFrequency`
- [ ] New model: `HomeworkAssignment` with all fields and indices
- [ ] New model: `HomeworkAttachment` with all fields and indices
- [ ] New model: `HomeworkCompletion` with unique constraint and indices
- [ ] New model: `HomeworkRecurrenceRule` with indices
- [ ] New model: `DiaryNote` with unique constraint and indices
- [ ] New model: `DiaryParentNote` with indices
- [ ] Relation additions to existing models: `Student`, `Class`, `Subject`, `AcademicYear`, `AcademicPeriod`, `User`, `Parent`, `Tenant`

### Migration
- [ ] `packages/prisma/migrations/YYYYMMDDHHMMSS_add_homework_diary_tables/migration.sql`

### RLS Policies
- [ ] `homework_assignments_tenant_isolation`
- [ ] `homework_attachments_tenant_isolation`
- [ ] `homework_completions_tenant_isolation`
- [ ] `homework_recurrence_rules_tenant_isolation`
- [ ] `diary_notes_tenant_isolation`
- [ ] `diary_parent_notes_tenant_isolation`
- [ ] `set_updated_at()` triggers on all tables with `updated_at`
- [ ] Added to `packages/prisma/rls/policies.sql`

### Shared Types (`packages/shared/src/`)
- [ ] `schemas/homework.schema.ts` — Zod schemas for all DTOs:
  - `createHomeworkSchema`, `updateHomeworkSchema`, `listHomeworkSchema`
  - `markCompletionSchema`, `bulkMarkCompletionSchema`
  - `createDiaryNoteSchema`, `createParentNoteSchema`
  - `homeworkSettingsSchema` (for tenant settings)
- [ ] `constants/homework-status.ts` — `VALID_HOMEWORK_TRANSITIONS` map
- [ ] `constants/homework-type.ts` — `HomeworkType` enum values with display labels
- [ ] `constants/completion-status.ts` — `CompletionStatus` enum values with display labels
- [ ] `types/homework.ts` — TypeScript type exports via `z.infer<>`
- [ ] Barrel export from `packages/shared/src/index.ts`

### Tenant Settings
- [ ] Add `homework` section to `tenantSettingsSchema` in `packages/shared/src/schemas/tenant.schema.ts`
  - All fields with `.default()` values (per DZ-05 rule)
- [ ] Add `homework` to `TenantModule` seed / enum if gated behind `tenant_modules`

### Permissions Seed
- [ ] Add 7 new permissions to seed: `homework.view`, `homework.manage`, `homework.mark_own`, `homework.view_diary`, `homework.write_diary`, `homework.view_analytics`, `parent.homework`

### Queue Registration
- [ ] Add `HOMEWORK_QUEUE = 'homework'` to `apps/worker/src/base/queue.constants.ts`

## Out of Scope

- API endpoints (Phase B)
- Worker job processors (Phase C)
- Frontend pages (Phase D, E, F)
- File upload/S3 implementation (Phase B handles the service layer)
- Analytics queries (Phase B)

## Dependencies

None — this is the foundation phase.

## Implementation Notes

- Every new field added to `tenantSettingsSchema` MUST have a `.default()` value (DZ-05: TenantSettings JSONB is a god object).
- RLS policies use the standard `{table_name}_tenant_isolation` naming convention with both `USING` and `WITH CHECK` clauses.
- `FORCE ROW LEVEL SECURITY` is mandatory on all 6 new tables — applies policies even to table owners.
- The `set_updated_at()` trigger function already exists in the DB. Only the trigger bindings need to be created for the new tables.
- The `HomeworkStatus` state machine is extremely simple (3 states, 2 transitions). It follows the pattern from `FormDefinitionStatus` rather than the complex invoice/behaviour machines.
- The `homework_completions` unique constraint `(tenant_id, homework_assignment_id, student_id)` ensures one completion record per student per assignment — upsert pattern for marking completions.
- `DiaryNote` has a unique constraint `(tenant_id, student_id, note_date)` — one personal note per student per day.
- The `copied_from_id` self-referential FK on `HomeworkAssignment` enables the "copy from previous" feature tracking ancestry.
