# Schema Change Playbook

> **Purpose**: A step-by-step process for safely making Prisma schema changes in this codebase. Follow this playbook for every migration — additive or destructive.
> **Last verified**: 2026-04-01

---

## Rule Zero: Read Before Writing

A Prisma migration cannot be undone once applied to production. Read this entire playbook before writing a single line of schema change.

---

## Step 1: Ownership Impact Analysis

### 1a. Identify the owning module

Find which NestJS module owns the table being changed:

```bash
# Find the model name in the Prisma schema
grep -n "model YourModel" packages/prisma/schema.prisma

# Find which service directly creates/updates rows in this table
grep -r "prisma\.yourModel\.(create|update|upsert|delete)" apps/api/src/ --include="*.ts" -l
```

This is the **owning module** — the one most likely to break from a schema change.

### 1b. Check the blast-radius map

Open [`architecture/module-blast-radius.md`](module-blast-radius.md) and:

- Find the owning module's entry
- Read its "Cross-module Prisma-direct reads" section
- Identify every other module listed as consuming this table

### 1c. Grep for ALL consumers — do not trust the module graph alone

The NestJS module import graph does NOT capture Prisma-direct reads. Always grep:

```bash
# Use the Prisma model name (PascalCase) and table name (snake_case)
grep -r "prisma\.yourModel\b" apps/api/src/ --include="*.ts" -l
grep -r "prisma\.your_table" apps/api/src/ --include="*.ts" -l
grep -r "yourModel" apps/worker/src/ --include="*.ts" -l
```

Record every file that references the model. These are all at risk.

---

## Step 2: Cross-Module Read Impact Assessment

For each file found in Step 1c, determine:

1. **What columns does this consumer select?** If it uses `select: { ... }`, your new column is invisible and safe. If it uses no `select` (returns full model), your new column is included automatically.
2. **Does the consumer destructure the result with a known shape?** If yes, adding an optional column is safe. Renaming or removing a column will break this consumer.
3. **Does the consumer pass the result to a Zod schema or TypeScript type?** If yes, the type definition must also be updated.

---

## Step 3: High-Exposure Tables — Extra Caution Required

These tables are queried directly by the highest number of modules. Any schema change to them has the widest blast radius. See [`architecture/danger-zones.md`](danger-zones.md) DZ-02 for full context.

| Table                                                                       | Direct consumers (non-owning modules)                                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `staff_profiles`                                                            | Payroll, scheduling, attendance, classes, reports, dashboard, SEN, regulatory                                                         |
| `students`                                                                  | Attendance, gradebook, report cards, finance, admissions, reports, behaviour, SEN, pastoral, regulatory, parent-daily-digest (worker) |
| `classes` / `class_enrolments`                                              | Gradebook, attendance, scheduling, report cards, parent-daily-digest (worker), SEN, behaviour                                         |
| `academic_periods` / `academic_years`                                       | Gradebook, report cards, scheduling, promotion, attendance, SEN, homework, behaviour                                                  |
| `invoices` / `payments`                                                     | Finance reports, dashboard, parent portal, parent-daily-digest (worker)                                                               |
| `attendance_records` / `attendance_sessions` / `daily_attendance_summaries` | Reports, dashboard, gradebook risk detection, parent-daily-digest (worker), regulatory                                                |

If you are changing any of these tables, grep across the ENTIRE codebase — not just the owning module.

---

## Step 4: RLS Implications

### New table

Every new tenant-scoped table requires an RLS policy. Add it to `packages/prisma/rls/post_migrate.sql`:

```sql
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {table_name} FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS {table_name}_tenant_isolation ON {table_name};
CREATE POLICY {table_name}_tenant_isolation ON {table_name}
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

Never forget `FORCE ROW LEVEL SECURITY` — without it, the table owner bypasses the policy.

### Adding `tenant_id` to an existing table

If a table previously lacked `tenant_id` and you are adding it:

1. Add the column as nullable first (so existing rows don't fail a NOT NULL constraint)
2. Backfill all rows with the correct `tenant_id` before making it NOT NULL
3. Add the RLS policy after backfill
4. Apply `FORCE ROW LEVEL SECURITY`

This requires a multi-step migration — see Step 6.

### Changing a column type

Verify the RLS policy still compiles after the type change. For UUID columns, `::uuid` cast must remain valid. Run:

```sql
EXPLAIN SELECT * FROM {table_name} WHERE tenant_id = current_setting('app.current_tenant_id')::uuid;
```

### Special case: tables without `tenant_id`

Only two tables in this codebase intentionally have no `tenant_id`:

- `users` (platform-level, guarded at the application layer)
- `survey_responses` (anonymity-by-design — see DZ-27 in `danger-zones.md`)

Any other table missing `tenant_id` is a security breach. Do not create new exceptions without explicit architectural approval.

---

## Step 5: Migration Safety Classification

### Additive changes (low risk)

These are safe to apply without downtime:

- Adding a nullable column
- Adding a column with a `DEFAULT` value
- Adding a new table
- Adding an index
- Adding a new enum value (append only — never remove or rename existing values)

**Requirement**: The existing application code must work correctly with the new schema even before the application is redeployed (backward compatibility). A new nullable column satisfies this.

### Destructive changes (high risk)

These require a multi-step migration strategy:

- Dropping a column
- Renaming a column or table
- Changing a column type
- Removing an enum value
- Changing a `NOT NULL` constraint (either direction)
- Dropping a table

For destructive changes, use the multi-step approach in Step 6.

---

## Step 6: Multi-Step Migration Strategy (Destructive Changes)

Never apply a destructive change in a single migration to a live production system. Use the expand/contract pattern:

### Step A — Expand (deploy 1)

Add the new state alongside the old:

- Add the new column / new table / new enum value
- Keep the old column / table / enum value intact
- Update application code to write to BOTH old and new
- Deploy

### Step B — Backfill

Migrate existing data from old to new format. Run as a script or migration with no downtime:

```bash
UPDATE {table} SET new_column = old_column WHERE new_column IS NULL;
```

### Step C — Cutover (deploy 2)

Update application code to read from the new column/table only. Remove writes to the old. Deploy.

### Step D — Contract (deploy 3)

Remove the old column / table / enum value after confirming no application code references it:

```bash
grep -r "old_column_name" apps/ packages/ --include="*.ts"
# Zero results = safe to drop
```

### Example: Renaming `staff_profiles.full_name` to `staff_profiles.display_name`

1. Deploy 1: Add `display_name` column, update writes to set both `full_name` and `display_name`
2. Backfill: `UPDATE staff_profiles SET display_name = full_name WHERE display_name IS NULL`
3. Deploy 2: Update all reads to use `display_name`. Stop writing to `full_name`.
4. Deploy 3: Drop `full_name` column.

---

## Step 7: Backward Compatibility Check

Before deploying a schema change, answer both questions:

**Can the OLD code run against the NEW schema?**

- This matters during the deployment window when the database is updated but the app is not yet restarted
- Additive changes (new column with default): Yes, old code ignores the column
- Renaming a column: No — old code references the old name. Requires multi-step migration.

**Can the NEW code run against the OLD schema?**

- This matters if you need to roll back the application without reverting the migration
- Only possible if the new code treats the new column as optional

Both answers must be "yes" for a zero-downtime deployment to be safe. If either is "no", plan for a maintenance window or use the multi-step approach.

---

## Step 8: Rollback Plan

Write a rollback plan BEFORE applying the migration. A rollback plan contains:

1. **Migration reversal SQL**: The exact `DOWN` SQL to undo the change. Test it in a local database first.
2. **Application rollback**: The `git revert` or tag to redeploy the previous application version.
3. **Data safety**: If the migration backfilled or transformed data, how do you restore the original values? (Backup required before running destructive migrations.)
4. **Time limit**: How long will you monitor before declaring the migration successful? What error rate triggers an automatic rollback?

Example rollback plan for adding a column:

```sql
-- Rollback: remove the added column
ALTER TABLE staff_profiles DROP COLUMN IF EXISTS preferred_name;
```

Example rollback plan for a multi-step rename (mid-migration):

```sql
-- If rolled back at Step B (backfill complete, reads not yet switched):
-- No SQL needed — old column still exists, old code still reads it.
-- Revert application code to Deploy 1 version.
```

---

## Step 9: Post-Deploy Verification

After applying the migration and deploying:

- [ ] `prisma migrate status` shows the new migration as applied
- [ ] No application startup errors in PM2 logs
- [ ] The new column/table is queryable: run a `SELECT` from the Prisma REPL or psql
- [ ] RLS policy is active: `SELECT relrowsecurity FROM pg_class WHERE relname = '{table_name}'` returns `true`
- [ ] All existing automated tests pass in CI for the affected package
- [ ] Spot-check the affected API endpoint(s) manually in production

---

## Checklist Summary (Copy into PR)

---BEGIN---

### Schema Change Verification

- [ ] Owning module identified
- [ ] All direct consumers grepped across the full codebase (`apps/api/`, `apps/worker/`)
- [ ] Each consumer assessed for column selection scope (full model vs explicit select)
- [ ] High-exposure table checklist reviewed if applicable (`staff_profiles`, `students`, `classes`, `academic_periods`, `invoices`, `attendance_records`)
- [ ] RLS implications assessed:
  - [ ] New table: RLS policy added to `post_migrate.sql` with `FORCE ROW LEVEL SECURITY`
  - [ ] Existing table: RLS policy verified to still work after change
- [ ] Migration classified as additive (low risk) or destructive (high risk)
- [ ] If destructive: multi-step expand/contract plan written and followed
- [ ] Backward compatibility confirmed: old code works with new schema during deploy window
- [ ] Rollback plan written and reviewed
- [ ] Post-deploy verification items checked

---END---
