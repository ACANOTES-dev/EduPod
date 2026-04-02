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
});
