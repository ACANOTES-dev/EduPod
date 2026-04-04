/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

import { MOCK_FACADE_PROVIDERS, AuthReadFacade } from '../../../common/tests/mock-facades';
import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PdfRenderingService } from '../../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { SequenceService } from '../../sequence/sequence.service';
import { PastoralEventService } from '../../pastoral/services/pastoral-event.service';

import { CpExportService } from './cp-export.service';
import type { CpExportPreviewDto, CpExportGenerateDto } from './cp-export.service';

// ─── Test Data ──────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const STUDENT_ID = '33333333-3333-3333-3333-333333333333';
const IP_ADDRESS = '127.0.0.1';

const SAMPLE_RECORD = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  student_id: STUDENT_ID,
  record_type: 'concern',
  created_at: new Date('2026-03-01T10:00:00Z'),
  narrative: 'Test narrative content',
  student: { first_name: 'Alice', last_name: 'Smith' },
};

const SAMPLE_RECORDS = [
  SAMPLE_RECORD,
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    student_id: STUDENT_ID,
    record_type: 'mandated_report',
    created_at: new Date('2026-03-10T12:00:00Z'),
    narrative: 'Another record',
    student: { first_name: 'Alice', last_name: 'Smith' },
  },
];

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockFindMany = jest.fn();
const mockTxHandler = jest.fn();

const mockRlsClient = {
  $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => {
    const fakeDb = { cpRecord: { findMany: mockFindMany } };
    mockTxHandler.mockImplementation(fn);
    return fn(fakeDb);
  }),
};

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
};

const mockRedisClient = {
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn(),
  del: jest.fn().mockResolvedValue(1),
};

const mockRedisService = {
  getClient: jest.fn(() => mockRedisClient),
};

const mockPdfService = {
  renderPdf: jest.fn().mockResolvedValue(Buffer.from('fake-pdf-content')),
};

const mockEventService = {
  write: jest.fn().mockResolvedValue(undefined),
};

const mockSequenceService = {
  nextNumber: jest.fn().mockResolvedValue('CPX-202603-000001'),
};

const mockAuthReadFacade = {
  findUserSummary: jest.fn().mockResolvedValue({ first_name: 'John', last_name: 'Teacher' }),
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('CpExportService', () => {
  let service: CpExportService;

  beforeEach(async () => {
    jest.clearAllMocks();

    (createRlsClient as jest.Mock).mockReturnValue(mockRlsClient);
    mockFindMany.mockResolvedValue(SAMPLE_RECORDS);
    mockRedisClient.get.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({
      first_name: 'John',
      last_name: 'Teacher',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        CpExportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PdfRenderingService, useValue: mockPdfService },
        { provide: PastoralEventService, useValue: mockEventService },
        { provide: SequenceService, useValue: mockSequenceService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: AuthReadFacade, useValue: mockAuthReadFacade },
      ],
    }).compile();

    service = module.get<CpExportService>(CpExportService);
  });

  // ─── Preview ────────────────────────────────────────────────────────────

  describe('preview', () => {
    const previewDto: CpExportPreviewDto = {
      student_id: STUDENT_ID,
    };

    it('should return preview metadata with record count and preview token', async () => {
      const result = await service.preview(TENANT_ID, USER_ID, previewDto, IP_ADDRESS);

      expect(result.data.record_count).toBe(2);
      expect(result.data.student_name).toBe('Alice Smith');
      expect(result.data.preview_token).toBeDefined();
      expect(typeof result.data.preview_token).toBe('string');
      expect(result.data.record_types_found).toEqual(
        expect.arrayContaining(['concern', 'mandated_report']),
      );
      expect(result.data.date_range.from).toBeDefined();
      expect(result.data.date_range.to).toBeDefined();
    });

    it('should store the preview token in Redis with 15-minute TTL', async () => {
      await service.preview(TENANT_ID, USER_ID, previewDto, IP_ADDRESS);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.stringContaining('cp-export:preview:'),
        expect.any(String),
        'EX',
        900,
      );
    });

    it('should persist purpose metadata in the preview token when provided', async () => {
      await service.preview(
        TENANT_ID,
        USER_ID,
        {
          ...previewDto,
          purpose: 'other',
          other_reason: 'Board review',
        },
        IP_ADDRESS,
      );

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.stringContaining('cp-export:preview:'),
        expect.stringContaining('"purpose":"other"'),
        'EX',
        900,
      );
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.stringContaining('cp-export:preview:'),
        expect.stringContaining('"other_reason":"Board review"'),
        'EX',
        900,
      );
    });

    it('should create RLS client with tenant and user IDs', async () => {
      await service.preview(TENANT_ID, USER_ID, previewDto, IP_ADDRESS);

      expect(createRlsClient).toHaveBeenCalledWith(mockPrisma, {
        tenant_id: TENANT_ID,
        user_id: USER_ID,
      });
    });

    it('should write a pastoral audit event for the preview', async () => {
      await service.preview(TENANT_ID, USER_ID, previewDto, IP_ADDRESS);

      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'record_exported',
          entity_type: 'export',
          actor_user_id: USER_ID,
          tier: 3,
          student_id: STUDENT_ID,
          ip_address: IP_ADDRESS,
        }),
      );
    });

    it('should throw NotFoundException when no records match', async () => {
      mockFindMany.mockResolvedValue([]);

      await expect(service.preview(TENANT_ID, USER_ID, previewDto, IP_ADDRESS)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should filter by record_types when provided', async () => {
      const dtWithTypes: CpExportPreviewDto = {
        student_id: STUDENT_ID,
        record_types: ['concern'],
      };
      mockFindMany.mockResolvedValue([SAMPLE_RECORD]);

      await service.preview(TENANT_ID, USER_ID, dtWithTypes, IP_ADDRESS);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            record_type: { in: ['concern'] },
          }),
        }),
      );
    });

    it('should filter by date_from when provided', async () => {
      const dtWithDateFrom: CpExportPreviewDto = {
        student_id: STUDENT_ID,
        date_from: '2026-03-05T00:00:00Z',
      };

      await service.preview(TENANT_ID, USER_ID, dtWithDateFrom, IP_ADDRESS);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: expect.objectContaining({
              gte: new Date('2026-03-05T00:00:00Z'),
            }),
          }),
        }),
      );
    });

    it('should filter by date_to when provided', async () => {
      const dtWithDateTo: CpExportPreviewDto = {
        student_id: STUDENT_ID,
        date_to: '2026-03-15T00:00:00Z',
      };

      await service.preview(TENANT_ID, USER_ID, dtWithDateTo, IP_ADDRESS);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: expect.objectContaining({
              lte: new Date('2026-03-15T00:00:00Z'),
            }),
          }),
        }),
      );
    });
  });

  // ─── Generate ───────────────────────────────────────────────────────────

  describe('generate', () => {
    const generateDto: CpExportGenerateDto = {
      student_id: STUDENT_ID,
      purpose: 'tusla_request',
      locale: 'en',
    };

    it('should generate a PDF and return a download token and export ref', async () => {
      const result = await service.generate(TENANT_ID, USER_ID, generateDto, IP_ADDRESS);

      expect(result.data.download_token).toBeDefined();
      expect(result.data.export_ref_id).toBe('CPX-202603-000001');
      expect(result.data.filename).toContain('CP-Export-Alice-Smith');
      expect(result.data.filename).toContain('.pdf');
    });

    it('should call PdfRenderingService.renderPdf with cp-export template', async () => {
      await service.generate(TENANT_ID, USER_ID, generateDto, IP_ADDRESS);

      expect(mockPdfService.renderPdf).toHaveBeenCalledWith(
        'cp-export',
        'en',
        expect.objectContaining({
          records: SAMPLE_RECORDS,
          watermark_text: expect.stringContaining('John Teacher'),
          export_ref_id: 'CPX-202603-000001',
          purpose: 'tusla_request',
          exporter_name: 'John Teacher',
        }),
        expect.objectContaining({
          school_name: expect.any(String),
        }),
      );
    });

    it('should include watermark text with user name, timestamp, purpose, and ref', async () => {
      await service.generate(TENANT_ID, USER_ID, generateDto, IP_ADDRESS);

      const renderCall = mockPdfService.renderPdf.mock.calls[0] as [
        string,
        string,
        { watermark_text: string },
        unknown,
      ];
      const watermark = renderCall[2].watermark_text;

      expect(watermark).toContain('John Teacher');
      expect(watermark).toContain('tusla_request');
      expect(watermark).toContain('CPX-202603-000001');
    });

    it('should store download token in Redis with 15-minute TTL', async () => {
      await service.generate(TENANT_ID, USER_ID, generateDto, IP_ADDRESS);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.stringContaining('cp-export:download:'),
        expect.any(String),
        'EX',
        900,
      );
    });

    it('should store PDF buffer in Redis with 15-minute TTL', async () => {
      await service.generate(TENANT_ID, USER_ID, generateDto, IP_ADDRESS);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.stringContaining('cp-export:pdf:'),
        expect.any(String),
        'EX',
        900,
      );
    });

    it('should generate a sequence number with CPX prefix', async () => {
      await service.generate(TENANT_ID, USER_ID, generateDto, IP_ADDRESS);

      expect(mockSequenceService.nextNumber).toHaveBeenCalledWith(
        TENANT_ID,
        'cp_export',
        undefined,
        'CPX',
      );
    });

    it('should write a pastoral audit event with watermarked: true', async () => {
      await service.generate(TENANT_ID, USER_ID, generateDto, IP_ADDRESS);

      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'record_exported',
          entity_type: 'export',
          actor_user_id: USER_ID,
          tier: 3,
          student_id: STUDENT_ID,
          payload: expect.objectContaining({
            export_tier: 3,
            entity_type: 'cp_record',
            watermarked: true,
            purpose: 'tusla_request',
            export_ref_id: 'CPX-202603-000001',
          }),
        }),
      );
    });

    it('should throw BadRequestException for invalid purpose', async () => {
      const badDto: CpExportGenerateDto = {
        ...generateDto,
        purpose: 'invalid_purpose' as CpExportGenerateDto['purpose'],
      };

      await expect(service.generate(TENANT_ID, USER_ID, badDto, IP_ADDRESS)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when purpose is "other" without other_reason', async () => {
      const otherDto: CpExportGenerateDto = {
        ...generateDto,
        purpose: 'other',
      };

      await expect(service.generate(TENANT_ID, USER_ID, otherDto, IP_ADDRESS)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should accept purpose "other" when other_reason is provided', async () => {
      const otherDto: CpExportGenerateDto = {
        ...generateDto,
        purpose: 'other',
        other_reason: 'Departmental audit requirement',
      };

      const result = await service.generate(TENANT_ID, USER_ID, otherDto, IP_ADDRESS);
      expect(result.data.download_token).toBeDefined();
    });

    it('should generate from preview_token using the preview-bound scope and purpose', async () => {
      mockRedisClient.get.mockImplementation((key: string) => {
        if (key === 'cp-export:preview:preview-token-1') {
          return Promise.resolve(
            JSON.stringify({
              tenant_id: TENANT_ID,
              user_id: USER_ID,
              student_id: STUDENT_ID,
              record_ids: [SAMPLE_RECORD.id],
              record_types: ['concern'],
              date_from: '2026-03-01T00:00:00Z',
              date_to: '2026-03-31T23:59:59Z',
              purpose: 'board_of_management',
              other_reason: null,
            }),
          );
        }

        return Promise.resolve(null);
      });
      mockFindMany.mockResolvedValue([SAMPLE_RECORD]);

      const result = await service.generate(
        TENANT_ID,
        USER_ID,
        {
          preview_token: 'preview-token-1',
          locale: 'en',
        },
        IP_ADDRESS,
      );

      expect(result.data.export_ref_id).toBe('CPX-202603-000001');
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: STUDENT_ID,
            id: { in: [SAMPLE_RECORD.id] },
          }),
        }),
      );
      expect(mockPdfService.renderPdf).toHaveBeenCalledWith(
        'cp-export',
        'en',
        expect.objectContaining({
          purpose: 'board_of_management',
        }),
        expect.any(Object),
      );
      expect(mockRedisClient.del).toHaveBeenCalledWith('cp-export:preview:preview-token-1');
    });

    it('should reject a preview_token used by a different user', async () => {
      mockRedisClient.get.mockImplementation((key: string) => {
        if (key === 'cp-export:preview:preview-token-1') {
          return Promise.resolve(
            JSON.stringify({
              tenant_id: TENANT_ID,
              user_id: '99999999-9999-9999-9999-999999999999',
              student_id: STUDENT_ID,
              record_ids: [SAMPLE_RECORD.id],
              record_types: null,
              date_from: null,
              date_to: null,
              purpose: 'tusla_request',
              other_reason: null,
            }),
          );
        }

        return Promise.resolve(null);
      });

      await expect(
        service.generate(
          TENANT_ID,
          USER_ID,
          {
            preview_token: 'preview-token-1',
          },
          IP_ADDRESS,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when no records match', async () => {
      mockFindMany.mockResolvedValue([]);

      await expect(service.generate(TENANT_ID, USER_ID, generateDto, IP_ADDRESS)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should default locale to "en" when not provided', async () => {
      const dtoNoLocale: CpExportGenerateDto = {
        student_id: STUDENT_ID,
        purpose: 'tusla_request',
      };

      await service.generate(TENANT_ID, USER_ID, dtoNoLocale, IP_ADDRESS);

      expect(mockPdfService.renderPdf).toHaveBeenCalledWith(
        'cp-export',
        'en',
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should use Arabic locale when specified', async () => {
      const arDto: CpExportGenerateDto = {
        ...generateDto,
        locale: 'ar',
      };

      await service.generate(TENANT_ID, USER_ID, arDto, IP_ADDRESS);

      expect(mockPdfService.renderPdf).toHaveBeenCalledWith(
        'cp-export',
        'ar',
        expect.any(Object),
        expect.any(Object),
      );
    });
  });

  // ─── Download ───────────────────────────────────────────────────────────

  describe('download', () => {
    const DOWNLOAD_TOKEN = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const TOKEN_METADATA = {
      tenant_id: TENANT_ID,
      user_id: USER_ID,
      export_ref_id: 'CPX-202603-000001',
      filename: 'CP-Export-Alice-Smith-CPX-202603-000001.pdf',
      student_id: STUDENT_ID,
    };
    const PDF_BASE64 = Buffer.from('fake-pdf-content').toString('base64');

    beforeEach(() => {
      mockRedisClient.get.mockImplementation((key: string) => {
        if (key === `cp-export:download:${DOWNLOAD_TOKEN}`) {
          return Promise.resolve(JSON.stringify(TOKEN_METADATA));
        }
        if (key === `cp-export:pdf:${DOWNLOAD_TOKEN}`) {
          return Promise.resolve(PDF_BASE64);
        }
        return Promise.resolve(null);
      });
    });

    it('should return the PDF buffer with correct metadata', async () => {
      const result = await service.download(DOWNLOAD_TOKEN, IP_ADDRESS);

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.toString()).toBe('fake-pdf-content');
      expect(result.filename).toBe('CP-Export-Alice-Smith-CPX-202603-000001.pdf');
      expect(result.contentType).toBe('application/pdf');
    });

    it('should delete the download token after use (one-time consumption)', async () => {
      await service.download(DOWNLOAD_TOKEN, IP_ADDRESS);

      expect(mockRedisClient.del).toHaveBeenCalledWith(`cp-export:download:${DOWNLOAD_TOKEN}`);
    });

    it('should delete the PDF buffer from Redis after retrieval', async () => {
      await service.download(DOWNLOAD_TOKEN, IP_ADDRESS);

      expect(mockRedisClient.del).toHaveBeenCalledWith(`cp-export:pdf:${DOWNLOAD_TOKEN}`);
    });

    it('should throw NotFoundException for invalid or expired token', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      await expect(service.download('nonexistent-token', IP_ADDRESS)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when token is valid but PDF buffer has expired', async () => {
      mockRedisClient.get.mockImplementation((key: string) => {
        if (key === `cp-export:download:${DOWNLOAD_TOKEN}`) {
          return Promise.resolve(JSON.stringify(TOKEN_METADATA));
        }
        return Promise.resolve(null); // PDF expired
      });

      await expect(service.download(DOWNLOAD_TOKEN, IP_ADDRESS)).rejects.toThrow(NotFoundException);
    });

    it('should reject second download attempt (token already consumed)', async () => {
      // First download succeeds
      await service.download(DOWNLOAD_TOKEN, IP_ADDRESS);

      // Now the token is deleted — second attempt gets null
      mockRedisClient.get.mockResolvedValue(null);

      await expect(service.download(DOWNLOAD_TOKEN, IP_ADDRESS)).rejects.toThrow(NotFoundException);
    });

    it('should write a pastoral audit event on download', async () => {
      await service.download(DOWNLOAD_TOKEN, IP_ADDRESS);

      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'record_exported',
          entity_type: 'export',
          entity_id: 'CPX-202603-000001',
          actor_user_id: USER_ID,
          tier: 3,
          student_id: STUDENT_ID,
          ip_address: IP_ADDRESS,
        }),
      );
    });
  });
});
