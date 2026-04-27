# Implementation 01 — Schema Foundation

> **Wave:** 1 (parallelisable with 02 once permission-constant strings are agreed)
> **Depends on:** nothing
> **Restart:** API + worker + web (Prisma client regenerates; shared types ripple)
> **Deployment:** worktree commit only — NO CI, NO PRODUCTION (per IMPLEMENTATION_LOG Rule 5)

---

## 1. Goal

Land every new database table, RLS policy, and enum that the Communications Overhaul needs in a single coordinated migration so Wave 2+ can code against stable types. **Zero business logic** — this implementation is pure foundation. After it lands, the schema is ready for the three credential services (Impl 03), the operational stack (Impls 06–08), and the test-tenant backfill (Impl 13). Eight new tenant-scoped tables, all with `FORCE ROW LEVEL SECURITY` and the canonical `<table>_tenant_isolation` policy. No service code, no controller code, no UI — just `schema.prisma`, the migration directory, the policy mirror, and the RLS leakage test suite.

---

## 2. Pre-flight

Per `.claude/rules/architecture-policing.md`:

1. Read `docs/architecture/pre-flight-checklist.md`.
2. Read `docs/architecture/module-blast-radius.md` — the `communications` module currently consumes notifications + audit; this impl adds the table layer that Wave 2 services will own.
3. Read `docs/architecture/danger-zones.md` — the entry on `TenantStripeConfig` rotation is the closest analogue.
4. Confirm you are on branch `communications-overhaul` in the dedicated worktree.
5. Re-read IMPLEMENTATION_LOG.md §2a (parallel-execution hygiene). Impl 02 may be in flight in the same wave; only `schema.prisma` is shared between us. Claim it under Rule 17 before writing.

---

## 3. What to change

### 3.1 Prisma schema additions (`packages/prisma/schema.prisma`)

Add the eight new models, the five new enums, and the relation back-references on `Tenant` and `User`. Place model definitions in this order, right after the existing `TenantStripeConfig` block (so all credential tables sit together, mirroring the established convention).

#### 3.1a New enums

Place these alongside the other comms enums (`NotificationChannel`, `NotificationStatus` already exist further down the file).

```prisma
enum SuppressionReason {
  hard_bounce
  soft_bounce_threshold
  complaint
  manual
  unsubscribe
}

enum EmailDomainStatus {
  pending
  verified
  failed
}

enum DnsRecordStatus {
  pending
  verified
  failed
}

enum WhatsAppTemplateCategory {
  utility
  marketing
  authentication
}

enum WhatsAppTemplateStatus {
  pending
  submitted
  approved
  rejected
  paused
}
```

PostgreSQL enum values are `snake_case` strings; Prisma enum names are `PascalCase` (per `.claude/rules/prisma.md`).

#### 3.1b New model: `TenantEmailConfig`

```prisma
model TenantEmailConfig {
  id                       String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id                String    @unique @db.Uuid
  resend_api_key_encrypted String    @db.Text
  from_email               String    @db.VarChar(255)
  from_name                String?   @db.VarChar(255)
  reply_to_email           String?   @db.VarChar(255)
  webhook_secret_encrypted String?   @db.Text
  encryption_key_ref       String    @db.VarChar(255)
  key_last_rotated_at      DateTime? @db.Timestamptz()
  is_enabled               Boolean   @default(true)
  last_verified_at         DateTime? @db.Timestamptz()
  created_by_user_id       String?   @db.Uuid
  created_at               DateTime  @default(now()) @db.Timestamptz()
  updated_at               DateTime  @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant     Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  created_by User?  @relation("EmailConfigsCreated", fields: [created_by_user_id], references: [id], onDelete: SetNull)

  @@map("tenant_email_configs")
}
```

`tenant_id` is `@unique` (one config per tenant per channel — same as Stripe). The unique index is sufficient; no separate `idx_` index needed.

#### 3.1c New model: `TenantSmsConfig`

```prisma
model TenantSmsConfig {
  id                           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id                    String    @unique @db.Uuid
  twilio_account_sid_encrypted String    @db.Text
  twilio_auth_token_encrypted  String    @db.Text
  twilio_from_number           String    @db.VarChar(50)
  webhook_secret_encrypted     String?   @db.Text
  encryption_key_ref           String    @db.VarChar(255)
  key_last_rotated_at          DateTime? @db.Timestamptz()
  is_enabled                   Boolean   @default(true)
  last_verified_at             DateTime? @db.Timestamptz()
  created_by_user_id           String?   @db.Uuid
  created_at                   DateTime  @default(now()) @db.Timestamptz()
  updated_at                   DateTime  @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant     Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  created_by User?  @relation("SmsConfigsCreated", fields: [created_by_user_id], references: [id], onDelete: SetNull)

  @@map("tenant_sms_configs")
}
```

#### 3.1d New model: `TenantWhatsAppConfig`

```prisma
model TenantWhatsAppConfig {
  id                           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id                    String    @unique @db.Uuid
  twilio_account_sid_encrypted String    @db.Text
  twilio_auth_token_encrypted  String    @db.Text
  twilio_whatsapp_from_number  String    @db.VarChar(50)
  business_profile_id          String?   @db.VarChar(255)
  webhook_secret_encrypted     String?   @db.Text
  encryption_key_ref           String    @db.VarChar(255)
  key_last_rotated_at          DateTime? @db.Timestamptz()
  is_enabled                   Boolean   @default(true)
  last_verified_at             DateTime? @db.Timestamptz()
  created_by_user_id           String?   @db.Uuid
  created_at                   DateTime  @default(now()) @db.Timestamptz()
  updated_at                   DateTime  @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant     Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  created_by User?  @relation("WhatsAppConfigsCreated", fields: [created_by_user_id], references: [id], onDelete: SetNull)

  @@map("tenant_whatsapp_configs")
}
```

#### 3.1e New model: `NotificationSuppressionList`

```prisma
model NotificationSuppressionList {
  id                String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id         String              @db.Uuid
  channel           NotificationChannel
  recipient_address String              @db.VarChar(320)
  reason            SuppressionReason
  source            String?             @db.VarChar(64)
  notification_id   String?             @db.Uuid
  expires_at        DateTime?           @db.Timestamptz()
  created_at        DateTime            @default(now()) @db.Timestamptz()

  // Relations
  tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@unique([tenant_id, channel, recipient_address], map: "uq_suppression_tenant_channel_recipient")
  @@index([tenant_id, channel, expires_at], map: "idx_suppression_tenant_channel_expiry")
  @@map("notification_suppression_list")
}
```

`recipient_address` uses `VARCHAR(320)` — the RFC 5321 maximum length for an email address (64-char local part + `@` + 255-char domain). Email is the longest of the three values that share this column; phone numbers fit comfortably inside.

`notification_id` is intentionally NOT a foreign key in this migration. The triggering notification may be deleted later (retention policy) and we want the suppression row to survive. Add the cross-reference comment in the migration but skip the FK.

#### 3.1f New model: `TenantEmailDomain`

```prisma
model TenantEmailDomain {
  id                 String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id          String            @db.Uuid
  domain             String            @db.VarChar(255)
  resend_domain_id   String?           @db.VarChar(255)
  status             EmailDomainStatus
  spf_status         DnsRecordStatus
  dkim_status        DnsRecordStatus
  dmarc_status       DnsRecordStatus
  dns_records_json   Json              @db.JsonB
  last_checked_at    DateTime?         @db.Timestamptz()
  verified_at        DateTime?         @db.Timestamptz()
  failure_reason     String?           @db.Text
  created_by_user_id String?           @db.Uuid
  created_at         DateTime          @default(now()) @db.Timestamptz()
  updated_at         DateTime          @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@unique([tenant_id, domain], map: "uq_email_domain_tenant_domain")
  @@index([status, last_checked_at], map: "idx_email_domain_status_check")
  @@map("tenant_email_domains")
}
```

The `idx_email_domain_status_check` index supports the `comms:domain-verification-refresh` cron's "find pending domains older than X minutes" scan that Impl 07 builds.

#### 3.1g New model: `WhatsAppTemplate`

```prisma
model WhatsAppTemplate {
  id                  String                   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id           String                   @db.Uuid
  template_key        String                   @db.VarChar(128)
  twilio_template_sid String?                  @db.VarChar(64)
  template_name       String                   @db.VarChar(128)
  language_code       String                   @db.VarChar(16)
  category            WhatsAppTemplateCategory
  body                String                   @db.Text
  status              WhatsAppTemplateStatus
  approval_message    String?                  @db.Text
  submitted_at        DateTime?                @db.Timestamptz()
  approved_at         DateTime?                @db.Timestamptz()
  last_synced_at      DateTime?                @db.Timestamptz()
  created_at          DateTime                 @default(now()) @db.Timestamptz()
  updated_at          DateTime                 @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@unique([tenant_id, template_key, language_code], map: "uq_whatsapp_template_tenant_key_lang")
  @@index([status, last_synced_at], map: "idx_whatsapp_template_status_sync")
  @@map("whatsapp_templates")
}
```

`idx_whatsapp_template_status_sync` supports the `comms:whatsapp-template-sync` cron's "find submitted templates older than X minutes" scan that Impl 08 builds.

#### 3.1h New model: `WhatsAppServiceWindow`

```prisma
model WhatsAppServiceWindow {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id       String   @db.Uuid
  recipient_phone String   @db.VarChar(50)
  last_inbound_at DateTime @db.Timestamptz()
  expires_at      DateTime @db.Timestamptz()
  created_at      DateTime @default(now()) @db.Timestamptz()
  updated_at      DateTime @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@unique([tenant_id, recipient_phone], map: "uq_whatsapp_window_tenant_recipient")
  @@index([expires_at], map: "idx_whatsapp_window_expiry")
  @@map("whatsapp_service_windows")
}
```

`idx_whatsapp_window_expiry` supports a future cleanup cron (out of scope for Impl 01) that purges expired rows.

#### 3.1i New model: `NotificationWebhookEvent`

```prisma
model NotificationWebhookEvent {
  id                 String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id          String              @db.Uuid
  channel            NotificationChannel
  provider_event_id  String              @db.VarChar(255)
  event_type         String              @db.VarChar(64)
  notification_id    String?             @db.Uuid
  payload_json       Json                @db.JsonB
  signature_verified Boolean
  processed_at       DateTime?           @db.Timestamptz()
  processing_error   String?             @db.Text
  received_at        DateTime            @default(now()) @db.Timestamptz()

  // Relations
  tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@unique([tenant_id, provider_event_id], map: "uq_webhook_tenant_provider_event")
  @@index([tenant_id, channel, received_at(sort: Desc)], map: "idx_webhook_tenant_channel_received")
  @@index([processed_at], map: "idx_webhook_processed_at")
  @@map("notification_webhook_events")
}
```

The `(tenant_id, provider_event_id)` unique constraint enforces idempotent webhook ingestion — Resend / Twilio will retry events on 5xx, and the unique key prevents duplicate processing. `notification_id` is nullable: when signature verification fails the event is logged before notification resolution and never resolves.

#### 3.1j Tenant relation entries (8 new)

Locate the existing `model Tenant {` block and append the eight new back-reference fields. Match the surrounding convention — group with other comms relations.

```prisma
model Tenant {
  // ...existing fields...

  // Communications credentials (Impl 01)
  email_config              TenantEmailConfig?
  sms_config                TenantSmsConfig?
  whatsapp_config           TenantWhatsAppConfig?

  // Communications operational tables (Impl 01)
  email_domains             TenantEmailDomain[]
  whatsapp_templates        WhatsAppTemplate[]
  whatsapp_service_windows  WhatsAppServiceWindow[]
  suppression_list          NotificationSuppressionList[]
  webhook_events            NotificationWebhookEvent[]
}
```

#### 3.1k User relation entries (3 new)

Locate the existing `model User {` block and append three back-references for the `created_by` audit columns. Each uses a named `@relation` to disambiguate (the User model already has dozens of relations — Prisma's generator demands names when there are multiple `User → X` relations through different FKs).

```prisma
model User {
  // ...existing fields...

  // Communications credentials — created_by audit (Impl 01)
  email_configs_created    TenantEmailConfig[]    @relation("EmailConfigsCreated")
  sms_configs_created      TenantSmsConfig[]      @relation("SmsConfigsCreated")
  whatsapp_configs_created TenantWhatsAppConfig[] @relation("WhatsAppConfigsCreated")
}
```

These three names must match the `@relation("...")` strings on the three credential models above. Mismatched names = `prisma format` error.

---

### 3.2 Migration files

#### 3.2a Migration directory

Create exactly one migration directory:

```
packages/prisma/migrations/{YYYYMMDDHHMMSS}_add_tenant_communication_configs_and_operational_tables/
├── migration.sql
└── post_migrate.sql
```

`{YYYYMMDDHHMMSS}` = the actual timestamp at the moment Prisma generates the migration. Use `pnpm --filter @school/prisma exec prisma migrate dev --create-only --name add_tenant_communication_configs_and_operational_tables` to generate the directory and `migration.sql`. Then add `post_migrate.sql` by hand.

Migration name: `add_tenant_communication_configs_and_operational_tables`. Per `.claude/rules/prisma.md` migration-naming convention.

#### 3.2b `migration.sql` contents

Prisma generates this from the schema diff. Verify the generated file contains, in roughly this order:

1. **CREATE TYPE** — five new enums (`SuppressionReason`, `EmailDomainStatus`, `DnsRecordStatus`, `WhatsAppTemplateCategory`, `WhatsAppTemplateStatus`).
2. **CREATE TABLE** — eight new tables in dependency order (the three credential tables don't reference each other, but `notification_suppression_list` references `NotificationChannel` enum which already exists, etc.).
3. **CREATE UNIQUE INDEX** — for each `@@unique` and `@unique tenant_id`.
4. **CREATE INDEX** — for each `@@index`.
5. **ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY** — the tenant FK on every table; the `created_by_user_id` FK on the three credential tables.

If Prisma generates the file with the FKs first, that's fine — the constraints are on the new tables alone. Read the generated file end-to-end before committing it; it should not touch any pre-existing table.

#### 3.2c `post_migrate.sql` contents

Hand-write this file. It contains the eight RLS policy blocks. See §3.3 for the boilerplate.

#### 3.2d Migration runner integration

Confirm the post-migrate runner picks up the new file. The repo already has the convention `migration.sql` + `post_migrate.sql`. The runner script (likely `scripts/post-migrate.sh` or invoked via `pnpm --filter @school/prisma post-migrate`) iterates migration directories alphabetically and runs every `post_migrate.sql` it finds. No changes needed if the script already glob-matches.

---

### 3.3 RLS policy boilerplate

Write the following SQL block in `post_migrate.sql` for `tenant_email_configs`, then **repeat for the other seven tables** with table-name substitution. Eight blocks total. All eight tables have a non-nullable `tenant_id`, so the simple form (no `IS NULL OR` clause) is correct.

```sql
-- =============================================================
-- Communications Overhaul (Impl 01) — RLS Policies
-- =============================================================

-- tenant_email_configs (standard)
ALTER TABLE tenant_email_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_email_configs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_email_configs_tenant_isolation ON tenant_email_configs;
CREATE POLICY tenant_email_configs_tenant_isolation ON tenant_email_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

The remaining seven tables follow the identical pattern. For brevity in this spec, only the table names are listed — the executing session generates the SQL with the same `ALTER … ENABLE / FORCE`, `DROP POLICY IF EXISTS`, `CREATE POLICY` triplet:

- `tenant_sms_configs` → policy `tenant_sms_configs_tenant_isolation`
- `tenant_whatsapp_configs` → policy `tenant_whatsapp_configs_tenant_isolation`
- `notification_suppression_list` → policy `notification_suppression_list_tenant_isolation`
- `tenant_email_domains` → policy `tenant_email_domains_tenant_isolation`
- `whatsapp_templates` → policy `whatsapp_templates_tenant_isolation`
- `whatsapp_service_windows` → policy `whatsapp_service_windows_tenant_isolation`
- `notification_webhook_events` → policy `notification_webhook_events_tenant_isolation`

Policy naming convention: always `<table>_tenant_isolation` per `CLAUDE.md` and `.claude/rules/prisma.md`. **NEVER forget `FORCE ROW LEVEL SECURITY`** — it is the difference between policies that protect against everything and policies that table-owners (the role our connection pool runs as) silently bypass.

---

### 3.4 Mirror policies into `packages/prisma/rls/policies.sql`

`packages/prisma/rls/policies.sql` is the canonical RLS catalogue. Every policy that ships in a migration must also live in this file. Open it and add a new section **at the bottom** (alongside other dated waves):

```sql
-- =============================================================
-- Communications Overhaul (Impl 01) — RLS Policies
-- =============================================================
-- Defined in: packages/prisma/migrations/{timestamp}_add_tenant_communication_configs_and_operational_tables/post_migrate.sql

-- tenant_email_configs (standard)
ALTER TABLE tenant_email_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_email_configs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_email_configs_tenant_isolation ON tenant_email_configs;
CREATE POLICY tenant_email_configs_tenant_isolation ON tenant_email_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ... same block for the remaining 7 tables ...
```

The file uses `-- Defined in: ...` header lines to back-link each block to its migration. Keep that convention.

`policies.sql` is read-only at runtime — it is not executed against the live DB; it is the documentation. The migration's `post_migrate.sql` is what actually runs. **Both files must agree.** Drift between them is a security risk and will be caught by a future audit.

---

### 3.5 AppModule DI smoke (Rule 6)

This impl does not add any new NestJS providers, modules, or imports — only Prisma schema. The Prisma client regenerates on `pnpm install` / `prisma generate`, and existing services that reference `prisma.tenantEmailConfig` (etc.) don't exist yet. So the DI graph is unchanged.

Even so, run the smoke once to confirm the regenerated Prisma client doesn't break compilation of existing service files:

```bash
cd /Users/ram/Desktop/SDB/apps/api && DATABASE_URL=postgresql://x:x@localhost:5432/x \
REDIS_URL=redis://localhost:6379 \
JWT_SECRET=fakefakefakefakefakefakefakefake \
JWT_REFRESH_SECRET=fakefakefakefakefakefakefakefake \
ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
MFA_ISSUER=test PLATFORM_DOMAIN=test.local APP_URL=http://localhost:3000 \
npx ts-node -e "
import { Test } from '@nestjs/testing';
import { AppModule } from './src/app.module';
Test.createTestingModule({ imports: [AppModule] }).compile()
  .then(() => { console.log('DI OK'); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
"
```

If this fails, the most likely cause is a `User`-relation naming collision — verify the three named relations (`EmailConfigsCreated`, `SmsConfigsCreated`, `WhatsAppConfigsCreated`) match exactly between the credential models and the `User` model.

---

## 4. Tests

Co-located RLS leakage spec: `apps/api/test/communications-foundation.rls.spec.ts`. Follow the existing pattern from `apps/api/test/notifications.rls.spec.ts` exactly — it has the helpers (`queryAsTenant`, `mutateAsTenant`), the test-role setup (`SET LOCAL ROLE rls_<test>_user`), the tenant fixtures, and the cleanup convention.

### 4.1 Test scope

One leakage test per table — eight tests minimum. The pattern for each:

1. Create one row as Tenant A (using a privileged setup connection).
2. Set `app.current_tenant_id = TENANT_B_ID` on a fresh transaction.
3. `SELECT *` from the table.
4. Assert: empty result set. Tenant B never sees Tenant A's row.

Mirror this for `tenant_email_configs`, `tenant_sms_configs`, `tenant_whatsapp_configs`, `notification_suppression_list`, `tenant_email_domains`, `whatsapp_templates`, `whatsapp_service_windows`, `notification_webhook_events`.

### 4.2 Test fixtures

Top of file, module-scope:

```typescript
const TENANT_A_ID = 'c5000001-0001-4001-8001-000000000001';
const TENANT_B_ID = 'c5000002-0002-4002-8002-000000000002';
const RLS_TEST_ROLE = 'rls_comms_foundation_test_user';
```

Use IDs that don't collide with other RLS specs. The existing notifications spec uses the `b400…` namespace; pick `c500…` to stay clear.

### 4.3 Test skeleton (single table example — replicate eight times)

```typescript
/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL */
import './setup-env';

import { PrismaClient } from '@prisma/client';

const TENANT_A_ID = 'c5000001-0001-4001-8001-000000000001';
const TENANT_B_ID = 'c5000002-0002-4002-8002-000000000002';
const RLS_TEST_ROLE = 'rls_comms_foundation_test_user';

jest.setTimeout(60_000);

describe('communications foundation — RLS leakage (database layer)', () => {
  let prisma: PrismaClient;

  async function queryAsTenant<T>(tenantId: string, sql: string): Promise<T[]> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', '${tenantId}', true)`);
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${RLS_TEST_ROLE}`);
      const result = await tx.$queryRawUnsafe(sql);
      return result as T[];
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    await prisma.$connect();
    await cleanupTestData();
    await seedTenants();
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe('tenant_email_configs', () => {
    beforeAll(async () => {
      await prisma.$executeRawUnsafe(`
        INSERT INTO tenant_email_configs
          (tenant_id, resend_api_key_encrypted, from_email, encryption_key_ref)
        VALUES
          ('${TENANT_A_ID}'::uuid, 'enc:fake', 'from@a.test', 'v1')
      `);
    });

    it('Tenant B cannot read Tenant A email config rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id FROM tenant_email_configs`,
      );
      expect(rows).toHaveLength(0);
    });

    it('Tenant A can read its own email config row', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_A_ID,
        `SELECT id FROM tenant_email_configs`,
      );
      expect(rows).toHaveLength(1);
    });
  });

  // ... seven more describe() blocks: one per remaining table ...
});

async function seedTenants(): Promise<void> {
  const prisma = new PrismaClient();
  for (const id of [TENANT_A_ID, TENANT_B_ID]) {
    await prisma.tenant.upsert({
      where: { id },
      create: {
        id,
        name: `RLS Comms Foundation Tenant ${id.slice(0, 4)}`,
        slug: `rls-comms-${id.slice(0, 4)}`,
        default_locale: 'en',
        timezone: 'UTC',
        date_format: 'YYYY-MM-DD',
        currency_code: 'USD',
        academic_year_start_month: 9,
        status: 'active',
      },
      update: {},
    });
  }
  await prisma.$disconnect();
}

async function cleanupTestData(): Promise<void> {
  const prisma = new PrismaClient();
  const ids = [TENANT_A_ID, TENANT_B_ID];
  // Delete child rows before tenants
  for (const table of [
    'notification_webhook_events',
    'whatsapp_service_windows',
    'whatsapp_templates',
    'tenant_email_domains',
    'notification_suppression_list',
    'tenant_whatsapp_configs',
    'tenant_sms_configs',
    'tenant_email_configs',
  ]) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM ${table} WHERE tenant_id IN ('${ids[0]}'::uuid, '${ids[1]}'::uuid)`,
    );
  }
  await prisma.$executeRawUnsafe(
    `DELETE FROM tenants WHERE id IN ('${ids[0]}'::uuid, '${ids[1]}'::uuid)`,
  );
  await prisma.$disconnect();
}
```

### 4.4 Test role setup

The `rls_comms_foundation_test_user` role must exist in the local dev DB with the same minimal grants used by the other RLS test roles. Inspect `apps/api/test/notifications.rls.spec.ts` for the exact `CREATE ROLE … GRANT …` snippet — usually the role is created in `apps/api/test/setup-env.ts` or a top-level `beforeAll` in the test file. Match the convention: do not invent a new pattern.

### 4.5 Per-table sample data

Each `describe()` block's `beforeAll` inserts exactly one row for Tenant A in the table under test. Use the minimum-required columns (everything `NOT NULL` without a default). Examples:

| Table                           | Minimal-insert columns                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `tenant_email_configs`          | `tenant_id, resend_api_key_encrypted, from_email, encryption_key_ref`                                                   |
| `tenant_sms_configs`            | `tenant_id, twilio_account_sid_encrypted, twilio_auth_token_encrypted, twilio_from_number, encryption_key_ref`          |
| `tenant_whatsapp_configs`       | `tenant_id, twilio_account_sid_encrypted, twilio_auth_token_encrypted, twilio_whatsapp_from_number, encryption_key_ref` |
| `notification_suppression_list` | `tenant_id, channel, recipient_address, reason`                                                                         |
| `tenant_email_domains`          | `tenant_id, domain, status, spf_status, dkim_status, dmarc_status, dns_records_json`                                    |
| `whatsapp_templates`            | `tenant_id, template_key, template_name, language_code, category, body, status`                                         |
| `whatsapp_service_windows`      | `tenant_id, recipient_phone, last_inbound_at, expires_at`                                                               |
| `notification_webhook_events`   | `tenant_id, channel, provider_event_id, event_type, payload_json, signature_verified`                                   |

For `dns_records_json` and `payload_json`, `'{}'::jsonb` is sufficient.

### 4.6 Optional: WITH CHECK enforcement test

For one table (pick `tenant_email_configs`), add a third test that proves the `WITH CHECK` half of the policy:

```typescript
it('Tenant B cannot insert a row claiming Tenant A ownership', async () => {
  await expect(
    queryAsTenant(
      TENANT_B_ID,
      `INSERT INTO tenant_email_configs (tenant_id, resend_api_key_encrypted, from_email, encryption_key_ref)
       VALUES ('${TENANT_A_ID}'::uuid, 'enc:fake', 'from@a.test', 'v1')`,
    ),
  ).rejects.toThrow(/row.level security/i);
});
```

This catches the easy mistake of writing `USING (...)` without `WITH CHECK (...)`.

---

## 5. Verification (local dev server)

This rebuild has no CI deploy. Verification runs against the local dev DB and the local dev server. Per IMPLEMENTATION_LOG Rule 27a, log the verification block in §5 of the log.

### 5.1 Run the migration locally

```bash
cd /Users/ram/Desktop/SDB
pnpm --filter @school/prisma prisma format
pnpm --filter @school/prisma prisma validate
pnpm --filter @school/prisma exec prisma migrate dev --name add_tenant_communication_configs_and_operational_tables
```

`migrate dev` automatically:

1. Detects the schema drift.
2. Writes the new migration directory.
3. Applies `migration.sql` to the local dev DB.
4. Regenerates `@prisma/client`.

### 5.2 Run post-migrate

```bash
pnpm --filter @school/prisma post-migrate
```

This applies `post_migrate.sql` (the RLS policies) to the local dev DB. If the package does not expose this script, run the file directly:

```bash
psql "$DATABASE_URL" -f packages/prisma/migrations/{timestamp}_add_tenant_communication_configs_and_operational_tables/post_migrate.sql
```

### 5.3 psql column verification (per-table)

Connect to the local dev DB:

```bash
psql "$DATABASE_URL"
```

For each of the eight new tables, run `\d <table>` and confirm the columns match this spec exactly. Example for `tenant_email_configs`:

```sql
\d tenant_email_configs
```

Expected output should list (column, type, nullable, default):

- `id` — `uuid` — `not null` — `gen_random_uuid()`
- `tenant_id` — `uuid` — `not null`
- `resend_api_key_encrypted` — `text` — `not null`
- `from_email` — `character varying(255)` — `not null`
- `from_name` — `character varying(255)` — `null`
- `reply_to_email` — `character varying(255)` — `null`
- `webhook_secret_encrypted` — `text` — `null`
- `encryption_key_ref` — `character varying(255)` — `not null`
- `key_last_rotated_at` — `timestamp with time zone` — `null`
- `is_enabled` — `boolean` — `not null` — `true`
- `last_verified_at` — `timestamp with time zone` — `null`
- `created_by_user_id` — `uuid` — `null`
- `created_at` — `timestamp with time zone` — `not null` — `now()`
- `updated_at` — `timestamp with time zone` — `not null` — `now()`

Repeat for all eight tables.

### 5.4 RLS-enforcement verification (per-table)

For each of the eight tables, run both checks:

```sql
-- 1. FORCE RLS is ON
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname = 'tenant_email_configs';
-- Expected: relrowsecurity = t  AND  relforcerowsecurity = t

-- 2. The tenant_isolation policy exists
SELECT polname FROM pg_policies WHERE tablename = 'tenant_email_configs';
-- Expected exact match: tenant_email_configs_tenant_isolation
```

For all eight tables in one query (faster than eight round-trips):

```sql
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN (
  'tenant_email_configs',
  'tenant_sms_configs',
  'tenant_whatsapp_configs',
  'notification_suppression_list',
  'tenant_email_domains',
  'whatsapp_templates',
  'whatsapp_service_windows',
  'notification_webhook_events'
)
ORDER BY relname;
```

Every row must show `t / t`. Eight rows total. If any row shows `f` for either column, RLS is not enforced — STOP, fix, re-apply `post_migrate.sql`.

```sql
SELECT tablename, polname FROM pg_policies
WHERE tablename IN (
  'tenant_email_configs',
  'tenant_sms_configs',
  'tenant_whatsapp_configs',
  'notification_suppression_list',
  'tenant_email_domains',
  'whatsapp_templates',
  'whatsapp_service_windows',
  'notification_webhook_events'
)
ORDER BY tablename;
```

Eight rows; one policy per table; policy name = `<table>_tenant_isolation`.

### 5.5 Index verification (spot-check)

Confirm the named indexes landed:

```sql
SELECT indexname FROM pg_indexes
WHERE tablename IN (
  'notification_suppression_list',
  'tenant_email_domains',
  'whatsapp_templates',
  'whatsapp_service_windows',
  'notification_webhook_events'
)
ORDER BY indexname;
```

Expected (at minimum):

- `idx_email_domain_status_check`
- `idx_suppression_tenant_channel_expiry`
- `idx_webhook_processed_at`
- `idx_webhook_tenant_channel_received`
- `idx_whatsapp_template_status_sync`
- `idx_whatsapp_window_expiry`
- `uq_email_domain_tenant_domain`
- `uq_suppression_tenant_channel_recipient`
- `uq_webhook_tenant_provider_event`
- `uq_whatsapp_template_tenant_key_lang`
- `uq_whatsapp_window_tenant_recipient`
- (plus PK and `tenant_id` indexes per table)

### 5.6 Run the test suite

```bash
pnpm turbo run test --filter=@school/api
```

The new spec must pass. The full pre-existing suite must still pass — RLS changes can subtly break tests that share `app.current_tenant_id` state. If a previously-green spec fails, fix the regression before flipping the impl row to `completed` (Rule 8).

### 5.7 Local API smoke

Start the local API and worker:

```bash
pnpm --filter @school/api dev    # in one terminal
pnpm --filter @school/worker dev # in another
```

Confirm both start without errors. There are no new endpoints to hit yet; the smoke is purely "does the regenerated Prisma client compile and load." A startup error here usually means one of:

- A relation name mismatch (rename `EmailConfigsCreated` etc.).
- A missing migration apply (re-run `prisma migrate dev`).
- A drift between `schema.prisma` and the DB (run `prisma migrate status`).

### 5.8 Append the verification block to IMPLEMENTATION_LOG §5

Per Rule 27a, the completion record must include a `## Local verification` block listing the surfaces covered:

```
## Local verification
- Migration applied: pnpm --filter @school/prisma exec prisma migrate dev … OK
- Post-migrate applied: 8 tables × ENABLE+FORCE RLS + tenant_isolation policy OK
- Column shape verified via \d for all 8 tables
- pg_class FORCE RLS check: 8/8 rows with t/t
- pg_policies check: 8 policies named correctly
- RLS leakage spec: apps/api/test/communications-foundation.rls.spec.ts — 9 tests, all green
- Full @school/api test suite: green (no regressions)
- API + worker dev start: no errors
- Run timestamp: <ISO>
```

---

## 6. Files touched

### Added

- `packages/prisma/migrations/{timestamp}_add_tenant_communication_configs_and_operational_tables/migration.sql` — Prisma-generated DDL.
- `packages/prisma/migrations/{timestamp}_add_tenant_communication_configs_and_operational_tables/post_migrate.sql` — eight RLS policy blocks.
- `apps/api/test/communications-foundation.rls.spec.ts` — RLS leakage tests (8+ tables, 9+ tests).

### Modified

- `packages/prisma/schema.prisma` — added 8 models, 5 enums, 8 relations on `Tenant`, 3 named relations on `User`.
- `packages/prisma/rls/policies.sql` — appended Communications Overhaul section mirroring the eight new policies.

### Untouched

- `apps/api/src/app.module.ts` — no DI changes.
- `apps/worker/src/worker.module.ts` — no DI changes.
- `packages/shared/` — no Zod / type changes (Impl 03 owns those).
- `apps/web/` — no UI changes (Impl 11 owns those).
- `docs/architecture/*.md` — Impl 14 owns the single coherent update at the end (Rule 14).

---

## 7. Rollback

This impl is a single coordinated migration. The clean rollback path is:

```bash
git revert <impl-01-commit-sha>
```

The revert backs out `schema.prisma`, the migration directory, the policy mirror, and the spec file in one commit. Then re-run `pnpm --filter @school/prisma exec prisma migrate dev` against the local DB — Prisma will detect the missing migration and offer to reset (or you can apply a manual down-migration).

### Manual down-migration (if needed)

If `prisma migrate dev` cannot cleanly back out the migration (rare but possible if dev DB has data in the new tables), run the following SQL by hand:

```sql
-- Drop tables (CASCADE picks up indexes, constraints, policies)
DROP TABLE IF EXISTS notification_webhook_events CASCADE;
DROP TABLE IF EXISTS whatsapp_service_windows CASCADE;
DROP TABLE IF EXISTS whatsapp_templates CASCADE;
DROP TABLE IF EXISTS tenant_email_domains CASCADE;
DROP TABLE IF EXISTS notification_suppression_list CASCADE;
DROP TABLE IF EXISTS tenant_whatsapp_configs CASCADE;
DROP TABLE IF EXISTS tenant_sms_configs CASCADE;
DROP TABLE IF EXISTS tenant_email_configs CASCADE;

-- Drop enums
DROP TYPE IF EXISTS "WhatsAppTemplateStatus";
DROP TYPE IF EXISTS "WhatsAppTemplateCategory";
DROP TYPE IF EXISTS "DnsRecordStatus";
DROP TYPE IF EXISTS "EmailDomainStatus";
DROP TYPE IF EXISTS "SuppressionReason";

-- Mark the migration as rolled back so prisma doesn't try to re-apply it
DELETE FROM "_prisma_migrations"
WHERE migration_name = '{timestamp}_add_tenant_communication_configs_and_operational_tables';
```

After manual rollback, regenerate the Prisma client (`pnpm --filter @school/prisma exec prisma generate`) and restart the API + worker.

### Rollback safety

Because no Wave 2+ code exists yet, dropping these tables breaks nothing downstream. After Wave 2 (Impl 03) ships, rollback becomes destructive — services would lose their query targets — and the rollback procedure would need to revert Impl 03 first. For Impl 01 in isolation, the revert is safe.

---

## 8. Invariants this impl establishes

These invariants are load-bearing for Wave 2+; subsequent impls assume them and will silently fail if any are missing.

1. **All eight tables have `tenant_id UUID NOT NULL`.** No exceptions. None of these are platform-level.
2. **All eight tables have `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` and `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` with `@updatedAt`.** Audit-trail floor for every row.
3. **All eight tables have `FORCE ROW LEVEL SECURITY` enabled** and the canonical `<table>_tenant_isolation` policy. The connection-pool role does not bypass RLS.
4. **Every encrypted-credential column is `TEXT` (variable length).** Ciphertext format is `{iv_hex}:{authTag_hex}:{ciphertext_hex}` per `EncryptionService`; lengths vary with key rotation.
5. **Every credential row carries `encryption_key_ref VARCHAR(255)` and optional `key_last_rotated_at TIMESTAMPTZ`.** Live key-rotation works only if the row records which key encrypted it.
6. **Email columns:** `from_email` / `reply_to_email` use `VARCHAR(255)`. The suppression list's `recipient_address` uses `VARCHAR(320)` (RFC 5321 max). Both align with the existing `users.email` storage.
7. **Phone columns use `VARCHAR(50)` for E.164.** `+` + up to 15 digits + future-proof slack.
8. **Every credential table has `is_enabled BOOLEAN NOT NULL DEFAULT true`.** Per-tenant per-channel disable without a row delete.
9. **Every credential table has `last_verified_at TIMESTAMPTZ` (nullable).** Set by Impl 09's verify endpoint on a successful test send.
10. **`tenant_id` is always indexed.** On the three credential tables it is the unique constraint (`@unique`); on the five operational tables it is the leading column of every named index.
11. **`(tenant_id, provider_event_id)` is unique on `notification_webhook_events`.** Idempotent webhook ingestion under provider retries.
12. **`policies.sql` and `post_migrate.sql` agree on every policy.** Drift between the catalogue and the migration is a security-grade bug.

If any of the above fails to hold after this impl ships, Wave 2 will see test failures and the implementation is not complete.

---

## 9. Follow-ups for subsequent waves

- **Impl 02 (parallel)** — adds `configuration.communications.view` and `configuration.communications.manage` permission constants, seeds them, and backfills onto Owner / Principal role mappings on all 5 test tenants. Independent of this impl's schema; only depends on the constant strings being agreed.
- **Impl 03 (Wave 2)** — builds `EmailConfigService`, `SmsConfigService`, `WhatsAppConfigService` against these tables. Adds Zod schemas in `packages/shared/src/schemas/communication-config.schema.ts`. Wires controllers under `apps/api/src/modules/configuration/`.
- **Impl 04 (Wave 3)** — refactors providers to read tenant config first. Introduces the per-tenant client cache and the `comms:config-changed` Redis pub/sub channel.
- **Impl 06 (Wave 3)** — webhook receivers consume `notification_webhook_events`. Hard bounces / complaints write to `notification_suppression_list`.
- **Impl 07 (Wave 3)** — domain registration flow writes to `tenant_email_domains`; cron `comms:domain-verification-refresh` polls Resend.
- **Impl 08 (Wave 3)** — template lifecycle writes to `whatsapp_templates`; service-window tracking writes to `whatsapp_service_windows`.
- **Impl 13 (Wave 5)** — backfills 15 rows (5 tenants × 3 channels) into the credential tables in the local dev DB.
- **Impl 14 (Wave 5)** — updates `docs/architecture/feature-map.md`, `module-blast-radius.md`, `state-machines.md`, `event-job-catalog.md`, `danger-zones.md` per Rule 14.

---

## 10. IMPLEMENTATION_LOG bookkeeping

When this impl completes, append to §5 of `communicationnew/IMPLEMENTATION_LOG.md`:

```
### [IMPL 01] — Schema + migration + RLS (8 new tables)
- **Completed:** <ISO timestamp> (Europe/Dublin)
- **Local commit SHA:** <sha>
- **Deployment route:** worktree commit only (per Rule 5) — NO CI, NO PRODUCTION
- **Verified at:** <ISO timestamp> on local dev server
- **Local verification:** see §5.8 block
- **Summary (≤ 200 words):**
  Landed the foundational schema for the Communications Overhaul. Eight new
  tenant-scoped tables (`tenant_email_configs`, `tenant_sms_configs`,
  `tenant_whatsapp_configs`, `notification_suppression_list`,
  `tenant_email_domains`, `whatsapp_templates`, `whatsapp_service_windows`,
  `notification_webhook_events`) shipped in a single migration named
  `add_tenant_communication_configs_and_operational_tables`. Five new enums
  (`SuppressionReason`, `EmailDomainStatus`, `DnsRecordStatus`,
  `WhatsAppTemplateCategory`, `WhatsAppTemplateStatus`). Eight RLS policies in
  `post_migrate.sql`, mirrored into `packages/prisma/rls/policies.sql`. RLS
  leakage spec covers all eight tables. No service / controller / UI code —
  Wave 2 owns those. Restart matrix: API + worker + web (Prisma client
  regenerates).
- **Follow-ups:** Impl 03 builds the services against these tables. Impl 13
  populates them in the dev DB.
- **Rollback:** `git revert <sha>` then re-run `prisma migrate dev`. If dev DB
  has data in new tables, see §7 manual down-migration.
- **Session notes:** named relations on `User` (`EmailConfigsCreated`,
  `SmsConfigsCreated`, `WhatsAppConfigsCreated`) are required because the User
  model has multiple ↔ TenantXConfig FKs.
```

Commit the log update as a SEPARATE commit (Rule 7).

### Shared-file claim

If Impl 02 is started in parallel, claim `packages/prisma/schema.prisma` via Rule 17 before writing:

```
### [WAVE 1 SHARED-FILE CLAIM] — impl 01
- Claims: packages/prisma/schema.prisma
- Claims: packages/prisma/rls/policies.sql
- Until: committed OR flipped to `🛑 blocked`
```

Impl 02 does not touch `schema.prisma` (it edits seed scripts and permission constants), so this claim should not block 02.

---

## 11. Done criteria

This impl is complete when, and only when, all of the following are true:

- [ ] `pnpm --filter @school/prisma prisma format` returns 0.
- [ ] `pnpm --filter @school/prisma prisma validate` returns 0.
- [ ] `prisma migrate dev` generated the migration directory and applied it cleanly.
- [ ] `post_migrate.sql` ran without error (8 ALTER + 8 DROP POLICY + 8 CREATE POLICY).
- [ ] `policies.sql` mirrors all eight new policies, dated and back-linked.
- [ ] All eight tables show `relrowsecurity = t AND relforcerowsecurity = t` in `pg_class`.
- [ ] All eight `<table>_tenant_isolation` policies exist in `pg_policies`.
- [ ] `apps/api/test/communications-foundation.rls.spec.ts` has at least 9 tests (8 tables × leak + 1 WITH CHECK), all green.
- [ ] `pnpm turbo run test --filter=@school/api` is green end-to-end (no regression in any pre-existing spec).
- [ ] AppModule DI smoke (Rule 6) returns `DI OK`.
- [ ] Local API + worker dev start without errors.
- [ ] IMPLEMENTATION_LOG.md §4 row flipped from `pending` → `completed`.
- [ ] IMPLEMENTATION_LOG.md §5 has the completion record per the template.
- [ ] All code commits + the log-update commit are on branch `communications-overhaul`. NOT pushed to any remote.
