import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';

import { PermissionCacheService } from '../../../common/services/permission-cache.service';

import { GradeThresholdService } from './grade-threshold.service';
import { ReportCardAcknowledgmentService } from './report-card-acknowledgment.service';
import { ReportCardAnalyticsService } from './report-card-analytics.service';
import { ReportCardApprovalService } from './report-card-approval.service';
import { ReportCardCustomFieldsService } from './report-card-custom-fields.service';
import { ReportCardDeliveryService } from './report-card-delivery.service';
import { ReportCardTemplateService } from './report-card-template.service';
import { ReportCardVerificationService } from './report-card-verification.service';
import {
  ReportCardVerificationController,
  ReportCardsEnhancedController,
} from './report-cards-enhanced.controller';
import { ReportCardsService } from './report-cards.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const REPORT_CARD_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const APPROVAL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const tenantContext = { tenant_id: TENANT_ID };
const jwtUser = { sub: USER_ID, email: 'admin@school.com' };

const mockTemplateService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  convertFromImage: jest.fn(),
};

const mockApprovalService = {
  createConfig: jest.fn(),
  findAllConfigs: jest.fn(),
  findOneConfig: jest.fn(),
  updateConfig: jest.fn(),
  removeConfig: jest.fn(),
  submitForApproval: jest.fn(),
  approve: jest.fn(),
  reject: jest.fn(),
  getPendingApprovals: jest.fn(),
  bulkApprove: jest.fn(),
};

const mockDeliveryService = {
  deliver: jest.fn(),
  getDeliveryStatus: jest.fn(),
  bulkDeliver: jest.fn(),
};

const mockCustomFieldsService = {
  createFieldDef: jest.fn(),
  findAllFieldDefs: jest.fn(),
  findOneFieldDef: jest.fn(),
  updateFieldDef: jest.fn(),
  removeFieldDef: jest.fn(),
  saveFieldValues: jest.fn(),
  getFieldValues: jest.fn(),
};

const mockThresholdService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

const mockVerificationService = {
  verify: jest.fn(),
  generateToken: jest.fn(),
};

const mockAcknowledgmentService = {
  acknowledge: jest.fn(),
  getAcknowledgmentStatus: jest.fn(),
};

const mockAnalyticsService = {
  getDashboard: jest.fn(),
  getClassComparison: jest.fn(),
};

const mockReportCardsService = {
  generateBulkDrafts: jest.fn(),
  publishBulk: jest.fn(),
  generateTranscript: jest.fn(),
};

const mockGradebookQueue = {
  add: jest.fn(),
};

const mockPermissionCacheService = {
  getPermissions: jest.fn(),
};

async function buildModule() {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [ReportCardsEnhancedController],
    providers: [
      { provide: ReportCardTemplateService, useValue: mockTemplateService },
      { provide: ReportCardApprovalService, useValue: mockApprovalService },
      { provide: ReportCardDeliveryService, useValue: mockDeliveryService },
      { provide: ReportCardCustomFieldsService, useValue: mockCustomFieldsService },
      { provide: GradeThresholdService, useValue: mockThresholdService },
      { provide: ReportCardVerificationService, useValue: mockVerificationService },
      { provide: ReportCardAcknowledgmentService, useValue: mockAcknowledgmentService },
      { provide: ReportCardAnalyticsService, useValue: mockAnalyticsService },
      { provide: ReportCardsService, useValue: mockReportCardsService },
      { provide: getQueueToken('gradebook'), useValue: mockGradebookQueue },
      { provide: PermissionCacheService, useValue: mockPermissionCacheService },
    ],
  }).compile();

  return module.get<ReportCardsEnhancedController>(ReportCardsEnhancedController);
}

describe('ReportCardsEnhancedController — templates', () => {
  let controller: ReportCardsEnhancedController;

  beforeEach(async () => {
    controller = await buildModule();
  });

  afterEach(() => jest.clearAllMocks());

  it('should call templateService.create with tenant and user', async () => {
    const template = { id: 'tmpl-1' };
    mockTemplateService.create.mockResolvedValue(template);

    const result = await controller.createTemplate(tenantContext, jwtUser as never, {
      name: 'Modern',
      locale: 'en',
      sections_json: [],
    });

    expect(mockTemplateService.create).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      expect.objectContaining({ name: 'Modern' }),
    );
    expect(result).toEqual(template);
  });

  it('should call templateService.findAll and return list', async () => {
    const list = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockTemplateService.findAll.mockResolvedValue(list);

    const result = await controller.listTemplates(tenantContext, { page: 1, pageSize: 20 });

    expect(mockTemplateService.findAll).toHaveBeenCalledWith(TENANT_ID, { page: 1, pageSize: 20 });
    expect(result).toEqual(list);
  });

  it('should call templateService.remove and return deleted', async () => {
    mockTemplateService.remove.mockResolvedValue({ deleted: true });

    const result = await controller.deleteTemplate(tenantContext, 'tmpl-1');

    expect(mockTemplateService.remove).toHaveBeenCalledWith(TENANT_ID, 'tmpl-1');
    expect(result).toEqual({ deleted: true });
  });
});

describe('ReportCardsEnhancedController — approval actions', () => {
  let controller: ReportCardsEnhancedController;

  beforeEach(async () => {
    controller = await buildModule();
  });

  afterEach(() => jest.clearAllMocks());

  it('should submit a report card for approval', async () => {
    mockApprovalService.submitForApproval.mockResolvedValue({ submitted: true });

    const result = await controller.submitForApproval(tenantContext, REPORT_CARD_ID);

    expect(mockApprovalService.submitForApproval).toHaveBeenCalledWith(TENANT_ID, REPORT_CARD_ID);
    expect(result).toEqual({ submitted: true });
  });

  it('should approve a report card approval', async () => {
    mockApprovalService.approve.mockResolvedValue({ approved: true });

    const result = await controller.approveReportCard(tenantContext, jwtUser as never, APPROVAL_ID);

    expect(mockApprovalService.approve).toHaveBeenCalledWith(TENANT_ID, APPROVAL_ID, USER_ID);
    expect(result).toEqual({ approved: true });
  });

  it('should reject a report card approval with reason', async () => {
    mockApprovalService.reject.mockResolvedValue({ rejected: true });

    const result = await controller.rejectReportCard(
      tenantContext,
      jwtUser as never,
      APPROVAL_ID,
      { reason: 'Incomplete grades' },
    );

    expect(mockApprovalService.reject).toHaveBeenCalledWith(
      TENANT_ID,
      APPROVAL_ID,
      USER_ID,
      'Incomplete grades',
    );
    expect(result).toEqual({ rejected: true });
  });

  it('should return pending approvals list', async () => {
    const pending = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockApprovalService.getPendingApprovals.mockResolvedValue(pending);

    const result = await controller.getPendingApprovals(tenantContext, jwtUser as never, {
      page: 1,
      pageSize: 20,
      role_key: 'head_of_year',
    });

    expect(mockApprovalService.getPendingApprovals).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      'head_of_year',
      { page: 1, pageSize: 20 },
    );
    expect(result).toEqual(pending);
  });
});

describe('ReportCardsEnhancedController — bulk operations', () => {
  let controller: ReportCardsEnhancedController;

  beforeEach(async () => {
    controller = await buildModule();
  });

  afterEach(() => jest.clearAllMocks());

  it('should call generateBulkDrafts for bulk generate', async () => {
    mockReportCardsService.generateBulkDrafts.mockResolvedValue({
      data: [],
      skipped: 0,
      generated: 0,
    });

    const result = await controller.bulkGenerate(tenantContext, {
      class_id: 'class-1',
      academic_period_id: 'period-1',
    });

    expect(mockReportCardsService.generateBulkDrafts).toHaveBeenCalledWith(
      TENANT_ID,
      'class-1',
      'period-1',
    );
    expect(result).toMatchObject({ generated: 0 });
  });

  it('should call publishBulk for bulk publish', async () => {
    mockReportCardsService.publishBulk.mockResolvedValue({
      results: [],
      succeeded: 2,
      failed: 0,
    });

    const result = await controller.bulkPublish(tenantContext, jwtUser as never, {
      report_card_ids: [REPORT_CARD_ID, 'rc-2'],
    });

    expect(mockReportCardsService.publishBulk).toHaveBeenCalledWith(
      TENANT_ID,
      [REPORT_CARD_ID, 'rc-2'],
      USER_ID,
    );
    expect(result).toMatchObject({ succeeded: 2 });
  });

  it('should enqueue batch PDF job', async () => {
    mockGradebookQueue.add.mockResolvedValue({ id: 'job-1' });

    const result = await controller.enqueueBatchPdf(tenantContext, jwtUser as never, {
      class_id: 'class-1',
      academic_period_id: 'period-1',
    });

    expect(mockGradebookQueue.add).toHaveBeenCalledWith(
      'gradebook:batch-pdf',
      expect.objectContaining({
        tenant_id: TENANT_ID,
        class_id: 'class-1',
        academic_period_id: 'period-1',
        requested_by_user_id: USER_ID,
      }),
    );
    expect(result).toMatchObject({ status: 'queued' });
  });
});

describe('ReportCardsEnhancedController — transcript and analytics', () => {
  let controller: ReportCardsEnhancedController;

  beforeEach(async () => {
    controller = await buildModule();
  });

  afterEach(() => jest.clearAllMocks());

  it('should call generateTranscript for student transcript', async () => {
    const transcript = { student: { id: STUDENT_ID }, academic_years: [] };
    mockReportCardsService.generateTranscript.mockResolvedValue(transcript);

    const result = await controller.getTranscript(tenantContext, STUDENT_ID);

    expect(mockReportCardsService.generateTranscript).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID);
    expect(result).toEqual(transcript);
  });

  it('should call analyticsService.getDashboard', async () => {
    const dashboard = { report_cards: {}, subjects: [] };
    mockAnalyticsService.getDashboard.mockResolvedValue(dashboard);

    const result = await controller.getAnalyticsDashboard(tenantContext, {
      academic_period_id: 'period-1',
    });

    expect(mockAnalyticsService.getDashboard).toHaveBeenCalledWith(TENANT_ID, 'period-1');
    expect(result).toEqual(dashboard);
  });

  it('should call analyticsService.getClassComparison', async () => {
    const comparison = { classes: [] };
    mockAnalyticsService.getClassComparison.mockResolvedValue(comparison);

    const result = await controller.getClassComparison(tenantContext, {
      academic_period_id: 'period-1',
    });

    expect(mockAnalyticsService.getClassComparison).toHaveBeenCalledWith(TENANT_ID, 'period-1');
    expect(result).toEqual(comparison);
  });
});

// ─── ReportCardVerificationController ────────────────────────────────────────

describe('ReportCardVerificationController', () => {
  let controller: ReportCardVerificationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportCardVerificationController],
      providers: [
        { provide: ReportCardVerificationService, useValue: mockVerificationService },
      ],
    }).compile();

    controller = module.get<ReportCardVerificationController>(ReportCardVerificationController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call verificationService.verify with the token', async () => {
    const verified = { valid: true, report_card_id: REPORT_CARD_ID };
    mockVerificationService.verify.mockResolvedValue(verified);

    const result = await controller.verify('abc-token-123');

    expect(mockVerificationService.verify).toHaveBeenCalledWith('abc-token-123');
    expect(result).toEqual(verified);
  });

  it('should propagate NotFoundException from verificationService.verify', async () => {
    const { NotFoundException } = await import('@nestjs/common');
    mockVerificationService.verify.mockRejectedValue(new NotFoundException('Invalid token'));

    await expect(controller.verify('bad-token')).rejects.toThrow(NotFoundException);
  });

  it('should pass any token string unchanged to the service', async () => {
    mockVerificationService.verify.mockResolvedValue(null);

    await controller.verify('some-complex-token_abc-123');

    expect(mockVerificationService.verify).toHaveBeenCalledWith('some-complex-token_abc-123');
  });
});
