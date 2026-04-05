/* eslint-disable import/order -- jest.mock must precede mocked imports */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware');

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourAttachmentService } from './behaviour-attachment.service';
import { BehaviourHistoryService } from './behaviour-history.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const INCIDENT_ID = 'incident-1';
const ATTACHMENT_ID = 'attachment-1';

const makeFile = (overrides: Partial<{ size: number; originalname: string }> = {}) => ({
  buffer: Buffer.from('test-file-content'),
  originalname: overrides.originalname ?? 'report.pdf',
  mimetype: 'application/pdf',
  size: overrides.size ?? 1024,
});

const makeIncident = (overrides: Record<string, unknown> = {}) => ({
  id: INCIDENT_ID,
  status: 'open',
  ...overrides,
});

const makeAttachment = (overrides: Record<string, unknown> = {}) => ({
  id: ATTACHMENT_ID,
  tenant_id: TENANT_ID,
  entity_type: 'incident',
  entity_id: INCIDENT_ID,
  file_name: 'report.pdf',
  file_key: `${TENANT_ID}/attachments/incident/${INCIDENT_ID}/uuid.pdf`,
  file_size_bytes: BigInt(1024),
  mime_type: 'application/pdf',
  sha256_hash: 'abc123',
  classification: 'supporting_evidence',
  description: null,
  visibility: 'staff_all',
  scan_status: 'clean',
  retention_status: 'active',
  created_at: new Date('2026-04-01'),
  uploaded_by: { id: USER_ID, first_name: 'John', last_name: 'Doe' },
  ...overrides,
});

// ─── Mock factories ─────────────────────────────────────────────────────────

const makeMockDb = () => ({
  behaviourIncident: {
    findFirst: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  behaviourAttachment: {
    create: jest.fn().mockResolvedValue({
      id: ATTACHMENT_ID,
      file_name: 'report.pdf',
      classification: 'supporting_evidence',
      scan_status: 'pending_scan',
      file_size_bytes: BigInt(1024),
      created_at: new Date('2026-04-01'),
    }),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  behaviourTask: {
    create: jest
      .fn()
      .mockResolvedValue({ id: 'task-1', title: 'Follow up', due_date: null, status: 'pending' }),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
});

const makeMockPrisma = () => ({
  behaviourIncident: {
    findFirst: jest.fn(),
  },
  behaviourAttachment: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
});

describe('BehaviourAttachmentService', () => {
  let service: BehaviourAttachmentService;
  let mockDb: ReturnType<typeof makeMockDb>;
  let mockPrisma: ReturnType<typeof makeMockPrisma>;
  let mockQueue: { add: jest.Mock };
  let mockAuditLog: { write: jest.Mock };
  let mockHistory: { recordHistory: jest.Mock };

  beforeEach(async () => {
    mockDb = makeMockDb();
    mockPrisma = makeMockPrisma();
    mockQueue = { add: jest.fn().mockResolvedValue(undefined) };
    mockAuditLog = { write: jest.fn().mockResolvedValue(undefined) };
    mockHistory = { recordHistory: jest.fn().mockResolvedValue(undefined) };

    const mockTx = jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn(mockDb);
    });

    (createRlsClient as jest.Mock).mockReturnValue({ $transaction: mockTx });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourAttachmentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: BehaviourHistoryService, useValue: mockHistory },
        { provide: getQueueToken('behaviour'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<BehaviourAttachmentService>(BehaviourAttachmentService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── uploadAttachment ──────────────────────────────────────────────────

  describe('BehaviourAttachmentService -- uploadAttachment', () => {
    it('should upload a valid file and return attachment data', async () => {
      mockDb.behaviourIncident.findFirst.mockResolvedValue(makeIncident());

      const result = await service.uploadAttachment(TENANT_ID, USER_ID, INCIDENT_ID, makeFile(), {
        classification: 'supporting_evidence',
      });

      expect(result.data.id).toBe(ATTACHMENT_ID);
      expect(result.data.scan_status).toBe('pending_scan');
      expect(mockDb.behaviourAttachment.create).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockHistory.recordHistory).toHaveBeenCalledTimes(1);
    });

    it('should throw PayloadTooLargeException for oversized files', async () => {
      await expect(
        service.uploadAttachment(
          TENANT_ID,
          USER_ID,
          INCIDENT_ID,
          makeFile({ size: 11 * 1024 * 1024 }),
          { classification: 'supporting_evidence' },
        ),
      ).rejects.toThrow(PayloadTooLargeException);
    });

    it('should throw UnprocessableEntityException for disallowed file types', async () => {
      await expect(
        service.uploadAttachment(
          TENANT_ID,
          USER_ID,
          INCIDENT_ID,
          makeFile({ originalname: 'virus.exe' }),
          { classification: 'supporting_evidence' },
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw NotFoundException when incident does not exist', async () => {
      mockDb.behaviourIncident.findFirst.mockResolvedValue(null);

      await expect(
        service.uploadAttachment(TENANT_ID, USER_ID, INCIDENT_ID, makeFile(), {
          classification: 'supporting_evidence',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when incident is withdrawn', async () => {
      mockDb.behaviourIncident.findFirst.mockResolvedValue(makeIncident({ status: 'withdrawn' }));

      await expect(
        service.uploadAttachment(TENANT_ID, USER_ID, INCIDENT_ID, makeFile(), {
          classification: 'supporting_evidence',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── listAttachments ───────────────────────────────────────────────────

  describe('BehaviourAttachmentService -- listAttachments', () => {
    it('should return attachments for an existing incident', async () => {
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue(makeIncident());
      mockPrisma.behaviourAttachment.findMany.mockResolvedValue([makeAttachment()]);

      const result = await service.listAttachments(TENANT_ID, INCIDENT_ID);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.id).toBe(ATTACHMENT_ID);
      expect(typeof result.data[0]!.file_size_bytes).toBe('number');
    });

    it('should throw NotFoundException when incident does not exist', async () => {
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue(null);

      await expect(service.listAttachments(TENANT_ID, INCIDENT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getAttachment ─────────────────────────────────────────────────────

  describe('BehaviourAttachmentService -- getAttachment', () => {
    it('should return attachment with download URL when scan is clean', async () => {
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue(makeIncident());
      mockPrisma.behaviourAttachment.findFirst.mockResolvedValue(makeAttachment());

      const result = await service.getAttachment(TENANT_ID, USER_ID, INCIDENT_ID, ATTACHMENT_ID);

      expect(result.data.id).toBe(ATTACHMENT_ID);
      expect(result.data.download_url).toContain('presigned');
    });

    it('should throw NotFoundException when attachment does not exist', async () => {
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue(makeIncident());
      mockPrisma.behaviourAttachment.findFirst.mockResolvedValue(null);

      await expect(
        service.getAttachment(TENANT_ID, USER_ID, INCIDENT_ID, ATTACHMENT_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when scan is pending', async () => {
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue(makeIncident());
      mockPrisma.behaviourAttachment.findFirst.mockResolvedValue(
        makeAttachment({ scan_status: 'pending_scan' }),
      );

      await expect(
        service.getAttachment(TENANT_ID, USER_ID, INCIDENT_ID, ATTACHMENT_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when file is infected', async () => {
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue(makeIncident());
      mockPrisma.behaviourAttachment.findFirst.mockResolvedValue(
        makeAttachment({ scan_status: 'infected' }),
      );

      await expect(
        service.getAttachment(TENANT_ID, USER_ID, INCIDENT_ID, ATTACHMENT_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when attachment belongs to a different entity', async () => {
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue(makeIncident());
      mockPrisma.behaviourAttachment.findFirst.mockResolvedValue(
        makeAttachment({ entity_id: 'other-incident' }),
      );

      await expect(
        service.getAttachment(TENANT_ID, USER_ID, INCIDENT_ID, ATTACHMENT_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── recordFollowUp ───────────────────────────────────────────────────

  describe('BehaviourAttachmentService -- recordFollowUp', () => {
    it('should record follow-up and clear follow_up_required flag', async () => {
      mockDb.behaviourIncident.findFirst.mockResolvedValue(
        makeIncident({ follow_up_required: true, category: { name: 'Disruption' } }),
      );

      const result = await service.recordFollowUp(TENANT_ID, USER_ID, INCIDENT_ID, {
        action_taken: 'Spoke to parents',
        create_task: false,
      });

      expect(result.data.follow_up_recorded).toBe(true);
      expect(result.data.action_taken).toBe('Spoke to parents');
      expect(mockHistory.recordHistory).toHaveBeenCalledTimes(1);
    });

    it('should create a task when create_task is true', async () => {
      mockDb.behaviourIncident.findFirst.mockResolvedValue(
        makeIncident({ follow_up_required: false, category: { name: 'Disruption' } }),
      );

      const result = await service.recordFollowUp(TENANT_ID, USER_ID, INCIDENT_ID, {
        action_taken: 'Called parents',
        create_task: true,
        task_title: 'Follow up with student',
      });

      expect(result.data.task).toBeTruthy();
      expect(mockDb.behaviourTask.create).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when incident does not exist', async () => {
      mockDb.behaviourIncident.findFirst.mockResolvedValue(null);

      await expect(
        service.recordFollowUp(TENANT_ID, USER_ID, INCIDENT_ID, {
          action_taken: 'Test',
          create_task: false,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when incident is withdrawn', async () => {
      mockDb.behaviourIncident.findFirst.mockResolvedValue(
        makeIncident({ status: 'withdrawn', category: { name: 'N/A' } }),
      );

      await expect(
        service.recordFollowUp(TENANT_ID, USER_ID, INCIDENT_ID, {
          action_taken: 'Test',
          create_task: false,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when incident is closed_after_appeal', async () => {
      mockDb.behaviourIncident.findFirst.mockResolvedValue(
        makeIncident({ status: 'closed_after_appeal', category: { name: 'N/A' } }),
      );

      await expect(
        service.recordFollowUp(TENANT_ID, USER_ID, INCIDENT_ID, {
          action_taken: 'Test',
          create_task: false,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should not update follow_up_required when already false', async () => {
      mockDb.behaviourIncident.findFirst.mockResolvedValue(
        makeIncident({ follow_up_required: false, category: { name: 'Disruption' } }),
      );

      await service.recordFollowUp(TENANT_ID, USER_ID, INCIDENT_ID, {
        action_taken: 'Test',
        create_task: false,
      });

      expect(mockDb.behaviourIncident.update).not.toHaveBeenCalled();
    });

    it('should create task with custom assigned_to_id and due_date', async () => {
      mockDb.behaviourIncident.findFirst.mockResolvedValue(
        makeIncident({ follow_up_required: false, category: { name: 'Disruption' } }),
      );

      await service.recordFollowUp(TENANT_ID, USER_ID, INCIDENT_ID, {
        action_taken: 'Emailed parents',
        create_task: true,
        task_title: 'Check on student',
        task_assigned_to_id: 'other-staff',
        task_due_date: '2026-04-10',
      });

      expect(mockDb.behaviourTask.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          assigned_to_id: 'other-staff',
          due_date: new Date('2026-04-10'),
        }),
      });
    });

    it('should pass outcome to history when provided', async () => {
      mockDb.behaviourIncident.findFirst.mockResolvedValue(
        makeIncident({ follow_up_required: false, category: { name: 'Disruption' } }),
      );

      await service.recordFollowUp(TENANT_ID, USER_ID, INCIDENT_ID, {
        action_taken: 'Called parents',
        outcome: 'resolved',
        create_task: false,
      });

      expect(mockHistory.recordHistory).toHaveBeenCalledWith(
        expect.anything(),
        TENANT_ID,
        'incident',
        INCIDENT_ID,
        USER_ID,
        'follow_up_recorded',
        null,
        expect.objectContaining({
          action_taken: 'Called parents',
          outcome: 'resolved',
        }),
      );
    });
  });

  // ─── uploadAttachment — additional branches ───────────────────────────────

  describe('uploadAttachment — additional branches', () => {
    it('should throw ForbiddenException when incident is closed_after_appeal', async () => {
      mockDb.behaviourIncident.findFirst.mockResolvedValue(
        makeIncident({ status: 'closed_after_appeal' }),
      );

      await expect(
        service.uploadAttachment(TENANT_ID, USER_ID, INCIDENT_ID, makeFile(), {
          classification: 'supporting_evidence',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('edge: should continue when scan job queue fails', async () => {
      mockDb.behaviourIncident.findFirst.mockResolvedValue(makeIncident());
      mockQueue.add.mockRejectedValue(new Error('Queue down'));

      const result = await service.uploadAttachment(TENANT_ID, USER_ID, INCIDENT_ID, makeFile(), {
        classification: 'supporting_evidence',
      });

      // Upload still succeeds even if scan queue fails
      expect(result.data.id).toBe(ATTACHMENT_ID);
    });
  });

  // ─── getAttachment — scan_failed branch ───────────────────────────────────

  describe('getAttachment — scan_failed', () => {
    it('should throw ForbiddenException when scan failed', async () => {
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue(makeIncident());
      mockPrisma.behaviourAttachment.findFirst.mockResolvedValue(
        makeAttachment({ scan_status: 'scan_failed' }),
      );

      await expect(
        service.getAttachment(TENANT_ID, USER_ID, INCIDENT_ID, ATTACHMENT_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when incident does not exist', async () => {
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue(null);

      await expect(
        service.getAttachment(TENANT_ID, USER_ID, INCIDENT_ID, ATTACHMENT_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when attachment has different entity_type', async () => {
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue(makeIncident());
      mockPrisma.behaviourAttachment.findFirst.mockResolvedValue(
        makeAttachment({ entity_type: 'sanction' }),
      );

      await expect(
        service.getAttachment(TENANT_ID, USER_ID, INCIDENT_ID, ATTACHMENT_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
