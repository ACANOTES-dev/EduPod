# Implementation 01 — Schema Foundation

> **Wave:** 1 (serial — runs alone)
> **Classification:** schema
> **Depends on:** nothing
> **Deploys:** migration + API + worker + web restart

---

## Goal

Lay down the database and shared-type foundation every other implementation depends on: the `households.household_number` + `students_counter` columns, the `applications.household_id` + `submission_batch_id` + `is_sibling_application` columns, the shared Zod schemas for the new multi-student application payload and the household lookup endpoint, and a shared constants file that codifies the household-number format (6 chars, 3 letters + 3 digits, max 99 students per household).

Nothing in this impl runs business logic — it's a pure schema + types drop. Everything downstream is unblocked the moment this ships.

## Shared files this impl touches

- `packages/prisma/schema.prisma` — new columns on `Household` and `Application`. Edit in the final commit window.
- `packages/prisma/migrations/<timestamp>_add_household_numbers/migration.sql` — new migration file. Owns this path, no conflict.
- `packages/prisma/rls/post_migrate.sql` — no changes needed (RLS on households/applications is already in place). If the impl discovers missing policies, add them here alongside the migration.
- `packages/shared/src/schemas/application.schema.ts` — replaces `createPublicApplicationSchema` with the new multi-student shape. Edit in the final commit window.
- `packages/shared/src/schemas/household.schema.ts` — adds `publicHouseholdLookupSchema`. Owns this file.
- `packages/shared/src/households/household-number.ts` — new constants + regex. Owns this file.
- `packages/shared/src/index.ts` — re-export the new `households/household-number` module. Edit in the final commit window.
- `IMPLEMENTATION_LOG.md` — status flips + completion record. Always in a separate commit.

## What to build

### Sub-step 1: Shared constants

Create `packages/shared/src/households/household-number.ts`:

```ts
// Household number format constants — the single source of truth for both
// generation and validation. Any code that generates or parses a household
// number must import from here.

export const HOUSEHOLD_NUMBER_LENGTH = 6;

/**
 * Three uppercase letters followed by three digits, no separators.
 * Example: XYZ476, MKL021, BPQ839.
 * The alphabetic prefix and numeric suffix are intentional — they make the
 * identifier read as a "code" rather than a phone number or address, and they
 * give a large enough address space (17,576,000 values) that enumeration is
 * infeasible when combined with the parent-email check on the public lookup
 * endpoint.
 */
export const HOUSEHOLD_NUMBER_PATTERN = /^[A-Z]{3}[0-9]{3}$/;

/**
 * Hard cap on students per household. 99 is already absurd; no real family
 * will hit this, so exceeding it is treated as a programming error rather
 * than a user-facing flow.
 */
export const HOUSEHOLD_MAX_STUDENTS = 99;

/**
 * Zero-padded per-household student index width. Always 2 digits. A household
 * with one student shows `-01`, not `-1`.
 */
export const HOUSEHOLD_STUDENT_INDEX_WIDTH = 2;

/**
 * Maximum retries when generating a fresh household number. If we fail to
 * find an unused value after this many attempts inside the same tenant, we
 * throw — but statistically we should hit it in 1 attempt nearly always
 * because the collision probability in a 17.5M space is microscopic.
 */
export const HOUSEHOLD_NUMBER_GENERATION_MAX_ATTEMPTS = 8;

export function isValidHouseholdNumber(value: string): boolean {
  return HOUSEHOLD_NUMBER_PATTERN.test(value);
}

export function formatStudentNumberFromHousehold(householdNumber: string, index: number): string {
  return `${householdNumber}-${String(index).padStart(HOUSEHOLD_STUDENT_INDEX_WIDTH, '0')}`;
}
```

Spec file `packages/shared/src/households/household-number.spec.ts` — exhaustive regex tests, formatter round-trips, invalid-format rejections.

### Sub-step 2: Migration + Prisma schema

Create `packages/prisma/migrations/<YYYYMMDDHHMMSS>_add_household_numbers/migration.sql`:

```sql
-- Household numbers — random 6-char (3 letters + 3 digits) per-tenant identifier.
ALTER TABLE households
  ADD COLUMN household_number VARCHAR(6),
  ADD COLUMN student_counter INTEGER NOT NULL DEFAULT 0;

-- Unique within tenant; null allowed (existing households are grandfathered).
CREATE UNIQUE INDEX households_tenant_id_household_number_key
  ON households (tenant_id, household_number)
  WHERE household_number IS NOT NULL;

-- Format guard — prevents bad rows from sneaking in via raw SQL or admin
-- tools. The app always generates matching values.
ALTER TABLE households
  ADD CONSTRAINT households_household_number_format_ck
  CHECK (household_number IS NULL OR household_number ~ '^[A-Z]{3}[0-9]{3}$');

-- Applications — link to a household (nullable for new-household batches
-- until approval materialises the household) + submission batch + cached
-- sibling priority.
ALTER TABLE applications
  ADD COLUMN household_id UUID REFERENCES households(id) ON DELETE SET NULL,
  ADD COLUMN submission_batch_id UUID,
  ADD COLUMN is_sibling_application BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_applications_tenant_id_household_id
  ON applications (tenant_id, household_id)
  WHERE household_id IS NOT NULL;

CREATE INDEX idx_applications_tenant_id_submission_batch_id
  ON applications (tenant_id, submission_batch_id)
  WHERE submission_batch_id IS NOT NULL;

-- Gate index for tiered FIFO auto-promotion.
CREATE INDEX idx_applications_auto_promotion_tiered
  ON applications (tenant_id, target_academic_year_id, target_year_group_id, is_sibling_application DESC, apply_date ASC)
  WHERE status = 'waiting_list';
```

Update `packages/prisma/schema.prisma`:

```prisma
model Household {
  // existing fields...
  household_number   String?  @db.VarChar(6)
  student_counter    Int      @default(0)

  applications       Application[] @relation("HouseholdApplications")

  @@unique([tenant_id, household_number], map: "households_tenant_id_household_number_key")
}

model Application {
  // existing fields...
  household_id            String?  @db.Uuid
  submission_batch_id     String?  @db.Uuid
  is_sibling_application  Boolean  @default(false)

  household               Household? @relation("HouseholdApplications", fields: [household_id], references: [id])

  @@index([tenant_id, household_id], map: "idx_applications_tenant_id_household_id")
  @@index([tenant_id, submission_batch_id], map: "idx_applications_tenant_id_submission_batch_id")
}
```

Run `pnpm --filter @school/prisma prisma generate` to refresh the client.

### Sub-step 3: Rewrite `createPublicApplicationSchema`

Edit `packages/shared/src/schemas/application.schema.ts`:

```ts
const publicApplicationStudentSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  middle_name: z.string().trim().max(100).optional(),
  last_name: z.string().trim().min(1).max(100),
  date_of_birth: z.string().date(),
  gender: z.enum(['male', 'female']),
  national_id: z.string().trim().min(1).max(100),
  target_academic_year_id: z.string().uuid(),
  target_year_group_id: z.string().uuid(),
  medical_notes: z.string().max(5000).optional(),
  has_allergies: z.boolean().optional(),
});

const publicHouseholdPayloadSchema = z.object({
  parent1_first_name: z.string().trim().min(1).max(100),
  parent1_last_name: z.string().trim().min(1).max(100),
  parent1_email: z.string().email(),
  parent1_phone: z.string().trim().min(5).max(40),
  parent1_relationship: z.string().trim().min(1).max(50),
  parent2_first_name: z.string().trim().max(100).optional(),
  parent2_last_name: z.string().trim().max(100).optional(),
  parent2_email: z.string().email().optional(),
  parent2_phone: z.string().trim().max(40).optional(),
  parent2_relationship: z.string().trim().max(50).optional(),
  address_line_1: z.string().trim().min(1).max(200),
  address_line_2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  country: z.string().trim().length(2),
  postal_code: z.string().trim().max(20).optional(),
  emergency_name: z.string().trim().max(200).optional(),
  emergency_phone: z.string().trim().max(40).optional(),
  emergency_relationship: z.string().trim().max(50).optional(),
});

export const createPublicApplicationSchema = z
  .object({
    mode: z.enum(['new_household', 'existing_household']),
    form_definition_id: z.string().uuid(),
    existing_household_id: z.string().uuid().optional(),
    household_payload: publicHouseholdPayloadSchema.optional(),
    students: z.array(publicApplicationStudentSchema).min(1).max(20),
    website_url: z.string().optional(), // honeypot
    consents: consentCaptureSchema.default({
      health_data: false,
      whatsapp_channel: false,
      ai_features: {
        ai_grading: false,
        ai_comments: false,
        ai_risk_detection: false,
        ai_progress_summary: false,
      },
    }),
  })
  .refine((v) => (v.mode === 'new_household' ? v.household_payload !== undefined : true), {
    path: ['household_payload'],
    message: 'household_payload is required for new_household mode',
  })
  .refine(
    (v) =>
      v.mode === 'existing_household'
        ? v.existing_household_id !== undefined && v.household_payload === undefined
        : true,
    {
      path: ['existing_household_id'],
      message:
        'existing_household_id is required for existing_household mode and household_payload must be omitted',
    },
  );

export type CreatePublicApplicationDto = z.infer<typeof createPublicApplicationSchema>;
export type PublicApplicationStudent = z.infer<typeof publicApplicationStudentSchema>;
export type PublicHouseholdPayload = z.infer<typeof publicHouseholdPayloadSchema>;
```

The old single-student shape is gone. The only callers today are the public apply form and the admissions e2e tests — both are updated downstream (impl 03, 06).

### Sub-step 4: Household lookup schema

Create (or edit if exists) `packages/shared/src/schemas/household.schema.ts`:

```ts
import { z } from 'zod';

import { HOUSEHOLD_NUMBER_PATTERN } from '../households/household-number';

export const publicHouseholdLookupSchema = z.object({
  tenant_slug: z.string().trim().min(1).max(100),
  household_number: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      HOUSEHOLD_NUMBER_PATTERN,
      'Household number must be 3 uppercase letters followed by 3 digits',
    ),
  parent_email: z.string().email().toLowerCase(),
});

export type PublicHouseholdLookupDto = z.infer<typeof publicHouseholdLookupSchema>;

export interface PublicHouseholdLookupResult {
  household_id: string;
  household_number: string;
  household_name: string;
  active_student_count: number;
}
```

### Sub-step 5: Barrel exports

Update `packages/shared/src/index.ts` (or the households subfolder index if one exists) to export:

```ts
export * from './households/household-number';
export {
  publicHouseholdLookupSchema,
  type PublicHouseholdLookupDto,
  type PublicHouseholdLookupResult,
} from './schemas/household.schema';
```

### Sub-step 6: Unit tests for shared types

- `packages/shared/src/households/household-number.spec.ts` — regex match/no-match, formatter with index 0, 1, 10, 99; reject 100.
- `packages/shared/src/schemas/application.schema.spec.ts` — happy-path new_household + existing_household submissions; reject mode/payload mismatches; reject students=[] and students > 20; reject bad UUIDs.

### Sub-step 7: Stub admissions service spec files for Waves 2+

Leave the existing `admissions/*.spec.ts` files alone but add `describe.skip` shells pointing to the Wave 2 impl that will rewrite them, mirroring how impl 01 of new-admissions handled it. This prevents half-written specs from breaking CI.

## Tests

- `household-number.spec.ts`: format, pad, round-trip, regex edge cases
- `application.schema.spec.ts`: new schema happy paths + refine failure paths
- `household.schema.spec.ts`: lookup DTO validation (uppercase coercion, email lowercase coercion, bad patterns)
- Regression: `pnpm turbo run test --filter=@school/shared` must pass

## Watch out for

- The unique index on `(tenant_id, household_number)` is PARTIAL (`WHERE household_number IS NOT NULL`). A non-partial unique would conflict with the many existing households that have NULL. Postgres treats NULL as distinct under unique indexes, but making the partial-index intent explicit is cleaner.
- The `CHECK` constraint on `household_number` regex format is defence in depth — the app generator always matches the regex, but if someone ever runs raw SQL to backfill, this blocks garbage from sneaking in.
- The `is_sibling_application` column is DENORMALISED. It is set at submission time by impl 03 and never re-evaluated. Do not call it "the current sibling status" — it is a submission-time snapshot.
- Do not run `prisma migrate dev` on production. Use `prisma migrate deploy` via `pnpm --filter @school/prisma migrate:deploy`. `migrate dev` prompts for a reset.
- The Zod `.refine()` calls use path-scoped error keys so the frontend form library can bind errors to the right field. Don't use unscoped `.refine()` — the errors won't attach to anything.
- `z.string().date()` requires a full ISO date string `YYYY-MM-DD`. Make sure the public form sends the HTML `<input type="date">` value as-is.

## Deployment notes

Full restart because the Prisma client regeneration touches API, worker, and web:

1. Commit locally, push patch, apply on prod.
2. `pnpm --filter @school/prisma migrate:deploy`
3. `pnpm --filter @school/prisma generate`
4. `pnpm turbo run build --filter=@school/api --force`
5. `pnpm turbo run build --filter=@school/worker --force`
6. `pnpm turbo run build --filter=@school/web --force`
7. `pm2 restart api worker web --update-env`
8. Smoke test: `curl /api/v1/healthz` → 200, PM2 all green, no log errors on startup.

Log flips to `completed` in a separate commit after verification.
