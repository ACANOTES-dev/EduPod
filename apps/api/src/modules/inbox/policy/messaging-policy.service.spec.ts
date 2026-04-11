import { Test, TestingModule } from '@nestjs/testing';

import { MESSAGING_ROLES } from '@school/shared/inbox';
import type { MessagingRole } from '@school/shared/inbox';

import { PrismaService } from '../../prisma/prisma.service';

import { MessagingPolicyService } from './messaging-policy.service';
import { RelationalScopeResolver } from './relational-scope.resolver';
import { RoleMappingService } from './role-mapping.service';
import {
  TenantMessagingPolicyRepository,
  buildMatrixKey,
} from './tenant-messaging-policy.repository';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SENDER_ID = 'sender-user';
const RECIPIENT_ID = 'recipient-user';

function buildMatrix(
  overrides: Partial<Record<`${MessagingRole}:${MessagingRole}`, boolean>> = {},
) {
  const matrix = new Map<`${MessagingRole}:${MessagingRole}`, boolean>();
  for (const sender of MESSAGING_ROLES) {
    for (const recipient of MESSAGING_ROLES) {
      matrix.set(buildMatrixKey(sender, recipient), false);
    }
  }
  for (const [k, v] of Object.entries(overrides)) {
    matrix.set(k as `${MessagingRole}:${MessagingRole}`, v as boolean);
  }
  return matrix;
}

function buildSettings(over: Partial<Record<string, boolean | number | string[] | null>> = {}) {
  return {
    id: 's-1',
    tenant_id: TENANT_ID,
    messaging_enabled: true,
    students_can_initiate: false,
    parents_can_initiate: false,
    parent_to_parent_messaging: false,
    student_to_student_messaging: false,
    student_to_parent_messaging: false,
    require_admin_approval_for_parent_to_teacher: false,
    edit_window_minutes: 10,
    retention_days: null,
    fallback_admin_enabled: true,
    fallback_admin_after_hours: 24,
    fallback_admin_channels: ['email'],
    fallback_teacher_enabled: true,
    fallback_teacher_after_hours: 3,
    fallback_teacher_channels: ['email'],
    created_at: new Date(),
    updated_at: new Date(),
    ...over,
  };
}

describe('MessagingPolicyService — canStartConversation', () => {
  let service: MessagingPolicyService;
  let prisma: {
    tenantSettingsInbox: { findUnique: jest.Mock };
    conversation: { findFirst: jest.Mock };
    conversationParticipant: { findFirst: jest.Mock };
  };
  let repo: { getMatrix: jest.Mock };
  let roleMapping: { resolveMessagingRole: jest.Mock; resolveMessagingRolesBatch: jest.Mock };
  let scope: { canReach: jest.Mock; canReachBatch: jest.Mock };

  beforeEach(async () => {
    prisma = {
      tenantSettingsInbox: { findUnique: jest.fn() },
      conversation: { findFirst: jest.fn() },
      conversationParticipant: { findFirst: jest.fn() },
    };
    repo = { getMatrix: jest.fn() };
    roleMapping = {
      resolveMessagingRole: jest.fn(),
      resolveMessagingRolesBatch: jest.fn(),
    };
    scope = { canReach: jest.fn(), canReachBatch: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingPolicyService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantMessagingPolicyRepository, useValue: repo },
        { provide: RoleMappingService, useValue: roleMapping },
        { provide: RelationalScopeResolver, useValue: scope },
      ],
    }).compile();

    service = module.get(MessagingPolicyService);
  });

  afterEach(() => jest.clearAllMocks());

  it('blocks everyone when tenant messaging is disabled', async () => {
    prisma.tenantSettingsInbox.findUnique.mockResolvedValue(
      buildSettings({ messaging_enabled: false }),
    );
    const decision = await service.canStartConversation({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      recipientUserIds: [RECIPIENT_ID],
      conversationKind: 'direct',
    });
    expect(decision).toEqual({ allowed: false, reason: 'MESSAGING_DISABLED_FOR_TENANT' });
  });

  it('blocks a parent from initiating when parents_can_initiate is false', async () => {
    prisma.tenantSettingsInbox.findUnique.mockResolvedValue(buildSettings());
    roleMapping.resolveMessagingRole.mockResolvedValue('parent' as MessagingRole);
    const decision = await service.canStartConversation({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      recipientUserIds: [RECIPIENT_ID],
      conversationKind: 'direct',
    });
    expect(decision).toEqual({ allowed: false, reason: 'PARENT_INITIATION_DISABLED' });
  });

  it('blocks a student from initiating when students_can_initiate is false', async () => {
    prisma.tenantSettingsInbox.findUnique.mockResolvedValue(buildSettings());
    roleMapping.resolveMessagingRole.mockResolvedValue('student' as MessagingRole);
    const decision = await service.canStartConversation({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      recipientUserIds: [RECIPIENT_ID],
      conversationKind: 'direct',
    });
    expect(decision).toEqual({ allowed: false, reason: 'STUDENT_INITIATION_DISABLED' });
  });

  it('blocks unknown sender role', async () => {
    prisma.tenantSettingsInbox.findUnique.mockResolvedValue(buildSettings());
    roleMapping.resolveMessagingRole.mockResolvedValue(null);
    const decision = await service.canStartConversation({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      recipientUserIds: [RECIPIENT_ID],
      conversationKind: 'direct',
    });
    expect(decision).toEqual({ allowed: false, reason: 'UNKNOWN_SENDER_ROLE' });
  });

  it('blocks when no recipients are provided', async () => {
    prisma.tenantSettingsInbox.findUnique.mockResolvedValue(buildSettings());
    roleMapping.resolveMessagingRole.mockResolvedValue('teacher' as MessagingRole);
    const decision = await service.canStartConversation({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      recipientUserIds: [],
      conversationKind: 'direct',
    });
    expect(decision).toEqual({
      allowed: false,
      reason: 'ROLE_PAIR_NOT_ALLOWED',
      deniedRecipientIds: [],
    });
  });

  it('blocks unknown recipient roles explicitly', async () => {
    prisma.tenantSettingsInbox.findUnique.mockResolvedValue(buildSettings());
    roleMapping.resolveMessagingRole.mockResolvedValue('teacher' as MessagingRole);
    repo.getMatrix.mockResolvedValue(buildMatrix());
    roleMapping.resolveMessagingRolesBatch.mockResolvedValue(
      new Map<string, MessagingRole | null>([[RECIPIENT_ID, null]]),
    );
    const decision = await service.canStartConversation({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      recipientUserIds: [RECIPIENT_ID],
      conversationKind: 'direct',
    });
    expect(decision).toEqual({
      allowed: false,
      reason: 'UNKNOWN_RECIPIENT_ROLE',
      deniedRecipientIds: [RECIPIENT_ID],
    });
  });

  it('blocks when the matrix cell is false', async () => {
    prisma.tenantSettingsInbox.findUnique.mockResolvedValue(buildSettings());
    roleMapping.resolveMessagingRole.mockResolvedValue('teacher' as MessagingRole);
    repo.getMatrix.mockResolvedValue(buildMatrix()); // all false
    roleMapping.resolveMessagingRolesBatch.mockResolvedValue(
      new Map<string, MessagingRole | null>([[RECIPIENT_ID, 'parent']]),
    );
    const decision = await service.canStartConversation({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      recipientUserIds: [RECIPIENT_ID],
      conversationKind: 'direct',
    });
    expect(decision).toEqual({
      allowed: false,
      reason: 'ROLE_PAIR_NOT_ALLOWED',
      deniedRecipientIds: [RECIPIENT_ID],
    });
  });

  it('allows a principal to reach anyone without a relational scope check', async () => {
    prisma.tenantSettingsInbox.findUnique.mockResolvedValue(buildSettings());
    roleMapping.resolveMessagingRole.mockResolvedValue('principal' as MessagingRole);
    repo.getMatrix.mockResolvedValue(buildMatrix({ 'principal:parent': true }));
    roleMapping.resolveMessagingRolesBatch.mockResolvedValue(
      new Map<string, MessagingRole | null>([[RECIPIENT_ID, 'parent']]),
    );
    const decision = await service.canStartConversation({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      recipientUserIds: [RECIPIENT_ID],
      conversationKind: 'direct',
    });
    expect(decision).toEqual({ allowed: true });
    expect(scope.canReachBatch).not.toHaveBeenCalled();
  });

  it('blocks parent→parent when parent_to_parent_messaging is off even if cell is true', async () => {
    prisma.tenantSettingsInbox.findUnique.mockResolvedValue(
      buildSettings({ parents_can_initiate: true, parent_to_parent_messaging: false }),
    );
    roleMapping.resolveMessagingRole.mockResolvedValue('parent' as MessagingRole);
    repo.getMatrix.mockResolvedValue(buildMatrix({ 'parent:parent': true }));
    roleMapping.resolveMessagingRolesBatch.mockResolvedValue(
      new Map<string, MessagingRole | null>([[RECIPIENT_ID, 'parent']]),
    );
    const decision = await service.canStartConversation({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      recipientUserIds: [RECIPIENT_ID],
      conversationKind: 'direct',
    });
    expect(decision).toEqual({
      allowed: false,
      reason: 'PARENT_TO_PARENT_DISABLED',
      deniedRecipientIds: [RECIPIENT_ID],
    });
  });

  it('allows parent→teacher when cell + scope both pass', async () => {
    prisma.tenantSettingsInbox.findUnique.mockResolvedValue(
      buildSettings({ parents_can_initiate: true }),
    );
    roleMapping.resolveMessagingRole.mockResolvedValue('parent' as MessagingRole);
    repo.getMatrix.mockResolvedValue(buildMatrix({ 'parent:teacher': true }));
    roleMapping.resolveMessagingRolesBatch.mockResolvedValue(
      new Map<string, MessagingRole | null>([[RECIPIENT_ID, 'teacher']]),
    );
    scope.canReachBatch.mockResolvedValue({
      reachable: new Set([RECIPIENT_ID]),
      unreachable: new Set<string>(),
    });

    const decision = await service.canStartConversation({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      recipientUserIds: [RECIPIENT_ID],
      conversationKind: 'direct',
    });
    expect(decision).toEqual({ allowed: true });
    expect(scope.canReachBatch).toHaveBeenCalledTimes(1);
  });

  it('blocks parent→teacher when relational scope denies the pair', async () => {
    prisma.tenantSettingsInbox.findUnique.mockResolvedValue(
      buildSettings({ parents_can_initiate: true }),
    );
    roleMapping.resolveMessagingRole.mockResolvedValue('parent' as MessagingRole);
    repo.getMatrix.mockResolvedValue(buildMatrix({ 'parent:teacher': true }));
    roleMapping.resolveMessagingRolesBatch.mockResolvedValue(
      new Map<string, MessagingRole | null>([[RECIPIENT_ID, 'teacher']]),
    );
    scope.canReachBatch.mockResolvedValue({
      reachable: new Set<string>(),
      unreachable: new Set([RECIPIENT_ID]),
    });

    const decision = await service.canStartConversation({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      recipientUserIds: [RECIPIENT_ID],
      conversationKind: 'direct',
    });
    expect(decision).toEqual({
      allowed: false,
      reason: 'RELATIONAL_SCOPE_VIOLATED',
      deniedRecipientIds: [RECIPIENT_ID],
    });
  });

  it('uses a single batched scope call for teacher composing to 30 parents', async () => {
    prisma.tenantSettingsInbox.findUnique.mockResolvedValue(buildSettings());
    roleMapping.resolveMessagingRole.mockResolvedValue('teacher' as MessagingRole);
    repo.getMatrix.mockResolvedValue(buildMatrix({ 'teacher:parent': true }));

    const recipientIds = Array.from({ length: 30 }, (_, i) => `parent-${i}`);
    const roleMap = new Map<string, MessagingRole | null>();
    for (const id of recipientIds) roleMap.set(id, 'parent');
    roleMapping.resolveMessagingRolesBatch.mockResolvedValue(roleMap);
    scope.canReachBatch.mockResolvedValue({
      reachable: new Set(recipientIds),
      unreachable: new Set<string>(),
    });

    const decision = await service.canStartConversation({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      recipientUserIds: recipientIds,
      conversationKind: 'group',
    });
    expect(decision).toEqual({ allowed: true });
    // Single batch call regardless of N recipients.
    expect(scope.canReachBatch).toHaveBeenCalledTimes(1);
  });

  it('skips relational check on broadcasts', async () => {
    prisma.tenantSettingsInbox.findUnique.mockResolvedValue(buildSettings());
    roleMapping.resolveMessagingRole.mockResolvedValue('teacher' as MessagingRole);
    repo.getMatrix.mockResolvedValue(buildMatrix({ 'teacher:parent': true }));
    roleMapping.resolveMessagingRolesBatch.mockResolvedValue(
      new Map<string, MessagingRole | null>([[RECIPIENT_ID, 'parent']]),
    );

    const decision = await service.canStartConversation({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      recipientUserIds: [RECIPIENT_ID],
      conversationKind: 'broadcast',
    });
    expect(decision).toEqual({ allowed: true });
    expect(scope.canReachBatch).not.toHaveBeenCalled();
  });
});

describe('MessagingPolicyService — canReplyToConversation', () => {
  let service: MessagingPolicyService;
  let prisma: {
    tenantSettingsInbox: { findUnique: jest.Mock };
    conversation: { findFirst: jest.Mock };
    conversationParticipant: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      tenantSettingsInbox: { findUnique: jest.fn() },
      conversation: { findFirst: jest.fn() },
      conversationParticipant: { findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingPolicyService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: TenantMessagingPolicyRepository,
          useValue: { getMatrix: jest.fn() },
        },
        {
          provide: RoleMappingService,
          useValue: {
            resolveMessagingRole: jest.fn(),
            resolveMessagingRolesBatch: jest.fn(),
          },
        },
        {
          provide: RelationalScopeResolver,
          useValue: { canReach: jest.fn(), canReachBatch: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(MessagingPolicyService);
  });

  afterEach(() => jest.clearAllMocks());

  it('blocks when the conversation is missing (treated as NOT_PARTICIPANT)', async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);
    const decision = await service.canReplyToConversation({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      conversationId: 'c-1',
    });
    expect(decision).toEqual({ allowed: false, reason: 'NOT_PARTICIPANT' });
  });

  it('blocks when conversation is frozen', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'c-1',
      kind: 'direct',
      allow_replies: false,
      frozen_at: new Date(),
      created_by_user_id: 'someone',
    });
    const decision = await service.canReplyToConversation({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      conversationId: 'c-1',
    });
    expect(decision).toEqual({ allowed: false, reason: 'CONVERSATION_FROZEN' });
  });

  it('blocks a non-participant on a direct thread', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'c-1',
      kind: 'direct',
      allow_replies: false,
      frozen_at: null,
      created_by_user_id: 'someone-else',
    });
    prisma.conversationParticipant.findFirst.mockResolvedValue(null);
    const decision = await service.canReplyToConversation({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      conversationId: 'c-1',
    });
    expect(decision).toEqual({ allowed: false, reason: 'NOT_PARTICIPANT' });
  });

  it('allows a participant to reply on a direct thread', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'c-1',
      kind: 'direct',
      allow_replies: false,
      frozen_at: null,
      created_by_user_id: 'someone-else',
    });
    prisma.conversationParticipant.findFirst.mockResolvedValue({ id: 'p-1' });
    const decision = await service.canReplyToConversation({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      conversationId: 'c-1',
    });
    expect(decision).toEqual({ allowed: true });
  });

  it('allows a participant to reply on a group thread', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'c-1',
      kind: 'group',
      allow_replies: false,
      frozen_at: null,
      created_by_user_id: 'someone-else',
    });
    prisma.conversationParticipant.findFirst.mockResolvedValue({ id: 'p-1' });
    const decision = await service.canReplyToConversation({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      conversationId: 'c-1',
    });
    expect(decision).toEqual({ allowed: true });
  });

  it('allows the broadcast sender to reply on their own broadcast', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'c-1',
      kind: 'broadcast',
      allow_replies: false,
      frozen_at: null,
      created_by_user_id: SENDER_ID,
    });
    prisma.conversationParticipant.findFirst.mockResolvedValue({ id: 'p-1' });
    const decision = await service.canReplyToConversation({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      conversationId: 'c-1',
    });
    expect(decision).toEqual({ allowed: true });
  });

  it('blocks a recipient reply on a broadcast when allow_replies is false', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'c-1',
      kind: 'broadcast',
      allow_replies: false,
      frozen_at: null,
      created_by_user_id: 'someone-else',
    });
    prisma.conversationParticipant.findFirst.mockResolvedValue({ id: 'p-1' });
    const decision = await service.canReplyToConversation({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      conversationId: 'c-1',
    });
    expect(decision).toEqual({ allowed: false, reason: 'REPLIES_NOT_ALLOWED_ON_BROADCAST' });
  });

  it('allows a recipient reply on a broadcast when allow_replies is true', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'c-1',
      kind: 'broadcast',
      allow_replies: true,
      frozen_at: null,
      created_by_user_id: 'someone-else',
    });
    prisma.conversationParticipant.findFirst.mockResolvedValue({ id: 'p-1' });
    const decision = await service.canReplyToConversation({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      conversationId: 'c-1',
    });
    expect(decision).toEqual({ allowed: true });
  });
});
