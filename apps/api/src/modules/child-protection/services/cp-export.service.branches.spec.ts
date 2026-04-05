/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, NotFoundException } from '@nestjs/common';
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
import type { CpExportGenerateDto, CpExportPreviewDto } from './cp-export.service';

// ─── Test Data ─────────────────────────────────────────────────────────────

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

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockFindMany = jest.fn();
const mockRlsClient = {
  $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => {
    const fakeDb = { cpRecord: { findMany: mockFindMany } };
    return fn(fakeDb);
  }),
};

const mockPrisma = { user: { findUnique: jest.fn() } };

const mockRedisClient = {
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn(),
  del: jest.fn().mockResolvedValue(1),
};
const mockRedisService = { getClient: jest.fn(() => mockRedisClient) };
const mockPdfService = {
  renderPdf: jest.fn().mockResolvedValue(Buffer.from('fake-pdf-content')),
};
const mockEventService = { write: jest.fn().mockResolvedValue(undefined) };
const mockSequenceService = { nextNumber: jest.fn().mockResolvedValue('CPX-202603-000001') };
const mockAuthReadFacade = {
  findUserSummary: jest.fn().mockResolvedValue({ first_name: 'John', last_name: 'Teacher' }),
};

// ─── Test Suite — Branch Coverage ──────────────────────────────────────────

describe('CpExportService — branch coverage', () => {
  let service: CpExportService;

  beforeEach(async () => {
    jest.clearAllMocks();

    (createRlsClient as jest.Mock).mockReturnValue(mockRlsClient);
    mockFindMany.mockResolvedValue([SAMPLE_RECORD]);
    mockRedisClient.get.mockResolvedValue(null);

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

  // ─── preview — both date_from and date_to ────────────────────────────────

  describe('CpExportService — preview combined date filters', () => {
    it('should apply both date_from and date_to to the where clause', async () => {
      const previewDto: CpExportPreviewDto = {
        student_id: STUDENT_ID,
        date_from: '2026-03-01T00:00:00Z',
        date_to: '2026-03-31T23:59:59Z',
      };

      await service.preview(TENANT_ID, USER_ID, previewDto, IP_ADDRESS);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: expect.objectContaining({
              gte: new Date('2026-03-01T00:00:00Z'),
              lte: new Date('2026-03-31T23:59:59Z'),
            }),
          }),
        }),
      );
    });
  });

  // ─── preview — student name with null student ─────────────────────────────

  describe('CpExportService — preview with no student relation', () => {
    it('should use "Unknown Student" when student relation is null', async () => {
      mockFindMany.mockResolvedValue([{ ...SAMPLE_RECORD, student: null }]);

      const result = await service.preview(
        TENANT_ID,
        USER_ID,
        { student_id: STUDENT_ID },
        IP_ADDRESS,
      );

      expect(result.data.student_name).toBe('Unknown Student');
    });
  });

  // ─── generate — without preview token, with record_types filter ──────────

  describe('CpExportService — generate without preview using filters', () => {
    it('should apply record_types filter when generating without preview', async () => {
      const dto: CpExportGenerateDto = {
        student_id: STUDENT_ID,
        purpose: 'tusla_request',
        record_types: ['concern', 'mandated_report'],
        locale: 'en',
      };

      await service.generate(TENANT_ID, USER_ID, dto, IP_ADDRESS);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            record_type: { in: ['concern', 'mandated_report'] },
          }),
        }),
      );
    });

    it('should apply date_from filter when generating without preview', async () => {
      const dto: CpExportGenerateDto = {
        student_id: STUDENT_ID,
        purpose: 'legal_proceedings',
        date_from: '2026-03-01T00:00:00Z',
        locale: 'en',
      };

      await service.generate(TENANT_ID, USER_ID, dto, IP_ADDRESS);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: expect.objectContaining({
              gte: new Date('2026-03-01T00:00:00Z'),
            }),
          }),
        }),
      );
    });

    it('should apply date_to filter when generating without preview', async () => {
      const dto: CpExportGenerateDto = {
        student_id: STUDENT_ID,
        purpose: 'section_26_inquiry',
        date_to: '2026-03-31T23:59:59Z',
        locale: 'en',
      };

      await service.generate(TENANT_ID, USER_ID, dto, IP_ADDRESS);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: expect.objectContaining({
              lte: new Date('2026-03-31T23:59:59Z'),
            }),
          }),
        }),
      );
    });
  });

  // ─── generate — missing student_id and no preview ─────────────────────────

  describe('CpExportService — generate missing student_id', () => {
    it('should throw BadRequestException when student_id is missing and no preview', async () => {
      const dto: CpExportGenerateDto = {
        purpose: 'tusla_request',
        locale: 'en',
      };

      await expect(service.generate(TENANT_ID, USER_ID, dto, IP_ADDRESS)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── generate — missing purpose and no preview ────────────────────────────

  describe('CpExportService — generate missing purpose', () => {
    it('should throw BadRequestException when purpose is missing and no preview', async () => {
      const dto: CpExportGenerateDto = {
        student_id: STUDENT_ID,
        locale: 'en',
      };

      await expect(service.generate(TENANT_ID, USER_ID, dto, IP_ADDRESS)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── generate — exporter name unknown ──────────────────────────────────────

  describe('CpExportService — generate with unknown user', () => {
    it('should use "Unknown User" when authReadFacade returns null', async () => {
      mockAuthReadFacade.findUserSummary.mockResolvedValue(null);

      const dto: CpExportGenerateDto = {
        student_id: STUDENT_ID,
        purpose: 'tusla_request',
        locale: 'en',
      };

      await service.generate(TENANT_ID, USER_ID, dto, IP_ADDRESS);

      const renderCall = mockPdfService.renderPdf.mock.calls[0] as [
        string,
        string,
        { exporter_name: string },
        unknown,
      ];
      expect(renderCall[2].exporter_name).toBe('Unknown User');
    });
  });

  // ─── generate — student name with null student on first record ────────────

  describe('CpExportService — generate with no student relation', () => {
    it('should use "Student" when student relation is null on first record', async () => {
      mockFindMany.mockResolvedValue([{ ...SAMPLE_RECORD, student: null }]);
      mockAuthReadFacade.findUserSummary.mockResolvedValue({
        first_name: 'John',
        last_name: 'Teacher',
      });

      const dto: CpExportGenerateDto = {
        student_id: STUDENT_ID,
        purpose: 'tusla_request',
        locale: 'en',
      };

      const result = await service.generate(TENANT_ID, USER_ID, dto, IP_ADDRESS);

      expect(result.data.filename).toContain('CP-Export-Student');
    });
  });

  // ─── generate — all valid purposes ────────────────────────────────────────

  describe('CpExportService — generate with each valid purpose', () => {
    const purposes = [
      'tusla_request',
      'section_26_inquiry',
      'legal_proceedings',
      'school_transfer_cp',
      'board_of_management',
    ] as const;

    for (const purpose of purposes) {
      it(`should accept "${purpose}" as valid purpose`, async () => {
        const dto: CpExportGenerateDto = {
          student_id: STUDENT_ID,
          purpose,
          locale: 'en',
        };

        const result = await service.generate(TENANT_ID, USER_ID, dto, IP_ADDRESS);
        expect(result.data.export_ref_id).toBeDefined();
      });
    }
  });

  // ─── generate — preview scope mismatch on student_id ──────────────────────

  describe('CpExportService — generate preview scope mismatch', () => {
    it('should throw BadRequestException when dto student_id mismatches preview', async () => {
      mockRedisClient.get.mockImplementation((key: string) => {
        if (key.startsWith('cp-export:preview:')) {
          return Promise.resolve(
            JSON.stringify({
              tenant_id: TENANT_ID,
              user_id: USER_ID,
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

      const dto: CpExportGenerateDto = {
        preview_token: 'token-1',
        student_id: 'different-student-id', // mismatches preview
        purpose: 'tusla_request',
      };

      await expect(service.generate(TENANT_ID, USER_ID, dto, IP_ADDRESS)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when dto record_types mismatches preview', async () => {
      mockRedisClient.get.mockImplementation((key: string) => {
        if (key.startsWith('cp-export:preview:')) {
          return Promise.resolve(
            JSON.stringify({
              tenant_id: TENANT_ID,
              user_id: USER_ID,
              student_id: STUDENT_ID,
              record_ids: [SAMPLE_RECORD.id],
              record_types: ['concern'],
              date_from: null,
              date_to: null,
              purpose: 'tusla_request',
              other_reason: null,
            }),
          );
        }
        return Promise.resolve(null);
      });

      const dto: CpExportGenerateDto = {
        preview_token: 'token-1',
        record_types: ['mandated_report'], // mismatches preview
      };

      await expect(service.generate(TENANT_ID, USER_ID, dto, IP_ADDRESS)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when dto record_types has different length than preview', async () => {
      mockRedisClient.get.mockImplementation((key: string) => {
        if (key.startsWith('cp-export:preview:')) {
          return Promise.resolve(
            JSON.stringify({
              tenant_id: TENANT_ID,
              user_id: USER_ID,
              student_id: STUDENT_ID,
              record_ids: [SAMPLE_RECORD.id],
              record_types: ['concern'],
              date_from: null,
              date_to: null,
              purpose: 'tusla_request',
              other_reason: null,
            }),
          );
        }
        return Promise.resolve(null);
      });

      const dto: CpExportGenerateDto = {
        preview_token: 'token-1',
        record_types: ['concern', 'mandated_report'], // extra element
      };

      await expect(service.generate(TENANT_ID, USER_ID, dto, IP_ADDRESS)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── generate — preview with null record_types (assertPreviewBoundArray) ──

  describe('CpExportService — generate with preview null record_types', () => {
    it('should allow when dto record_types is undefined even with null preview record_types', async () => {
      mockRedisClient.get.mockImplementation((key: string) => {
        if (key.startsWith('cp-export:preview:')) {
          return Promise.resolve(
            JSON.stringify({
              tenant_id: TENANT_ID,
              user_id: USER_ID,
              student_id: STUDENT_ID,
              record_ids: [SAMPLE_RECORD.id],
              record_types: null, // null in preview
              date_from: null,
              date_to: null,
              purpose: 'tusla_request',
              other_reason: null,
            }),
          );
        }
        return Promise.resolve(null);
      });
      mockFindMany.mockResolvedValue([SAMPLE_RECORD]);

      const dto: CpExportGenerateDto = {
        preview_token: 'token-1',
        locale: 'en',
        // No record_types → undefined, should pass assertPreviewBoundArray
      };

      const result = await service.generate(TENANT_ID, USER_ID, dto, IP_ADDRESS);
      expect(result.data.export_ref_id).toBeDefined();
    });
  });

  // ─── validatePurpose — "other" with empty string reason ──────────────────

  describe('CpExportService — validatePurpose other_reason edge cases', () => {
    it('should throw when purpose is "other" and other_reason is whitespace-only', async () => {
      const dto: CpExportGenerateDto = {
        student_id: STUDENT_ID,
        purpose: 'other',
        other_reason: '   ',
        locale: 'en',
      };

      await expect(service.generate(TENANT_ID, USER_ID, dto, IP_ADDRESS)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── preview — validatePurpose with null purpose (pass-through) ──────────

  describe('CpExportService — preview without purpose', () => {
    it('should skip purpose validation when purpose is not provided in preview', async () => {
      const previewDto: CpExportPreviewDto = {
        student_id: STUDENT_ID,
        // No purpose
      };

      const result = await service.preview(TENANT_ID, USER_ID, previewDto, IP_ADDRESS);
      expect(result.data.record_count).toBe(1);
    });
  });

  // ─── generate with preview_token — expired/invalid ────────────────────────

  describe('CpExportService — generate with expired preview token', () => {
    it('should throw NotFoundException when preview token has expired', async () => {
      mockRedisClient.get.mockResolvedValue(null); // token not found

      const dto: CpExportGenerateDto = {
        preview_token: 'expired-token',
      };

      await expect(service.generate(TENANT_ID, USER_ID, dto, IP_ADDRESS)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── generate — preview with purpose bound and override ──────────────────

  describe('CpExportService — assertPreviewBoundValue with allowWhenExpectedMissing', () => {
    it('should allow overriding purpose when preview has null purpose (allowWhenExpectedMissing)', async () => {
      mockRedisClient.get.mockImplementation((key: string) => {
        if (key.startsWith('cp-export:preview:')) {
          return Promise.resolve(
            JSON.stringify({
              tenant_id: TENANT_ID,
              user_id: USER_ID,
              student_id: STUDENT_ID,
              record_ids: [SAMPLE_RECORD.id],
              record_types: null,
              date_from: null,
              date_to: null,
              purpose: null, // Null in preview
              other_reason: null,
            }),
          );
        }
        return Promise.resolve(null);
      });
      mockFindMany.mockResolvedValue([SAMPLE_RECORD]);

      const dto: CpExportGenerateDto = {
        preview_token: 'token-1',
        purpose: 'tusla_request', // Override allowed since preview had null
        locale: 'en',
      };

      const result = await service.generate(TENANT_ID, USER_ID, dto, IP_ADDRESS);
      expect(result.data.export_ref_id).toBeDefined();
    });
  });
});
