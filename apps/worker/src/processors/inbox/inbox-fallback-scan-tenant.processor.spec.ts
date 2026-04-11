import { Job } from 'bullmq';

import {
  INBOX_FALLBACK_SCAN_TENANT_JOB,
  InboxFallbackScanTenantProcessor,
} from './inbox-fallback-scan-tenant.processor';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_TENANT_ID = '22222222-2222-2222-2222-222222222222';
const MSG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const MSG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CONV_A = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONV_B = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const SENDER_ADMIN = 'e1111111-e111-e111-e111-e11111111111';
const SENDER_TEACHER = 'e2222222-e222-e222-e222-e22222222222';
const RECIPIENT_1 = 'f1111111-f111-f111-f111-f11111111111';
const RECIPIENT_2 = 'f2222222-f222-f222-f222-f22222222222';

interface SettingsOverride {
  messaging_enabled?: boolean;
  fallback_admin_enabled?: boolean;
  fallback_admin_after_hours?: number;
  fallback_admin_channels?: string[];
  fallback_teacher_enabled?: boolean;
  fallback_teacher_after_hours?: number;
  fallback_teacher_channels?: string[];
}

function buildSettings(override: SettingsOverride = {}) {
  return {
    tenant_id: TENANT_ID,
    messaging_enabled: true,
    fallback_admin_enabled: true,
    fallback_admin_after_hours: 24,
    fallback_admin_channels: ['email'],
    fallback_teacher_enabled: true,
    fallback_teacher_after_hours: 3,
    fallback_teacher_channels: ['email', 'sms'],
    ...override,
  };
}

function buildCandidate(
  id: string,
  sender: string,
  ageMs: number,
  conversation_id = CONV_A,
  body = 'Important message body',
) {
  return {
    id,
    conversation_id,
    sender_user_id: sender,
    body,
    created_at: new Date(Date.now() - ageMs),
  };
}

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    tenantSettingsInbox: {
      findUnique: jest.fn().mockResolvedValue(buildSettings()),
    },
    message: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    conversationParticipant: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    tenantMembership: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    parent: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    notification: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

type MockTx = ReturnType<typeof buildMockTx>;

function buildMockPrisma(tx: MockTx) {
  return {
    $transaction: jest.fn(async (cb: (tx: MockTx) => Promise<unknown>) => cb(tx)),
  };
}

function buildJob(
  name: string = INBOX_FALLBACK_SCAN_TENANT_JOB,
  tenant_id: string = TENANT_ID,
): Job {
  return { name, data: { tenant_id } } as unknown as Job;
}

const ONE_HOUR = 60 * 60 * 1000;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('InboxFallbackScanTenantProcessor', () => {
  let tx: MockTx;
  let prisma: ReturnType<typeof buildMockPrisma>;
  let processor: InboxFallbackScanTenantProcessor;

  beforeEach(() => {
    tx = buildMockTx();
    prisma = buildMockPrisma(tx);
    processor = new InboxFallbackScanTenantProcessor(prisma as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('ignores jobs with a different name', async () => {
    await processor.process(buildJob('inbox:something-else'));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects payloads missing tenant_id', async () => {
    const job = { name: INBOX_FALLBACK_SCAN_TENANT_JOB, data: {} } as unknown as Job;
    await expect(processor.process(job)).rejects.toThrow(/tenant_id/);
  });

  it('sets RLS context before any DB operation', async () => {
    await processor.process(buildJob());

    expect(tx.$executeRaw).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining(TENANT_ID),
    );
  });

  it('skips tenants with messaging disabled', async () => {
    tx.tenantSettingsInbox.findUnique.mockResolvedValue(
      buildSettings({ messaging_enabled: false }),
    );

    await processor.process(buildJob());

    expect(tx.message.findMany).not.toHaveBeenCalled();
    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });

  it('skips tenants with no settings row at all', async () => {
    tx.tenantSettingsInbox.findUnique.mockResolvedValue(null);

    await processor.process(buildJob());

    expect(tx.message.findMany).not.toHaveBeenCalled();
  });

  it('skips tenants with both fallback buckets disabled', async () => {
    tx.tenantSettingsInbox.findUnique.mockResolvedValue(
      buildSettings({ fallback_admin_enabled: false, fallback_teacher_enabled: false }),
    );

    await processor.process(buildJob());

    expect(tx.message.findMany).not.toHaveBeenCalled();
  });

  it('caps the candidate scan at 500 messages', async () => {
    await processor.process(buildJob());

    expect(tx.message.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }));
  });

  it('excludes frozen conversations, soft-deleted messages, and already-dispatched rows', async () => {
    await processor.process(buildJob());

    const call = tx.message.findMany.mock.calls[0]![0];
    expect(call.where).toEqual(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        fallback_dispatched_at: null,
        disable_fallback: false,
        deleted_at: null,
        conversation: { frozen_at: null },
      }),
    );
  });

  it('excludes messages with disable_fallback = true (via query)', async () => {
    // The SQL-level filter is what protects us here; ensure the `where` clause
    // locks it in so a future refactor can't regress.
    await processor.process(buildJob());

    const call = tx.message.findMany.mock.calls[0]![0];
    expect(call.where.disable_fallback).toBe(false);
  });

  it('does not escalate when no candidate messages are found', async () => {
    tx.message.findMany.mockResolvedValue([]);

    await processor.process(buildJob());

    expect(tx.notification.createMany).not.toHaveBeenCalled();
    expect(tx.message.updateMany).not.toHaveBeenCalled();
  });

  it('dispatches admin-bucket messages older than the admin threshold', async () => {
    tx.message.findMany.mockResolvedValue([
      buildCandidate(MSG_A, SENDER_ADMIN, 25 * ONE_HOUR), // older than 24h
    ]);
    tx.tenantMembership.findMany.mockResolvedValue([
      {
        user_id: SENDER_ADMIN,
        membership_roles: [{ role: { role_key: 'school_principal' } }],
      },
    ]);
    tx.conversationParticipant.findMany.mockResolvedValue([
      { conversation_id: CONV_A, user_id: RECIPIENT_1, unread_count: 1 },
    ]);
    tx.user.findMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) => {
      if (where.id.in.includes(RECIPIENT_1)) {
        return Promise.resolve([
          { id: RECIPIENT_1, email: 'parent1@example.com', preferred_locale: 'en' },
        ]);
      }
      return Promise.resolve([
        {
          id: SENDER_ADMIN,
          first_name: 'Principal',
          last_name: 'Smith',
          email: 'principal@example.com',
        },
      ]);
    });

    await processor.process(buildJob());

    expect(tx.notification.createMany).toHaveBeenCalledTimes(1);
    const createArgs = tx.notification.createMany.mock.calls[0]![0];
    expect(createArgs.data).toEqual([
      expect.objectContaining({
        tenant_id: TENANT_ID,
        recipient_user_id: RECIPIENT_1,
        channel: 'email',
        template_key: 'inbox_message_fallback',
        locale: 'en',
        status: 'queued',
        source_entity_type: 'inbox_message',
        source_entity_id: MSG_A,
        payload_json: expect.objectContaining({
          conversation_id: CONV_A,
          message_id: MSG_A,
          sender_name: 'Principal Smith',
        }),
      }),
    ]);

    expect(tx.message.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [MSG_A] }, tenant_id: TENANT_ID },
      data: { fallback_dispatched_at: expect.any(Date) },
    });
  });

  it('dispatches teacher-bucket messages on every configured channel', async () => {
    tx.message.findMany.mockResolvedValue([
      buildCandidate(MSG_A, SENDER_TEACHER, 4 * ONE_HOUR), // older than 3h
    ]);
    tx.tenantMembership.findMany.mockResolvedValue([
      {
        user_id: SENDER_TEACHER,
        membership_roles: [{ role: { role_key: 'teacher' } }],
      },
    ]);
    tx.conversationParticipant.findMany.mockResolvedValue([
      { conversation_id: CONV_A, user_id: RECIPIENT_1, unread_count: 1 },
    ]);
    tx.user.findMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) => {
      if (where.id.in.includes(RECIPIENT_1)) {
        return Promise.resolve([
          { id: RECIPIENT_1, email: 'p@example.com', preferred_locale: 'en' },
        ]);
      }
      return Promise.resolve([
        { id: SENDER_TEACHER, first_name: 'Ms.', last_name: 'Jones', email: 'jones@example.com' },
      ]);
    });
    tx.parent.findMany.mockResolvedValue([
      { user_id: RECIPIENT_1, phone: '+12025551234', whatsapp_phone: null },
    ]);

    await processor.process(buildJob());

    expect(tx.notification.createMany).toHaveBeenCalledTimes(1);
    const rows = tx.notification.createMany.mock.calls[0]![0].data;
    // teacher channels are ['email', 'sms'] — recipient has both, so 2 rows
    expect(rows).toHaveLength(2);
    expect(rows.map((r: { channel: string }) => r.channel).sort()).toEqual(['email', 'sms']);
  });

  it('skips recipients who have no contact on the target channel', async () => {
    tx.message.findMany.mockResolvedValue([buildCandidate(MSG_A, SENDER_TEACHER, 4 * ONE_HOUR)]);
    tx.tenantMembership.findMany.mockResolvedValue([
      {
        user_id: SENDER_TEACHER,
        membership_roles: [{ role: { role_key: 'teacher' } }],
      },
    ]);
    tx.conversationParticipant.findMany.mockResolvedValue([
      { conversation_id: CONV_A, user_id: RECIPIENT_1, unread_count: 1 },
    ]);
    tx.user.findMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) => {
      if (where.id.in.includes(RECIPIENT_1)) {
        // No email on this user → SMS is the only deliverable channel.
        return Promise.resolve([{ id: RECIPIENT_1, email: null, preferred_locale: 'en' }]);
      }
      return Promise.resolve([
        { id: SENDER_TEACHER, first_name: 'Ms.', last_name: 'Jones', email: null },
      ]);
    });
    tx.parent.findMany.mockResolvedValue([
      { user_id: RECIPIENT_1, phone: '+12025551234', whatsapp_phone: null },
    ]);

    await processor.process(buildJob());

    const rows = tx.notification.createMany.mock.calls[0]![0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0].channel).toBe('sms');
  });

  it('never escalates to the sender themselves', async () => {
    tx.message.findMany.mockResolvedValue([buildCandidate(MSG_A, SENDER_TEACHER, 4 * ONE_HOUR)]);
    tx.tenantMembership.findMany.mockResolvedValue([
      {
        user_id: SENDER_TEACHER,
        membership_roles: [{ role: { role_key: 'teacher' } }],
      },
    ]);
    // The sender is also listed with an unread row (shouldn't happen in
    // practice, but protect against it).
    tx.conversationParticipant.findMany.mockResolvedValue([
      { conversation_id: CONV_A, user_id: SENDER_TEACHER, unread_count: 1 },
      { conversation_id: CONV_A, user_id: RECIPIENT_1, unread_count: 1 },
    ]);
    tx.user.findMany.mockResolvedValue([
      { id: RECIPIENT_1, email: 'p@example.com', preferred_locale: 'en' },
      { id: SENDER_TEACHER, first_name: 'Ms.', last_name: 'Jones', email: 'jones@example.com' },
    ]);
    tx.parent.findMany.mockResolvedValue([
      { user_id: RECIPIENT_1, phone: '+12025551234', whatsapp_phone: null },
    ]);

    await processor.process(buildJob());

    const rows = tx.notification.createMany.mock.calls[0]![0].data;
    expect(
      rows.every((r: { recipient_user_id: string }) => r.recipient_user_id !== SENDER_TEACHER),
    ).toBe(true);
  });

  it('does not escalate messages below their bucket age threshold', async () => {
    tx.message.findMany.mockResolvedValue([
      // 2 hours old — below the 3h teacher threshold. Within scan window
      // (scan takes min of enabled thresholds = 3h, so this only reaches
      // the candidate scan when cutoff = now - 3h — which excludes 2h old).
      buildCandidate(MSG_A, SENDER_TEACHER, 2 * ONE_HOUR),
    ]);

    // Simulate the SQL being narrower than what we pass here — by asserting
    // the in-memory age filter, we double-lock the guard.
    tx.tenantMembership.findMany.mockResolvedValue([
      {
        user_id: SENDER_TEACHER,
        membership_roles: [{ role: { role_key: 'teacher' } }],
      },
    ]);

    await processor.process(buildJob());

    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });

  it('does not escalate parent- or student-originated messages', async () => {
    tx.message.findMany.mockResolvedValue([buildCandidate(MSG_A, SENDER_ADMIN, 25 * ONE_HOUR)]);
    tx.tenantMembership.findMany.mockResolvedValue([
      {
        user_id: SENDER_ADMIN,
        membership_roles: [{ role: { role_key: 'parent' } }],
      },
    ]);

    await processor.process(buildJob());

    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });

  it('skips messages where every recipient has already read', async () => {
    tx.message.findMany.mockResolvedValue([buildCandidate(MSG_A, SENDER_ADMIN, 25 * ONE_HOUR)]);
    tx.tenantMembership.findMany.mockResolvedValue([
      {
        user_id: SENDER_ADMIN,
        membership_roles: [{ role: { role_key: 'school_owner' } }],
      },
    ]);
    // unread_count > 0 filter excludes every recipient in this conversation.
    tx.conversationParticipant.findMany.mockResolvedValue([]);

    await processor.process(buildJob());

    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });

  it('stamps messages.fallback_dispatched_at only for tenant-scoped rows', async () => {
    tx.message.findMany.mockResolvedValue([
      buildCandidate(MSG_A, SENDER_TEACHER, 4 * ONE_HOUR, CONV_A),
      buildCandidate(MSG_B, SENDER_TEACHER, 4 * ONE_HOUR, CONV_B),
    ]);
    tx.tenantMembership.findMany.mockResolvedValue([
      {
        user_id: SENDER_TEACHER,
        membership_roles: [{ role: { role_key: 'teacher' } }],
      },
    ]);
    tx.conversationParticipant.findMany.mockResolvedValue([
      { conversation_id: CONV_A, user_id: RECIPIENT_1, unread_count: 1 },
      { conversation_id: CONV_B, user_id: RECIPIENT_2, unread_count: 1 },
    ]);
    tx.user.findMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) => {
      if (where.id.in.some((id) => id === RECIPIENT_1 || id === RECIPIENT_2)) {
        return Promise.resolve([
          { id: RECIPIENT_1, email: 'r1@example.com', preferred_locale: 'en' },
          { id: RECIPIENT_2, email: 'r2@example.com', preferred_locale: 'ar' },
        ]);
      }
      return Promise.resolve([
        { id: SENDER_TEACHER, first_name: 'Ms.', last_name: 'Jones', email: 'jones@example.com' },
      ]);
    });
    tx.parent.findMany.mockResolvedValue([
      { user_id: RECIPIENT_1, phone: '+12025551234', whatsapp_phone: null },
      { user_id: RECIPIENT_2, phone: '+12025555678', whatsapp_phone: null },
    ]);

    await processor.process(buildJob());

    // The updateMany should scope by tenant_id, not just id.in — guarantees
    // a cross-tenant leak cannot stamp somebody else's rows.
    const updateCall = tx.message.updateMany.mock.calls[0]![0];
    expect(updateCall.where.tenant_id).toBe(TENANT_ID);
    expect(updateCall.where.id.in.sort()).toEqual([MSG_A, MSG_B].sort());
  });

  it('operates entirely under the tenant in the job payload (RLS isolation)', async () => {
    // The tenant_id in the updateMany scope must equal the payload tenant,
    // not the candidate's tenant_id (which is implicit via RLS).
    tx.message.findMany.mockResolvedValue([buildCandidate(MSG_A, SENDER_ADMIN, 25 * ONE_HOUR)]);
    tx.tenantMembership.findMany.mockResolvedValue([
      {
        user_id: SENDER_ADMIN,
        membership_roles: [{ role: { role_key: 'school_principal' } }],
      },
    ]);
    tx.conversationParticipant.findMany.mockResolvedValue([
      { conversation_id: CONV_A, user_id: RECIPIENT_1, unread_count: 1 },
    ]);
    tx.user.findMany.mockResolvedValue([
      { id: RECIPIENT_1, email: 'r1@example.com', preferred_locale: 'en' },
      { id: SENDER_ADMIN, first_name: 'Principal', last_name: null, email: null },
    ]);

    await processor.process(buildJob(INBOX_FALLBACK_SCAN_TENANT_JOB, OTHER_TENANT_ID));

    expect(tx.$executeRaw).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining(OTHER_TENANT_ID),
    );
    expect(tx.message.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenant_id: OTHER_TENANT_ID }),
      }),
    );
  });
});
