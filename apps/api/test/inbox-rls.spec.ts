/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { PrismaClient } from '@prisma/client';

/**
 * Inbox RLS leakage sweep — all 14 tenant-scoped inbox tables (impl 01).
 *
 * Pattern follows `.claude/rules/testing.md`:
 *   1. Seed data as Tenant A (via superuser Prisma, no role switch)
 *   2. Query / mutate as Tenant B (RLS-test role + app.current_tenant_id = B)
 *   3. Assert Tenant B sees nothing of Tenant A's, and cross-tenant writes are no-ops
 *
 * Covers (14 tables):
 *   1. conversations                        6. message_attachments            11. tenant_settings_inbox
 *   2. conversation_participants            7. broadcast_audience_definitions 12. safeguarding_keywords
 *   3. messages                             8. broadcast_audience_snapshots   13. message_flags
 *   4. message_reads                        9. saved_audiences                14. oversight_access_log
 *   5. message_edits                       10. tenant_messaging_policy
 */

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_A_ID = 'b1100001-0001-4001-8001-000000000001';
const TENANT_B_ID = 'b1100002-0002-4002-8002-000000000002';
const USER_A_ID = 'b1100003-0003-4003-8003-000000000003';
const USER_B_ID = 'b1100004-0004-4004-8004-000000000004';
const CONV_A_ID = 'b1100005-0005-4005-8005-000000000005';
const MSG_A_ID = 'b1100006-0006-4006-8006-000000000006';
const SAVED_AUD_A_ID = 'b1100007-0007-4007-8007-000000000007';
const BROADCAST_CONV_A_ID = 'b1100008-0008-4008-8008-000000000008';
const KEYWORD_A_ID = 'b1100009-0009-4009-8009-000000000009';
const FLAG_A_ID = 'b110000a-000a-400a-800a-00000000000a';
const ATTACHMENT_A_ID = 'b110000b-000b-400b-800b-00000000000b';
const EDIT_A_ID = 'b110000c-000c-400c-800c-00000000000c';
const READ_A_ID = 'b110000d-000d-400d-800d-00000000000d';
const AUD_DEF_A_ID = 'b110000e-000e-400e-800e-00000000000e';
const AUD_SNAP_A_ID = 'b110000f-000f-400f-800f-00000000000f';
const OVERSIGHT_LOG_A_ID = 'b1100010-0010-4010-8010-000000000010';

const RLS_TEST_ROLE = 'rls_inbox_test_user';

// ─── Suite ───────────────────────────────────────────────────────────────────

jest.setTimeout(90_000);

describe('inbox — RLS leakage (database layer)', () => {
  let prisma: PrismaClient;

  // ─── Helpers ───────────────────────────────────────────────────────────────

  async function queryAsTenant<T>(tenantId: string, sql: string): Promise<T[]> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', '${tenantId}', true)`);
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${RLS_TEST_ROLE}`);
      const result = await tx.$queryRawUnsafe(sql);
      return result as T[];
    });
  }

  async function mutateAsTenant(tenantId: string, sql: string): Promise<number> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', '${tenantId}', true)`);
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${RLS_TEST_ROLE}`);
      const result = await tx.$executeRawUnsafe(sql);
      return result as number;
    });
  }

  // ─── Setup / teardown ──────────────────────────────────────────────────────

  async function cleanupTestData(): Promise<void> {
    // Children first (FK order)
    await prisma.$executeRawUnsafe(
      `DELETE FROM oversight_access_log WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM message_flags WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM message_attachments WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM message_edits WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM message_reads WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM messages WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM broadcast_audience_snapshots WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM broadcast_audience_definitions WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM conversation_participants WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM conversations WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM saved_audiences WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM safeguarding_keywords WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid) AND id = '${KEYWORD_A_ID}'::uuid`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM tenant_messaging_policy WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM tenant_settings_inbox WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM users WHERE id IN ('${USER_A_ID}'::uuid, '${USER_B_ID}'::uuid)`,
    );
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

    // ── Seed tenants + users ──────────────────────────────────────────────

    for (const [id, slug, name] of [
      [TENANT_A_ID, 'rls-inbox-a', 'RLS Inbox Tenant A'],
      [TENANT_B_ID, 'rls-inbox-b', 'RLS Inbox Tenant B'],
    ] as const) {
      await prisma.tenant.upsert({
        where: { id },
        create: {
          id,
          name,
          slug,
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

    for (const [id, email] of [
      [USER_A_ID, 'rls-inbox-a@test.local'],
      [USER_B_ID, 'rls-inbox-b@test.local'],
    ] as const) {
      await prisma.user.upsert({
        where: { id },
        create: {
          id,
          email,
          password_hash: '$2a$10$placeholder',
          first_name: 'RLS',
          last_name: 'Inbox',
          global_status: 'active',
        },
        update: {},
      });
    }

    // ── Seed one Tenant A row per inbox table ─────────────────────────────

    // 1. tenant_settings_inbox
    await prisma.tenantSettingsInbox.create({
      data: { tenant_id: TENANT_A_ID, messaging_enabled: true },
    });

    // 2. tenant_messaging_policy — one cell
    await prisma.tenantMessagingPolicy.create({
      data: {
        tenant_id: TENANT_A_ID,
        sender_role: 'teacher',
        recipient_role: 'parent',
        allowed: true,
      },
    });

    // 3. safeguarding_keywords
    await prisma.safeguardingKeyword.create({
      data: {
        id: KEYWORD_A_ID,
        tenant_id: TENANT_A_ID,
        keyword: 'rls-test-keyword',
        severity: 'low',
        category: 'other',
        active: true,
      },
    });

    // 4. conversations — a direct thread
    await prisma.conversation.create({
      data: {
        id: CONV_A_ID,
        tenant_id: TENANT_A_ID,
        kind: 'direct',
        created_by_user_id: USER_A_ID,
      },
    });

    // 5. conversation_participants
    await prisma.conversationParticipant.create({
      data: {
        tenant_id: TENANT_A_ID,
        conversation_id: CONV_A_ID,
        user_id: USER_A_ID,
        role_at_join: 'teacher',
      },
    });

    // 6. messages
    await prisma.message.create({
      data: {
        id: MSG_A_ID,
        tenant_id: TENANT_A_ID,
        conversation_id: CONV_A_ID,
        sender_user_id: USER_A_ID,
        body: 'Hello from Tenant A',
      },
    });

    // 7. message_reads
    await prisma.messageRead.create({
      data: {
        id: READ_A_ID,
        tenant_id: TENANT_A_ID,
        message_id: MSG_A_ID,
        user_id: USER_A_ID,
      },
    });

    // 8. message_edits
    await prisma.messageEdit.create({
      data: {
        id: EDIT_A_ID,
        tenant_id: TENANT_A_ID,
        message_id: MSG_A_ID,
        previous_body: 'Hello from Tenant A (earlier)',
        edited_by_user_id: USER_A_ID,
      },
    });

    // 9. message_attachments
    await prisma.messageAttachment.create({
      data: {
        id: ATTACHMENT_A_ID,
        tenant_id: TENANT_A_ID,
        message_id: MSG_A_ID,
        storage_key: `tenants/${TENANT_A_ID}/inbox/rls-test.pdf`,
        filename: 'rls-test.pdf',
        mime_type: 'application/pdf',
        size_bytes: 1024,
        uploaded_by_user_id: USER_A_ID,
      },
    });

    // 10. saved_audiences
    await prisma.savedAudience.create({
      data: {
        id: SAVED_AUD_A_ID,
        tenant_id: TENANT_A_ID,
        name: 'RLS Test Audience',
        kind: 'dynamic',
        definition_json: { provider: 'school', params: {} },
        created_by_user_id: USER_A_ID,
      },
    });

    // 11. broadcast_audience_definitions — needs a broadcast conversation
    await prisma.conversation.create({
      data: {
        id: BROADCAST_CONV_A_ID,
        tenant_id: TENANT_A_ID,
        kind: 'broadcast',
        subject: 'RLS broadcast',
        created_by_user_id: USER_A_ID,
      },
    });
    await prisma.broadcastAudienceDefinition.create({
      data: {
        id: AUD_DEF_A_ID,
        tenant_id: TENANT_A_ID,
        conversation_id: BROADCAST_CONV_A_ID,
        definition_json: { provider: 'school', params: {} },
      },
    });

    // 12. broadcast_audience_snapshots
    await prisma.broadcastAudienceSnapshot.create({
      data: {
        id: AUD_SNAP_A_ID,
        tenant_id: TENANT_A_ID,
        conversation_id: BROADCAST_CONV_A_ID,
        recipient_user_ids: [USER_A_ID],
        resolved_count: 1,
      },
    });

    // 13. message_flags
    await prisma.messageFlag.create({
      data: {
        id: FLAG_A_ID,
        tenant_id: TENANT_A_ID,
        message_id: MSG_A_ID,
        highest_severity: 'low',
        matched_keywords: ['rls-test-keyword'],
        review_state: 'pending',
      },
    });

    // 14. oversight_access_log
    await prisma.oversightAccessLog.create({
      data: {
        id: OVERSIGHT_LOG_A_ID,
        tenant_id: TENANT_A_ID,
        actor_user_id: USER_A_ID,
        action: 'read_thread',
        conversation_id: CONV_A_ID,
      },
    });

    // ── Create the non-BYPASSRLS test role ────────────────────────────────

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
      console.error('[inbox RLS role cleanup]', err);
    }

    await prisma.$disconnect();
  });

  // ─── Read isolation: 14 tables × Tenant B SELECT returns 0 ──────────────

  const READ_ISOLATION_TABLES: ReadonlyArray<[string, string]> = [
    ['conversations', CONV_A_ID],
    ['conversation_participants', ''], // look up by tenant_id
    ['messages', MSG_A_ID],
    ['message_reads', READ_A_ID],
    ['message_edits', EDIT_A_ID],
    ['message_attachments', ATTACHMENT_A_ID],
    ['broadcast_audience_definitions', AUD_DEF_A_ID],
    ['broadcast_audience_snapshots', AUD_SNAP_A_ID],
    ['saved_audiences', SAVED_AUD_A_ID],
    ['tenant_messaging_policy', ''],
    ['tenant_settings_inbox', ''],
    ['safeguarding_keywords', KEYWORD_A_ID],
    ['message_flags', FLAG_A_ID],
    ['oversight_access_log', OVERSIGHT_LOG_A_ID],
  ];

  for (const [table, rowId] of READ_ISOLATION_TABLES) {
    it(`${table}: SELECT as Tenant B returns 0 Tenant A rows`, async () => {
      const whereClause = rowId
        ? `WHERE id = '${rowId}'::uuid`
        : `WHERE tenant_id = '${TENANT_A_ID}'::uuid`;
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM ${table} ${whereClause}`,
      );
      expect(rows).toHaveLength(0);
    });
  }

  // ─── Read positive control: Tenant A SELECT returns its own rows ────────

  it('conversations: SELECT as Tenant A returns the seeded Tenant A conversation', async () => {
    const rows = await queryAsTenant<{ id: string; tenant_id: string }>(
      TENANT_A_ID,
      `SELECT id::text, tenant_id::text FROM conversations WHERE id = '${CONV_A_ID}'::uuid`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tenant_id).toBe(TENANT_A_ID);
  });

  it('messages: SELECT as Tenant A returns the seeded Tenant A message', async () => {
    const rows = await queryAsTenant<{ id: string; body: string }>(
      TENANT_A_ID,
      `SELECT id::text, body FROM messages WHERE id = '${MSG_A_ID}'::uuid`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.body).toBe('Hello from Tenant A');
  });

  // ─── Write isolation: cross-tenant UPDATE is a no-op ────────────────────

  it('messages: UPDATE as Tenant B targeting Tenant A message leaves body unchanged', async () => {
    await mutateAsTenant(
      TENANT_B_ID,
      `UPDATE messages SET body = 'HACKED BY TENANT B' WHERE id = '${MSG_A_ID}'::uuid`,
    );
    const rows = await prisma.$queryRawUnsafe<Array<{ body: string }>>(
      `SELECT body FROM messages WHERE id = '${MSG_A_ID}'::uuid`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.body).toBe('Hello from Tenant A');
  });

  it('conversations: UPDATE as Tenant B targeting Tenant A conversation leaves subject untouched', async () => {
    await mutateAsTenant(
      TENANT_B_ID,
      `UPDATE conversations SET subject = 'hacked' WHERE id = '${CONV_A_ID}'::uuid`,
    );
    const rows = await prisma.$queryRawUnsafe<Array<{ subject: string | null }>>(
      `SELECT subject FROM conversations WHERE id = '${CONV_A_ID}'::uuid`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.subject).toBeNull();
  });

  it('message_flags: UPDATE as Tenant B targeting Tenant A flag leaves review_state pending', async () => {
    await mutateAsTenant(
      TENANT_B_ID,
      `UPDATE message_flags SET review_state = 'dismissed' WHERE id = '${FLAG_A_ID}'::uuid`,
    );
    const rows = await prisma.$queryRawUnsafe<Array<{ review_state: string }>>(
      `SELECT review_state::text FROM message_flags WHERE id = '${FLAG_A_ID}'::uuid`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.review_state).toBe('pending');
  });

  it('tenant_messaging_policy: UPDATE as Tenant B targeting Tenant A cell does not flip allowed', async () => {
    await mutateAsTenant(
      TENANT_B_ID,
      `UPDATE tenant_messaging_policy SET allowed = false WHERE tenant_id = '${TENANT_A_ID}'::uuid AND sender_role = 'teacher' AND recipient_role = 'parent'`,
    );
    const rows = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
      `SELECT allowed FROM tenant_messaging_policy WHERE tenant_id = '${TENANT_A_ID}'::uuid AND sender_role = 'teacher' AND recipient_role = 'parent'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.allowed).toBe(true);
  });

  // ─── Write isolation: cross-tenant DELETE is a no-op ────────────────────

  it('messages: DELETE as Tenant B targeting Tenant A message leaves it intact', async () => {
    await mutateAsTenant(TENANT_B_ID, `DELETE FROM messages WHERE id = '${MSG_A_ID}'::uuid`);
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id::text FROM messages WHERE id = '${MSG_A_ID}'::uuid`,
    );
    expect(rows).toHaveLength(1);
  });

  it('conversations: DELETE as Tenant B targeting Tenant A conversation leaves it intact', async () => {
    await mutateAsTenant(TENANT_B_ID, `DELETE FROM conversations WHERE id = '${CONV_A_ID}'::uuid`);
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id::text FROM conversations WHERE id = '${CONV_A_ID}'::uuid`,
    );
    expect(rows).toHaveLength(1);
  });

  it('safeguarding_keywords: DELETE as Tenant B targeting Tenant A keyword leaves it intact', async () => {
    await mutateAsTenant(
      TENANT_B_ID,
      `DELETE FROM safeguarding_keywords WHERE id = '${KEYWORD_A_ID}'::uuid`,
    );
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id::text FROM safeguarding_keywords WHERE id = '${KEYWORD_A_ID}'::uuid`,
    );
    expect(rows).toHaveLength(1);
  });

  it('saved_audiences: DELETE as Tenant B targeting Tenant A audience leaves it intact', async () => {
    await mutateAsTenant(
      TENANT_B_ID,
      `DELETE FROM saved_audiences WHERE id = '${SAVED_AUD_A_ID}'::uuid`,
    );
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id::text FROM saved_audiences WHERE id = '${SAVED_AUD_A_ID}'::uuid`,
    );
    expect(rows).toHaveLength(1);
  });

  it('oversight_access_log: DELETE as Tenant B targeting Tenant A log leaves it intact', async () => {
    await mutateAsTenant(
      TENANT_B_ID,
      `DELETE FROM oversight_access_log WHERE id = '${OVERSIGHT_LOG_A_ID}'::uuid`,
    );
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id::text FROM oversight_access_log WHERE id = '${OVERSIGHT_LOG_A_ID}'::uuid`,
    );
    expect(rows).toHaveLength(1);
  });
});
