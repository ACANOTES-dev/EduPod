# Stage 5 — Seed NHQS data

**Before you start:** open `../IMPLEMENTATION_LOG.md`. Confirm Stages 1–4 are `complete`. You are about to write data directly to production for the NHQS tenant. Treat every query as high-stakes.

## Purpose

Replace the sparse, legacy competencies data on NHQS with a complete, solver-ready dataset:

- Wipe the existing 122 `teacher_competencies` rows (all obsolete pool entries; partial coverage).
- Seed a full curriculum across every `(year_group, subject)` the school actually teaches.
- Seed pool-level teacher competencies covering every curriculum entry — with pins left blank (solver will pick per-class).
- Seed staff availability: Mon–Fri 08:00–16:00 for all 34 teachers.
- **No room closures, no teacher configs, no preferences** — per the user's explicit instruction we iterate on edge cases later.

After this stage, the prereq check should pass for NHQS and Stage 6 can run a real generation.

## Prerequisites

- Stages 1–4 complete. Critically, the competencies API and UI match the new shape — if Stage 4 isn't done you cannot verify seeded data in the UI.
- Database access to production. Connection details: `ssh root@46.62.244.139 'docker exec -i edupod-postgres-1 psql -U edupod_admin -d school_platformedupod_prod'`.
- Tenant id: `3ba9b02c-0339-49b8-8583-a06e05a32ac5` (NHQS).

## Scope — what to insert

This stage is **data only**. No code changes to any application file. All inserts via SQL heredocs on the server. All inserts respect RLS by explicitly setting `tenant_id` on every row.

### A. Wipe existing competencies

```sql
SET app.current_tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5';
DELETE FROM teacher_competencies
 WHERE tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5';
```

### B. Wipe existing sparse curriculum (will be reseeded)

```sql
DELETE FROM curriculum_requirements
 WHERE tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5';
```

### C. Seed curriculum

The session running this stage must build the curriculum matrix with the user's approval. Proposed default — **do not insert without explicit sign-off from the user in-session**:

| Year group     | Subjects                                                                                                       | Periods/week (each) |
| -------------- | -------------------------------------------------------------------------------------------------------------- | ------------------- |
| Kindergarten   | Arabic, English, Mathematics                                                                                   | 5 each              |
| Junior infants | Arabic, English, Mathematics                                                                                   | 5 each              |
| Senior infants | Arabic, English, Mathematics, Geography                                                                        | 4–5                 |
| 1st class      | Arabic, English, Mathematics, Biology, History, Geography                                                      | 3–5                 |
| 2nd class      | Arabic, English, Mathematics, Biology, History, Geography                                                      | 3–5                 |
| 3rd Class      | Arabic, English, Mathematics, Biology, Chemistry, History, Geography                                           | 3–5                 |
| 4th Class      | Arabic, English, Mathematics, Biology, Chemistry, Physics, History, Geography, Accounting                      | 3–5                 |
| 5th Class      | Arabic, English, Mathematics, Biology, Chemistry, Physics, History, Geography, Business, Economics             | 3–5                 |
| 6th Class      | Arabic, English, Mathematics, Biology, Chemistry, Physics, History, Geography, Business, Economics, Accounting | 3–5                 |

Present this to the user at stage start; they may adjust. Total expected rows: ~50–70.

Insert template (one row at a time, via a single `INSERT ... VALUES (...), (...), (...);` SQL):

```sql
INSERT INTO curriculum_requirements (
  tenant_id, academic_year_id, year_group_id, subject_id,
  min_periods_per_week, max_periods_per_day, preferred_periods_per_week,
  requires_double_period
) VALUES (
  '3ba9b02c-0339-49b8-8583-a06e05a32ac5',
  '<current_academic_year_id>',
  '<year_group_id>',
  '<subject_id>',
  5, 1, 5, false
);
```

Do **not** hardcode UUIDs — use subqueries against `year_groups` and `subjects` by name, scoped to the tenant.

### D. Seed teacher competencies (pool entries only)

For every `(year_group, subject)` in the seeded curriculum, identify the set of teachers qualified to teach that subject, and insert one **pool entry** per qualified teacher:

```sql
INSERT INTO teacher_competencies (
  tenant_id, academic_year_id, staff_profile_id, subject_id, year_group_id,
  class_id
) VALUES (
  '3ba9b02c-0339-49b8-8583-a06e05a32ac5',
  '<current_academic_year_id>',
  '<staff_profile_id>',
  '<subject_id>',
  '<year_group_id>',
  NULL
);
```

The set of qualified teachers per subject must be sourced from the user. Propose a mapping at stage start:

- Approach A (recommended): export the existing 122 rows _before_ the wipe, present as a table, ask user to confirm which to carry forward.
- Approach B: ask user to write the matrix from scratch (slower; more accurate).

Under no circumstances seed competencies based on a guess.

**No pins** in this stage. Every row is `class_id = NULL`. The user can promote pool entries to pins later via the UI.

### E. Seed staff availability

For every staff profile with an active teaching role, insert five availability rows (Mon–Fri). Skip weekends.

```sql
INSERT INTO staff_availability (tenant_id, staff_profile_id, weekday, start_time, end_time)
SELECT '3ba9b02c-0339-49b8-8583-a06e05a32ac5', sp.id, d.weekday, '08:00'::time, '16:00'::time
  FROM staff_profiles sp
 CROSS JOIN (VALUES (1), (2), (3), (4), (5)) AS d(weekday)
 WHERE sp.tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5';
```

(Verify column names — the schema might differ. Use `\d staff_availability` first.)

Expected rows: 34 teachers × 5 days = 170.

## Non-goals

- Do **not** seed `room_closures`, `teacher_scheduling_configs`, `staff_scheduling_preferences`, or `class_scheduling_requirements` — per the user's "no room closures for now; iterate later" instruction.
- Do **not** modify the period grid — it is already populated (359 rows across 9 year groups).
- Do **not** modify break groups — already populated (2 groups, 9 assignments).
- Do **not** touch any application code.
- Do **not** generate a schedule — that is Stage 6.

## Step-by-step

1. Take a snapshot of the current state before any write:
   ```sql
   SELECT 'teacher_competencies' AS t, COUNT(*) FROM teacher_competencies WHERE tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5'
   UNION ALL SELECT 'curriculum_requirements', COUNT(*) FROM curriculum_requirements WHERE tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5'
   UNION ALL SELECT 'staff_availability', COUNT(*) FROM staff_availability WHERE tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5';
   ```
   Record the numbers in the log entry.
2. Export existing competencies in a human-readable form for the user review:
   ```sql
   SELECT sp.first_name, sp.last_name, s.name AS subject, yg.name AS year_group
     FROM teacher_competencies tc
     JOIN staff_profiles sp ON sp.id = tc.staff_profile_id
     JOIN subjects s ON s.id = tc.subject_id
     JOIN year_groups yg ON yg.id = tc.year_group_id
    WHERE tc.tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5'
    ORDER BY yg.display_order, s.name, sp.last_name;
   ```
3. Present the export + the proposed curriculum matrix to the user. **Wait for explicit confirmation before any write.**
4. In a single psql session (so RLS `SET LOCAL` takes effect), run inside a transaction:
   ```sql
   BEGIN;
   SET LOCAL app.current_tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5';
   DELETE FROM teacher_competencies ...;
   DELETE FROM curriculum_requirements ...;
   INSERT INTO curriculum_requirements ...;
   INSERT INTO teacher_competencies ...;
   INSERT INTO staff_availability ...;
   -- run the verification queries from step 5 BEFORE committing
   COMMIT;  -- or ROLLBACK if anything looks wrong
   ```
5. Verification queries **inside the transaction, before COMMIT**:
   - `SELECT COUNT(*) FROM curriculum_requirements WHERE tenant_id = '...';` — matches the expected count.
   - `SELECT yg.name, COUNT(*) FROM curriculum_requirements cr JOIN year_groups yg ON yg.id = cr.year_group_id WHERE cr.tenant_id = '...' GROUP BY yg.name ORDER BY yg.name;` — per-year-group breakdown matches matrix.
   - For every `(year_group, subject)` in curriculum, at least one pool competency exists.
   - For every class in every year group that has curriculum, the prereq check will pass (simulate by hitting `GET /prerequisites` after commit).
   - `SELECT COUNT(*) FROM staff_availability WHERE tenant_id = '...'` — equals 170.
6. COMMIT if all checks pass. Otherwise ROLLBACK, iterate.
7. Confirm prereqs pass on prod:
   ```bash
   curl -H 'cookie: <owner session>' 'https://api.nhqs.edupod.app/api/v1/scheduling-runs/prerequisites?academic_year_id=<id>' | jq .
   ```
   Expected: `{ ready: true, checks: [ ... all passed ... ] }`.
8. Append completion entry to the log.

## Testing requirements

### Unit / integration

None for this stage — no code changes.

### Browser — Playwright (mandatory)

Verify the UI now reflects the seed:

1. Navigate `/en/scheduling` on nhqs. KPI cards should show `Total Slots > 0` and `Completion 0%`.
2. Open `/en/scheduling/competencies`. Pick a year group. Confirm the "All (pool)" tab has pre-ticked cells matching the seeded matrix.
3. Open `/en/scheduling/competency-coverage`. No subject row should have any missing class except where the user deliberately left a gap.
4. Open `/en/scheduling/auto`. The prerequisite checklist should be all green.

Attach snapshot summaries to the log entry.

## Acceptance criteria

- [x] Pre-seed snapshot captured.
- [x] User confirmed the competency matrix before wipe.
- [x] Wipe + seed ran in a single transaction; all verification queries passed **before** commit.
- [x] Post-seed counts match the proposed matrix.
- [x] Prereqs endpoint returns `ready: true` for the active academic year.
- [x] Playwright smoke on competencies + coverage + auto pages.
- [x] Completion entry appended with the exact SQL used (or a pointer to a checked-in file).

## If something goes wrong

- **Prereq endpoint still fails after seed**: check per-class coverage — the Stage 2 check iterates classes, so if curriculum has a subject for a year group but the pool only covers one of two subclasses, it may pass. If it fails, the message should identify the missing class; go back and add pool entries or user-provided pins.
- **RLS blocks inserts** despite `SET LOCAL app.current_tenant_id`: confirm you ran `SET LOCAL` in the same session as the inserts. psql sessions via `-c` are one-shot and can lose the setting.
- **Duplicate key violation on competency insert**: the new unique constraint includes `class_id`. Two pool entries with the same `(teacher, subject, year_group)` and `class_id = NULL` are legal in Postgres (NULLs are distinct for uniqueness) — but the Prisma unique constraint at the _schema_ level enforces them as distinct via the 6-column index, so duplicates across the 5 non-null columns with `class_id = NULL` will still collide. If seeding hits this, your matrix has duplicates; de-dup the input before inserting.
