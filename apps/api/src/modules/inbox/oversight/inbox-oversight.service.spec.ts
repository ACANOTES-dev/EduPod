/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';

import { SYSTEM_USER_SENTINEL } from '@school/shared';

jest.mock('../../../common/middleware/rls.middleware', () => {
  const actual = jest.requireActual('../../../common/middleware/rls.middleware');
  return {
    ...actual,
    createRlsClient: jest.fn(),
  };
});

import { createRlsClient } from '../../../common/middleware/rls.middleware';

import { InboxOversightService } from './inbox-oversight.service';
import type { OversightAuditService } from './oversight-audit.service';
import type { OversightPdfService } from './oversight-pdf.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_TENANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ACTOR_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONV_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const FLAG_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const MSG_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

interface MockTx {
  conversation: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
  };
  message: { create: jest.Mock };
  messageFlag: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
  };
  oversightAccessLog: {
    create: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
}

function buildMockTx(): MockTx {
  return {
    conversation: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    message: { create: jest.fn() },
    messageFlag: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    oversightAccessLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
}

function mockRlsTransaction(
  tx: MockTx,
): jest.Mock<Promise<unknown>, [(tx: MockTx) => Promise<unknown>]> {
  const txFn = jest.fn(async (fn: (tx: MockTx) => Promise<unknown>) => fn(tx));
  (createRlsClient as jest.Mock).mockReturnValue({ $transaction: txFn });
  return txFn as jest.Mock<Promise<unknown>, [(tx: MockTx) => Promise<unknown>]>;
}

describe('InboxOversightService', () => {
  let service: InboxOversightService;
  let tx: MockTx;
  let auditService: jest.Mocked<OversightAuditService>;
  let pdfService: jest.Mocked<OversightPdfService>;
  let s3Service: { upload: jest.Mock; getPresignedUrl: jest.Mock };
  let prisma: Record<string, unknown>;

  beforeEach(() => {
    prisma = {};
    tx = buildMockTx();
    mockRlsTransaction(tx);

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<OversightAuditService>;
    pdfService = {
      generateThreadExport: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
    } as unknown as jest.Mocked<OversightPdfService>;
    s3Service = {
      upload: jest.fn().mockResolvedValue(`${TENANT_ID}/inbox/oversight/key.pdf`),
      getPresignedUrl: jest.fn().mockResolvedValue('https://signed.example/thread.pdf'),
    };

    service = new InboxOversightService(
      prisma as never,
      auditService,
      pdfService,
      s3Service as never,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listAllConversations ─────────────────────────────────────────────────

  describe('listAllConversations', () => {
    it('returns conversations regardless of actor participation and audit-logs the read', async () => {
      tx.conversation.findMany.mockResolvedValue([
        {
          id: CONV_ID,
          kind: 'direct',
          subject: 'hi',
          frozen_at: null,
          last_message_at: new Date('2026-04-10T12:00:00Z'),
          created_at: new Date('2026-04-09T12:00:00Z'),
          _count: { participants: 2 },
          messages: [{ flags: [{ id: 'f1', review_state: 'pending' }] }],
        },
      ]);
      tx.conversation.count.mockResolvedValue(1);

      const result = await service.listAllConversations({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_ID,
        filter: {},
        pagination: { page: 1, pageSize: 20 },
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: CONV_ID,
        participant_count: 2,
        flag_count: 1,
        has_pending_flag: true,
      });
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });

      // `where` on findMany must not include a participant filter scoping to the actor —
      // this is the "privileged read" property.
      const findManyWhere = tx.conversation.findMany.mock.calls[0][0].where;
      expect(findManyWhere.tenant_id).toBe(TENANT_ID);
      expect(findManyWhere.participants).toBeUndefined();

      expect(auditService.log).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tenantId: TENANT_ID,
          actorUserId: ACTOR_ID,
          action: 'read_thread',
        }),
      );
    });

    it('remains RLS-scoped to the tenant (cross-tenant leakage check)', async () => {
      tx.conversation.findMany.mockResolvedValue([]);
      tx.conversation.count.mockResolvedValue(0);

      await service.listAllConversations({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_ID,
        filter: {},
        pagination: { page: 1, pageSize: 20 },
      });

      // createRlsClient is called with the tenant we scoped to — the RLS layer
      // will enforce SET LOCAL app.current_tenant_id. We verify the intent here
      // by asserting the scoping argument.
      expect(createRlsClient).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ tenant_id: TENANT_ID }),
      );
      expect(createRlsClient).not.toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ tenant_id: OTHER_TENANT_ID }),
      );
    });

    it('applies the frozen filter', async () => {
      tx.conversation.findMany.mockResolvedValue([]);
      tx.conversation.count.mockResolvedValue(0);

      await service.listAllConversations({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_ID,
        filter: { frozen: true },
        pagination: { page: 1, pageSize: 20 },
      });

      const where = tx.conversation.findMany.mock.calls[0][0].where;
      expect(where.frozen_at).toEqual({ not: null });
    });
  });

  // ─── getThread ────────────────────────────────────────────────────────────

  describe('getThread', () => {
    it('returns deleted messages inline and audit-logs the read', async () => {
      tx.conversation.findFirst.mockResolvedValue({
        id: CONV_ID,
        kind: 'direct',
        subject: null,
        frozen_at: null,
        frozen_by_user_id: null,
        freeze_reason: null,
        created_at: new Date('2026-04-09T12:00:00Z'),
        participants: [
          {
            id: 'p1',
            user_id: 'u1',
            role_at_join: 'teacher',
            user: { id: 'u1', first_name: 'Amina', last_name: 'Y', email: 'a@y' },
          },
        ],
        messages: [
          {
            id: MSG_ID,
            sender_user_id: 'u1',
            body: 'deleted body',
            created_at: new Date('2026-04-09T12:00:00Z'),
            deleted_at: new Date('2026-04-09T13:00:00Z'),
            edits: [],
            sender: { id: 'u1', first_name: 'Amina', last_name: 'Y', email: 'a@y' },
          },
        ],
      });

      const result = await service.getThread({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_ID,
        conversationId: CONV_ID,
      });

      expect(result.messages[0]).toMatchObject({
        id: MSG_ID,
        body: 'deleted body',
        deleted_at: expect.any(Date),
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'read_thread',
          conversationId: CONV_ID,
          metadata: { scope: 'detail' },
        }),
      );
    });

    it('throws NotFoundException for missing conversation', async () => {
      tx.conversation.findFirst.mockResolvedValue(null);
      await expect(
        service.getThread({
          tenantId: TENANT_ID,
          actorUserId: ACTOR_ID,
          conversationId: CONV_ID,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── freeze / unfreeze ────────────────────────────────────────────────────

  describe('freezeConversation', () => {
    it('sets frozen_at, posts a system message, audit-logs', async () => {
      tx.conversation.findFirst.mockResolvedValue({
        id: CONV_ID,
        frozen_at: null,
        freeze_reason: null,
      });
      tx.conversation.update.mockResolvedValue({});
      tx.message.create.mockResolvedValue({});

      const result = await service.freezeConversation({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_ID,
        conversationId: CONV_ID,
        reason: 'safeguarding',
      });

      expect(result.already_frozen).toBe(false);
      expect(result.freeze_reason).toBe('safeguarding');
      expect(tx.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CONV_ID },
          data: expect.objectContaining({
            frozen_by_user_id: ACTOR_ID,
            freeze_reason: 'safeguarding',
          }),
        }),
      );
      const msgData = tx.message.create.mock.calls[0][0].data;
      expect(msgData.sender_user_id).toBe(SYSTEM_USER_SENTINEL);
      expect(msgData.conversation_id).toBe(CONV_ID);
      expect(msgData.body).toContain('disabled by school administration');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'freeze', conversationId: CONV_ID }),
      );
    });

    it('is idempotent when the conversation is already frozen', async () => {
      tx.conversation.findFirst.mockResolvedValue({
        id: CONV_ID,
        frozen_at: new Date('2026-04-01T00:00:00Z'),
        freeze_reason: 'earlier',
      });

      const result = await service.freezeConversation({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_ID,
        conversationId: CONV_ID,
        reason: 'new reason',
      });

      expect(result.already_frozen).toBe(true);
      expect(tx.conversation.update).not.toHaveBeenCalled();
      expect(tx.message.create).not.toHaveBeenCalled();
      // Audit still written so the attempt is traceable.
      expect(auditService.log).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'freeze',
          metadata: { result: 'already_frozen' },
        }),
      );
    });

    it('throws when the conversation does not exist', async () => {
      tx.conversation.findFirst.mockResolvedValue(null);
      await expect(
        service.freezeConversation({
          tenantId: TENANT_ID,
          actorUserId: ACTOR_ID,
          conversationId: CONV_ID,
          reason: 'x',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('unfreezeConversation', () => {
    it('clears frozen_at, posts re-enabled system message, audit-logs', async () => {
      tx.conversation.findFirst.mockResolvedValue({
        id: CONV_ID,
        frozen_at: new Date('2026-04-01T00:00:00Z'),
      });

      const result = await service.unfreezeConversation({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_ID,
        conversationId: CONV_ID,
      });

      expect(result.already_unfrozen).toBe(false);
      expect(tx.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            frozen_at: null,
            frozen_by_user_id: null,
            freeze_reason: null,
          },
        }),
      );
      expect(tx.message.create.mock.calls[0][0].data.body).toContain('re-enabled');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'unfreeze' }),
      );
    });

    it('is idempotent when the conversation is not frozen', async () => {
      tx.conversation.findFirst.mockResolvedValue({ id: CONV_ID, frozen_at: null });
      const result = await service.unfreezeConversation({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_ID,
        conversationId: CONV_ID,
      });
      expect(result.already_unfrozen).toBe(true);
      expect(tx.conversation.update).not.toHaveBeenCalled();
    });
  });

  // ─── flag actions ─────────────────────────────────────────────────────────

  describe('dismissFlag', () => {
    it('updates review_state to dismissed and audit-logs', async () => {
      tx.messageFlag.findFirst.mockResolvedValue({
        id: FLAG_ID,
        review_state: 'pending',
        message_id: MSG_ID,
      });

      await service.dismissFlag({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_ID,
        flagId: FLAG_ID,
        notes: 'false positive',
      });

      expect(tx.messageFlag.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: FLAG_ID },
          data: expect.objectContaining({
            review_state: 'dismissed',
            reviewed_by_user_id: ACTOR_ID,
            review_notes: 'false positive',
          }),
        }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'dismiss_flag',
          messageFlagId: FLAG_ID,
        }),
      );
    });

    it('throws when the flag is missing', async () => {
      tx.messageFlag.findFirst.mockResolvedValue(null);
      await expect(
        service.dismissFlag({
          tenantId: TENANT_ID,
          actorUserId: ACTOR_ID,
          flagId: FLAG_ID,
          notes: 'n',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('escalateFlag', () => {
    it('updates review_state, audit-logs, and returns export URL', async () => {
      tx.messageFlag.findFirst.mockResolvedValue({
        id: FLAG_ID,
        message: { conversation_id: CONV_ID },
      });
      tx.conversation.findFirst.mockResolvedValue({
        id: CONV_ID,
        kind: 'direct',
        subject: null,
        frozen_at: null,
        freeze_reason: null,
        created_at: new Date('2026-04-09T12:00:00Z'),
        tenant: { name: 'Nurul Huda' },
        participants: [],
        messages: [],
      });

      const result = await service.escalateFlag({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_ID,
        flagId: FLAG_ID,
        notes: 'escalate to DSL',
      });

      expect(result.export_url).toBe('https://signed.example/thread.pdf');
      expect(tx.messageFlag.update).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'escalate_flag',
          messageFlagId: FLAG_ID,
        }),
      );
      // The inner exportThread call also audit-logs.
      expect(auditService.log).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'export_thread', conversationId: CONV_ID }),
      );
      expect(pdfService.generateThreadExport).toHaveBeenCalled();
      expect(s3Service.upload).toHaveBeenCalled();
    });
  });

  describe('exportThread', () => {
    it('generates a PDF, uploads, returns signed URL, audit-logs', async () => {
      tx.conversation.findFirst.mockResolvedValue({
        id: CONV_ID,
        kind: 'direct',
        subject: 'x',
        frozen_at: null,
        freeze_reason: null,
        created_at: new Date('2026-04-09T12:00:00Z'),
        tenant: { name: 'School' },
        participants: [
          {
            id: 'p1',
            user_id: 'u1',
            role_at_join: 'teacher',
            user: { id: 'u1', first_name: 'A', last_name: 'B', email: 'a@b' },
          },
        ],
        messages: [
          {
            id: MSG_ID,
            sender_user_id: 'u1',
            body: 'hello',
            created_at: new Date('2026-04-09T12:00:00Z'),
            deleted_at: null,
            edits: [],
            sender: { id: 'u1', first_name: 'A', last_name: 'B', email: 'a@b' },
          },
        ],
      });

      const result = await service.exportThread({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_ID,
        conversationId: CONV_ID,
      });

      expect(result.export_url).toBe('https://signed.example/thread.pdf');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'export_thread' }),
      );
      expect(pdfService.generateThreadExport).toHaveBeenCalledWith(
        expect.objectContaining({ schoolName: 'School', conversationId: CONV_ID }),
      );
      expect(s3Service.upload).toHaveBeenCalledWith(
        TENANT_ID,
        expect.stringContaining('inbox/oversight/'),
        expect.any(Buffer),
        'application/pdf',
      );
    });
  });

  // ─── searchAll (stub) ─────────────────────────────────────────────────────

  describe('searchAll', () => {
    it('audit-logs the attempt and throws 503 INBOX_SEARCH_NOT_READY', async () => {
      await expect(
        service.searchAll({
          tenantId: TENANT_ID,
          actorUserId: ACTOR_ID,
          query: 'safeguarding',
          pagination: { page: 1, pageSize: 20 },
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'search',
          metadata: expect.objectContaining({ state: 'stub_not_ready' }),
        }),
      );
    });
  });

  // ─── listAuditLog ─────────────────────────────────────────────────────────

  describe('listAuditLog', () => {
    it('returns recent log entries ordered by created_at desc', async () => {
      tx.oversightAccessLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          actor_user_id: ACTOR_ID,
          action: 'read_thread',
          conversation_id: CONV_ID,
          message_flag_id: null,
          metadata_json: null,
          created_at: new Date('2026-04-10T12:00:00Z'),
        },
      ]);
      tx.oversightAccessLog.count.mockResolvedValue(1);

      const result = await service.listAuditLog({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_ID,
        pagination: { page: 1, pageSize: 20 },
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.action).toBe('read_thread');
      expect(tx.oversightAccessLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { created_at: 'desc' },
          where: { tenant_id: TENANT_ID },
        }),
      );
    });
  });

  // ─── listPendingFlags ─────────────────────────────────────────────────────

  describe('listPendingFlags', () => {
    it('returns first 200 chars of the message body and the review URL', async () => {
      const longBody = 'x'.repeat(400);
      tx.messageFlag.findMany.mockResolvedValue([
        {
          id: FLAG_ID,
          message_id: MSG_ID,
          matched_keywords: ['bully'],
          highest_severity: 'high',
          review_state: 'pending',
          created_at: new Date('2026-04-10T12:00:00Z'),
          message: {
            id: MSG_ID,
            conversation_id: CONV_ID,
            body: longBody,
            conversation: {
              id: CONV_ID,
              participants: [
                {
                  user_id: 'u1',
                  user: { id: 'u1', first_name: 'A', last_name: 'B', email: 'a@b' },
                },
              ],
            },
          },
        },
      ]);
      tx.messageFlag.count.mockResolvedValue(1);

      const result = await service.listPendingFlags({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_ID,
        pagination: { page: 1, pageSize: 20 },
      });

      expect(result.data[0]?.body_preview).toHaveLength(200);
      expect(result.data[0]?.review_url).toContain(CONV_ID);
      expect(result.data[0]?.review_url).toContain(FLAG_ID);
    });
  });
});
