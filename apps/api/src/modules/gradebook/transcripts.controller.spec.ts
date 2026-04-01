/* eslint-disable @typescript-eslint/no-require-imports */
import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';

import { TranscriptsController } from './transcripts.controller';
import { TranscriptsService } from './transcripts.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const tenantContext = { tenant_id: TENANT_ID };

const mockTranscriptsService = {
  getTranscriptData: jest.fn(),
};

const mockPdfRenderingService = {
  renderPdf: jest.fn(),
};

const mockPrisma = {
  tenant: {
    findFirst: jest.fn(),
  },
  tenantBranding: {
    findFirst: jest.fn(),
  },
};

describe('TranscriptsController', () => {
  let controller: TranscriptsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TranscriptsController],
      providers: [
        { provide: TranscriptsService, useValue: mockTranscriptsService },
        { provide: PdfRenderingService, useValue: mockPdfRenderingService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TranscriptsController>(TranscriptsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return transcript data for a student', async () => {
    const transcriptData = {
      student: { id: STUDENT_ID, first_name: 'Ali', last_name: 'Hassan' },
      periods: [],
    };
    mockTranscriptsService.getTranscriptData.mockResolvedValue(transcriptData);

    const result = await controller.getTranscript(tenantContext, STUDENT_ID);

    expect(result).toEqual(transcriptData);
    expect(mockTranscriptsService.getTranscriptData).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID);
  });

  it('should render a PDF and stream it in the response', async () => {
    const transcriptData = {
      student: { id: STUDENT_ID, first_name: 'Ali', last_name: 'Hassan' },
      periods: [],
    };
    const pdfBuffer = Buffer.from('%PDF-1.4 test');

    mockTranscriptsService.getTranscriptData.mockResolvedValue(transcriptData);
    mockPrisma.tenant.findFirst.mockResolvedValue({ name: 'Test School', default_locale: 'en' });
    mockPrisma.tenantBranding.findFirst.mockResolvedValue(null);
    mockPdfRenderingService.renderPdf.mockResolvedValue(pdfBuffer);

    const mockRes = {
      set: jest.fn(),
      send: jest.fn(),
    };

    await controller.renderPdf(tenantContext, STUDENT_ID, mockRes as never);

    expect(mockTranscriptsService.getTranscriptData).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID);
    expect(mockPdfRenderingService.renderPdf).toHaveBeenCalledWith(
      'transcript',
      'en',
      transcriptData,
      expect.objectContaining({ school_name: 'Test School' }),
    );
    expect(mockRes.set).toHaveBeenCalledWith(
      expect.objectContaining({ 'Content-Type': 'application/pdf' }),
    );
    expect(mockRes.send).toHaveBeenCalledWith(pdfBuffer);
  });

  it('should default locale to "en" when tenant has no default_locale', async () => {
    const transcriptData = { student: { id: STUDENT_ID }, periods: [] };
    const pdfBuffer = Buffer.from('%PDF');

    mockTranscriptsService.getTranscriptData.mockResolvedValue(transcriptData);
    mockPrisma.tenant.findFirst.mockResolvedValue(null);
    mockPrisma.tenantBranding.findFirst.mockResolvedValue(null);
    mockPdfRenderingService.renderPdf.mockResolvedValue(pdfBuffer);

    const mockRes = { set: jest.fn(), send: jest.fn() };

    await controller.renderPdf(tenantContext, STUDENT_ID, mockRes as never);

    expect(mockPdfRenderingService.renderPdf).toHaveBeenCalledWith(
      'transcript',
      'en',
      transcriptData,
      expect.anything(),
    );
  });
});

// ─── Permission denied (guard rejection via HTTP) ──────────────────────────────

describe('TranscriptsController — permission denied', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [TranscriptsController],
      providers: [
        { provide: TranscriptsService, useValue: mockTranscriptsService },
        { provide: PdfRenderingService, useValue: mockPdfRenderingService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({
        canActivate: () => {
          throw new ForbiddenException({
            error: { code: 'PERMISSION_DENIED', message: 'Missing required permission' },
          });
        },
      })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should return 403 when user lacks transcripts.generate permission (GET /v1/transcripts/students/123e4567-e89b-12d3-a456-426614174000)', async () => {
    await request(app.getHttpServer())
      .get('/v1/transcripts/students/123e4567-e89b-12d3-a456-426614174000')
      .send({})
      .expect(403);
  });
});
