import { Test, TestingModule } from '@nestjs/testing';

import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { PermissionCacheService } from '../../../common/services/permission-cache.service';
import { MOCK_FACADE_PROVIDERS } from '../../../common/tests/mock-facades';
import { PdfRenderingService } from '../../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../../prisma/prisma.service';

import { ReportCardGenerationService } from './report-card-generation.service';
import { ReportCardsQueriesService } from './report-cards-queries.service';
import { ReportCardsController } from './report-cards.controller';
import { ReportCardsService } from './report-cards.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const REPORT_CARD_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STUDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PERIOD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const tenantContext = { tenant_id: TENANT_ID };
const jwtUser = { sub: USER_ID, email: 'teacher@school.com' };

const mockReportCardsService = {
  generate: jest.fn(),
  update: jest.fn(),
  publish: jest.fn(),
  revise: jest.fn(),
  generateBulkDrafts: jest.fn(),
  publishBulk: jest.fn(),
};

const mockReportCardsQueriesService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  gradeOverview: jest.fn(),
  buildBatchSnapshots: jest.fn(),
  generateTranscript: jest.fn(),
  getClassMatrix: jest.fn(),
  listReportCardLibrary: jest.fn(),
};

const mockPdfRenderingService = {
  renderPdf: jest.fn(),
  renderHtml: jest.fn(),
  renderFromHtml: jest.fn(),
};

const mockPrisma = {
  tenant: { findFirst: jest.fn() },
  tenantBranding: { findFirst: jest.fn() },
};

const mockPermissionCacheService = {
  getPermissions: jest.fn(),
};

const mockGenerationService = {
  dryRunCommentGate: jest.fn(),
  generateRun: jest.fn(),
  getRun: jest.fn(),
  listRuns: jest.fn(),
};

describe('ReportCardsController', () => {
  let controller: ReportCardsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportCardsController],
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ReportCardsService, useValue: mockReportCardsService },
        { provide: ReportCardsQueriesService, useValue: mockReportCardsQueriesService },
        { provide: PdfRenderingService, useValue: mockPdfRenderingService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PermissionCacheService, useValue: mockPermissionCacheService },
        { provide: ReportCardGenerationService, useValue: mockGenerationService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReportCardsController>(ReportCardsController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── generate ────────────────────────────────────────────────────────────

  describe('generate', () => {
    it('should call service.generate with correct args and return result', async () => {
      const created = [{ id: REPORT_CARD_ID }];
      mockReportCardsService.generate.mockResolvedValue({ data: created });

      const result = await controller.generate(tenantContext, {
        student_ids: [STUDENT_ID],
        academic_period_id: PERIOD_ID,
      });

      expect(mockReportCardsService.generate).toHaveBeenCalledWith(
        TENANT_ID,
        [STUDENT_ID],
        PERIOD_ID,
      );
      expect(result).toEqual({ data: created });
    });
  });

  // ─── findAll ─────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should delegate to service.findAll and return paginated result', async () => {
      const paginated = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockReportCardsQueriesService.findAll.mockResolvedValue(paginated);

      const result = await controller.findAll(tenantContext, { page: 1, pageSize: 20 });

      expect(mockReportCardsQueriesService.findAll).toHaveBeenCalledWith(TENANT_ID, {
        page: 1,
        pageSize: 20,
      });
      expect(result).toEqual(paginated);
    });

    it('should pass status filter through to service', async () => {
      const paginated = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockReportCardsQueriesService.findAll.mockResolvedValue(paginated);

      await controller.findAll(tenantContext, { page: 1, pageSize: 20, status: 'published' });

      expect(mockReportCardsQueriesService.findAll).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ status: 'published' }),
      );
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should call service.findOne with tenant and id', async () => {
      const card = { id: REPORT_CARD_ID, status: 'draft' };
      mockReportCardsQueriesService.findOne.mockResolvedValue(card);

      const result = await controller.findOne(tenantContext, REPORT_CARD_ID);

      expect(mockReportCardsQueriesService.findOne).toHaveBeenCalledWith(TENANT_ID, REPORT_CARD_ID);
      expect(result).toEqual(card);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should call service.update and return updated card', async () => {
      const updated = { id: REPORT_CARD_ID, teacher_comment: 'Great work!' };
      mockReportCardsService.update.mockResolvedValue(updated);

      const result = await controller.update(tenantContext, REPORT_CARD_ID, {
        teacher_comment: 'Great work!',
      });

      expect(mockReportCardsService.update).toHaveBeenCalledWith(TENANT_ID, REPORT_CARD_ID, {
        teacher_comment: 'Great work!',
      });
      expect(result).toEqual(updated);
    });
  });

  // ─── publish ─────────────────────────────────────────────────────────────

  describe('publish', () => {
    it('should call service.publish with tenant, id, and user sub', async () => {
      const published = { id: REPORT_CARD_ID, status: 'published' };
      mockReportCardsService.publish.mockResolvedValue(published);

      const result = await controller.publish(tenantContext, jwtUser as never, REPORT_CARD_ID);

      expect(mockReportCardsService.publish).toHaveBeenCalledWith(
        TENANT_ID,
        REPORT_CARD_ID,
        USER_ID,
      );
      expect(result).toEqual(published);
    });
  });

  // ─── revise ──────────────────────────────────────────────────────────────

  describe('revise', () => {
    it('should call service.revise and return new draft card', async () => {
      const newDraft = { id: 'new-draft-id', status: 'draft' };
      mockReportCardsService.revise.mockResolvedValue(newDraft);

      const result = await controller.revise(tenantContext, REPORT_CARD_ID);

      expect(mockReportCardsService.revise).toHaveBeenCalledWith(TENANT_ID, REPORT_CARD_ID);
      expect(result).toEqual(newDraft);
    });
  });

  // ─── gradeOverview ───────────────────────────────────────────────────────

  describe('gradeOverview', () => {
    it('should delegate to service.gradeOverview', async () => {
      const overview = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockReportCardsQueriesService.gradeOverview.mockResolvedValue(overview);

      const result = await controller.gradeOverview(tenantContext, { page: 1, pageSize: 20 });

      expect(mockReportCardsQueriesService.gradeOverview).toHaveBeenCalledWith(TENANT_ID, {
        page: 1,
        pageSize: 20,
      });
      expect(result).toEqual(overview);
    });
  });

  // ─── getClassMatrix (impl 06) ────────────────────────────────────────────

  describe('getClassMatrix', () => {
    const CLASS_ID = 'cccccccc-1111-4111-8111-111111111111';

    it('delegates to service.getClassMatrix with the period filter', async () => {
      const matrix = {
        class: { id: CLASS_ID, name: '5A', year_group: null },
        period: { id: 'all', name: 'Full year' },
        students: [],
        subjects: [],
        cells: {},
        overall_by_student: {},
      };
      mockReportCardsQueriesService.getClassMatrix.mockResolvedValue(matrix);

      const result = await controller.getClassMatrix(tenantContext, CLASS_ID, {
        academic_period_id: 'all',
      });

      expect(mockReportCardsQueriesService.getClassMatrix).toHaveBeenCalledWith(TENANT_ID, {
        classId: CLASS_ID,
        academicPeriodId: 'all',
      });
      expect(result).toEqual(matrix);
    });

    it('passes through a concrete academic period id', async () => {
      mockReportCardsQueriesService.getClassMatrix.mockResolvedValue({
        class: { id: CLASS_ID, name: '5A', year_group: null },
        period: { id: PERIOD_ID, name: 'Term 1' },
        students: [],
        subjects: [],
        cells: {},
        overall_by_student: {},
      });

      await controller.getClassMatrix(tenantContext, CLASS_ID, {
        academic_period_id: PERIOD_ID,
      });

      expect(mockReportCardsQueriesService.getClassMatrix).toHaveBeenCalledWith(TENANT_ID, {
        classId: CLASS_ID,
        academicPeriodId: PERIOD_ID,
      });
    });
  });

  // ─── listLibrary (impl 06) ───────────────────────────────────────────────

  describe('listLibrary', () => {
    it('calls service with admin scope when caller has report_cards.view', async () => {
      mockPermissionCacheService.getPermissions.mockResolvedValue(['report_cards.view']);
      mockReportCardsQueriesService.listReportCardLibrary.mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      });

      await controller.listLibrary(tenantContext, { ...jwtUser, membership_id: 'm-1' } as never, {
        page: 1,
        pageSize: 20,
      });

      expect(mockReportCardsQueriesService.listReportCardLibrary).toHaveBeenCalledWith(
        TENANT_ID,
        { user_id: USER_ID, is_admin: true },
        { page: 1, pageSize: 20 },
      );
    });

    it('calls service with teacher scope when caller lacks view/manage', async () => {
      mockPermissionCacheService.getPermissions.mockResolvedValue(['report_cards.comment']);
      mockReportCardsQueriesService.listReportCardLibrary.mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      });

      await controller.listLibrary(tenantContext, { ...jwtUser, membership_id: 'm-2' } as never, {
        page: 1,
        pageSize: 20,
      });

      expect(mockReportCardsQueriesService.listReportCardLibrary).toHaveBeenCalledWith(
        TENANT_ID,
        { user_id: USER_ID, is_admin: false },
        { page: 1, pageSize: 20 },
      );
    });

    it('passes filters through untouched', async () => {
      mockPermissionCacheService.getPermissions.mockResolvedValue(['report_cards.manage']);
      mockReportCardsQueriesService.listReportCardLibrary.mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      });

      const classFilter = '11111111-1111-4111-8111-111111111111';
      await controller.listLibrary(tenantContext, { ...jwtUser, membership_id: 'm-3' } as never, {
        page: 2,
        pageSize: 50,
        class_id: classFilter,
        language: 'ar',
      });

      expect(mockReportCardsQueriesService.listReportCardLibrary).toHaveBeenCalledWith(
        TENANT_ID,
        { user_id: USER_ID, is_admin: true },
        { page: 2, pageSize: 50, class_id: classFilter, language: 'ar' },
      );
    });
  });

  // ─── renderPdf ──────────────────────────────────────────────────────────────

  describe('renderPdf', () => {
    it('should render PDF and send it as response', async () => {
      const reportCard = {
        id: REPORT_CARD_ID,
        template_locale: 'en',
        snapshot_payload_json: { student: 'Alice' },
      };
      mockReportCardsQueriesService.findOne.mockResolvedValue(reportCard);

      // Mock tenant read facade methods accessed via MOCK_FACADE_PROVIDERS
      const tenantFacade = controller['tenantReadFacade'] as unknown as {
        findNameById: jest.Mock;
        findBranding: jest.Mock;
      };
      tenantFacade.findNameById.mockResolvedValue('Test School');
      tenantFacade.findBranding.mockResolvedValue({
        school_name_ar: 'مدرسة',
        logo_url: 'https://example.com/logo.png',
        primary_color: '#003366',
        report_card_title: 'Student Report',
      });

      mockPdfRenderingService.renderPdf.mockResolvedValue(Buffer.from('pdf-content'));

      const mockRes = {
        set: jest.fn(),
        send: jest.fn(),
      };

      await controller.renderPdf(tenantContext, REPORT_CARD_ID, mockRes as never);

      expect(mockReportCardsQueriesService.findOne).toHaveBeenCalledWith(TENANT_ID, REPORT_CARD_ID);
      expect(mockPdfRenderingService.renderPdf).toHaveBeenCalledWith(
        'report-card',
        'en',
        { student: 'Alice' },
        expect.objectContaining({ school_name: 'Test School' }),
      );
      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({ 'Content-Type': 'application/pdf' }),
      );
      expect(mockRes.send).toHaveBeenCalledWith(Buffer.from('pdf-content'));
    });

    it('should use empty string for school_name when tenant name is null', async () => {
      mockReportCardsQueriesService.findOne.mockResolvedValue({
        id: REPORT_CARD_ID,
        template_locale: 'ar',
        snapshot_payload_json: {},
      });

      const tenantFacade = controller['tenantReadFacade'] as unknown as {
        findNameById: jest.Mock;
        findBranding: jest.Mock;
      };
      tenantFacade.findNameById.mockResolvedValue(null);
      tenantFacade.findBranding.mockResolvedValue(null);

      mockPdfRenderingService.renderPdf.mockResolvedValue(Buffer.from('pdf'));

      const mockRes = { set: jest.fn(), send: jest.fn() };

      await controller.renderPdf(tenantContext, REPORT_CARD_ID, mockRes as never);

      expect(mockPdfRenderingService.renderPdf).toHaveBeenCalledWith(
        'report-card',
        'ar',
        {},
        expect.objectContaining({
          school_name: '',
          school_name_ar: undefined,
          logo_url: undefined,
          primary_color: undefined,
          report_card_title: undefined,
        }),
      );
    });
  });

  // ─── generateBatchPdf ───────────────────────────────────────────────────────

  describe('generateBatchPdf', () => {
    it('should return NO_CONTENT when no snapshots are generated', async () => {
      mockReportCardsQueriesService.buildBatchSnapshots.mockResolvedValue([]);

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        set: jest.fn(),
      };

      await controller.generateBatchPdf(
        tenantContext,
        {
          class_id: 'class-1',
          academic_period_id: 'period-1',
          template_id: 'classic',
        },
        mockRes as never,
      );

      expect(mockRes.status).toHaveBeenCalledWith(204);
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('should render combined PDF from multiple snapshots', async () => {
      const snapshots = [{ payload: { student: 'Alice' } }, { payload: { student: 'Bob' } }];
      mockReportCardsQueriesService.buildBatchSnapshots.mockResolvedValue(snapshots);

      const tenantFacade = controller['tenantReadFacade'] as unknown as {
        findNameById: jest.Mock;
        findBranding: jest.Mock;
      };
      tenantFacade.findNameById.mockResolvedValue('School');
      tenantFacade.findBranding.mockResolvedValue(null);

      mockPdfRenderingService.renderHtml
        .mockReturnValueOnce(
          '<html><head><style>body{color:red}</style></head><body><p>Alice</p></body></html>',
        )
        .mockReturnValueOnce(
          '<html><head><style>body{color:red}</style></head><body><p>Bob</p></body></html>',
        );
      mockPdfRenderingService.renderFromHtml.mockResolvedValue(Buffer.from('combined-pdf'));

      const mockRes = { set: jest.fn(), send: jest.fn() };

      await controller.generateBatchPdf(
        tenantContext,
        { class_id: 'class-1', academic_period_id: 'period-1', template_id: 'classic' },
        mockRes as never,
      );

      expect(mockPdfRenderingService.renderHtml).toHaveBeenCalledTimes(2);
      expect(mockPdfRenderingService.renderFromHtml).toHaveBeenCalledWith(
        expect.stringContaining('Alice'),
      );
      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({ 'Content-Type': 'application/pdf' }),
      );
      expect(mockRes.send).toHaveBeenCalledWith(Buffer.from('combined-pdf'));
    });

    it('should use report-card-modern template when template_id is modern', async () => {
      const snapshots = [{ payload: { student: 'Alice' } }];
      mockReportCardsQueriesService.buildBatchSnapshots.mockResolvedValue(snapshots);

      const tenantFacade = controller['tenantReadFacade'] as unknown as {
        findNameById: jest.Mock;
        findBranding: jest.Mock;
      };
      tenantFacade.findNameById.mockResolvedValue('School');
      tenantFacade.findBranding.mockResolvedValue(null);

      mockPdfRenderingService.renderHtml.mockReturnValue(
        '<html><head></head><body>content</body></html>',
      );
      mockPdfRenderingService.renderFromHtml.mockResolvedValue(Buffer.from('pdf'));

      const mockRes = { set: jest.fn(), send: jest.fn() };

      await controller.generateBatchPdf(
        tenantContext,
        { class_id: 'class-1', academic_period_id: 'period-1', template_id: 'modern' },
        mockRes as never,
      );

      expect(mockPdfRenderingService.renderHtml).toHaveBeenCalledWith(
        'report-card-modern',
        'en',
        expect.anything(),
        expect.anything(),
      );
    });

    it('should use default template when template_id is not modern', async () => {
      const snapshots = [{ payload: { student: 'Alice' } }];
      mockReportCardsQueriesService.buildBatchSnapshots.mockResolvedValue(snapshots);

      const tenantFacade = controller['tenantReadFacade'] as unknown as {
        findNameById: jest.Mock;
        findBranding: jest.Mock;
      };
      tenantFacade.findNameById.mockResolvedValue('School');
      tenantFacade.findBranding.mockResolvedValue(null);

      mockPdfRenderingService.renderHtml.mockReturnValue(
        '<html><head></head><body>content</body></html>',
      );
      mockPdfRenderingService.renderFromHtml.mockResolvedValue(Buffer.from('pdf'));

      const mockRes = { set: jest.fn(), send: jest.fn() };

      await controller.generateBatchPdf(
        tenantContext,
        { class_id: 'class-1', academic_period_id: 'period-1', template_id: 'classic' },
        mockRes as never,
      );

      expect(mockPdfRenderingService.renderHtml).toHaveBeenCalledWith(
        'report-card',
        'en',
        expect.anything(),
        expect.anything(),
      );
    });

    it('edge: should handle HTML without body tags gracefully', async () => {
      const snapshots = [{ payload: { student: 'Alice' } }];
      mockReportCardsQueriesService.buildBatchSnapshots.mockResolvedValue(snapshots);

      const tenantFacade = controller['tenantReadFacade'] as unknown as {
        findNameById: jest.Mock;
        findBranding: jest.Mock;
      };
      tenantFacade.findNameById.mockResolvedValue('School');
      tenantFacade.findBranding.mockResolvedValue(null);

      // Return HTML without body tags
      mockPdfRenderingService.renderHtml.mockReturnValue('<div>No body tag here</div>');
      mockPdfRenderingService.renderFromHtml.mockResolvedValue(Buffer.from('pdf'));

      const mockRes = { set: jest.fn(), send: jest.fn() };

      await controller.generateBatchPdf(
        tenantContext,
        { class_id: 'class-1', academic_period_id: 'period-1', template_id: 'classic' },
        mockRes as never,
      );

      // Should still render, using the full HTML as fallback
      expect(mockPdfRenderingService.renderFromHtml).toHaveBeenCalledWith(
        expect.stringContaining('No body tag here'),
      );
    });

    it('edge: should handle HTML without style tags gracefully', async () => {
      const snapshots = [{ payload: { student: 'Alice' } }];
      mockReportCardsQueriesService.buildBatchSnapshots.mockResolvedValue(snapshots);

      const tenantFacade = controller['tenantReadFacade'] as unknown as {
        findNameById: jest.Mock;
        findBranding: jest.Mock;
      };
      tenantFacade.findNameById.mockResolvedValue('School');
      tenantFacade.findBranding.mockResolvedValue(null);

      // Return HTML without style tags
      mockPdfRenderingService.renderHtml.mockReturnValue(
        '<html><head></head><body><p>A</p></body></html>',
      );
      mockPdfRenderingService.renderFromHtml.mockResolvedValue(Buffer.from('pdf'));

      const mockRes = { set: jest.fn(), send: jest.fn() };

      await controller.generateBatchPdf(
        tenantContext,
        { class_id: 'class-1', academic_period_id: 'period-1', template_id: 'classic' },
        mockRes as never,
      );

      expect(mockPdfRenderingService.renderFromHtml).toHaveBeenCalled();
    });
  });
});
