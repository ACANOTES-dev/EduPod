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

import type { InboxOutboxService } from '../common/inbox-outbox.service';
import type { RoleMappingService } from '../policy/role-mapping.service';

import { MessagesService } from './messages.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SENDER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const OTHER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const CONV_ID = '11111111-1111-1111-1111-111111111111';
const MSG_ID = '22222222-2222-2222-2222-222222222222';

interface MockTx {
  message: { update: jest.Mock };
  messageEdit: { create: jest.Mock };
}

function buildMockTx(editedAt: Date): MockTx {
  return {
    message: {
      update: jest.fn().mockResolvedValue({
        id: MSG_ID,
        edited_at: editedAt,
        deleted_at: editedAt,
        conversation_id: CONV_ID,
      }),
    },
    messageEdit: { create: jest.fn().mockResolvedValue({ id: 'edit-1' }) },
  };
}

function mockRlsTransaction(tx: MockTx): void {
  const txFn = jest.fn(async (fn: (tx: MockTx) => Promise<unknown>) => fn(tx));
  (createRlsClient as jest.Mock).mockReturnValue({ $transaction: txFn });
}

interface MockPrisma {
  message: { findFirst: jest.Mock };
  tenantSettingsInbox: { findUnique: jest.Mock };
}

function buildPrisma(
  params: {
    message?: unknown;
    editWindowMinutes?: number;
  } = {},
): MockPrisma {
  return {
    message: {
      findFirst: jest.fn().mockResolvedValue(
        params.message ?? {
          id: MSG_ID,
          conversation_id: CONV_ID,
          sender_user_id: SENDER_ID,
          body: 'original body',
          created_at: new Date(),
          deleted_at: null,
        },
      ),
    },
    tenantSettingsInbox: {
      findUnique: jest.fn().mockResolvedValue({
        edit_window_minutes: params.editWindowMinutes ?? 10,
      }),
    },
  };
}

function buildDeps(): {
  roleMapping: jest.Mocked<RoleMappingService>;
  outbox: jest.Mocked<InboxOutboxService>;
} {
  const roleMapping = {
    resolveMessagingRole: jest.fn().mockResolvedValue('teacher'),
  } as unknown as jest.Mocked<RoleMappingService>;

  const outbox = {
    notifyMessageCreated: jest.fn(),
    notifyNeedsSafeguardingScan: jest.fn(),
  } as unknown as jest.Mocked<InboxOutboxService>;

  return { roleMapping, outbox };
}

function buildService(prisma: MockPrisma, deps: ReturnType<typeof buildDeps>): MessagesService {
  return new MessagesService(prisma as never, deps.roleMapping, deps.outbox);
}

// ─── editMessage ──────────────────────────────────────────────────────────────

describe('MessagesService — editMessage', () => {
  let deps: ReturnType<typeof buildDeps>;

  beforeEach(() => {
    deps = buildDeps();
  });

  afterEach(() => jest.clearAllMocks());

  it('edits a message within the window and stores a history row', async () => {
    const now = new Date();
    const tx = buildMockTx(now);
    mockRlsTransaction(tx);
    const prisma = buildPrisma();
    const service = buildService(prisma, deps);

    const result = await service.editMessage({
      tenantId: TENANT_A,
      userId: SENDER_ID,
      messageId: MSG_ID,
      newBody: 'new body',
    });

    expect(result.message_id).toBe(MSG_ID);
    expect(tx.messageEdit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          message_id: MSG_ID,
          previous_body: 'original body',
          edited_by_user_id: SENDER_ID,
        }),
      }),
    );
    expect(deps.outbox.notifyNeedsSafeguardingScan).toHaveBeenCalledTimes(1);
  });

  it('throws EDIT_WINDOW_EXPIRED after the window closes', async () => {
    const oldMessage = {
      id: MSG_ID,
      conversation_id: CONV_ID,
      sender_user_id: SENDER_ID,
      body: 'old',
      created_at: new Date(Date.now() - 20 * 60 * 1000), // 20 min ago
      deleted_at: null,
    };
    const prisma = buildPrisma({ message: oldMessage, editWindowMinutes: 10 });
    const service = buildService(prisma, deps);

    await expect(
      service.editMessage({
        tenantId: TENANT_A,
        userId: SENDER_ID,
        messageId: MSG_ID,
        newBody: 'new',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects non-author edits with NOT_AUTHOR', async () => {
    const prisma = buildPrisma({
      message: {
        id: MSG_ID,
        conversation_id: CONV_ID,
        sender_user_id: OTHER_ID,
        body: 'x',
        created_at: new Date(),
        deleted_at: null,
      },
    });
    const service = buildService(prisma, deps);
    await expect(
      service.editMessage({
        tenantId: TENANT_A,
        userId: SENDER_ID,
        messageId: MSG_ID,
        newBody: 'hijack',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects parent role edits with EDIT_NOT_ALLOWED_FOR_ROLE', async () => {
    deps.roleMapping.resolveMessagingRole.mockResolvedValue('parent');
    const prisma = buildPrisma();
    const service = buildService(prisma, deps);
    await expect(
      service.editMessage({
        tenantId: TENANT_A,
        userId: SENDER_ID,
        messageId: MSG_ID,
        newBody: 'new',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects student role edits with EDIT_NOT_ALLOWED_FOR_ROLE', async () => {
    deps.roleMapping.resolveMessagingRole.mockResolvedValue('student');
    const prisma = buildPrisma();
    const service = buildService(prisma, deps);
    await expect(
      service.editMessage({
        tenantId: TENANT_A,
        userId: SENDER_ID,
        messageId: MSG_ID,
        newBody: 'new',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects editing a deleted message', async () => {
    const prisma = buildPrisma({
      message: {
        id: MSG_ID,
        conversation_id: CONV_ID,
        sender_user_id: SENDER_ID,
        body: 'x',
        created_at: new Date(),
        deleted_at: new Date(),
      },
    });
    const service = buildService(prisma, deps);
    await expect(
      service.editMessage({
        tenantId: TENANT_A,
        userId: SENDER_ID,
        messageId: MSG_ID,
        newBody: 'nope',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects empty body', async () => {
    const prisma = buildPrisma();
    const service = buildService(prisma, deps);
    await expect(
      service.editMessage({
        tenantId: TENANT_A,
        userId: SENDER_ID,
        messageId: MSG_ID,
        newBody: '   ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns NotFoundException for a missing message', async () => {
    const prisma = {
      message: { findFirst: jest.fn().mockResolvedValue(null) },
      tenantSettingsInbox: { findUnique: jest.fn() },
    };
    const service = buildService(prisma as never, deps);
    await expect(
      service.editMessage({
        tenantId: TENANT_A,
        userId: SENDER_ID,
        messageId: MSG_ID,
        newBody: 'x',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── deleteMessage ────────────────────────────────────────────────────────────

describe('MessagesService — deleteMessage', () => {
  let deps: ReturnType<typeof buildDeps>;

  beforeEach(() => {
    deps = buildDeps();
  });

  afterEach(() => jest.clearAllMocks());

  it('soft-deletes a message and does not touch the body', async () => {
    const now = new Date();
    const tx = buildMockTx(now);
    mockRlsTransaction(tx);
    const prisma = buildPrisma();
    const service = buildService(prisma, deps);

    const result = await service.deleteMessage({
      tenantId: TENANT_A,
      userId: SENDER_ID,
      messageId: MSG_ID,
    });

    expect(result.message_id).toBe(MSG_ID);
    expect(tx.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deleted_at: expect.any(Date) }),
      }),
    );
    // body is NOT modified
    const args = tx.message.update.mock.calls[0]?.[0];
    expect(Object.keys(args.data)).toEqual(['deleted_at']);
  });

  it('rejects non-author deletes with NOT_AUTHOR', async () => {
    const prisma = buildPrisma({
      message: {
        id: MSG_ID,
        sender_user_id: OTHER_ID,
        deleted_at: null,
      },
    });
    const service = buildService(prisma, deps);
    await expect(
      service.deleteMessage({
        tenantId: TENANT_A,
        userId: SENDER_ID,
        messageId: MSG_ID,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects parent role deletes', async () => {
    deps.roleMapping.resolveMessagingRole.mockResolvedValue('parent');
    const prisma = buildPrisma();
    const service = buildService(prisma, deps);
    await expect(
      service.deleteMessage({
        tenantId: TENANT_A,
        userId: SENDER_ID,
        messageId: MSG_ID,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('is idempotent when called on an already-deleted message', async () => {
    const existingDeletedAt = new Date();
    const prisma = buildPrisma({
      message: {
        id: MSG_ID,
        sender_user_id: SENDER_ID,
        deleted_at: existingDeletedAt,
      },
    });
    const service = buildService(prisma, deps);
    const result = await service.deleteMessage({
      tenantId: TENANT_A,
      userId: SENDER_ID,
      messageId: MSG_ID,
    });
    expect(result.deleted_at).toEqual(existingDeletedAt);
  });
});
