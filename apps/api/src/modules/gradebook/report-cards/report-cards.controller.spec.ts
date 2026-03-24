import { Test, TestingModule } from '@nestjs/testing';

import { PermissionCacheService } from '../../../common/services/permission-cache.service';
import { PdfRenderingService } from '../../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../../prisma/prisma.service';

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
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  publish: jest.fn(),
  revise: jest.fn(),
  gradeOverview: jest.fn(),
  buildBatchSnapshots: jest.fn(),
  generateBulkDrafts: jest.fn(),
  publishBulk: jest.fn(),
  generateTranscript: jest.fn(),
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

describe('ReportCardsController', () => {
  let controller: ReportCardsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportCardsController],
      providers: [
        { provide: ReportCardsService, useValue: mockReportCardsService },
        { provide: PdfRenderingService, useValue: mockPdfRenderingService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PermissionCacheService, useValue: mockPermissionCacheService },
      ],
    }).compile();

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
      mockReportCardsService.findAll.mockResolvedValue(paginated);

      const result = await controller.findAll(tenantContext, { page: 1, pageSize: 20 });

      expect(mockReportCardsService.findAll).toHaveBeenCalledWith(TENANT_ID, { page: 1, pageSize: 20 });
      expect(result).toEqual(paginated);
    });

    it('should pass status filter through to service', async () => {
      const paginated = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockReportCardsService.findAll.mockResolvedValue(paginated);

      await controller.findAll(tenantContext, { page: 1, pageSize: 20, status: 'published' });

      expect(mockReportCardsService.findAll).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ status: 'published' }),
      );
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should call service.findOne with tenant and id', async () => {
      const card = { id: REPORT_CARD_ID, status: 'draft' };
      mockReportCardsService.findOne.mockResolvedValue(card);

      const result = await controller.findOne(tenantContext, REPORT_CARD_ID);

      expect(mockReportCardsService.findOne).toHaveBeenCalledWith(TENANT_ID, REPORT_CARD_ID);
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

      expect(mockReportCardsService.update).toHaveBeenCalledWith(
        TENANT_ID,
        REPORT_CARD_ID,
        { teacher_comment: 'Great work!' },
      );
      expect(result).toEqual(updated);
    });
  });

  // ─── publish ─────────────────────────────────────────────────────────────

  describe('publish', () => {
    it('should call service.publish with tenant, id, and user sub', async () => {
      const published = { id: REPORT_CARD_ID, status: 'published' };
      mockReportCardsService.publish.mockResolvedValue(published);

      const result = await controller.publish(tenantContext, jwtUser as never, REPORT_CARD_ID);

      expect(mockReportCardsService.publish).toHaveBeenCalledWith(TENANT_ID, REPORT_CARD_ID, USER_ID);
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
      mockReportCardsService.gradeOverview.mockResolvedValue(overview);

      const result = await controller.gradeOverview(tenantContext, { page: 1, pageSize: 20 });

      expect(mockReportCardsService.gradeOverview).toHaveBeenCalledWith(TENANT_ID, { page: 1, pageSize: 20 });
      expect(result).toEqual(overview);
    });
  });
});
