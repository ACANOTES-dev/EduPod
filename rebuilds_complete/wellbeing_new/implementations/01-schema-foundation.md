# Implementation 01 — Schema Foundation + Default Seeds

> **Wave:** 1 (serial — every other impl reads against these tables and seeds)
> **Classification:** schema
> **Depends on:** nothing
> **Deploys:** migration + API + worker + web restart (touches shared types, every service rebuilds)

---

## Goal

Land every new database object the wellbeing rebuild needs in a single coordinated migration: the `tenant_ai_flags` table, the comprehensive default behaviour categories seed, the `early_warning_settings` default-init for the per-domain config, the wellbeing-events notification channel preferences extension on `tenant_notification_preferences`, and the new permission constants. Wire the `TenantsService.createTenant` hook so every new tenant lands with working defaults — no admin should ever stare at "no categories configured" again.

Zero business logic, zero new endpoints. This impl is the foundation Waves 2–6 read against.

## Shared files this impl touches

- `packages/prisma/schema.prisma` — add `TenantAiFlag` model + extend `tenant_notification_preferences` with `wellbeing_channels` JSONB column. Edit early; this is your impl's primary footprint.
- `packages/prisma/migrations/<timestamp>_wellbeing_foundation/migration.sql` — new migration directory. Yours alone.
- `packages/prisma/post_migrate.sql` — append RLS policies for `tenant_ai_flags`. Edit late, just before the migration commit.
- `packages/prisma/rls/policies.sql` — mirror the same RLS policy. Edit late.
- `packages/prisma/src/wellbeing-defaults.ts` — NEW. Yours alone. Exports `seedWellbeingDefaultsForTenant(tenantId, prisma)` — used by both the seeded migration and the `TenantsService.createTenant` hook.
- `packages/prisma/seed.ts` (or whichever file is the global seeder) — call `seedWellbeingDefaultsForTenant` for each tenant. Edit in the final commit window.
- `packages/prisma/seed/system-roles.ts` — add 4 new permission constants (`ai_flag.manage`, `wellbeing.view_dashboard`, `safeguarding.dedicated_view`, `wellbeing_notifications.configure`). Edit in the final commit window.
- `apps/api/src/modules/tenants/tenants.service.ts` — call `seedWellbeingDefaultsForTenant(tenant.id, prisma)` inside the create-tenant transaction. Edit in the final commit window.
- `packages/shared/src/wellbeing/index.ts` — NEW barrel for shared types: `TenantAiFlag` Zod schema + types, `WellbeingChannelPreferences` schema + types, default category seed const re-export. Yours alone.
- `packages/shared/package.json` — add `./wellbeing` subpath export. Edit late.
- `IMPLEMENTATION_LOG.md` — status flips + completion record. **Always in a separate commit, after all other commits.**

Hot-zone severity: **medium.** Most edits are in your own files. The shared files (`schema.prisma`, `seed/system-roles.ts`, `tenants.service.ts`) are touched by very few other impls; coordinate via final-commit window discipline.

## What to build

### 1. Prisma schema additions (`packages/prisma/schema.prisma`)

#### 1a. `TenantAiFlag`

```prisma
model TenantAiFlag {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id  String   @db.Uuid
  module_key String   @db.VarChar(64)
  enabled    Boolean  @default(false)
  updated_at DateTime @default(now()) @updatedAt @db.Timestamptz()
  updated_by String?  @db.Uuid

  tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@unique([tenant_id, module_key], map: "uq_tenant_ai_flags_tenant_module")
  @@index([tenant_id], map: "idx_tenant_ai_flags_tenant")
  @@map("tenant_ai_flags")
}
```

`module_key` values used in code: `behaviour`, `pastoral`, `staff_wellbeing`, `early_warning`. Consumers pass the value as a string constant; we don't enum it because future modules can register their AI features without a schema change.

#### 1b. Extend `TenantNotificationPreferences`

If the table already exists, add the column. If not, create the table:

```prisma
model TenantNotificationPreferences {
  id                   String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id            String   @unique @db.Uuid
  wellbeing_channels   Json     @default("{\"defaults\": {\"email\": false, \"sms\": false, \"whatsapp\": false}, \"overrides\": {}}") @db.JsonB
  updated_at           DateTime @default(now()) @updatedAt @db.Timestamptz()

  tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@index([tenant_id])
  @@map("tenant_notification_preferences")
}
```

Investigate first: `grep -r "tenant_notification_preferences" packages/prisma/`. If the table exists with a different shape, ADD the column instead of redefining the model. If the column already exists from another module, do not re-add — flag it in the completion record.

#### 1c. Make sure no existing wellbeing tables need touching

**Investigate before assuming you need to create:** the wellbeing umbrella already has 68 Prisma tables. Do not duplicate. Specifically check that the following exist (per the audit's backend-report.md):

- `behaviour_categories` — must exist; we seed defaults into it
- `early_warning_settings` — must exist; we may need to write defaults to it
- `behaviour_houses`, `behaviour_house_memberships` — must exist; recognition wall consumes them

If any are missing in the live schema, STOP and report — the audit may have mis-identified them. Do not guess.

### 2. Migration

Create `packages/prisma/migrations/<YYYYMMDDHHMMSS>_wellbeing_foundation/migration.sql`. Generate it via:

```bash
pnpm --filter @school/prisma exec prisma migrate dev --name wellbeing_foundation --create-only
```

Then **review the generated SQL** and append a data block that idempotently seeds wellbeing defaults for every existing tenant:

```sql
-- Seed wellbeing defaults for every existing tenant (idempotent)
INSERT INTO tenant_ai_flags (id, tenant_id, module_key, enabled, updated_at)
SELECT gen_random_uuid(), t.id, m.module_key, false, now()
FROM tenants t
CROSS JOIN (VALUES ('behaviour'), ('pastoral'), ('staff_wellbeing'), ('early_warning')) AS m(module_key)
ON CONFLICT (tenant_id, module_key) DO NOTHING;

-- Default behaviour categories — only insert if the tenant has zero categories
INSERT INTO behaviour_categories (id, tenant_id, name, slug, polarity, severity, point_value, icon, requires_parent_ack, auto_create_pastoral_concern, converts_to_safeguarding, is_active, sort_order, created_at, updated_at)
SELECT
  gen_random_uuid(), t.id, c.name, c.slug, c.polarity::"BehaviourPolarity", c.severity::"BehaviourSeverity",
  c.point_value, c.icon, c.requires_parent_ack, c.auto_create_pastoral_concern, c.converts_to_safeguarding,
  true, c.sort_order, now(), now()
FROM tenants t
CROSS JOIN (VALUES
  -- Negative — minor (1 pt)
  ('Lateness', 'lateness', 'negative', 'minor', 1, 'Clock', false, false, false, 10),
  ('Uniform', 'uniform', 'negative', 'minor', 1, 'Shirt', false, false, false, 11),
  ('Phone use', 'phone-use', 'negative', 'minor', 1, 'Smartphone', false, false, false, 12),
  ('Out of bounds', 'out-of-bounds', 'negative', 'minor', 1, 'MapPinOff', false, false, false, 13),
  ('Disruption (low)', 'disruption-low', 'negative', 'minor', 1, 'Volume2', false, false, false, 14),
  ('Missed homework', 'missed-homework', 'negative', 'minor', 1, 'BookX', false, false, false, 15),
  ('Disrespect (low)', 'disrespect-low', 'negative', 'minor', 1, 'AlertCircle', false, false, false, 16),
  -- Negative — moderate (3 pt)
  ('Disruption (sustained)', 'disruption-sustained', 'negative', 'moderate', 3, 'AlertOctagon', true, false, false, 20),
  ('Defiance', 'defiance', 'negative', 'moderate', 3, 'X', true, false, false, 21),
  ('Bullying (verbal)', 'bullying-verbal', 'negative', 'moderate', 3, 'MessageSquareX', true, true, false, 22),
  ('Lying / dishonesty', 'lying', 'negative', 'moderate', 3, 'EyeOff', true, false, false, 23),
  ('Damage to property (minor)', 'damage-minor', 'negative', 'moderate', 3, 'Hammer', true, false, false, 24),
  ('Inappropriate language', 'inappropriate-language', 'negative', 'moderate', 3, 'MessageCircleWarning', true, false, false, 25),
  -- Negative — major (5 pt)
  ('Bullying (physical/cyber)', 'bullying-major', 'negative', 'major', 5, 'ShieldAlert', true, true, true, 30),
  ('Theft', 'theft', 'negative', 'major', 5, 'AlertTriangle', true, true, false, 31),
  ('Fighting', 'fighting', 'negative', 'major', 5, 'Swords', true, true, false, 32),
  ('Drug-related concern', 'drug-related', 'negative', 'major', 5, 'PillBottle', true, true, true, 33),
  ('Major property damage', 'damage-major', 'negative', 'major', 5, 'AlertOctagon', true, true, false, 34),
  ('Discrimination / harassment', 'discrimination', 'negative', 'major', 5, 'UserX', true, true, true, 35),
  ('Weapons-related concern', 'weapons', 'negative', 'major', 5, 'AlertTriangle', true, true, true, 36),
  -- Positive — minor (1 pt)
  ('Effort', 'effort', 'positive', 'minor', 1, 'Sparkles', false, false, false, 40),
  ('Helpfulness', 'helpfulness', 'positive', 'minor', 1, 'HandHelping', false, false, false, 41),
  ('Punctuality', 'punctuality', 'positive', 'minor', 1, 'Clock', false, false, false, 42),
  ('Participation', 'participation', 'positive', 'minor', 1, 'Hand', false, false, false, 43),
  -- Positive — moderate (3 pt)
  ('Outstanding work', 'outstanding-work', 'positive', 'moderate', 3, 'Star', false, false, false, 50),
  ('Leadership', 'leadership', 'positive', 'moderate', 3, 'Crown', false, false, false, 51),
  ('Kindness', 'kindness', 'positive', 'moderate', 3, 'Heart', false, false, false, 52),
  ('Improvement', 'improvement', 'positive', 'moderate', 3, 'TrendingUp', false, false, false, 53),
  -- Positive — major (5 pt)
  ('Exceptional achievement', 'exceptional-achievement', 'positive', 'major', 5, 'Trophy', false, false, false, 60),
  ('Acts of integrity', 'integrity', 'positive', 'major', 5, 'Shield', false, false, false, 61),
  ('Community contribution', 'community', 'positive', 'major', 5, 'Users', false, false, false, 62)
) AS c(name, slug, polarity, severity, point_value, icon, requires_parent_ack, auto_create_pastoral_concern, converts_to_safeguarding, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM behaviour_categories bc WHERE bc.tenant_id = t.id
);

-- Default tenant_notification_preferences row for every tenant if missing
INSERT INTO tenant_notification_preferences (id, tenant_id, wellbeing_channels, updated_at)
SELECT gen_random_uuid(), t.id, '{"defaults": {"email": false, "sms": false, "whatsapp": false}, "overrides": {}}'::jsonb, now()
FROM tenants t
ON CONFLICT (tenant_id) DO NOTHING;
```

Adjust enum names (`BehaviourPolarity`, `BehaviourSeverity`) to match the actual Prisma enum names — verify by inspecting `behaviour_categories` columns first.

If `behaviour_categories` columns differ from those listed (`requires_parent_ack`, `auto_create_pastoral_concern`, `converts_to_safeguarding`), drop the missing columns from the INSERT and add them as separate ALTER TABLEs at the top of the migration with safe defaults.

### 3. RLS policies (`packages/prisma/post_migrate.sql` + `packages/prisma/rls/policies.sql`)

Append:

```sql
ALTER TABLE tenant_ai_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_ai_flags FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_ai_flags_tenant_isolation ON tenant_ai_flags;
CREATE POLICY tenant_ai_flags_tenant_isolation ON tenant_ai_flags
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

If `tenant_notification_preferences` does not already have an RLS policy, add one with the same shape.

### 4. `packages/prisma/src/wellbeing-defaults.ts` (NEW)

Export a single function:

```ts
import type { PrismaClient } from '@prisma/client';
import { DEFAULT_BEHAVIOUR_CATEGORIES } from './seed-data/wellbeing-default-categories';

export async function seedWellbeingDefaultsForTenant(
  tenantId: string,
  prisma: PrismaClient,
): Promise<void> {
  // 1. AI flags
  for (const moduleKey of ['behaviour', 'pastoral', 'staff_wellbeing', 'early_warning'] as const) {
    await prisma.tenantAiFlag.upsert({
      where: { tenant_id_module_key: { tenant_id: tenantId, module_key: moduleKey } },
      update: {},
      create: { tenant_id: tenantId, module_key: moduleKey, enabled: false },
    });
  }

  // 2. Behaviour categories — only seed if the tenant has none
  const existingCount = await prisma.behaviourCategory.count({ where: { tenant_id: tenantId } });
  if (existingCount === 0) {
    await prisma.behaviourCategory.createMany({
      data: DEFAULT_BEHAVIOUR_CATEGORIES.map((c) => ({ ...c, tenant_id: tenantId })),
    });
  }

  // 3. Notification preferences — upsert with defaults
  await prisma.tenantNotificationPreferences.upsert({
    where: { tenant_id: tenantId },
    update: {},
    create: {
      tenant_id: tenantId,
      wellbeing_channels: {
        defaults: { email: false, sms: false, whatsapp: false },
        overrides: {},
      },
    },
  });
}
```

Move the category list into `packages/prisma/src/seed-data/wellbeing-default-categories.ts` as an exported const. Same shape as the SQL VALUES list above, but as TypeScript objects so the type system can verify it.

### 5. Permission constants (`packages/prisma/seed/system-roles.ts`)

Add the four new permissions to the catalog:

```ts
{ key: 'ai_flag.manage', description: 'Manage tenant-level AI feature flags', module: 'platform' },
{ key: 'wellbeing.view_dashboard', description: 'View the wellbeing super-hub dashboard', module: 'wellbeing' },
{ key: 'safeguarding.dedicated_view', description: 'Access the dedicated safeguarding sub-hub', module: 'safeguarding' },
{ key: 'wellbeing_notifications.configure', description: 'Configure wellbeing notification channel preferences', module: 'wellbeing' },
```

Map them to roles in the existing role-permission seed:

- `ai_flag.manage` → `school_owner`, `school_principal`
- `wellbeing.view_dashboard` → all staff roles (the super-hub is staff-visible)
- `safeguarding.dedicated_view` → `school_owner`, `school_principal`, `vice_principal`, `designated_safeguarding_lead` (if the role exists; otherwise stop and ask the user)
- `wellbeing_notifications.configure` → `school_owner`, `school_principal`

### 6. `TenantsService.createTenant` hook (`apps/api/src/modules/tenants/tenants.service.ts`)

Locate the `createTenant` (or equivalent) method. Inside its existing transaction, after the tenant row is created and other defaults are seeded, call:

```ts
await seedWellbeingDefaultsForTenant(tenant.id, tx as unknown as PrismaClient);
```

Import from `@school/prisma/wellbeing-defaults` (add the subpath export to `packages/prisma/package.json` if missing).

### 7. Shared types (`packages/shared/src/wellbeing/index.ts` NEW)

```ts
import { z } from 'zod';

export const tenantAiFlagSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  module_key: z.enum(['behaviour', 'pastoral', 'staff_wellbeing', 'early_warning']),
  enabled: z.boolean(),
  updated_at: z.string().datetime(),
  updated_by: z.string().uuid().nullable(),
});
export type TenantAiFlag = z.infer<typeof tenantAiFlagSchema>;

export const wellbeingChannelPreferencesSchema = z.object({
  defaults: z.object({
    email: z.boolean(),
    sms: z.boolean(),
    whatsapp: z.boolean(),
  }),
  overrides: z.record(
    z.string(), // event key
    z.object({
      email: z.boolean().optional(),
      sms: z.boolean().optional(),
      whatsapp: z.boolean().optional(),
    }),
  ),
});
export type WellbeingChannelPreferences = z.infer<typeof wellbeingChannelPreferencesSchema>;

export const WELLBEING_AI_MODULE_KEYS = [
  'behaviour',
  'pastoral',
  'staff_wellbeing',
  'early_warning',
] as const;
export type WellbeingAiModuleKey = (typeof WELLBEING_AI_MODULE_KEYS)[number];
```

Add `./wellbeing` subpath to `packages/shared/package.json` exports.

## Tests

- **Unit:** `seedWellbeingDefaultsForTenant` is idempotent — call twice, assert one set of rows. Build mock prisma; assert upsert calls.
- **Migration smoke:** apply the migration to a fresh DB, count: `behaviour_categories` should be 28 × tenant_count, `tenant_ai_flags` should be 4 × tenant_count, `tenant_notification_preferences` should equal tenant_count.
- **RLS leakage:** authenticate as Tenant B, attempt to read `tenant_ai_flags` rows for Tenant A — expect empty result.
- **Tenant create flow:** `apps/api/src/modules/tenants/tenants.service.spec.ts` — assert `createTenant` triggers `seedWellbeingDefaultsForTenant` exactly once.

## Watch out for

- **Existing tenants with partial categories** — the WHERE NOT EXISTS guard prevents overwriting. But a tenant that has 1 category gets no defaults. Acceptable; flag the user can request "reseed defaults" later.
- **Behaviour category column drift** — verify the actual schema. If the columns named in step 2 don't match, the INSERT will fail mid-migration. Inspect first.
- **`vice_principal` and `designated_safeguarding_lead` role keys** — verify they exist in `system-roles.ts`. If not, STOP and ask before adding a permission to a non-existent role.
- **Tenant onboarding hook** — `TenantsService.createTenant` may already call other seed hooks; add yours in the same pattern, not as a one-off.
- **Subpath export in `@school/prisma`** — Wave 1 is the only impl that should add this. If Waves 2+ try to import from `@school/prisma/wellbeing-defaults` and it 404s, your package.json edit is missing.

## Deployment notes

- Restart targets: API, worker, web (full restart — shared types change).
- Migration: `pnpm db:migrate` then `pnpm db:post-migrate` (the post-migrate is what installs RLS policies).
- Smoke test on production:
  - `psql -c "SELECT count(*) FROM tenant_ai_flags;"` — expect `4 × tenant_count`.
  - `psql -c "SELECT count(*) FROM behaviour_categories WHERE tenant_id = '<NHQS_ID>';"` — expect 28 (or whatever NHQS already had if categories existed before).
  - Visit `/en/settings/behaviour-categories` on NHQS — should show 28 default categories listed. (This is the first visible change to the user — categories appearing in the admin UI.)
- If migration applies but categories don't appear, verify the BehaviourCategory enum values match (`polarity::"BehaviourPolarity"` cast).
