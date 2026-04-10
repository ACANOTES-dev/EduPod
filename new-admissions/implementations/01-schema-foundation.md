# Implementation 01 — Schema Foundation

> **Wave:** 1 (serial, no parallelism — everything depends on this)
> **Depends on:** nothing
> **Deploys:** migration + API + worker + web restart (touches shared types, so every service rebuilds)

---

## Goal

Land every DB and shared-type change the rebuild needs in a single, coordinated migration so that subsequent waves can code against stable types. No business logic in this implementation — just the foundation.

## What to change

### 1. Prisma schema (`packages/prisma/schema.prisma`)

#### 1a. Extend the `ApplicationStatus` enum

Target end state:

```prisma
enum ApplicationStatus {
  submitted
  waiting_list
  ready_to_admit
  conditional_approval
  approved
  rejected
  withdrawn
}
```

Use expand-then-contract:

1. Add the new values (`waiting_list`, `ready_to_admit`, `conditional_approval`). PostgreSQL supports `ALTER TYPE ... ADD VALUE` outside a transaction. Prisma migrations will generate the correct SQL if you use `ADD VALUE` manually.
2. Run a data migration that maps existing rows:
   - `draft → withdrawn` (never got submitted, free up the seat and close out)
   - `under_review → ready_to_admit`
   - `pending_acceptance_approval → ready_to_admit`
   - `accepted → approved`
3. Remove the old values (`draft`, `under_review`, `pending_acceptance_approval`, `accepted`) in a second migration that runs after the row remap. PostgreSQL does not support `ALTER TYPE ... DROP VALUE` directly, so you must rename the old enum, create the new one, alter the column, and drop the old one. Prisma will generate this automatically if you update `schema.prisma` — review the generated migration SQL carefully.

Write two migration files:

- `add_new_admissions_statuses` — adds the three new enum values.
- `remove_legacy_admissions_statuses` — the row remap + enum cleanup.

Both must be idempotent and safe to re-run.

#### 1b. Add `ApplicationWaitingListSubstatus`

```prisma
enum ApplicationWaitingListSubstatus {
  awaiting_year_setup
}
```

#### 1c. Extend the `Application` model

```prisma
model Application {
  // ... existing columns ...
  target_academic_year_id     String?   @db.Uuid
  target_year_group_id        String?   @db.Uuid
  apply_date                  DateTime  @default(now()) @db.Timestamptz()
  payment_amount_cents        Int?
  currency_code               String?   @db.VarChar(3)
  stripe_checkout_session_id  String?   @db.VarChar(255)
  waiting_list_substatus      ApplicationWaitingListSubstatus?
  override_record_id          String?   @db.Uuid

  target_academic_year        AcademicYear? @relation("applications_target_year", fields: [target_academic_year_id], references: [id], onDelete: SetNull)
  target_year_group           YearGroup?    @relation("applications_target_year_group", fields: [target_year_group_id], references: [id], onDelete: SetNull)
  override_record             AdmissionOverride? @relation(fields: [override_record_id], references: [id], onDelete: SetNull)

  @@index([tenant_id, status, target_year_group_id, target_academic_year_id, apply_date], name: "idx_applications_gating")
  @@index([tenant_id, status, payment_deadline], name: "idx_applications_expiry")
}
```

The `apply_date` column is new and defaults to `now()`. For historical rows, backfill with `COALESCE(submitted_at, created_at)` in the migration.

The `payment_amount_cents` column replaces the existing `payment_amount` (Decimal). Do NOT drop `payment_amount` yet — leave it nullable for now and we'll drop it in a later cleanup wave. Backfill `payment_amount_cents = ROUND(payment_amount * 100)::int` where non-null.

The gating index covers the exact lookup the state machine performs in the hot path.

#### 1d. New `AdmissionOverride` model

```prisma
model AdmissionOverride {
  id                    String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id             String   @db.Uuid
  application_id        String   @db.Uuid
  approved_by_user_id   String   @db.Uuid
  expected_amount_cents Int
  actual_amount_cents   Int      @default(0)
  justification         String   @db.Text
  override_type         AdmissionOverrideType
  created_at            DateTime @default(now()) @db.Timestamptz()

  tenant       Tenant      @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  application  Application @relation(fields: [application_id], references: [id], onDelete: Cascade)
  approved_by  User        @relation(fields: [approved_by_user_id], references: [id], onDelete: Restrict)

  @@index([tenant_id, created_at], name: "idx_admission_overrides_tenant_time")
  @@index([application_id], name: "idx_admission_overrides_application")
  @@map("admission_overrides")
}

enum AdmissionOverrideType {
  full_waiver
  partial_waiver
  deferred_payment
}
```

RLS policy — add to `packages/prisma/rls/policies.sql`:

```sql
ALTER TABLE admission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_overrides FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admission_overrides_tenant_isolation ON admission_overrides;
CREATE POLICY admission_overrides_tenant_isolation ON admission_overrides
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

Run `pnpm db:post-migrate` on the server as part of deployment so this policy is actually applied.

#### 1e. Tighten `Class.max_capacity`

Current: `max_capacity Int? @db.SmallInt`
Target: `max_capacity Int @db.SmallInt`

Migration:

```sql
UPDATE classes SET max_capacity = 25 WHERE max_capacity IS NULL;
ALTER TABLE classes ALTER COLUMN max_capacity SET NOT NULL;
```

The value `25` is the default backfill for any historical rows without an explicit capacity. Document this in the migration comment so the tenant knows to review.

### 2. Shared types (`packages/shared/src/`)

#### 2a. Update `constants/application-status.ts`

Replace the existing status list with the seven new values. Export both the runtime constant and the TypeScript union.

```ts
export const APPLICATION_STATUSES = [
  'submitted',
  'waiting_list',
  'ready_to_admit',
  'conditional_approval',
  'approved',
  'rejected',
  'withdrawn',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_WAITING_LIST_SUBSTATUSES = ['awaiting_year_setup'] as const;
export type ApplicationWaitingListSubstatus = (typeof APPLICATION_WAITING_LIST_SUBSTATUSES)[number];
```

Grep the repo for every import of the old enum values and fix them. There will be multiple — the existing state machine, frontend components, tests. For files that are slated to be rewritten in later waves (see the component map in `PLAN.md`), the goal here is just to make them compile against the new types. Minimal touches.

#### 2b. Zod schemas (`packages/shared/src/schemas/application.schema.ts`)

Add:

```ts
export const createPublicApplicationSchema = z.object({
  target_academic_year_id: z.string().uuid(),
  target_year_group_id: z.string().uuid(),
  payload_json: z.record(z.unknown()),
});
export type CreatePublicApplicationDto = z.infer<typeof createPublicApplicationSchema>;
```

If `createPublicApplicationSchema` already exists, extend it to require `target_academic_year_id` and `target_year_group_id`. These were previously inferred from payload string fields; we're now making them first-class.

#### 2c. Tenant settings types

Add to `packages/shared/src/types/tenant-settings.ts` (or wherever tenant setting shapes are typed):

```ts
export interface AdmissionsSettings {
  upfront_percentage: number; // 0..100
  payment_window_days: number; // default 7
  max_application_horizon_years: number; // default 2
  allow_cash: boolean;
  allow_bank_transfer: boolean;
  bank_iban: string | null;
  require_override_approval_role: 'school_owner' | 'school_principal';
}

export const DEFAULT_ADMISSIONS_SETTINGS: AdmissionsSettings = {
  upfront_percentage: 100,
  payment_window_days: 7,
  max_application_horizon_years: 2,
  allow_cash: true,
  allow_bank_transfer: false,
  bank_iban: null,
  require_override_approval_role: 'school_principal',
};
```

### 3. Backend audit trail RLS wiring

Register the new model in `apps/api/src/modules/prisma/prisma.module.ts` exports if that module gates access (most of the project's facades do). Add a basic read facade for `AdmissionOverride` under `apps/api/src/modules/admissions/admission-override.facade.ts` — subsequent waves will use it.

### 4. Frontend compile fixes

Fix any imports of the old `ApplicationStatus` values in `apps/web/src/` that currently break the type-check. Use the narrowest possible change — we're not redesigning pages in this wave. For queue pages that will be deleted in later waves, either stub them with a placeholder or hide them behind a feature flag for now. Suggested approach: rename the current `admissions/page.tsx` to `admissions/_legacy/page.tsx` (not a route, just a parking lot) so the old code still compiles, and let Wave 4 replace the main route.

Actually simpler — since the wave-1 goal is just "tsc passes", replace any old-enum literals with `'ready_to_admit'` or similar so the status-badge components and filter tabs still render. They'll be replaced in Wave 4 anyway.

## Tests

- Migration dry-run locally: `docker compose up postgres`, run migrations, check that old applications get correctly remapped (seed a few test rows with old statuses before running, verify post-migration state).
- Add a Jest spec under `apps/api/src/modules/admissions/migrations.spec.ts` that asserts the state remap logic is idempotent.
- `pnpm turbo run type-check` must pass across all workspaces.
- Existing `apps/api` tests must still pass (the state machine tests will fail — update them minimally to use the new enum values, NOT the old ones. If a test asserts behaviour we're about to rewrite, mark it `test.skip` with a TODO comment pointing to the wave where it will be rewritten).

## Deployment

1. Commit locally.
2. `scp` patch to production.
3. `git am` on the server.
4. Run `pnpm db:migrate` (as `edupod` user), verify migration applied cleanly.
5. Run `pnpm db:post-migrate` so the new RLS policy is installed.
6. `pnpm turbo run build` — full build because shared types changed and everything depends on them.
7. `pm2 restart all --update-env` (api, web, worker).
8. Smoke test: GET `/en/login` → 200, POST to an existing endpoint that reads applications → no 500. If production has zero applications (likely), this is a minimal validation.
9. Update `IMPLEMENTATION_LOG.md`.

## Definition of done

- Prisma migration applied to production.
- `pnpm turbo run type-check` passes.
- `pnpm turbo run test` passes (with documented skips for tests that belong to later waves).
- All three PM2 services online.
- `/en/login`, `/en/dashboard`, `/en/admissions` all return 200 (or redirect to login).
- Completion record added to the log.
