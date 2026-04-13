# Stage 7 — Substitutes page + table

**Before you start:** open `../IMPLEMENTATION_LOG.md`. Confirm Stages 1–6 are `complete`. Stage 6's log entry should describe a working end-to-end generation; Stage 7 now introduces a parallel table and UI for substitutes so the substitution board regains auto-suggestions.

## Purpose

Create a parallel system to `teacher_competencies` that holds **substitute** teacher competencies at the same granularity. The substitution board (which currently allows only manual picks since cover-teacher.service was deleted in Stage 1) will now pull suggestions from this table.

Crucially: this is **not** about cover/availability on a specific date. It is about "who is qualified to cover for whom in general." The existing `teacher_absences` / `substitution_records` tables handle the date-specific side and are untouched.

## Prerequisites

- Stages 1–6 complete. A working applied schedule exists on NHQS.

## Scope

### Schema

New migration: `packages/prisma/migrations/<timestamp>_add_substitute_teacher_competencies/`

Create `substitute_teacher_competencies` table with **exactly the same shape** as `teacher_competencies` (post-Stage-1):

```prisma
model SubstituteTeacherCompetency {
  id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id           String   @db.Uuid
  academic_year_id    String   @db.Uuid
  staff_profile_id    String   @db.Uuid
  subject_id          String   @db.Uuid
  year_group_id       String   @db.Uuid
  class_id            String?  @db.Uuid
  created_at          DateTime @default(now())  @db.Timestamptz(6)
  updated_at          DateTime @default(now()) @updatedAt @db.Timestamptz(6)

  tenant         Tenant        @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  academic_year  AcademicYear  @relation(fields: [academic_year_id], references: [id], onDelete: Cascade)
  staff_profile  StaffProfile  @relation(fields: [staff_profile_id], references: [id], onDelete: Cascade)
  subject        Subject       @relation(fields: [subject_id], references: [id], onDelete: Cascade)
  year_group     YearGroup     @relation(fields: [year_group_id], references: [id], onDelete: Cascade)
  class          Class?        @relation(fields: [class_id], references: [id], onDelete: Cascade)

  @@unique([tenant_id, academic_year_id, staff_profile_id, subject_id, year_group_id, class_id])
  @@index([tenant_id, class_id])
  @@index([tenant_id, subject_id, year_group_id])
  @@map("substitute_teacher_competencies")
}
```

RLS policy in `packages/prisma/rls/post_migrate.sql`:

```sql
ALTER TABLE substitute_teacher_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE substitute_teacher_competencies FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS substitute_teacher_competencies_tenant_isolation ON substitute_teacher_competencies;
CREATE POLICY substitute_teacher_competencies_tenant_isolation ON substitute_teacher_competencies
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

### Shared Zod schemas

`packages/shared/src/scheduling/substitute-competencies.schemas.ts` — mirror `teacher-competencies.schemas.ts` exactly, with `Substitute` prefixes.

### API module

`apps/api/src/modules/scheduling/substitute-competencies.controller.ts` + `.service.ts` — mirror the structure of `teacher-competencies.*` post-Stage-3.

Routes:

- `GET /v1/scheduling/substitute-competencies` (list with filters mirroring the primary table).
- `POST /v1/scheduling/substitute-competencies`.
- `PATCH /v1/scheduling/substitute-competencies/:id`.
- `DELETE /v1/scheduling/substitute-competencies/:id`.
- `GET /v1/scheduling/substitute-competencies/coverage` (per-class coverage).
- `GET /v1/scheduling/substitute-competencies/suggest` — new endpoint: given `{ class_id, subject_id, date }`, return ranked candidate substitutes. Ranking: teachers with a pin (class_id) rank higher than pool entries; break ties by current cover workload (reuse logic from the deleted `cover-teacher.service` — it's gone but git history has the reference implementation).

Register under `SchedulingModule`: add to `providers`, `controllers`, and `exports` as appropriate.

### Substitution board rewiring

`apps/web/src/app/[locale]/(school)/scheduling/substitutions/page.tsx` — wire the "suggest substitute" UI back in, hitting the new `/suggest` endpoint.

Backend: `apps/api/src/modules/scheduling/substitutions.service.ts` — wherever it was calling the old cover-teacher service before Stage 1 stubbed it out, replace the stub with a call to the new substitute-competencies service's `suggest` method.

### UI page

`apps/web/src/app/[locale]/(school)/scheduling/substitute-competencies/page.tsx` (new) — literal copy of the Stage 4 competencies page but hitting the substitute endpoints and with different titles + i18n keys.

Add a link to the new page from the `/scheduling` hub. Under the "Day-to-day Operations" category → new tile "Substitute Competencies".

### Hub tile

Update `apps/web/src/app/[locale]/(school)/scheduling/page.tsx`:

- Add a new module tile for substitute competencies under "Day-to-day Operations" (or a new "Substitutes" mini-category if the set grows).

### i18n

New translation keys under `scheduling.substituteCompetencies` in en + ar.

## Non-goals

- Do **not** touch downstream readers (teaching-allocations, report-comments). Stage 8.
- Do **not** auto-populate the new table from the existing competencies. It starts empty; the user fills it via the UI.

## Step-by-step

1. Create the Prisma migration + RLS policy. Run `migrate dev` locally. Verify schema on local DB.
2. Add the new Zod schema file in `packages/shared/src/scheduling/`. Re-export from the package's index if there's a barrel.
3. Build the new `SubstituteCompetenciesService` + controller. Factor shared logic with the primary competencies service into a helper if repetition is significant — otherwise duplicate.
4. Wire into `SchedulingModule` (`imports`, `providers`, `controllers`, `exports`). Run DI smoke test.
5. Build the `/suggest` endpoint. Unit-test the ranking.
6. Rewire `substitutions.service.ts` to call `/suggest`.
7. Build the new UI page by copying Stage 4's competencies page and swapping endpoints + i18n. Confirm the "pin vs pool" semantics are visually distinct from the primary competencies page (e.g., amber accent instead of blue) to avoid user confusion.
8. Add hub tile.
9. Update i18n (en + ar).
10. type-check + lint + DI smoke test.
11. Deploy schema migration first: `prisma migrate deploy` on server. Restart api + worker. Then rebuild web, restart web.
12. **Playwright verification** (mandatory — see below).
13. Commit locally, append to the log.

## Testing requirements

### Unit

`apps/api/src/modules/scheduling/substitute-competencies.service.spec.ts`:

- CRUD happy paths with `class_id` null and non-null.
- Uniqueness catches duplicates.
- `/suggest` ranking: with one pin and two pool entries, pin ranks first.
- Workload-based tiebreaker (reuse the deleted cover-teacher logic).

### Integration

`apps/api/test/scheduling/substitute-competencies.e2e-spec.ts`:

- All CRUD endpoints + `/suggest` exercise a full tenant context.
- RLS leakage across tenants.

### Browser — Playwright (mandatory)

1. Navigate `/en/scheduling`. Confirm the new "Substitute Competencies" tile appears.
2. Click through. Confirm the page mirrors the competencies page in structure but visually differentiated.
3. Add a pool entry; refresh; persists.
4. Add a pin; refresh; persists.
5. Navigate to `/en/scheduling/substitutions`. Create a synthetic absence for a teacher whose class has a seeded substitute competency. Click "suggest" — confirm candidates appear with rank order.
6. Confirm the manual-pick flow still works unchanged.
7. RTL pass on locale `ar`.

### Coverage

Ratchet up.

## Acceptance criteria

- [x] New table + RLS policy live on prod.
- [x] New API endpoints respond.
- [x] New UI page loads, creates/pins/deletes.
- [x] Substitution board auto-suggestions work again.
- [x] Hub tile added.
- [x] i18n en + ar.
- [x] Playwright flows pass.
- [x] type-check / lint / DI clean.
- [x] Local commit; nothing pushed.
- [x] Completion entry appended.

## If something goes wrong

- **DI failure on api boot** after module changes — usually a missing provider or import. Re-run the smoke test; examine the exception chain.
- **Substitute suggestions empty even after seeding substitute competencies** — the `/suggest` endpoint probably isn't joining on the live schedule to find _who actually teaches the missed class_. Confirm the suggestion filters by `(subject, class)` competency, not by `(subject, year_group)`.
- **Prisma migration fails** because the foreign key to `classes` requires classes to exist — they do for NHQS; for other tenants with no classes, the migration will still run (no existing rows to validate).
