import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

import { BehaviourDocumentTemplateService } from './behaviour-document-template.service';
import { BehaviourDocumentService } from './behaviour-document.service';
import { BehaviourHistoryService } from './behaviour-history.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const DOCUMENT_ID = 'doc-1';
const INCIDENT_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = 'student-1';
const TEMPLATE_ID = 'template-1';
const S3_KEY = 'behaviour/documents/parent_notification/doc-1.pdf';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  behaviourDocument: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  behaviourDocumentTemplate: {
    findFirst: jest.fn(),
  },
  behaviourParentAcknowledgement: {
    create: jest.fn(),
  },
  tenantSetting: {
    findFirst: jest.fn(),
  },
  academicYear: {
    findFirst: jest.fn(),
  },
  behaviourIncident: {
    findFirst: jest.fn(),
  },
  behaviourSanction: {
    findFirst: jest.fn(),
  },
  behaviourAppeal: {
    findFirst: jest.fn(),
  },
  behaviourExclusionCase: {
    findFirst: jest.fn(),
  },
  behaviourIntervention: {
    findFirst: jest.fn(),
  },
  studentParent: {
    findFirst: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Factory helpers ─────────────────────────────────────────────────────────

const makeTemplate = (overrides: Record<string, unknown> = {}) => ({
  id: TEMPLATE_ID,
  tenant_id: TENANT_ID,
  document_type: 'parent_notification',
  locale: 'en',
  name: 'Parent Notification',
  template_body: '<p>Hello {{student_name}}</p>',
  is_active: true,
  ...overrides,
});

const makeDocument = (overrides: Record<string, unknown> = {}) => ({
  id: DOCUMENT_ID,
  tenant_id: TENANT_ID,
  document_type: 'parent_notification',
  template_id: TEMPLATE_ID,
  entity_type: 'incident',
  entity_id: INCIDENT_ID,
  student_id: STUDENT_ID,
  generated_by_id: USER_ID,
  generated_at: new Date('2026-03-27'),
  file_key: S3_KEY,
  file_size_bytes: BigInt(12345),
  sha256_hash: 'abc123',
  locale: 'en',
  data_snapshot: {},
  status: 'draft_doc',
  ...overrides,
});

// ─── Result shape ─────────────────────────────────────────────────────────────

interface DocumentResult {
  data: {
    id: string;
    status: string;
    file_size_bytes: number;
    [key: string]: unknown;
  };
}

describe('BehaviourDocumentService', () => {
  let service: BehaviourDocumentService;
  let mockPrisma: {
    behaviourDocument: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };
  let mockS3: { upload: jest.Mock; getPresignedUrl: jest.Mock };
  let mockPdf: { renderFromHtml: jest.Mock };
  let mockTemplateService: { getActiveTemplate: jest.Mock };
  let mockHistoryService: { recordHistory: jest.Mock };
  let mockPdfQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      behaviourDocument: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    mockS3 = {
      upload: jest.fn().mockResolvedValue(S3_KEY),
      getPresignedUrl: jest.fn().mockResolvedValue('https://s3.example.com/presigned'),
    };

    mockPdf = {
      renderFromHtml: jest.fn().mockResolvedValue(Buffer.from('fake-pdf-content')),
    };

    mockTemplateService = {
      getActiveTemplate: jest.fn(),
    };

    mockHistoryService = {
      recordHistory: jest.fn().mockResolvedValue(undefined),
    };

    mockPdfQueue = {
      add: jest.fn().mockResolvedValue({}),
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourDocumentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
        { provide: PdfRenderingService, useValue: mockPdf },
        { provide: BehaviourDocumentTemplateService, useValue: mockTemplateService },
        { provide: BehaviourHistoryService, useValue: mockHistoryService },
        { provide: getQueueToken('pdf-rendering'), useValue: mockPdfQueue },
      ],
    }).compile();

    service = module.get<BehaviourDocumentService>(BehaviourDocumentService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── generateDocument ────────────────────────────────────────────────────

  describe('generateDocument', () => {
    const baseDto = {
      document_type: 'detention_notice' as const,
      entity_type: 'incident' as const,
      entity_id: INCIDENT_ID,
    };

    const setupIncidentMocks = () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(null);
      mockTemplateService.getActiveTemplate.mockResolvedValue(makeTemplate());

      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({
        settings: { school_name: 'Test School' },
      });
      mockRlsTx.academicYear.findFirst.mockResolvedValue({ name: '2025/26' });
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue({
        id: INCIDENT_ID,
        occurred_at: new Date('2026-03-15'),
        parent_description: 'Test incident description',
        location: 'Corridor',
        category: { name: 'Disruption' },
        context_snapshot: null,
        participants: [
          {
            student_id: STUDENT_ID,
            student: {
              first_name: 'Alice',
              last_name: 'Smith',
              date_of_birth: new Date('2015-06-01'),
              year_group: { name: 'Year 4' },
              class_enrolments: [{ class_entity: { name: '4A' } }],
            },
          },
        ],
      });
      mockRlsTx.studentParent.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourDocument.create.mockResolvedValue(
        makeDocument({ status: 'generating', file_size_bytes: BigInt(0) }),
      );
    };

    it('should load template, render HTML, create placeholder record, enqueue PDF job, record history', async () => {
      setupIncidentMocks();

      const result = (await service.generateDocument(
        TENANT_ID,
        USER_ID,
        baseDto,
      )) as DocumentResult;

      expect(mockTemplateService.getActiveTemplate).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'detention_notice',
        'en',
      );
      expect(mockRlsTx.behaviourDocument.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          document_type: 'detention_notice',
          template_id: TEMPLATE_ID,
          entity_type: 'incident',
          entity_id: INCIDENT_ID,
          student_id: STUDENT_ID,
          generated_by_id: USER_ID,
          status: 'generating',
          file_size_bytes: BigInt(0),
        }),
      });
      expect(mockPdfQueue.add).toHaveBeenCalledWith(
        'pdf:render',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          callback_queue_name: 'behaviour',
          callback_job_name: 'behaviour:document-ready',
        }),
      );
      expect(mockHistoryService.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'incident',
        INCIDENT_ID,
        USER_ID,
        'document_generated',
        null,
        expect.objectContaining({ document_type: 'detention_notice' }),
      );
      expect(result.data).toBeDefined();
      expect(result.data.status).toBe('generating');
    });

    it('should throw NotFoundException when no active template is found', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(null);
      mockTemplateService.getActiveTemplate.mockResolvedValue(null);

      await expect(service.generateDocument(TENANT_ID, USER_ID, baseDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should use template_id directly when provided in dto', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(makeTemplate());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: {} });
      mockRlsTx.academicYear.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue({
        id: INCIDENT_ID,
        occurred_at: new Date('2026-03-15'),
        parent_description: 'desc',
        location: null,
        category: null,
        context_snapshot: null,
        participants: [
          {
            student_id: STUDENT_ID,
            student: {
              first_name: 'Bob',
              last_name: 'Jones',
              date_of_birth: null,
              year_group: null,
              class_enrolments: [],
            },
          },
        ],
      });
      mockRlsTx.studentParent.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourDocument.create.mockResolvedValue(
        makeDocument({ status: 'generating', file_size_bytes: BigInt(0) }),
      );

      await service.generateDocument(TENANT_ID, USER_ID, {
        ...baseDto,
        template_id: TEMPLATE_ID,
      });

      // When template_id is provided, templateService.getActiveTemplate should NOT be called
      expect(mockTemplateService.getActiveTemplate).not.toHaveBeenCalled();
      expect(mockRlsTx.behaviourDocumentTemplate.findFirst).toHaveBeenCalledWith({
        where: { id: TEMPLATE_ID, tenant_id: TENANT_ID, is_active: true },
      });
    });
  });

  // ─── listDocuments ───────────────────────────────────────────────────────

  describe('listDocuments', () => {
    it('should return paginated documents with meta', async () => {
      const doc = makeDocument();
      mockPrisma.behaviourDocument.findMany.mockResolvedValue([
        { ...doc, student: null, generated_by: null, template: null },
      ]);
      mockPrisma.behaviourDocument.count.mockResolvedValue(1);

      const result = await service.listDocuments(TENANT_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.status).toBe('draft');
      expect(result.data[0]!.file_size_bytes).toBe(12345);
    });

    it('should forward entity_type and entity_id filters to DB query', async () => {
      mockPrisma.behaviourDocument.findMany.mockResolvedValue([]);
      mockPrisma.behaviourDocument.count.mockResolvedValue(0);

      await service.listDocuments(TENANT_ID, {
        page: 1,
        pageSize: 20,
        entity_type: 'incident' as const,
        entity_id: INCIDENT_ID,
      });

      expect(mockPrisma.behaviourDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entity_type: 'incident',
            entity_id: INCIDENT_ID,
          }),
        }),
      );
    });
  });

  // ─── getDocument ─────────────────────────────────────────────────────────

  describe('getDocument', () => {
    it('should return a document by ID', async () => {
      const doc = makeDocument();
      mockPrisma.behaviourDocument.findFirst.mockResolvedValue({
        ...doc,
        student: null,
        generated_by: null,
        template: null,
      });

      const result = await service.getDocument(TENANT_ID, DOCUMENT_ID);

      // serializeDocument spreads doc keys — access via index to satisfy strict TS
      const data = result.data as Record<string, unknown>;
      expect(data['id']).toBe(DOCUMENT_ID);
      expect(data['status']).toBe('draft');
      expect(mockPrisma.behaviourDocument.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: DOCUMENT_ID, tenant_id: TENANT_ID },
        }),
      );
    });

    it('should throw NotFoundException for non-existent document', async () => {
      mockPrisma.behaviourDocument.findFirst.mockResolvedValue(null);

      await expect(service.getDocument(TENANT_ID, 'no-such-doc')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── finaliseDocument ────────────────────────────────────────────────────

  describe('finaliseDocument', () => {
    it('should transition draft_doc to finalised and record history', async () => {
      const draft = makeDocument({ status: 'draft_doc' });
      const finalised = makeDocument({ status: 'finalised' });

      mockRlsTx.behaviourDocument.findFirst.mockResolvedValue(draft);
      mockRlsTx.behaviourDocument.update.mockResolvedValue(finalised);

      const result = (await service.finaliseDocument(
        TENANT_ID,
        USER_ID,
        DOCUMENT_ID,
        'Approved',
      )) as DocumentResult;

      expect(mockRlsTx.behaviourDocument.update).toHaveBeenCalledWith({
        where: { id: DOCUMENT_ID },
        data: { status: 'finalised' },
      });
      expect(mockHistoryService.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'incident',
        INCIDENT_ID,
        USER_ID,
        'document_finalised',
        null,
        expect.objectContaining({ document_id: DOCUMENT_ID, notes: 'Approved' }),
      );
      expect(result.data.status).toBe('finalised');
    });

    it('should throw BadRequestException when document is not in draft status', async () => {
      const sent = makeDocument({ status: 'sent_doc' });
      mockRlsTx.behaviourDocument.findFirst.mockResolvedValue(sent);

      await expect(service.finaliseDocument(TENANT_ID, USER_ID, DOCUMENT_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when document does not exist', async () => {
      mockRlsTx.behaviourDocument.findFirst.mockResolvedValue(null);

      await expect(service.finaliseDocument(TENANT_ID, USER_ID, 'missing-doc')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── sendDocument ────────────────────────────────────────────────────────

  describe('sendDocument', () => {
    const sendDto = {
      channel: 'email' as const,
      recipient_parent_id: 'aaaaaaaa-aaaa-aaaa-aaaa-bbbbbbbbbbbb',
    };

    it('should transition finalised to sent_doc and create acknowledgement', async () => {
      const finalised = makeDocument({ status: 'finalised' });
      const sent = makeDocument({ status: 'sent_doc' });

      mockRlsTx.behaviourDocument.findFirst.mockResolvedValue({
        ...finalised,
        student: { id: STUDENT_ID, first_name: 'Alice', last_name: 'Smith' },
      });
      mockRlsTx.behaviourDocument.update.mockResolvedValue(sent);
      mockRlsTx.behaviourParentAcknowledgement.create.mockResolvedValue({ id: 'ack-1' });

      const result = (await service.sendDocument(
        TENANT_ID,
        USER_ID,
        DOCUMENT_ID,
        sendDto,
      )) as DocumentResult;

      expect(mockRlsTx.behaviourDocument.update).toHaveBeenCalledWith({
        where: { id: DOCUMENT_ID },
        data: expect.objectContaining({
          status: 'sent_doc',
          sent_via: 'email',
        }),
      });
      expect(mockRlsTx.behaviourParentAcknowledgement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          incident_id: INCIDENT_ID,
          parent_id: sendDto.recipient_parent_id,
          channel: 'email',
        }),
      });
      expect(result.data.status).toBe('sent');
    });

    it('should throw BadRequestException when document is not finalised', async () => {
      const draft = makeDocument({ status: 'draft_doc' });
      mockRlsTx.behaviourDocument.findFirst.mockResolvedValue({
        ...draft,
        student: null,
      });

      await expect(service.sendDocument(TENANT_ID, USER_ID, DOCUMENT_ID, sendDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should skip acknowledgement creation when no recipient_parent_id provided', async () => {
      const finalised = makeDocument({ status: 'finalised' });
      const sent = makeDocument({ status: 'sent_doc' });

      mockRlsTx.behaviourDocument.findFirst.mockResolvedValue({
        ...finalised,
        student: null,
      });
      mockRlsTx.behaviourDocument.update.mockResolvedValue(sent);

      await service.sendDocument(TENANT_ID, USER_ID, DOCUMENT_ID, {
        channel: 'print' as const,
      });

      expect(mockRlsTx.behaviourParentAcknowledgement.create).not.toHaveBeenCalled();
    });
  });

  // ─── getDownloadUrl ──────────────────────────────────────────────────────

  describe('getDownloadUrl', () => {
    it('should return a presigned URL with expiry', async () => {
      const doc = makeDocument();
      mockPrisma.behaviourDocument.findFirst.mockResolvedValue(doc);
      mockS3.getPresignedUrl.mockResolvedValue('https://s3.example.com/presigned?expires=900');

      const result = await service.getDownloadUrl(TENANT_ID, DOCUMENT_ID);

      expect(mockS3.getPresignedUrl).toHaveBeenCalledWith(S3_KEY, 900);
      expect(result.data.url).toBe('https://s3.example.com/presigned?expires=900');
      expect(result.data.expires_in).toBe(900);
    });

    it('should throw NotFoundException when document does not exist', async () => {
      mockPrisma.behaviourDocument.findFirst.mockResolvedValue(null);

      await expect(service.getDownloadUrl(TENANT_ID, 'no-such-doc')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── sendDocument — print channel ────────────────────────────────────────

  describe('sendDocument — print channel', () => {
    it('should return download_url for print channel without changing status', async () => {
      const finalised = makeDocument({ status: 'finalised' });
      mockRlsTx.behaviourDocument.findFirst.mockResolvedValue({
        ...finalised,
        student: null,
      });
      mockS3.getPresignedUrl.mockResolvedValue('https://s3.example.com/print-url');

      const result = (await service.sendDocument(TENANT_ID, USER_ID, DOCUMENT_ID, {
        channel: 'print' as const,
      })) as { data: { download_url: string; status: string } };

      expect(result.data.download_url).toBe('https://s3.example.com/print-url');
      expect(mockRlsTx.behaviourDocument.update).not.toHaveBeenCalled();
    });
  });

  // ─── sendDocument — NotFoundException ────────────────────────────────────

  describe('sendDocument — not found', () => {
    it('should throw NotFoundException when document does not exist', async () => {
      mockRlsTx.behaviourDocument.findFirst.mockResolvedValue(null);

      await expect(
        service.sendDocument(TENANT_ID, USER_ID, 'missing', {
          channel: 'email' as const,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── sendDocument — sanction entity type ─────────────────────────────────

  describe('sendDocument — sanction entity type ack', () => {
    it('should create acknowledgement with sanction_id for sanction documents', async () => {
      const finalised = makeDocument({
        status: 'finalised',
        entity_type: 'sanction',
        entity_id: 'sanction-1',
      });
      const sent = makeDocument({ status: 'sent_doc', entity_type: 'sanction' });

      mockRlsTx.behaviourDocument.findFirst.mockResolvedValue({
        ...finalised,
        student: null,
      });
      mockRlsTx.behaviourDocument.update.mockResolvedValue(sent);
      mockRlsTx.behaviourParentAcknowledgement.create.mockResolvedValue({ id: 'ack-1' });

      await service.sendDocument(TENANT_ID, USER_ID, DOCUMENT_ID, {
        channel: 'email' as const,
        recipient_parent_id: 'parent-1',
      });

      expect(mockRlsTx.behaviourParentAcknowledgement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          incident_id: null,
          sanction_id: 'sanction-1',
        }),
      });
    });
  });

  // ─── sendDocument — no recipient_parent_id for non-print ─────────────────

  describe('sendDocument — no ack without recipient', () => {
    it('should not create acknowledgement row when no recipient_parent_id for email channel', async () => {
      const finalised = makeDocument({ status: 'finalised' });
      const sent = makeDocument({ status: 'sent_doc' });

      mockRlsTx.behaviourDocument.findFirst.mockResolvedValue({
        ...finalised,
        student: null,
      });
      mockRlsTx.behaviourDocument.update.mockResolvedValue(sent);

      await service.sendDocument(TENANT_ID, USER_ID, DOCUMENT_ID, {
        channel: 'email' as const,
      });

      expect(mockRlsTx.behaviourParentAcknowledgement.create).not.toHaveBeenCalled();
    });
  });

  // ─── listDocuments — status mapping ──────────────────────────────────────

  describe('listDocuments — status filter', () => {
    it('should map draft to draft_doc in where clause', async () => {
      mockPrisma.behaviourDocument.findMany.mockResolvedValue([]);
      mockPrisma.behaviourDocument.count.mockResolvedValue(0);

      await service.listDocuments(TENANT_ID, {
        page: 1,
        pageSize: 20,
        status: 'draft',
      });

      expect(mockPrisma.behaviourDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'draft_doc',
          }),
        }),
      );
    });

    it('should map sent to sent_doc in where clause', async () => {
      mockPrisma.behaviourDocument.findMany.mockResolvedValue([]);
      mockPrisma.behaviourDocument.count.mockResolvedValue(0);

      await service.listDocuments(TENANT_ID, {
        page: 1,
        pageSize: 20,
        status: 'sent',
      });

      expect(mockPrisma.behaviourDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'sent_doc',
          }),
        }),
      );
    });

    it('should pass unmapped status directly (e.g. finalised)', async () => {
      mockPrisma.behaviourDocument.findMany.mockResolvedValue([]);
      mockPrisma.behaviourDocument.count.mockResolvedValue(0);

      await service.listDocuments(TENANT_ID, {
        page: 1,
        pageSize: 20,
        status: 'finalised',
      });

      expect(mockPrisma.behaviourDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'finalised',
          }),
        }),
      );
    });

    it('should filter by student_id and document_type', async () => {
      mockPrisma.behaviourDocument.findMany.mockResolvedValue([]);
      mockPrisma.behaviourDocument.count.mockResolvedValue(0);

      await service.listDocuments(TENANT_ID, {
        page: 1,
        pageSize: 20,
        student_id: STUDENT_ID,
        document_type: 'detention_notice',
      });

      expect(mockPrisma.behaviourDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: STUDENT_ID,
            document_type: 'detention_notice',
          }),
        }),
      );
    });
  });

  // ─── autoGenerateDocument ────────────────────────────────────────────────

  describe('autoGenerateDocument', () => {
    it('should return null when no active template found', async () => {
      mockTemplateService.getActiveTemplate.mockResolvedValue(null);

      const result = await service.autoGenerateDocument(
        mockRlsTx as unknown as PrismaService,
        TENANT_ID,
        USER_ID,
        'parent_notification',
        'incident',
        INCIDENT_ID,
        STUDENT_ID,
        'en',
      );

      expect(result).toBeNull();
    });

    it('should create document and enqueue PDF render job', async () => {
      mockTemplateService.getActiveTemplate.mockResolvedValue(makeTemplate());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: {} });
      mockRlsTx.academicYear.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue({
        id: INCIDENT_ID,
        occurred_at: new Date('2026-03-15'),
        parent_description: null,
        location: null,
        category: null,
        context_snapshot: null,
        participants: [
          {
            student_id: STUDENT_ID,
            student: {
              first_name: 'Alice',
              last_name: 'Smith',
              date_of_birth: null,
              year_group: null,
              class_enrolments: [],
            },
          },
        ],
      });
      mockRlsTx.studentParent.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourDocument.create.mockResolvedValue(makeDocument({ status: 'generating' }));

      const result = await service.autoGenerateDocument(
        mockRlsTx as unknown as PrismaService,
        TENANT_ID,
        USER_ID,
        'parent_notification',
        'incident',
        INCIDENT_ID,
        STUDENT_ID,
        'en',
      );

      expect(result).not.toBeNull();
      expect(mockPdfQueue.add).toHaveBeenCalledWith('pdf:render', expect.any(Object));
    });

    it('edge: should return null and log error when document creation throws', async () => {
      mockTemplateService.getActiveTemplate.mockRejectedValue(new Error('DB failure'));

      const result = await service.autoGenerateDocument(
        mockRlsTx as unknown as PrismaService,
        TENANT_ID,
        USER_ID,
        'parent_notification',
        'incident',
        INCIDENT_ID,
        STUDENT_ID,
        'en',
      );

      expect(result).toBeNull();
    });
  });

  // ─── supersedeDocument ───────────────────────────────────────────────────

  describe('supersedeDocument', () => {
    it('should update document status to superseded', async () => {
      mockRlsTx.behaviourDocument.update.mockResolvedValue({});

      await service.supersedeDocument(
        mockRlsTx as unknown as PrismaService,
        'doc-old',
        'doc-new',
        'Correction applied',
      );

      expect(mockRlsTx.behaviourDocument.update).toHaveBeenCalledWith({
        where: { id: 'doc-old' },
        data: {
          status: 'superseded',
          superseded_by_id: 'doc-new',
          superseded_reason: 'Correction applied',
        },
      });
    });
  });

  // ─── generateDocument — resolveMergeFields for sanction ──────────────────

  describe('generateDocument — sanction entity', () => {
    it('should resolve merge fields for sanction entity type', async () => {
      const sanctionDto = {
        document_type: 'detention_notice' as const,
        entity_type: 'sanction' as const,
        entity_id: 'sanction-1',
      };

      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(null);
      mockTemplateService.getActiveTemplate.mockResolvedValue(makeTemplate());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: {} });
      mockRlsTx.academicYear.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourSanction.findFirst.mockResolvedValue({
        id: 'sanction-1',
        student_id: STUDENT_ID,
        type: 'detention',
        scheduled_date: new Date('2026-03-20'),
        suspension_start_date: null,
        suspension_end_date: null,
        suspension_days: null,
        return_conditions: null,
        incident: {
          occurred_at: new Date('2026-03-15'),
          parent_description: 'Incident desc',
          location: 'Hall',
          category: { name: 'Fighting' },
          context_snapshot: null,
        },
        student: {
          first_name: 'Bob',
          last_name: 'Jones',
          date_of_birth: null,
          year_group: null,
          class_enrolments: [],
        },
      });
      mockRlsTx.studentParent.findFirst.mockResolvedValue({
        parent: { first_name: 'Jane', last_name: 'Jones' },
      });
      mockRlsTx.behaviourDocument.create.mockResolvedValue(
        makeDocument({ status: 'generating', file_size_bytes: BigInt(0) }),
      );

      const result = (await service.generateDocument(
        TENANT_ID,
        USER_ID,
        sanctionDto,
      )) as DocumentResult;

      expect(result.data).toBeDefined();
    });
  });

  // ─── generateDocument — unsupported entity type ──────────────────────────

  describe('generateDocument — unsupported entity type', () => {
    it('should throw BadRequestException for unknown entity type', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(null);
      mockTemplateService.getActiveTemplate.mockResolvedValue(makeTemplate());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: {} });
      mockRlsTx.academicYear.findFirst.mockResolvedValue(null);

      await expect(
        service.generateDocument(TENANT_ID, USER_ID, {
          document_type: 'detention_notice' as const,
          entity_type: 'unknown_type' as 'incident',
          entity_id: 'id-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── generateDocument — locale ar ────────────────────────────────────────

  describe('generateDocument — Arabic locale', () => {
    it('should use ar-SA date locale when locale is ar', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(null);
      mockTemplateService.getActiveTemplate.mockResolvedValue(makeTemplate());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: {} });
      mockRlsTx.academicYear.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue({
        id: INCIDENT_ID,
        occurred_at: new Date('2026-03-15'),
        parent_description: null,
        location: null,
        category: null,
        context_snapshot: null,
        participants: [
          {
            student_id: STUDENT_ID,
            student: {
              first_name: 'Ali',
              last_name: 'Ahmed',
              date_of_birth: new Date('2014-01-15'),
              year_group: { name: 'Year 6' },
              class_enrolments: [{ class_entity: { name: '6B' } }],
            },
          },
        ],
      });
      mockRlsTx.studentParent.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourDocument.create.mockResolvedValue(
        makeDocument({ status: 'generating', file_size_bytes: BigInt(0) }),
      );

      const result = (await service.generateDocument(TENANT_ID, USER_ID, {
        document_type: 'detention_notice' as const,
        entity_type: 'incident' as const,
        entity_id: INCIDENT_ID,
        locale: 'ar',
      })) as DocumentResult;

      expect(result.data).toBeDefined();
    });
  });

  // ─── generateDocument — appeal entity ───────────────────────────────────

  describe('generateDocument — appeal entity', () => {
    it('should resolve merge fields for appeal entity type', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(null);
      mockTemplateService.getActiveTemplate.mockResolvedValue(makeTemplate());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: {} });
      mockRlsTx.academicYear.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourAppeal.findFirst.mockResolvedValue({
        id: 'appeal-1',
        student_id: STUDENT_ID,
        grounds: 'Procedural unfairness',
        hearing_date: new Date('2026-04-10'),
        decision: 'upheld',
        decision_reasoning: 'Evidence supports the appeal',
        incident: {
          occurred_at: new Date('2026-03-15'),
          parent_description: 'Incident desc',
          location: 'Hall',
          category: { name: 'Fighting' },
          context_snapshot: null,
        },
        student: {
          first_name: 'Carol',
          last_name: 'Davis',
          date_of_birth: null,
          year_group: null,
          class_enrolments: [],
        },
      });
      mockRlsTx.studentParent.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourDocument.create.mockResolvedValue(
        makeDocument({ status: 'generating', file_size_bytes: BigInt(0) }),
      );

      const result = (await service.generateDocument(TENANT_ID, USER_ID, {
        document_type: 'detention_notice' as const,
        entity_type: 'appeal' as const,
        entity_id: 'appeal-1',
      })) as DocumentResult;

      expect(result.data).toBeDefined();
    });

    it('should throw NotFoundException when appeal not found', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(null);
      mockTemplateService.getActiveTemplate.mockResolvedValue(makeTemplate());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: {} });
      mockRlsTx.academicYear.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourAppeal.findFirst.mockResolvedValue(null);

      await expect(
        service.generateDocument(TENANT_ID, USER_ID, {
          document_type: 'detention_notice' as const,
          entity_type: 'appeal' as const,
          entity_id: 'appeal-missing',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle appeal without incident', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(null);
      mockTemplateService.getActiveTemplate.mockResolvedValue(makeTemplate());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: {} });
      mockRlsTx.academicYear.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourAppeal.findFirst.mockResolvedValue({
        id: 'appeal-1',
        student_id: STUDENT_ID,
        grounds: null,
        hearing_date: null,
        decision: null,
        decision_reasoning: null,
        incident: null,
        student: {
          first_name: 'Carol',
          last_name: 'Davis',
          date_of_birth: null,
          year_group: null,
          class_enrolments: [],
        },
      });
      mockRlsTx.studentParent.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourDocument.create.mockResolvedValue(
        makeDocument({ status: 'generating', file_size_bytes: BigInt(0) }),
      );

      const result = (await service.generateDocument(TENANT_ID, USER_ID, {
        document_type: 'detention_notice' as const,
        entity_type: 'appeal' as const,
        entity_id: 'appeal-1',
      })) as DocumentResult;

      expect(result.data).toBeDefined();
    });
  });

  // ─── generateDocument — exclusion_case entity ──────────────────────────

  describe('generateDocument — exclusion_case entity', () => {
    it('should resolve merge fields for exclusion_case entity type', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(null);
      mockTemplateService.getActiveTemplate.mockResolvedValue(makeTemplate());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: {} });
      mockRlsTx.academicYear.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourExclusionCase.findFirst.mockResolvedValue({
        id: 'exc-1',
        student_id: STUDENT_ID,
        sanction: {
          type: 'suspension_external',
          scheduled_date: new Date('2026-03-20'),
          suspension_start_date: new Date('2026-03-21'),
          suspension_end_date: new Date('2026-03-25'),
          suspension_days: 5,
          return_conditions: 'Parent meeting required',
        },
        incident: {
          occurred_at: new Date('2026-03-15'),
          parent_description: null,
          location: 'Playground',
          category: { name: 'Violence' },
          context_snapshot: null,
        },
        student: {
          first_name: 'Dave',
          last_name: 'Evans',
          date_of_birth: new Date('2013-05-20'),
          year_group: { name: 'Year 7' },
          class_enrolments: [{ class_entity: { name: '7C' } }],
        },
      });
      mockRlsTx.studentParent.findFirst.mockResolvedValue({
        parent: { first_name: 'Mary', last_name: 'Evans' },
      });
      mockRlsTx.behaviourDocument.create.mockResolvedValue(
        makeDocument({ status: 'generating', file_size_bytes: BigInt(0) }),
      );

      const result = (await service.generateDocument(TENANT_ID, USER_ID, {
        document_type: 'detention_notice' as const,
        entity_type: 'exclusion_case' as const,
        entity_id: 'exc-1',
      })) as DocumentResult;

      expect(result.data).toBeDefined();
    });

    it('should throw NotFoundException when exclusion case not found', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(null);
      mockTemplateService.getActiveTemplate.mockResolvedValue(makeTemplate());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: {} });
      mockRlsTx.academicYear.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourExclusionCase.findFirst.mockResolvedValue(null);

      await expect(
        service.generateDocument(TENANT_ID, USER_ID, {
          document_type: 'detention_notice' as const,
          entity_type: 'exclusion_case' as const,
          entity_id: 'missing',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle exclusion_case without sanction or incident', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(null);
      mockTemplateService.getActiveTemplate.mockResolvedValue(makeTemplate());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: {} });
      mockRlsTx.academicYear.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourExclusionCase.findFirst.mockResolvedValue({
        id: 'exc-2',
        student_id: STUDENT_ID,
        sanction: null,
        incident: null,
        student: {
          first_name: 'Eve',
          last_name: 'Fox',
          date_of_birth: null,
          year_group: null,
          class_enrolments: [],
        },
      });
      mockRlsTx.studentParent.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourDocument.create.mockResolvedValue(
        makeDocument({ status: 'generating', file_size_bytes: BigInt(0) }),
      );

      const result = (await service.generateDocument(TENANT_ID, USER_ID, {
        document_type: 'detention_notice' as const,
        entity_type: 'exclusion_case' as const,
        entity_id: 'exc-2',
      })) as DocumentResult;

      expect(result.data).toBeDefined();
    });
  });

  // ─── generateDocument — intervention entity ────────────────────────────

  describe('generateDocument — intervention entity', () => {
    it('should resolve merge fields for intervention entity type', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(null);
      mockTemplateService.getActiveTemplate.mockResolvedValue(makeTemplate());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: {} });
      mockRlsTx.academicYear.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourIntervention.findFirst.mockResolvedValue({
        id: 'iv-1',
        student_id: STUDENT_ID,
        goals: ['Reduce disruptions'],
        student: {
          first_name: 'Frank',
          last_name: 'Green',
          date_of_birth: null,
          year_group: null,
          class_enrolments: [],
        },
      });
      mockRlsTx.studentParent.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourDocument.create.mockResolvedValue(
        makeDocument({ status: 'generating', file_size_bytes: BigInt(0) }),
      );

      const result = (await service.generateDocument(TENANT_ID, USER_ID, {
        document_type: 'detention_notice' as const,
        entity_type: 'intervention' as const,
        entity_id: 'iv-1',
      })) as DocumentResult;

      expect(result.data).toBeDefined();
    });

    it('should throw NotFoundException when intervention not found', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(null);
      mockTemplateService.getActiveTemplate.mockResolvedValue(makeTemplate());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: {} });
      mockRlsTx.academicYear.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourIntervention.findFirst.mockResolvedValue(null);

      await expect(
        service.generateDocument(TENANT_ID, USER_ID, {
          document_type: 'detention_notice' as const,
          entity_type: 'intervention' as const,
          entity_id: 'missing',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle intervention with null goals', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(null);
      mockTemplateService.getActiveTemplate.mockResolvedValue(makeTemplate());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: {} });
      mockRlsTx.academicYear.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourIntervention.findFirst.mockResolvedValue({
        id: 'iv-2',
        student_id: STUDENT_ID,
        goals: null,
        student: {
          first_name: 'Grace',
          last_name: 'Hill',
          date_of_birth: null,
          year_group: null,
          class_enrolments: [],
        },
      });
      mockRlsTx.studentParent.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourDocument.create.mockResolvedValue(
        makeDocument({ status: 'generating', file_size_bytes: BigInt(0) }),
      );

      const result = (await service.generateDocument(TENANT_ID, USER_ID, {
        document_type: 'detention_notice' as const,
        entity_type: 'intervention' as const,
        entity_id: 'iv-2',
      })) as DocumentResult;

      expect(result.data).toBeDefined();
    });
  });

  // ─── generateDocument — sanction without incident ──────────────────────

  describe('generateDocument — sanction without incident', () => {
    it('should handle sanction entity without linked incident', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(null);
      mockTemplateService.getActiveTemplate.mockResolvedValue(makeTemplate());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: {} });
      mockRlsTx.academicYear.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourSanction.findFirst.mockResolvedValue({
        id: 'sanction-2',
        student_id: STUDENT_ID,
        type: 'detention',
        scheduled_date: null,
        suspension_start_date: null,
        suspension_end_date: null,
        suspension_days: null,
        return_conditions: null,
        incident: null,
        student: null,
      });
      mockRlsTx.studentParent.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourDocument.create.mockResolvedValue(
        makeDocument({ status: 'generating', file_size_bytes: BigInt(0) }),
      );

      const result = (await service.generateDocument(TENANT_ID, USER_ID, {
        document_type: 'detention_notice' as const,
        entity_type: 'sanction' as const,
        entity_id: 'sanction-2',
      })) as DocumentResult;

      expect(result.data).toBeDefined();
    });

    it('should throw NotFoundException when sanction not found', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(null);
      mockTemplateService.getActiveTemplate.mockResolvedValue(makeTemplate());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: {} });
      mockRlsTx.academicYear.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourSanction.findFirst.mockResolvedValue(null);

      await expect(
        service.generateDocument(TENANT_ID, USER_ID, {
          document_type: 'detention_notice' as const,
          entity_type: 'sanction' as const,
          entity_id: 'missing',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── generateDocument — incident not found ─────────────────────────────

  describe('generateDocument — incident not found', () => {
    it('should throw NotFoundException when incident entity not found', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(null);
      mockTemplateService.getActiveTemplate.mockResolvedValue(makeTemplate());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: {} });
      mockRlsTx.academicYear.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(null);

      await expect(
        service.generateDocument(TENANT_ID, USER_ID, {
          document_type: 'detention_notice' as const,
          entity_type: 'incident' as const,
          entity_id: 'missing-incident',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── generateDocument — incident with no participants ──────────────────

  describe('generateDocument — incident with empty participant', () => {
    it('should handle incident with no subject participant', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(null);
      mockTemplateService.getActiveTemplate.mockResolvedValue(makeTemplate());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: {} });
      mockRlsTx.academicYear.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue({
        id: INCIDENT_ID,
        occurred_at: new Date('2026-03-15'),
        parent_description: null,
        location: null,
        category: null,
        context_snapshot: null,
        participants: [],
      });
      mockRlsTx.studentParent.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourDocument.create.mockResolvedValue(
        makeDocument({ status: 'generating', file_size_bytes: BigInt(0) }),
      );

      const result = (await service.generateDocument(TENANT_ID, USER_ID, {
        document_type: 'detention_notice' as const,
        entity_type: 'incident' as const,
        entity_id: INCIDENT_ID,
      })) as DocumentResult;

      expect(result.data).toBeDefined();
    });
  });

  // ─── generateDocument — sanction with ar locale and suspension fields ───

  describe('generateDocument — sanction ar locale with suspension fields', () => {
    it('should populate suspension fields with Arabic dates', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(null);
      mockTemplateService.getActiveTemplate.mockResolvedValue(makeTemplate());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: {} });
      mockRlsTx.academicYear.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourSanction.findFirst.mockResolvedValue({
        id: 'sanction-3',
        student_id: STUDENT_ID,
        type: 'suspension_external',
        scheduled_date: new Date('2026-03-20'),
        suspension_start_date: new Date('2026-03-21'),
        suspension_end_date: new Date('2026-03-25'),
        suspension_days: 5,
        return_conditions: 'Parent meeting',
        incident: {
          occurred_at: new Date('2026-03-15'),
          parent_description: 'desc',
          location: 'Hall',
          category: { name: 'Violence' },
          context_snapshot: null,
        },
        student: {
          first_name: 'Ahmed',
          last_name: 'Ali',
          date_of_birth: new Date('2013-01-01'),
          year_group: { name: 'Year 7' },
          class_enrolments: [{ class_entity: { name: '7A' } }],
        },
      });
      mockRlsTx.studentParent.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourDocument.create.mockResolvedValue(
        makeDocument({ status: 'generating', file_size_bytes: BigInt(0) }),
      );

      const result = (await service.generateDocument(TENANT_ID, USER_ID, {
        document_type: 'detention_notice' as const,
        entity_type: 'sanction' as const,
        entity_id: 'sanction-3',
        locale: 'ar',
      })) as DocumentResult;

      expect(result.data).toBeDefined();
    });
  });

  // ─── generateDocument — tenantSettings null fallbacks ───────────────────

  describe('generateDocument — tenantSettings null', () => {
    it('should handle null tenantSettings gracefully', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(null);
      mockTemplateService.getActiveTemplate.mockResolvedValue(makeTemplate());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue(null);
      mockRlsTx.academicYear.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue({
        id: INCIDENT_ID,
        occurred_at: new Date('2026-03-15'),
        parent_description: null,
        location: null,
        category: null,
        context_snapshot: null,
        participants: [
          {
            student_id: STUDENT_ID,
            student: {
              first_name: 'Test',
              last_name: 'Student',
              date_of_birth: null,
              year_group: null,
              class_enrolments: [],
            },
          },
        ],
      });
      mockRlsTx.studentParent.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourDocument.create.mockResolvedValue(
        makeDocument({ status: 'generating', file_size_bytes: BigInt(0) }),
      );

      const result = (await service.generateDocument(TENANT_ID, USER_ID, {
        document_type: 'detention_notice' as const,
        entity_type: 'incident' as const,
        entity_id: INCIDENT_ID,
      })) as DocumentResult;

      expect(result.data).toBeDefined();
    });
  });

  // ─── mapStatusToApi — default case ──────────────────────────────────────

  describe('serializeDocument — unmapped status', () => {
    it('should pass unmapped status through mapStatusToApi (e.g. generating)', async () => {
      const doc = makeDocument({ status: 'generating' });
      mockPrisma.behaviourDocument.findFirst.mockResolvedValue({
        ...doc,
        student: null,
        generated_by: null,
        template: null,
      });

      const result = await service.getDocument(TENANT_ID, DOCUMENT_ID);
      const data = result.data as Record<string, unknown>;
      expect(data['status']).toBe('generating');
    });
  });
});
