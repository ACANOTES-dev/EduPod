/* eslint-disable import/order -- jest.mock must precede mocked imports */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

const mockTx = {
  behaviourIncident: {
    findFirst: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  behaviourAttachment: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  behaviourTask: {
    create: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};

const mockBehaviourQueue = {
  add: jest.fn().mockResolvedValue({}),
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

jest.mock('crypto', () => ({
  createHash: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('mock-sha256-hash'),
  }),
  randomUUID: jest.fn().mockReturnValue('file-uuid-123'),
}));

import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourAttachmentService } from './behaviour-attachment.service';
import { BehaviourHistoryService } from './behaviour-history.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const INCIDENT_ID = 'incident-1';
const ATTACHMENT_ID = 'attachment-1';

const makeMockFile = (overrides: Record<string, unknown> = {}) => ({
  buffer: Buffer.from('test file content'),
  originalname: 'test.pdf',
  mimetype: 'application/pdf',
  size: 1024,
  ...overrides,
});

const makeMockIncident = (overrides: Record<string, unknown> = {}) => ({
  id: INCIDENT_ID,
  tenant_id: TENANT_ID,
  status: 'active',
  category: { name: 'Test Category' },
  follow_up_required: true,
  ...overrides,
});

const makeMockAttachment = (overrides: Record<string, unknown> = {}) => ({
  id: ATTACHMENT_ID,
  tenant_id: TENANT_ID,
  entity_type: 'incident',
  entity_id: INCIDENT_ID,
  file_name: 'test.pdf',
  file_key: `${TENANT_ID}/attachments/incident/${INCIDENT_ID}/file-uuid-123.pdf`,
  file_size_bytes: BigInt(1024),
  mime_type: 'application/pdf',
  sha256_hash: 'mock-sha256-hash',
  classification: 'evidence',
  description: null,
  visibility: 'staff_all',
  scan_status: 'pending_scan',
  uploaded_by_id: USER_ID,
  created_at: new Date('2026-03-15'),
  ...overrides,
});

describe('BehaviourAttachmentService', () => {
  let service: BehaviourAttachmentService;
  let mockPrisma: Record<string, jest.Mock>;
  let mockAuditLogService: { write: jest.Mock };
  let mockHistoryService: { recordHistory: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      behaviourIncident: { findFirst: jest.fn() },
      behaviourAttachment: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    };

    mockAuditLogService = { write: jest.fn() };
    mockHistoryService = { recordHistory: jest.fn().mockResolvedValue(undefined) };

    mockTx.behaviourIncident.findFirst.mockResolvedValue(makeMockIncident());
    mockTx.behaviourAttachment.create.mockResolvedValue(makeMockAttachment());
    mockTx.behaviourAttachment.findFirst.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourAttachmentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: BehaviourHistoryService, useValue: mockHistoryService },
        { provide: 'BullQueue_behaviour', useValue: mockBehaviourQueue },
      ],
    }).compile();

    service = module.get<BehaviourAttachmentService>(BehaviourAttachmentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadAttachment', () => {
    beforeEach(() => {
      mockTx.behaviourIncident.findFirst.mockResolvedValue(makeMockIncident());
      mockTx.behaviourAttachment.create.mockResolvedValue(makeMockAttachment());
    });

    it('should upload attachment successfully', async () => {
      const file = makeMockFile();
      const dto = { classification: 'evidence', description: 'Test evidence' };

      const result = await service.uploadAttachment(TENANT_ID, USER_ID, INCIDENT_ID, file, dto);

      expect(result.data).toMatchObject({
        file_name: 'test.pdf',
        classification: 'evidence',
        scan_status: 'pending_scan',
        file_size_bytes: 1024,
      });
    });

    it('should throw PayloadTooLargeException for files over 10MB', async () => {
      const file = makeMockFile({ size: 11 * 1024 * 1024 });
      const dto = { classification: 'evidence' };

      await expect(
        service.uploadAttachment(TENANT_ID, USER_ID, INCIDENT_ID, file, dto),
      ).rejects.toThrow(PayloadTooLargeException);
    });

    it('should throw UnprocessableEntityException for invalid file extension', async () => {
      const file = makeMockFile({ originalname: 'test.exe' });
      const dto = { classification: 'evidence' };

      await expect(
        service.uploadAttachment(TENANT_ID, USER_ID, INCIDENT_ID, file, dto),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw NotFoundException when incident not found', async () => {
      mockTx.behaviourIncident.findFirst.mockResolvedValue(null);
      const file = makeMockFile();
      const dto = { classification: 'evidence' };

      await expect(
        service.uploadAttachment(TENANT_ID, USER_ID, INCIDENT_ID, file, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when incident is withdrawn', async () => {
      mockTx.behaviourIncident.findFirst.mockResolvedValue(makeMockIncident({ status: 'withdrawn' }));
      const file = makeMockFile();
      const dto = { classification: 'evidence' };

      await expect(
        service.uploadAttachment(TENANT_ID, USER_ID, INCIDENT_ID, file, dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should enqueue virus scan job', async () => {
      const file = makeMockFile();
      const dto = { classification: 'evidence' };

      await service.uploadAttachment(TENANT_ID, USER_ID, INCIDENT_ID, file, dto);

      expect(mockBehaviourQueue.add).toHaveBeenCalledWith(
        'behaviour:attachment-scan',
        expect.objectContaining({ tenant_id: TENANT_ID, attachment_id: ATTACHMENT_ID }),
      );
    });

    it('should record history entry', async () => {
      const file = makeMockFile();
      const dto = { classification: 'evidence' };

      await service.uploadAttachment(TENANT_ID, USER_ID, INCIDENT_ID, file, dto);

      expect(mockHistoryService.recordHistory).toHaveBeenCalled();
    });

    it('should write audit log', async () => {
      const file = makeMockFile();
      const dto = { classification: 'evidence' };

      await service.uploadAttachment(TENANT_ID, USER_ID, INCIDENT_ID, file, dto);

      expect(mockAuditLogService.write).toHaveBeenCalled();
    });

    it('should handle queue enqueue failure gracefully', async () => {
      mockBehaviourQueue.add.mockRejectedValue(new Error('Queue error'));
      const file = makeMockFile();
      const dto = { classification: 'evidence' };

      const result = await service.uploadAttachment(TENANT_ID, USER_ID, INCIDENT_ID, file, dto);

      expect(result.data.id).toBe(ATTACHMENT_ID);
    });

    it('should convert file size to BigInt', async () => {
      const file = makeMockFile({ size: 2048 });
      const dto = { classification: 'evidence' };

      await service.uploadAttachment(TENANT_ID, USER_ID, INCIDENT_ID, file, dto);

      expect(mockTx.behaviourAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ file_size_bytes: BigInt(2048) }),
        }),
      );
    });

    it('should set default visibility to staff_all', async () => {
      const file = makeMockFile();
      const dto = { classification: 'evidence' };

      await service.uploadAttachment(TENANT_ID, USER_ID, INCIDENT_ID, file, dto);

      expect(mockTx.behaviourAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ visibility: 'staff_all' }),
        }),
      );
    });
  });

  describe('listAttachments', () => {
    beforeEach(() => {
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue({ id: INCIDENT_ID });
    });

    it('should return list of attachments', async () => {
      mockPrisma.behaviourAttachment.findMany.mockResolvedValue([
        { ...makeMockAttachment(), uploaded_by: { id: USER_ID, first_name: 'John', last_name: 'Doe' } },
      ]);

      const result = await service.listAttachments(TENANT_ID, INCIDENT_ID);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ file_name: 'test.pdf', classification: 'evidence' });
    });

    it('should throw NotFoundException when incident not found', async () => {
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue(null);

      await expect(service.listAttachments(TENANT_ID, INCIDENT_ID)).rejects.toThrow(NotFoundException);
    });

    it('should filter by active retention status', async () => {
      await service.listAttachments(TENANT_ID, INCIDENT_ID);

      expect(mockPrisma.behaviourAttachment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ retention_status: 'active' }) }),
      );
    });

    it('should convert file_size_bytes to Number', async () => {
      mockPrisma.behaviourAttachment.findMany.mockResolvedValue([makeMockAttachment()]);

      const result = await service.listAttachments(TENANT_ID, INCIDENT_ID);

      expect(typeof result.data[0].file_size_bytes).toBe('number');
      expect(result.data[0].file_size_bytes).toBe(1024);
    });
  });

  describe('getAttachment', () => {
    beforeEach(() => {
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue({ id: INCIDENT_ID });
      mockPrisma.behaviourAttachment.findFirst.mockResolvedValue({
        ...makeMockAttachment(),
        uploaded_by: { id: USER_ID, first_name: 'John', last_name: 'Doe' },
      });
    });

    it('should return attachment details', async () => {
      const result = await service.getAttachment(TENANT_ID, USER_ID, INCIDENT_ID, ATTACHMENT_ID);

      expect(result.data).toMatchObject({ id: ATTACHMENT_ID, file_name: 'test.pdf' });
      expect(result.data.download_url).toContain('s3.example.com');
    });

    it('should throw NotFoundException when incident not found', async () => {
      mockPrisma.behaviourIncident.findFirst.mockResolvedValue(null);

      await expect(service.getAttachment(TENANT_ID, USER_ID, INCIDENT_ID, ATTACHMENT_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when attachment not found', async () => {
      mockPrisma.behaviourAttachment.findFirst.mockResolvedValue(null);

      await expect(service.getAttachment(TENANT_ID, USER_ID, INCIDENT_ID, ATTACHMENT_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when attachment entity mismatch', async () => {
      mockPrisma.behaviourAttachment.findFirst.mockResolvedValue({
        ...makeMockAttachment(),
        entity_id: 'different-incident',
      });

      await expect(service.getAttachment(TENANT_ID, USER_ID, INCIDENT_ID, ATTACHMENT_ID)).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when scan is pending', async () => {
      mockPrisma.behaviourAttachment.findFirst.mockResolvedValue({
        ...makeMockAttachment(),
        scan_status: 'pending_scan',
      });

      await expect(service.getAttachment(TENANT_ID, USER_ID, INCIDENT_ID, ATTACHMENT_ID)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when file is infected', async () => {
      mockPrisma.behaviourAttachment.findFirst.mockResolvedValue({
        ...makeMockAttachment(),
        scan_status: 'infected',
      });

      await expect(service.getAttachment(TENANT_ID, USER_ID, INCIDENT_ID, ATTACHMENT_ID)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when scan failed', async () => {
      mockPrisma.behaviourAttachment.findFirst.mockResolvedValue({
        ...makeMockAttachment(),
        scan_status: 'scan_failed',
      });

      await expect(service.getAttachment(TENANT_ID, USER_ID, INCIDENT_ID, ATTACHMENT_ID)).rejects.toThrow(ForbiddenException);
    });

    it('should write audit log on download', async () => {
      await service.getAttachment(TENANT_ID, USER_ID, INCIDENT_ID, ATTACHMENT_ID);

      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'behaviour_attachment',
        ATTACHMENT_ID,
        'behaviour_attachment_downloaded',
        expect.objectContaining({ incident_id: INCIDENT_ID }),
        null,
      );
    });
  });

  describe('recordFollowUp', () => {
    beforeEach(() => {
      mockTx.behaviourIncident.findFirst.mockResolvedValue(makeMockIncident());
    });

    it('should record follow-up successfully', async () => {
      const dto = { action_taken: 'Spoke with student', outcome: 'Student apologized', create_task: false };

      const result = await service.recordFollowUp(TENANT_ID, USER_ID, INCIDENT_ID, dto);

      expect(result.data.follow_up_recorded).toBe(true);
    });

    it('should throw NotFoundException when incident not found', async () => {
      mockTx.behaviourIncident.findFirst.mockResolvedValue(null);
      const dto = { action_taken: 'Test', create_task: false };

      await expect(service.recordFollowUp(TENANT_ID, USER_ID, INCIDENT_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when incident is withdrawn', async () => {
      mockTx.behaviourIncident.findFirst.mockResolvedValue(makeMockIncident({ status: 'withdrawn' }));
      const dto = { action_taken: 'Test', create_task: false };

      await expect(service.recordFollowUp(TENANT_ID, USER_ID, INCIDENT_ID, dto)).rejects.toThrow(ForbiddenException);
    });

    it('should record history entry', async () => {
      const dto = { action_taken: 'Test', outcome: 'Result', create_task: false };

      await service.recordFollowUp(TENANT_ID, USER_ID, INCIDENT_ID, dto);

      expect(mockHistoryService.recordHistory).toHaveBeenCalled();
    });

    it('should create follow-up task when create_task is true', async () => {
      const dto = {
        action_taken: 'Test',
        create_task: true,
        task_title: 'Follow up',
        task_due_date: '2026-03-22',
      };
      mockTx.behaviourTask.create.mockResolvedValue({
        id: 'task-1',
        title: 'Follow up',
        due_date: new Date('2026-03-22'),
        status: 'pending',
      });

      const result = await service.recordFollowUp(TENANT_ID, USER_ID, INCIDENT_ID, dto);

      expect(result.data.task).toBeDefined();
      expect(result.data.task.title).toBe('Follow up');
    });

    it('should not create task when create_task is false', async () => {
      const dto = { action_taken: 'Test', create_task: false };

      await service.recordFollowUp(TENANT_ID, USER_ID, INCIDENT_ID, dto);

      expect(mockTx.behaviourTask.create).not.toHaveBeenCalled();
    });

    it('should use userId as assigned_to when task_assigned_to_id not provided', async () => {
      const dto = { action_taken: 'Test', create_task: true, task_title: 'Task' };

      await service.recordFollowUp(TENANT_ID, USER_ID, INCIDENT_ID, dto);

      expect(mockTx.behaviourTask.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ assigned_to_id: USER_ID }) }),
      );
    });

    it('should update incident follow_up_required to false', async () => {
      const dto = { action_taken: 'Test', create_task: false };

      await service.recordFollowUp(TENANT_ID, USER_ID, INCIDENT_ID, dto);

      expect(mockTx.behaviourIncident.update).toHaveBeenCalledWith({
        where: { id: INCIDENT_ID },
        data: { follow_up_required: false },
      });
    });

    it('should complete existing pending follow-up tasks', async () => {
      const dto = { action_taken: 'Test', create_task: false };

      await service.recordFollowUp(TENANT_ID, USER_ID, INCIDENT_ID, dto);

      expect(mockTx.behaviourTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entity_type: 'incident',
            entity_id: INCIDENT_ID,
            task_type: 'follow_up',
          }),
          data: { status: 'completed' },
        }),
      );
    });

    it('should write audit log', async () => {
      const dto = { action_taken: 'Test', create_task: false };

      await service.recordFollowUp(TENANT_ID, USER_ID, INCIDENT_ID, dto);

      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'behaviour_incident',
        INCIDENT_ID,
        'follow_up_recorded',
        expect.objectContaining({ action_taken: 'Test' }),
        null,
      );
    });
  });
});
