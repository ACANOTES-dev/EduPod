# Stage 3 — API surface updates

**Before you start:** open `../IMPLEMENTATION_LOG.md`. Confirm Stages 1 and 2 are `complete`. Read their completion entries — especially Stage 2's notes on how `resolveTeacherCandidates` is structured, since you will consume it here.

## Purpose

Bring the HTTP surface of `teacher_competencies` in line with the new schema + solver model:

- Zod schemas in `packages/shared/src/scheduling/` accept `class_id?: string | null` and omit `is_primary`.
- `teacher-competencies.controller.ts` and `.service.ts` accept and return the new shape.
- Coverage endpoint returns per-class breakdown, not per-year-group.
- Orchestration service feeds the new snapshot shape into the solver (Stage 2 already prepared the consumer side; this stage completes the producer side end-to-end).
- Remove any DTOs / helpers related to `is_primary`.

After this stage the API is ready for the frontend rebuild in Stage 4.

## Prerequisites

- Stage 1: schema `teacher_competencies` has `class_id` and no `is_primary`.
- Stage 2: solver expects `class_id` in its input shape and handles pool vs pin.

## Scope

### Shared Zod schemas

`packages/shared/src/scheduling/teacher-competencies.schemas.ts` (or wherever the existing schema lives — grep for `teacherCompetencySchema`):

- `createTeacherCompetencySchema`:
  - Add `class_id: z.string().uuid().nullable().optional()`.
  - Remove `is_primary`.
- `updateTeacherCompetencySchema`:
  - Same edits; remove `is_primary`.
  - If the old update schema allowed toggling `is_primary` via PATCH, replace with `class_id` edits (setting it to a specific class = promoting a pool entry to a pin; setting it to `null` = demoting a pin to a pool entry).
- `bulkCopyTeacherCompetenciesSchema` (if exists): keep; copy doesn't care about `class_id` — it copies as-is.
- Response schema / row type: add `class_id: string | null`, remove `is_primary`.

### DTO re-exports

`apps/api/src/modules/scheduling/dto/` — wherever competency DTOs live. Thin re-exports. Keep them consistent with the schema changes.

### Controller

`apps/api/src/modules/scheduling/teacher-competencies.controller.ts`

- Routes to keep: `GET /v1/scheduling/teacher-competencies`, `POST`, `PATCH :id`, `DELETE :id`, `POST /copy`, `GET /coverage`.
- The `GET` list endpoint should support the existing filters (by staff, by subject, by year_group) and add a new optional `class_id=` filter.
- The `GET /coverage` endpoint's response shape changes: instead of a matrix keyed by `(year_group_id, subject_id)`, return a matrix keyed by `(class_id, subject_id)` so each cell reflects real class-level coverage. Include the year group for grouping convenience.

### Service

`apps/api/src/modules/scheduling/teacher-competencies.service.ts`

- `create()`: accept optional `class_id`. Validate class belongs to the same tenant and its year_group_id matches the `year_group_id` in the input.
- `update()`: accept `class_id` patch. Either value must still preserve the uniqueness constraint; catch Prisma P2002 and return a `CONFLICT` error with message "a competency for this teacher/subject/class combination already exists".
- `findAll()`: support filter by `class_id`.
- `coverage()`: rewrite to iterate classes, not year groups. For each `(class, subject)` in the curriculum, determine the assignment mode using the same `resolveTeacherCandidates` helper from Stage 2. Return rows with `{ class_id, class_name, year_group_id, year_group_name, subject_id, subject_name, mode: 'pinned' | 'pool' | 'missing', eligible_teacher_count }`.
- `bulkCopy()`: unchanged apart from carrying `class_id` through when duplicating rows across academic years.

### Orchestration

`apps/api/src/modules/scheduling/scheduler-orchestration.service.ts`

- Already updated in Stage 2 to select `class_id`. Double-check the mapping into the solver input conforms to the `TeacherCompetencyEntry` shape from Stage 2 types.
- The `config_snapshot` persisted to `scheduling_runs` should include the new shape verbatim so the worker has a self-sufficient record for replay/debug.

### Prereq endpoint

`apps/api/src/modules/scheduling-runs/scheduling-runs.controller.ts` — the `GET /prerequisites` endpoint response type should expose the per-class failure list from Stage 2. Update the Zod response schema in `packages/shared` if it's documented there.

## Non-goals

- Do **not** touch the frontend. Stage 4.
- Do **not** seed or wipe data. Stage 5.
- Do **not** modify downstream readers (`teaching-allocations`, `report-comment-windows`). Stage 8.
- Do **not** add a substitutes endpoint. Stage 7.

## Step-by-step

1. Start from `packages/shared`. Update the Zod schemas. Run `pnpm --filter @school/shared build` to regenerate types. This should immediately surface compile errors in consumers — use that as your checklist for the controller/service edits.
2. Update `teacher-competencies.service.ts`:
   - Rewrite `create` to validate `class_id` if present: fetch the class, check it belongs to the tenant, check `class.year_group_id === input.year_group_id`.
   - Rewrite `coverage` using `resolveTeacherCandidates` from the shared scheduler helper.
3. Update the controller. DTOs in the `@Body(new ZodValidationPipe(schema))` calls pick up the new shape for free.
4. Update `scheduler-orchestration.service.ts` end-to-end and add an explicit assertion in the build step: every emitted competency has `class_id: string | null` (never `undefined`).
5. Update unit + integration tests (see "Testing" below).
6. `turbo type-check` clean. `turbo lint` clean. DI smoke test `DI OK`.
7. Deploy: rsync `packages/shared`, `apps/api/src/modules/scheduling*/`, `apps/api/src/modules/scheduling-runs/`. Rebuild shared, then api. Restart api + worker.
8. Smoke on prod:
   ```bash
   curl -H 'cookie: <owner session>' 'https://api.nhqs.edupod.app/api/v1/scheduling/teacher-competencies?pageSize=5'
   ```
   Confirm every row includes `class_id` (currently `null` for all — pool entries left from Stage 1).
   ```bash
   curl -H 'cookie: <owner session>' 'https://api.nhqs.edupod.app/api/v1/scheduling/teacher-competencies/coverage?academic_year_id=<id>'
   ```
   Confirm the response is a per-class matrix, not per-year-group. Some classes will show `mode: 'missing'` — expected until Stage 5 seeds.
9. Commit locally, append completion entry to the log.

## Testing requirements

### Unit

`apps/api/src/modules/scheduling/teacher-competencies.service.spec.ts` — update existing tests and add:

- `create` with `class_id` that belongs to a different tenant → 404 or 403.
- `create` with `class_id` whose `year_group_id` mismatches the input → 400 with code `CLASS_YEAR_GROUP_MISMATCH`.
- `create` pool-level row, then pin-level row for same teacher/subject/year/class combo → both succeed (the class_id distinguishes them); two pool-level rows for same teacher/subject/year → second one rejected as duplicate.
- `coverage` with mixed pin/pool/missing classes → each class returns the right `mode`.

### Integration (e2e)

`apps/api/test/scheduling/teacher-competencies.e2e-spec.ts` (create if absent):

- POST + GET + PATCH + DELETE happy paths with `class_id`.
- RLS leakage: create a competency as Tenant A, query as Tenant B → must not be returned.
- Coverage endpoint returns expected shape for a synthetic tenant with a known seed.

### Browser

This stage is API-only, but you can exercise the `/scheduling/competency-coverage` page on prod to confirm it still loads (the frontend hasn't been rebuilt yet; it may render incorrectly because it expects the old shape, but it must not crash — backward compatibility check).

If the page crashes due to the shape change, treat it as expected and document it in the log under "Known follow-ups" with a note referencing Stage 4, which will rebuild the frontend to match.

### Coverage

Ratchet coverage up where it improved; never down.

## Acceptance criteria

- [x] Zod schemas updated; DTO re-exports match.
- [x] All routes accept/return `class_id`; `is_primary` gone everywhere.
- [x] Coverage endpoint per-class.
- [x] RLS leakage test passes.
- [x] type-check + lint clean; DI OK.
- [x] Prod smoke shows correct JSON shape.
- [x] Local commit; nothing pushed.
- [x] Completion entry appended.

## If something goes wrong

- **Prisma P2002 on existing rows after deploy**: if any NHQS row already exists with a `class_id` that matches the new tightened unique constraint, Stage 1's uniqueness added `class_id` so this should be fine. If you see P2002, it's a Stage 1 regression — stop and investigate.
- **Coverage endpoint returns no rows on prod**: check that the new query joins classes correctly. NHQS has 16 classes across 9 year groups; you should see 16 × (number of curriculum subjects for that year) rows.
- **Frontend competencies page errors**: expected until Stage 4 — document it; do not attempt to fix the frontend in this stage.
