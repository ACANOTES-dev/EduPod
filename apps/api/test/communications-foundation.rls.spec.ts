/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { PrismaClient } from '@prisma/client';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_A_ID = 'c5000001-0001-4001-8001-000000000001';
const TENANT_B_ID = 'c5000002-0002-4002-8002-000000000002';
const RLS_TEST_ROLE = 'rls_comms_foundation_test_user';

// Tables touched by this spec, in child→parent delete order so the
// teardown does not violate foreign-key constraints.
const COMMS_TABLES = [
  'notification_webhook_events',
  'whatsapp_service_windows',
  'whatsapp_templates',
  'tenant_email_domains',
  'notification_suppression_list',
  'tenant_whatsapp_configs',
  'tenant_sms_configs',
  'tenant_email_configs',
] as const;

jest.setTimeout(60_000);

describe('communications foundation — RLS leakage (database layer)', () => {
  let prisma: PrismaClient;

  // ─── Helpers ──────────────────────────────────────────────────────────────

  async function queryAsTenant<T>(tenantId: string, sql: string): Promise<T[]> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', '${tenantId}', true)`);
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${RLS_TEST_ROLE}`);
      const result = await tx.$queryRawUnsafe(sql);
      return result as T[];
    });
  }

  async function mutateAsTenant(tenantId: string, sql: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', '${tenantId}', true)`);
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${RLS_TEST_ROLE}`);
      await tx.$executeRawUnsafe(sql);
    });
  }

  // ─── Setup / teardown ─────────────────────────────────────────────────────

  async function cleanupTestData(): Promise<void> {
    for (const table of COMMS_TABLES) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM ${table} WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
      );
    }
    await prisma.$executeRawUnsafe(
      `DELETE FROM tenants WHERE id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
  }

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });
    await prisma.$connect();

    await cleanupTestData();

    // ── Seed tenants ────────────────────────────────────────────────────────

    for (const id of [TENANT_A_ID, TENANT_B_ID]) {
      const suffix = id.slice(0, 8);
      await prisma.tenant.upsert({
        where: { id },
        create: {
          id,
          name: `RLS Comms Foundation Tenant ${suffix}`,
          slug: `rls-comms-${suffix}`,
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

    // ── Seed Tenant A rows in every comms table ────────────────────────────

    await prisma.$executeRawUnsafe(`
      INSERT INTO tenant_email_configs
        (tenant_id, resend_api_key_encrypted, from_email, encryption_key_ref)
      VALUES
        ('${TENANT_A_ID}'::uuid, 'enc:fake', 'from@a.test', 'v1')
    `);

    await prisma.$executeRawUnsafe(`
      INSERT INTO tenant_sms_configs
        (tenant_id, twilio_account_sid_encrypted, twilio_auth_token_encrypted, twilio_from_number, encryption_key_ref)
      VALUES
        ('${TENANT_A_ID}'::uuid, 'enc:sid', 'enc:token', '+15555550100', 'v1')
    `);

    await prisma.$executeRawUnsafe(`
      INSERT INTO tenant_whatsapp_configs
        (tenant_id, twilio_account_sid_encrypted, twilio_auth_token_encrypted, twilio_whatsapp_from_number, encryption_key_ref)
      VALUES
        ('${TENANT_A_ID}'::uuid, 'enc:sid', 'enc:token', '+15555550101', 'v1')
    `);

    await prisma.$executeRawUnsafe(`
      INSERT INTO notification_suppression_list
        (tenant_id, channel, recipient_address, reason)
      VALUES
        ('${TENANT_A_ID}'::uuid, 'email', 'bounced@example.com', 'hard_bounce')
    `);

    await prisma.$executeRawUnsafe(`
      INSERT INTO tenant_email_domains
        (tenant_id, domain, status, spf_status, dkim_status, dmarc_status, dns_records_json)
      VALUES
        ('${TENANT_A_ID}'::uuid, 'a.test', 'pending', 'pending', 'pending', 'pending', '{}'::jsonb)
    `);

    await prisma.$executeRawUnsafe(`
      INSERT INTO whatsapp_templates
        (tenant_id, template_key, template_name, language_code, category, body, status)
      VALUES
        ('${TENANT_A_ID}'::uuid, 'test_template', 'Test Template', 'en', 'utility', 'Hello {{1}}', 'pending')
    `);

    await prisma.$executeRawUnsafe(`
      INSERT INTO whatsapp_service_windows
        (tenant_id, recipient_phone, last_inbound_at, expires_at)
      VALUES
        ('${TENANT_A_ID}'::uuid, '+15555550200', NOW(), NOW() + INTERVAL '24 hours')
    `);

    await prisma.$executeRawUnsafe(`
      INSERT INTO notification_webhook_events
        (tenant_id, channel, provider_event_id, event_type, payload_json, signature_verified)
      VALUES
        ('${TENANT_A_ID}'::uuid, 'email', 'evt_test_a_1', 'delivered', '{}'::jsonb, true)
    `);

    // ── Create non-BYPASSRLS role for tenant-scoped queries ────────────────

    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN
         CREATE ROLE ${RLS_TEST_ROLE} NOLOGIN;
       EXCEPTION WHEN duplicate_object THEN NULL;
       END $$`,
    );
    await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${RLS_TEST_ROLE}`);
    await prisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${RLS_TEST_ROLE}`,
    );
  });

  afterAll(async () => {
    await cleanupTestData();

    try {
      await prisma.$executeRawUnsafe(
        `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${RLS_TEST_ROLE}`,
      );
      await prisma.$executeRawUnsafe(`REVOKE USAGE ON SCHEMA public FROM ${RLS_TEST_ROLE}`);
      await prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS ${RLS_TEST_ROLE}`);
    } catch (err) {
      console.error('[communications foundation RLS role cleanup]', err);
    }

    await prisma.$disconnect();
  });

  // ─── Per-table leakage tests ───────────────────────────────────────────────

  describe('tenant_email_configs', () => {
    it('Tenant A can read its own row', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_A_ID,
        `SELECT id::text FROM tenant_email_configs`,
      );
      expect(rows).toHaveLength(1);
    });

    it('Tenant B cannot read Tenant A rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM tenant_email_configs`,
      );
      expect(rows).toHaveLength(0);
    });

    // WITH CHECK enforcement: prove the policy blocks cross-tenant inserts.
    it('Tenant B cannot insert a row claiming Tenant A ownership', async () => {
      await expect(
        mutateAsTenant(
          TENANT_B_ID,
          `INSERT INTO tenant_email_configs (tenant_id, resend_api_key_encrypted, from_email, encryption_key_ref)
           VALUES ('${TENANT_A_ID}'::uuid, 'enc:hostile', 'attacker@b.test', 'v1')`,
        ),
      ).rejects.toThrow(/row.level security/i);
    });
  });

  describe('tenant_sms_configs', () => {
    it('Tenant B cannot read Tenant A rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM tenant_sms_configs`,
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe('tenant_whatsapp_configs', () => {
    it('Tenant B cannot read Tenant A rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM tenant_whatsapp_configs`,
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe('notification_suppression_list', () => {
    it('Tenant B cannot read Tenant A rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM notification_suppression_list`,
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe('tenant_email_domains', () => {
    it('Tenant B cannot read Tenant A rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM tenant_email_domains`,
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe('whatsapp_templates', () => {
    it('Tenant B cannot read Tenant A rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM whatsapp_templates`,
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe('whatsapp_service_windows', () => {
    it('Tenant B cannot read Tenant A rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM whatsapp_service_windows`,
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe('notification_webhook_events', () => {
    it('Tenant B cannot read Tenant A rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM notification_webhook_events`,
      );
      expect(rows).toHaveLength(0);
    });
  });
});
