import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AcademicPeriodsService } from '../academics/academic-periods.service';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';

import { GradesService } from './grades.service';
import { ParentGradebookController } from './parent-gradebook.controller';
import { ReportCardsService } from './report-cards/report-cards.service';
import { TranscriptsService } from './transcripts.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PARENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const REPORT_CARD_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const tenantContext = { tenant_id: TENANT_ID };
const userContext = {
  sub: USER_ID,
  membership_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
  email: 'parent@example.com',
  tenant_id: TENANT_ID,
  type: 'access' as const,
  iat: 0,
  exp: 0,
};

const mockGradesService = {
  findByStudent: jest.fn(),
};

const mockReportCardsService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
};

const mockTranscriptsService = {
  getTranscriptData: jest.fn(),
};

const mockPdfRenderingService = {
  renderPdf: jest.fn(),
};

const mockPrisma = {
  parent: { findFirst: jest.fn() },
  studentParent: { findUnique: jest.fn() },
  tenant: { findFirst: jest.fn() },
  tenantBranding: { findFirst: jest.fn() },
};

const mockAcademicPeriodsService = {
  findAll: jest.fn(),
};

describe('ParentGradebookController', () => {
  let controller: ParentGradebookController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParentGradebookController],
      providers: [
        { provide: GradesService, useValue: mockGradesService },
        { provide: ReportCardsService, useValue: mockReportCardsService },
        { provide: TranscriptsService, useValue: mockTranscriptsService },
        { provide: PdfRenderingService, useValue: mockPdfRenderingService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AcademicPeriodsService, useValue: mockAcademicPeriodsService },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ParentGradebookController>(ParentGradebookController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Academic Periods ───────────────────────────────────────────────────

  it('should return academic periods for the tenant', async () => {
    const periods = [{ id: 'p-1', name: 'Term 1' }];
    mockAcademicPeriodsService.findAll.mockResolvedValue(periods);

    const result = await controller.getAcademicPeriods(tenantContext);

    expect(result).toEqual(periods);
    expect(mockAcademicPeriodsService.findAll).toHaveBeenCalledWith(TENANT_ID, 50);
  });

  // ─── Student Grades ─────────────────────────────────────────────────────

  it('should return grades for a student when parent is linked', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID });
    mockPrisma.studentParent.findUnique.mockResolvedValue({
      student_id: STUDENT_ID,
      parent_id: PARENT_ID,
      tenant_id: TENANT_ID,
    });
    const grades = [{ id: 'grade-1', raw_score: 85 }];
    mockGradesService.findByStudent.mockResolvedValue(grades);

    const result = await controller.getStudentGrades(
      tenantContext,
      userContext,
      STUDENT_ID,
      {},
    );

    expect(result).toEqual(grades);
    expect(mockGradesService.findByStudent).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID, {});
  });

  it('should throw NotFoundException when no parent profile exists for the current user', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue(null);

    await expect(
      controller.getStudentGrades(tenantContext, userContext, STUDENT_ID, {}),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException when parent is not linked to the student', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID });
    mockPrisma.studentParent.findUnique.mockResolvedValue(null);

    await expect(
      controller.getStudentGrades(tenantContext, userContext, STUDENT_ID, {}),
    ).rejects.toThrow(ForbiddenException);
  });

  // ─── Student Report Cards ──────────────────────────────────────────────

  it('should return published report cards for a linked student', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID });
    mockPrisma.studentParent.findUnique.mockResolvedValue({
      student_id: STUDENT_ID,
      parent_id: PARENT_ID,
      tenant_id: TENANT_ID,
    });
    const reportCards = { data: [{ id: REPORT_CARD_ID, status: 'published' }] };
    mockReportCardsService.findAll.mockResolvedValue(reportCards);

    const result = await controller.getStudentReportCards(
      tenantContext,
      userContext,
      STUDENT_ID,
      {},
    );

    expect(result).toEqual(reportCards);
    expect(mockReportCardsService.findAll).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ student_id: STUDENT_ID, status: 'published' }),
    );
  });

  // ─── Report Card PDF ───────────────────────────────────────────────────

  it('should throw ForbiddenException when report card does not belong to the student', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID });
    mockPrisma.studentParent.findUnique.mockResolvedValue({
      student_id: STUDENT_ID,
      parent_id: PARENT_ID,
      tenant_id: TENANT_ID,
    });
    mockReportCardsService.findOne.mockResolvedValue({
      id: REPORT_CARD_ID,
      student_id: 'different-student-id',
      status: 'published',
      template_locale: 'en',
      snapshot_payload_json: {},
    });

    const mockRes = { set: jest.fn(), send: jest.fn() };

    await expect(
      controller.getStudentReportCardPdf(
        tenantContext,
        userContext,
        STUDENT_ID,
        REPORT_CARD_ID,
        mockRes as never,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when report card is not yet published', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID });
    mockPrisma.studentParent.findUnique.mockResolvedValue({
      student_id: STUDENT_ID,
      parent_id: PARENT_ID,
      tenant_id: TENANT_ID,
    });
    mockReportCardsService.findOne.mockResolvedValue({
      id: REPORT_CARD_ID,
      student_id: STUDENT_ID,
      status: 'draft',
      template_locale: 'en',
      snapshot_payload_json: {},
    });

    const mockRes = { set: jest.fn(), send: jest.fn() };

    await expect(
      controller.getStudentReportCardPdf(
        tenantContext,
        userContext,
        STUDENT_ID,
        REPORT_CARD_ID,
        mockRes as never,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should stream PDF when report card is published and belongs to the student', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID });
    mockPrisma.studentParent.findUnique.mockResolvedValue({
      student_id: STUDENT_ID,
      parent_id: PARENT_ID,
      tenant_id: TENANT_ID,
    });
    mockReportCardsService.findOne.mockResolvedValue({
      id: REPORT_CARD_ID,
      student_id: STUDENT_ID,
      status: 'published',
      template_locale: 'en',
      snapshot_payload_json: { student: 'Ali' },
    });
    mockPrisma.tenant.findFirst.mockResolvedValue({ name: 'Test School' });
    mockPrisma.tenantBranding.findFirst.mockResolvedValue(null);
    const pdfBuffer = Buffer.from('%PDF-1.4');
    mockPdfRenderingService.renderPdf.mockResolvedValue(pdfBuffer);

    const mockRes = { set: jest.fn(), send: jest.fn() };

    await controller.getStudentReportCardPdf(
      tenantContext,
      userContext,
      STUDENT_ID,
      REPORT_CARD_ID,
      mockRes as never,
    );

    expect(mockPdfRenderingService.renderPdf).toHaveBeenCalledWith(
      'report-card',
      'en',
      { student: 'Ali' },
      expect.objectContaining({ school_name: 'Test School' }),
    );
    expect(mockRes.set).toHaveBeenCalledWith(
      expect.objectContaining({ 'Content-Type': 'application/pdf' }),
    );
    expect(mockRes.send).toHaveBeenCalledWith(pdfBuffer);
  });

  // ─── Transcript PDF ────────────────────────────────────────────────────

  it('should stream a transcript PDF for a linked student', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID });
    mockPrisma.studentParent.findUnique.mockResolvedValue({
      student_id: STUDENT_ID,
      parent_id: PARENT_ID,
      tenant_id: TENANT_ID,
    });
    const transcriptData = { student: { id: STUDENT_ID }, periods: [] };
    mockTranscriptsService.getTranscriptData.mockResolvedValue(transcriptData);
    mockPrisma.tenant.findFirst.mockResolvedValue({ name: 'Test School', default_locale: 'ar' });
    mockPrisma.tenantBranding.findFirst.mockResolvedValue(null);
    const pdfBuffer = Buffer.from('%PDF-1.4');
    mockPdfRenderingService.renderPdf.mockResolvedValue(pdfBuffer);

    const mockRes = { set: jest.fn(), send: jest.fn() };

    await controller.getStudentTranscriptPdf(
      tenantContext,
      userContext,
      STUDENT_ID,
      mockRes as never,
    );

    expect(mockTranscriptsService.getTranscriptData).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID);
    expect(mockPdfRenderingService.renderPdf).toHaveBeenCalledWith(
      'transcript',
      'ar',
      transcriptData,
      expect.objectContaining({ school_name: 'Test School' }),
    );
    expect(mockRes.send).toHaveBeenCalledWith(pdfBuffer);
  });
});
