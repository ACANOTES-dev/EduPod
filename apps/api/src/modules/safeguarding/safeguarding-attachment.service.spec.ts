/* eslint-disable import/order -- jest.mock must precede mocked imports */
import {
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

const mockTx = {
  safeguardingConcern: {
    findFirst: jest.fn(),
  },
  behaviourAttachment: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  safeguardingAction: {
    create: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      ),
  }),
}));

import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';

import { SafeguardingAttachmentService } from './safeguarding-attachment.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const CONCERN_ID = '44444444-4444-4444-4444-444444444444';
const ATTACHMENT_ID = '88888888-8888-8888-8888-888888888888';
const MEMBERSHIP_ID = '66666666-6666-6666-6666-666666666666';

const mockBehaviourQueue = { add: jest.fn().mockResolvedValue({}) };

const mockFile = {
  buffer: Buffer.from('test file content'),
  originalname: 'report.pdf',
  mimetype: 'application/pdf',
  size: 1024,
};

const baseDto = {
  classification: 'evidence',
  description: 'Safeguarding report',
  is_redactable: false,
};

describe('SafeguardingAttachmentService', () => {
  let service: SafeguardingAttachmentService;
  let mockPrisma: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    mockPrisma = {
      behaviourAttachment: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      safeguardingAction: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SafeguardingAttachmentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: { write: jest.fn() } },
        { provide: 'BullQueue_behaviour', useValue: mockBehaviourQueue },
      ],
    }).compile();

    service = module.get<SafeguardingAttachmentService>(
      SafeguardingAttachmentService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── uploadAttachment ───────────────────────────────────────────────────────

  describe('uploadAttachment', () => {
    beforeEach(() => {
      mockTx.safeguardingConcern.findFirst.mockResolvedValue({
        id: CONCERN_ID,
        status: 'open',
      });
      mockTx.behaviourAttachment.create.mockResolvedValue({
        id: ATTACHMENT_ID,
      });
      mockTx.safeguardingAction.create.mockResolvedValue({ id: 'action-1' });
    });

    it('should create attachment record with pending_scan status and enqueue scan job', async () => {
      const result = await service.uploadAttachment(
        TENANT_ID,
        USER_ID,
        CONCERN_ID,
        mockFile,
        baseDto,
      );

      expect(mockTx.behaviourAttachment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          entity_type: 'safeguarding_concern',
          entity_id: CONCERN_ID,
          uploaded_by_id: USER_ID,
          file_name: 'report.pdf',
          mime_type: 'application/pdf',
          scan_status: 'pending_scan',
          classification: 'evidence',
        }),
      });

      expect(mockBehaviourQueue.add).toHaveBeenCalledWith(
        'behaviour:attachment-scan',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          attachment_id: ATTACHMENT_ID,
        }),
      );

      expect(result).toEqual({
        data: { attachment_id: ATTACHMENT_ID, status: 'pending' },
      });
    });

    it('should throw PayloadTooLargeException for files > 10MB', async () => {
      const largeFile = { ...mockFile, size: 11 * 1024 * 1024 };

      await expect(
        service.uploadAttachment(
          TENANT_ID,
          USER_ID,
          CONCERN_ID,
          largeFile,
          baseDto,
        ),
      ).rejects.toThrow(PayloadTooLargeException);
    });

    it('should throw UnprocessableEntityException for disallowed extension (.exe)', async () => {
      const exeFile = { ...mockFile, originalname: 'malware.exe' };

      await expect(
        service.uploadAttachment(
          TENANT_ID,
          USER_ID,
          CONCERN_ID,
          exeFile,
          baseDto,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw NotFoundException when concern not found', async () => {
      mockTx.safeguardingConcern.findFirst.mockResolvedValue(null);

      await expect(
        service.uploadAttachment(
          TENANT_ID,
          USER_ID,
          CONCERN_ID,
          mockFile,
          baseDto,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when concern is sealed', async () => {
      mockTx.safeguardingConcern.findFirst.mockResolvedValue({
        id: CONCERN_ID,
        status: 'sealed',
      });

      await expect(
        service.uploadAttachment(
          TENANT_ID,
          USER_ID,
          CONCERN_ID,
          mockFile,
          baseDto,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should compute and store SHA-256 hash', async () => {
      await service.uploadAttachment(
        TENANT_ID,
        USER_ID,
        CONCERN_ID,
        mockFile,
        baseDto,
      );

      const createCall = mockTx.behaviourAttachment.create.mock.calls[0] as [
        { data: { sha256_hash: string } },
      ];
      const sha256 = createCall[0].data.sha256_hash;

      // SHA-256 is a 64-character hex string
      expect(sha256).toMatch(/^[a-f0-9]{64}$/);
      // Must be deterministic for the same input
      const crypto = await import('crypto');
      const expected = crypto
        .createHash('sha256')
        .update(mockFile.buffer)
        .digest('hex');
      expect(sha256).toBe(expected);
    });

    it('should return 202-style response with attachment_id', async () => {
      const result = (await service.uploadAttachment(
        TENANT_ID,
        USER_ID,
        CONCERN_ID,
        mockFile,
        baseDto,
      )) as { data: { attachment_id: string; status: string } };

      expect(result.data).toHaveProperty('attachment_id', ATTACHMENT_ID);
      expect(result.data).toHaveProperty('status', 'pending');
    });
  });

  // ─── generateDownloadUrl ────────────────────────────────────────────────────

  describe('generateDownloadUrl', () => {
    const mockCheckPermission = jest
      .fn()
      .mockResolvedValue({ allowed: true, context: 'normal' as const });

    const cleanAttachment = {
      id: ATTACHMENT_ID,
      tenant_id: TENANT_ID,
      entity_type: 'safeguarding_concern',
      entity_id: CONCERN_ID,
      file_key: `${TENANT_ID}/attachments/safeguarding_concern/${CONCERN_ID}/file.pdf`,
      file_name: 'report.pdf',
      scan_status: 'clean',
    };

    beforeEach(() => {
      mockPrisma.behaviourAttachment!.findFirst!.mockResolvedValue(
        cleanAttachment,
      );
      mockTx.safeguardingAction.create.mockResolvedValue({ id: 'action-1' });
    });

    it('should return download URL for clean attachment', async () => {
      const result = await service.generateDownloadUrl(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        CONCERN_ID,
        ATTACHMENT_ID,
        mockCheckPermission,
      );

      expect(result.data).toHaveProperty('download_url');
      expect(result.data.download_url).toContain('presigned');
    });

    it('should throw ForbiddenException for pending_scan attachment', async () => {
      mockPrisma.behaviourAttachment!.findFirst!.mockResolvedValue({
        ...cleanAttachment,
        scan_status: 'pending_scan',
      });

      await expect(
        service.generateDownloadUrl(
          TENANT_ID,
          USER_ID,
          MEMBERSHIP_ID,
          CONCERN_ID,
          ATTACHMENT_ID,
          mockCheckPermission,
        ),
      ).rejects.toThrow(ForbiddenException);

      try {
        await service.generateDownloadUrl(
          TENANT_ID,
          USER_ID,
          MEMBERSHIP_ID,
          CONCERN_ID,
          ATTACHMENT_ID,
          mockCheckPermission,
        );
      } catch (err) {
        const response = (err as ForbiddenException).getResponse() as {
          message: string;
        };
        expect(response.message).toContain('awaiting security scan');
      }
    });

    it('should throw ForbiddenException for infected attachment', async () => {
      mockPrisma.behaviourAttachment!.findFirst!.mockResolvedValue({
        ...cleanAttachment,
        scan_status: 'infected',
      });

      await expect(
        service.generateDownloadUrl(
          TENANT_ID,
          USER_ID,
          MEMBERSHIP_ID,
          CONCERN_ID,
          ATTACHMENT_ID,
          mockCheckPermission,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should create safeguarding_actions entry with document_downloaded', async () => {
      await service.generateDownloadUrl(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        CONCERN_ID,
        ATTACHMENT_ID,
        mockCheckPermission,
      );

      expect(mockTx.safeguardingAction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          concern_id: CONCERN_ID,
          action_by_id: USER_ID,
          action_type: 'document_downloaded',
          description: expect.stringContaining('report.pdf'),
        }),
      });
    });
  });

  // ─── listAttachments ────────────────────────────────────────────────────────

  describe('listAttachments', () => {
    it('should return all attachments for a concern with correct fields', async () => {
      const attachments = [
        {
          id: ATTACHMENT_ID,
          file_name: 'report.pdf',
          classification: 'evidence',
          scan_status: 'clean',
          file_size_bytes: BigInt(1024),
          uploaded_by: {
            id: USER_ID,
            first_name: 'Jane',
            last_name: 'Doe',
          },
          created_at: new Date('2026-01-15'),
        },
      ];

      mockPrisma.behaviourAttachment!.findMany!.mockResolvedValue(attachments);

      const result = await service.listAttachments(TENANT_ID, CONCERN_ID);

      expect(mockPrisma.behaviourAttachment!.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          entity_type: 'safeguarding_concern',
          entity_id: CONCERN_ID,
        },
        orderBy: { created_at: 'desc' },
        include: {
          uploaded_by: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      });

      expect(result.data).toHaveLength(1);
      const item = result.data[0]!;
      expect(item.id).toBe(ATTACHMENT_ID);
      expect(item.file_name).toBe('report.pdf');
      expect(item.classification).toBe('evidence');
      expect(item.scan_status).toBe('clean');
      // file_size_bytes should be a number, not BigInt
      expect(typeof item.file_size_bytes).toBe('number');
      expect(item.file_size_bytes).toBe(1024);
      expect(item.uploaded_by).toEqual({
        id: USER_ID,
        first_name: 'Jane',
        last_name: 'Doe',
      });
    });
  });
});
