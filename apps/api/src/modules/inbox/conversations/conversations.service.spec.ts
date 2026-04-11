/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

jest.mock('../../../common/middleware/rls.middleware', () => {
  const actual = jest.requireActual('../../../common/middleware/rls.middleware');
  return {
    ...actual,
    createRlsClient: jest.fn(),
  };
});

import { createRlsClient } from '../../../common/middleware/rls.middleware';

import type { AudienceResolutionService } from '../audience/audience-resolution.service';
import type { AttachmentValidator } from '../common/attachment-validator';
import type { InboxOutboxService } from '../common/inbox-outbox.service';
import type { MessagingPolicyService } from '../policy/messaging-policy.service';
import type { RoleMappingService } from '../policy/role-mapping.service';

import { ConversationsService } from './conversations.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SENDER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const RECIPIENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const OTHER_RECIPIENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const CONV_ID = '11111111-1111-1111-1111-111111111111';
const MSG_ID = '22222222-2222-2222-2222-222222222222';

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface MockTx {
  conversation: {
    create: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  conversationParticipant: {
    createMany: jest.Mock;
    updateMany: jest.Mock;
    findMany: jest.Mock;
  };
  message: {
    create: jest.Mock;
    findMany: jest.Mock;
  };
  messageAttachment: { createMany: jest.Mock };
  messageRead: { createMany: jest.Mock };
  broadcastAudienceDefinition: { create: jest.Mock };
  broadcastAudienceSnapshot: { create: jest.Mock };
}

function buildMockTx(): MockTx {
  return {
    conversation: {
      create: jest.fn().mockResolvedValue({ id: CONV_ID }),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    conversationParticipant: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    message: {
      create: jest.fn().mockResolvedValue({ id: MSG_ID }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    messageAttachment: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    messageRead: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    broadcastAudienceDefinition: {
      create: jest.fn().mockResolvedValue({ id: 'def-1' }),
    },
    broadcastAudienceSnapshot: {
      create: jest.fn().mockResolvedValue({ id: 'snap-1' }),
    },
  };
}

function mockRlsTransaction(tx: MockTx): void {
  const txFn = jest.fn(async (fn: (tx: MockTx) => Promise<unknown>) => fn(tx));
  (createRlsClient as jest.Mock).mockReturnValue({ $transaction: txFn });
}

interface MockPrisma {
  conversation: { findFirst: jest.Mock };
  conversationParticipant: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
}

function buildPrisma(): MockPrisma {
  return {
    conversation: { findFirst: jest.fn().mockResolvedValue(null) },
    conversationParticipant: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
}

function buildDeps(): {
  policy: jest.Mocked<MessagingPolicyService>;
  audience: jest.Mocked<AudienceResolutionService>;
  roleMapping: jest.Mocked<RoleMappingService>;
  outbox: jest.Mocked<InboxOutboxService>;
  attachments: jest.Mocked<AttachmentValidator>;
} {
  const policy = {
    canStartConversation: jest.fn().mockResolvedValue({ allowed: true }),
    canReplyToConversation: jest.fn().mockResolvedValue({ allowed: true }),
  } as unknown as jest.Mocked<MessagingPolicyService>;

  const audience = {
    resolve: jest.fn(),
    resolveSavedAudience: jest.fn(),
    previewCount: jest.fn(),
  } as unknown as jest.Mocked<AudienceResolutionService>;

  const roleMapping = {
    resolveMessagingRole: jest.fn(),
    resolveMessagingRolesBatch: jest.fn(),
  } as unknown as jest.Mocked<RoleMappingService>;

  const outbox = {
    notifyMessageCreated: jest.fn(),
    notifyNeedsSafeguardingScan: jest.fn(),
  } as unknown as jest.Mocked<InboxOutboxService>;

  const attachments = {
    validateBatch: jest.fn(),
  } as unknown as jest.Mocked<AttachmentValidator>;

  return { policy, audience, roleMapping, outbox, attachments };
}

function buildService(
  prisma: MockPrisma,
  deps: ReturnType<typeof buildDeps>,
): ConversationsService {
  return new ConversationsService(
    prisma as never,
    deps.policy,
    deps.audience,
    deps.roleMapping,
    deps.outbox,
    deps.attachments,
  );
}

// ─── createDirect ─────────────────────────────────────────────────────────────

describe('ConversationsService — createDirect', () => {
  let tx: MockTx;
  let prisma: MockPrisma;
  let deps: ReturnType<typeof buildDeps>;
  let service: ConversationsService;

  beforeEach(() => {
    tx = buildMockTx();
    mockRlsTransaction(tx);
    prisma = buildPrisma();
    deps = buildDeps();
    deps.roleMapping.resolveMessagingRole.mockImplementation(async (_t, userId) => {
      if (userId === SENDER_ID) return 'teacher';
      if (userId === RECIPIENT_ID) return 'parent';
      return 'teacher';
    });
    service = buildService(prisma, deps);
  });

  afterEach(() => jest.clearAllMocks());

  it('creates a new direct conversation and fires outbox side effects', async () => {
    const result = await service.createDirect({
      tenantId: TENANT_A,
      senderUserId: SENDER_ID,
      recipientUserId: RECIPIENT_ID,
      body: 'Hello',
      attachments: [],
      extraChannels: [],
      disableFallback: false,
    });

    expect(result.conversation_id).toBe(CONV_ID);
    expect(result.message_id).toBe(MSG_ID);
    expect(result.deduped).toBe(false);
    expect(tx.conversation.create).toHaveBeenCalledTimes(1);
    expect(tx.conversationParticipant.createMany).toHaveBeenCalledTimes(1);
    expect(deps.outbox.notifyMessageCreated).toHaveBeenCalledTimes(1);
    expect(deps.outbox.notifyNeedsSafeguardingScan).toHaveBeenCalledTimes(1);
    // Inbox always-on invariant — must be in the payload:
    const payload = deps.outbox.notifyMessageCreated.mock.calls[0]?.[0];
    expect(payload?.extra_channels).toContain('inbox');
  });

  it('dedupes onto an existing active direct thread between the two users', async () => {
    prisma.conversationParticipant.findMany.mockResolvedValue([
      {
        conversation_id: CONV_ID,
        archived_at: null,
        conversation: {
          id: CONV_ID,
          participants: [{ id: 'p-other', archived_at: null }],
        },
      },
    ]);

    const result = await service.createDirect({
      tenantId: TENANT_A,
      senderUserId: SENDER_ID,
      recipientUserId: RECIPIENT_ID,
      body: 'Hello again',
      attachments: [],
      extraChannels: [],
      disableFallback: false,
    });

    expect(result.deduped).toBe(true);
    // The existing conversation's id must be used; no new conversation row.
    expect(tx.conversation.create).not.toHaveBeenCalled();
    // Message is still appended to the existing thread.
    expect(tx.message.create).toHaveBeenCalledTimes(1);
  });

  it('throws ForbiddenException when the policy engine denies', async () => {
    deps.policy.canStartConversation.mockResolvedValue({
      allowed: false,
      reason: 'ROLE_PAIR_NOT_ALLOWED',
      deniedRecipientIds: [RECIPIENT_ID],
    });

    await expect(
      service.createDirect({
        tenantId: TENANT_A,
        senderUserId: SENDER_ID,
        recipientUserId: RECIPIENT_ID,
        body: 'x',
        attachments: [],
        extraChannels: [],
        disableFallback: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(tx.conversation.create).not.toHaveBeenCalled();
  });

  it('rejects sending to self', async () => {
    await expect(
      service.createDirect({
        tenantId: TENANT_A,
        senderUserId: SENDER_ID,
        recipientUserId: SENDER_ID,
        body: 'hi me',
        attachments: [],
        extraChannels: [],
        disableFallback: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates every attachment belongs to the tenant before inserting', async () => {
    const att = {
      storage_key: `${TENANT_A}/uploads/abc.pdf`,
      filename: 'abc.pdf',
      mime_type: 'application/pdf' as const,
      size_bytes: 1000,
    };
    await service.createDirect({
      tenantId: TENANT_A,
      senderUserId: SENDER_ID,
      recipientUserId: RECIPIENT_ID,
      body: 'with attachment',
      attachments: [att],
      extraChannels: [],
      disableFallback: false,
    });
    expect(deps.attachments.validateBatch).toHaveBeenCalledWith(TENANT_A, [att]);
    expect(tx.messageAttachment.createMany).toHaveBeenCalledTimes(1);
  });
});

// ─── createGroup ──────────────────────────────────────────────────────────────

describe('ConversationsService — createGroup', () => {
  let tx: MockTx;
  let prisma: MockPrisma;
  let deps: ReturnType<typeof buildDeps>;
  let service: ConversationsService;

  beforeEach(() => {
    tx = buildMockTx();
    mockRlsTransaction(tx);
    prisma = buildPrisma();
    deps = buildDeps();
    deps.roleMapping.resolveMessagingRole.mockResolvedValue('teacher');
    deps.roleMapping.resolveMessagingRolesBatch.mockResolvedValue(
      new Map([
        [RECIPIENT_ID, 'parent'],
        [OTHER_RECIPIENT_ID, 'parent'],
      ]),
    );
    service = buildService(prisma, deps);
  });

  afterEach(() => jest.clearAllMocks());

  it('creates a new group conversation and participants', async () => {
    const result = await service.createGroup({
      tenantId: TENANT_A,
      senderUserId: SENDER_ID,
      recipientUserIds: [RECIPIENT_ID, OTHER_RECIPIENT_ID],
      subject: 'PTA notes',
      body: 'Here is the agenda',
      attachments: [],
      extraChannels: [],
      disableFallback: false,
    });

    expect(result.conversation_id).toBe(CONV_ID);
    expect(tx.conversation.create).toHaveBeenCalledTimes(1);
    // Sender + 2 recipients = 3 participant rows
    const participantsArg = tx.conversationParticipant.createMany.mock.calls[0]?.[0];
    expect(participantsArg.data).toHaveLength(3);
  });

  it('hard-fails the whole send when any recipient is denied', async () => {
    deps.policy.canStartConversation.mockResolvedValue({
      allowed: false,
      reason: 'RELATIONAL_SCOPE_VIOLATED',
      deniedRecipientIds: [OTHER_RECIPIENT_ID],
    });

    await expect(
      service.createGroup({
        tenantId: TENANT_A,
        senderUserId: SENDER_ID,
        recipientUserIds: [RECIPIENT_ID, OTHER_RECIPIENT_ID],
        subject: 'PTA',
        body: 'x',
        attachments: [],
        extraChannels: [],
        disableFallback: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(tx.conversation.create).not.toHaveBeenCalled();
  });

  it('rejects empty subject', async () => {
    await expect(
      service.createGroup({
        tenantId: TENANT_A,
        senderUserId: SENDER_ID,
        recipientUserIds: [RECIPIENT_ID, OTHER_RECIPIENT_ID],
        subject: '   ',
        body: 'x',
        attachments: [],
        extraChannels: [],
        disableFallback: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when the sender is in recipients', async () => {
    await expect(
      service.createGroup({
        tenantId: TENANT_A,
        senderUserId: SENDER_ID,
        recipientUserIds: [SENDER_ID, RECIPIENT_ID],
        subject: 'x',
        body: 'x',
        attachments: [],
        extraChannels: [],
        disableFallback: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ─── createBroadcast ──────────────────────────────────────────────────────────

describe('ConversationsService — createBroadcast', () => {
  let tx: MockTx;
  let prisma: MockPrisma;
  let deps: ReturnType<typeof buildDeps>;
  let service: ConversationsService;

  beforeEach(() => {
    tx = buildMockTx();
    mockRlsTransaction(tx);
    prisma = buildPrisma();
    deps = buildDeps();
    deps.roleMapping.resolveMessagingRole.mockResolvedValue('principal');
    deps.roleMapping.resolveMessagingRolesBatch.mockResolvedValue(
      new Map([
        [RECIPIENT_ID, 'parent'],
        [OTHER_RECIPIENT_ID, 'parent'],
      ]),
    );
    deps.audience.resolve.mockResolvedValue({
      user_ids: [RECIPIENT_ID, OTHER_RECIPIENT_ID],
      resolved_at: new Date(),
      definition: { provider: 'parents_school' },
    });
    service = buildService(prisma, deps);
  });

  afterEach(() => jest.clearAllMocks());

  it('persists definition + snapshot and returns the filtered recipient count', async () => {
    const result = await service.createBroadcast({
      tenantId: TENANT_A,
      senderUserId: SENDER_ID,
      audienceDefinition: { provider: 'parents_school' },
      subject: 'School closed',
      body: 'Snow day',
      attachments: [],
      allowReplies: false,
      extraChannels: [],
      disableFallback: false,
    });

    expect(result.resolved_recipient_count).toBe(2);
    expect(result.original_recipient_count).toBe(2);
    expect(tx.broadcastAudienceDefinition.create).toHaveBeenCalledTimes(1);
    expect(tx.broadcastAudienceSnapshot.create).toHaveBeenCalledTimes(1);
  });

  it('soft-filters the audience when policy denies some recipients', async () => {
    deps.policy.canStartConversation.mockResolvedValue({
      allowed: false,
      reason: 'ROLE_PAIR_NOT_ALLOWED',
      deniedRecipientIds: [OTHER_RECIPIENT_ID],
    });

    const result = await service.createBroadcast({
      tenantId: TENANT_A,
      senderUserId: SENDER_ID,
      audienceDefinition: { provider: 'parents_school' },
      subject: 'x',
      body: 'x',
      attachments: [],
      allowReplies: false,
      extraChannels: [],
      disableFallback: false,
    });

    expect(result.resolved_recipient_count).toBe(1);
    expect(result.original_recipient_count).toBe(2);
  });

  it('throws BROADCAST_AUDIENCE_EMPTY when the audience has zero recipients', async () => {
    deps.audience.resolve.mockResolvedValue({
      user_ids: [],
      resolved_at: new Date(),
      definition: { provider: 'parents_school' },
    });
    await expect(
      service.createBroadcast({
        tenantId: TENANT_A,
        senderUserId: SENDER_ID,
        audienceDefinition: { provider: 'parents_school' },
        subject: 'x',
        body: 'x',
        attachments: [],
        allowReplies: false,
        extraChannels: [],
        disableFallback: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects parent/student senders even if policy matrix would allow', async () => {
    deps.roleMapping.resolveMessagingRole.mockResolvedValue('parent');
    await expect(
      service.createBroadcast({
        tenantId: TENANT_A,
        senderUserId: SENDER_ID,
        audienceDefinition: { provider: 'parents_school' },
        subject: 'x',
        body: 'x',
        attachments: [],
        allowReplies: true,
        extraChannels: [],
        disableFallback: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

// ─── sendReply ────────────────────────────────────────────────────────────────

describe('ConversationsService — sendReply', () => {
  let tx: MockTx;
  let prisma: MockPrisma;
  let deps: ReturnType<typeof buildDeps>;
  let service: ConversationsService;

  beforeEach(() => {
    tx = buildMockTx();
    mockRlsTransaction(tx);
    prisma = buildPrisma();
    deps = buildDeps();
    deps.roleMapping.resolveMessagingRole.mockResolvedValue('parent');
    service = buildService(prisma, deps);
  });

  afterEach(() => jest.clearAllMocks());

  it('appends to a direct thread', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: CONV_ID,
      kind: 'direct',
      allow_replies: true,
      frozen_at: null,
      created_by_user_id: SENDER_ID,
    });

    const result = await service.sendReply({
      tenantId: TENANT_A,
      senderUserId: RECIPIENT_ID,
      conversationId: CONV_ID,
      body: 'Reply body',
      attachments: [],
      extraChannels: [],
      disableFallback: false,
    });

    expect(result.message_id).toBe(MSG_ID);
    expect(result.spawned_conversation_id).toBeUndefined();
    expect(tx.message.create).toHaveBeenCalledTimes(1);
  });

  it('throws NotFoundException when the conversation does not exist in this tenant', async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);
    await expect(
      service.sendReply({
        tenantId: TENANT_A,
        senderUserId: SENDER_ID,
        conversationId: CONV_ID,
        body: 'x',
        attachments: [],
        extraChannels: [],
        disableFallback: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws ForbiddenException when the policy engine denies the reply', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: CONV_ID,
      kind: 'broadcast',
      allow_replies: false,
      frozen_at: null,
      created_by_user_id: SENDER_ID,
    });
    deps.policy.canReplyToConversation.mockResolvedValue({
      allowed: false,
      reason: 'REPLIES_NOT_ALLOWED_ON_BROADCAST',
    });
    await expect(
      service.sendReply({
        tenantId: TENANT_A,
        senderUserId: RECIPIENT_ID,
        conversationId: CONV_ID,
        body: 'x',
        attachments: [],
        extraChannels: [],
        disableFallback: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('spawns a direct thread on first broadcast recipient reply', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: CONV_ID,
      kind: 'broadcast',
      allow_replies: true,
      frozen_at: null,
      created_by_user_id: SENDER_ID,
    });
    deps.roleMapping.resolveMessagingRole.mockImplementation(async (_t, userId) => {
      return userId === SENDER_ID ? 'principal' : 'parent';
    });
    // No existing spawned thread yet.
    tx.conversation.findFirst.mockResolvedValue(null);
    tx.conversation.create.mockResolvedValue({ id: 'spawned-id' });

    const result = await service.sendReply({
      tenantId: TENANT_A,
      senderUserId: RECIPIENT_ID,
      conversationId: CONV_ID,
      body: 'parent reply',
      attachments: [],
      extraChannels: [],
      disableFallback: false,
    });

    expect(result.spawned_conversation_id).toBe('spawned-id');
    expect(tx.conversation.create).toHaveBeenCalledTimes(1);
  });

  it('appends to an existing spawned thread on subsequent broadcast replies', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: CONV_ID,
      kind: 'broadcast',
      allow_replies: true,
      frozen_at: null,
      created_by_user_id: SENDER_ID,
    });
    deps.roleMapping.resolveMessagingRole.mockImplementation(async (_t, userId) => {
      return userId === SENDER_ID ? 'principal' : 'parent';
    });
    tx.conversation.findFirst.mockResolvedValue({ id: 'existing-spawn' });

    const result = await service.sendReply({
      tenantId: TENANT_A,
      senderUserId: RECIPIENT_ID,
      conversationId: CONV_ID,
      body: 'second reply',
      attachments: [],
      extraChannels: [],
      disableFallback: false,
    });

    expect(result.spawned_conversation_id).toBe('existing-spawn');
    // No new conversation created — reusing the existing spawn.
    expect(tx.conversation.create).not.toHaveBeenCalled();
  });
});

// ─── RLS leakage ──────────────────────────────────────────────────────────────

describe('ConversationsService — RLS leakage', () => {
  it('wires the RLS client with the caller tenant so cross-tenant reads are blocked', async () => {
    const tx = buildMockTx();
    mockRlsTransaction(tx);
    const prisma = buildPrisma();
    const deps = buildDeps();
    deps.roleMapping.resolveMessagingRole.mockResolvedValue('teacher');
    const service = buildService(prisma, deps);

    await service.createDirect({
      tenantId: TENANT_A,
      senderUserId: SENDER_ID,
      recipientUserId: RECIPIENT_ID,
      body: 'tenant A message',
      attachments: [],
      extraChannels: [],
      disableFallback: false,
    });

    // The key invariant: createRlsClient is always called with the
    // caller's tenant_id. Cross-tenant reads go through a DIFFERENT
    // RLS client and cannot see this transaction.
    expect(createRlsClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenant_id: TENANT_A }),
    );
    expect(createRlsClient).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenant_id: TENANT_B }),
    );
  });
});
