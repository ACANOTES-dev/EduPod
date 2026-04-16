import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';

import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
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
import { ReportCardsQueriesService } from './report-cards-queries.service';
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
};

const mockReportCardsQueriesService = {
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
      { provide: ReportCardsQueriesService, useValue: mockReportCardsQueriesService },
      { provide: getQueueToken('gradebook'), useValue: mockGradebookQueue },
      { provide: PermissionCacheService, useValue: mockPermissionCacheService },
    ],
  })
    .overrideGuard(AuthGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(PermissionGuard)
    .useValue({ canActivate: () => true })
    .compile();

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

    const result = await controller.rejectReportCard(tenantContext, jwtUser as never, APPROVAL_ID, {
      reason: 'Incomplete grades',
    });

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
    mockReportCardsQueriesService.generateTranscript.mockResolvedValue(transcript);

    const result = await controller.getTranscript(tenantContext, STUDENT_ID);

    expect(mockReportCardsQueriesService.generateTranscript).toHaveBeenCalledWith(
      TENANT_ID,
      STUDENT_ID,
    );
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
      providers: [{ provide: ReportCardVerificationService, useValue: mockVerificationService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

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

// ─── Template update/get/convert ─────────────────────────────────────────────

describe('ReportCardsEnhancedController — template CRUD extra branches', () => {
  let controller: ReportCardsEnhancedController;

  beforeEach(async () => {
    controller = await buildModule();
  });

  afterEach(() => jest.clearAllMocks());

  it('should call templateService.findOne and return a single template', async () => {
    const template = { id: 'tmpl-1', name: 'Modern' };
    mockTemplateService.findOne.mockResolvedValue(template);

    const result = await controller.getTemplate(tenantContext, 'tmpl-1');

    expect(mockTemplateService.findOne).toHaveBeenCalledWith(TENANT_ID, 'tmpl-1');
    expect(result).toEqual(template);
  });

  it('should call templateService.update with id and dto', async () => {
    const updated = { id: 'tmpl-1', name: 'Updated' };
    mockTemplateService.update.mockResolvedValue(updated);

    const result = await controller.updateTemplate(tenantContext, 'tmpl-1', {
      name: 'Updated',
    });

    expect(mockTemplateService.update).toHaveBeenCalledWith(TENANT_ID, 'tmpl-1', {
      name: 'Updated',
    });
    expect(result).toEqual(updated);
  });

  it('should call templateService.convertFromImage with buffer and mime type', async () => {
    const converted = { id: 'tmpl-2', name: 'AI Template' };
    mockTemplateService.convertFromImage.mockResolvedValue(converted);

    const mockReq = {
      body: Buffer.from('fake-image-data'),
      headers: { 'content-type': 'image/png' },
    };

    const result = await controller.convertTemplateFromImage(
      tenantContext,
      jwtUser as never,
      mockReq as never,
    );

    expect(mockTemplateService.convertFromImage).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      expect.any(Buffer),
      'image/png',
    );
    expect(result).toEqual(converted);
  });

  it('should default mime type to image/jpeg when content-type header is missing', async () => {
    mockTemplateService.convertFromImage.mockResolvedValue({ id: 'tmpl-3' });

    const mockReq = {
      body: Buffer.from('fake'),
      headers: {},
    };

    await controller.convertTemplateFromImage(tenantContext, jwtUser as never, mockReq as never);

    expect(mockTemplateService.convertFromImage).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      expect.any(Buffer),
      'image/jpeg',
    );
  });
});

// ─── Approval Config extra branches ──────────────────────────────────────────

describe('ReportCardsEnhancedController — approval config CRUD', () => {
  let controller: ReportCardsEnhancedController;

  beforeEach(async () => {
    controller = await buildModule();
  });

  afterEach(() => jest.clearAllMocks());

  it('should get a single approval config', async () => {
    const config = { id: 'cfg-1', name: 'Standard' };
    mockApprovalService.findOneConfig.mockResolvedValue(config);

    const result = await controller.getApprovalConfig(tenantContext, 'cfg-1');

    expect(mockApprovalService.findOneConfig).toHaveBeenCalledWith(TENANT_ID, 'cfg-1');
    expect(result).toEqual(config);
  });

  it('should update an approval config', async () => {
    const updated = { id: 'cfg-1', name: 'Updated' };
    mockApprovalService.updateConfig.mockResolvedValue(updated);

    const result = await controller.updateApprovalConfig(tenantContext, 'cfg-1', {
      name: 'Updated',
    });

    expect(mockApprovalService.updateConfig).toHaveBeenCalledWith(TENANT_ID, 'cfg-1', {
      name: 'Updated',
    });
    expect(result).toEqual(updated);
  });

  it('should delete an approval config', async () => {
    mockApprovalService.removeConfig.mockResolvedValue({ deleted: true });

    const result = await controller.deleteApprovalConfig(tenantContext, 'cfg-1');

    expect(mockApprovalService.removeConfig).toHaveBeenCalledWith(TENANT_ID, 'cfg-1');
    expect(result).toEqual({ deleted: true });
  });

  it('should bulk approve multiple approvals', async () => {
    mockApprovalService.bulkApprove.mockResolvedValue({ results: [], succeeded: 2, failed: 0 });

    const result = await controller.bulkApprove(tenantContext, jwtUser as never, {
      approval_ids: [APPROVAL_ID, 'ap-2'],
    });

    expect(mockApprovalService.bulkApprove).toHaveBeenCalledWith(
      TENANT_ID,
      [APPROVAL_ID, 'ap-2'],
      USER_ID,
    );
    expect(result).toMatchObject({ succeeded: 2 });
  });
});

// ─── Delivery endpoints ──────────────────────────────────────────────────────

describe('ReportCardsEnhancedController — delivery', () => {
  let controller: ReportCardsEnhancedController;

  beforeEach(async () => {
    controller = await buildModule();
  });

  afterEach(() => jest.clearAllMocks());

  it('should call deliveryService.deliver for a single report card', async () => {
    mockDeliveryService.deliver.mockResolvedValue({ delivered_count: 2 });

    const result = await controller.deliverReportCard(tenantContext, REPORT_CARD_ID);

    expect(mockDeliveryService.deliver).toHaveBeenCalledWith(TENANT_ID, REPORT_CARD_ID);
    expect(result).toMatchObject({ delivered_count: 2 });
  });

  it('should call deliveryService.getDeliveryStatus', async () => {
    const status = { summary: { total: 5 }, deliveries: [] };
    mockDeliveryService.getDeliveryStatus.mockResolvedValue(status);

    const result = await controller.getDeliveryStatus(tenantContext, REPORT_CARD_ID);

    expect(mockDeliveryService.getDeliveryStatus).toHaveBeenCalledWith(TENANT_ID, REPORT_CARD_ID);
    expect(result).toEqual(status);
  });

  it('should call deliveryService.bulkDeliver', async () => {
    mockDeliveryService.bulkDeliver.mockResolvedValue({ results: [], succeeded: 3, failed: 0 });

    const result = await controller.bulkDeliver(tenantContext, {
      report_card_ids: [REPORT_CARD_ID, 'rc-2', 'rc-3'],
    });

    expect(mockDeliveryService.bulkDeliver).toHaveBeenCalledWith(TENANT_ID, [
      REPORT_CARD_ID,
      'rc-2',
      'rc-3',
    ]);
    expect(result).toMatchObject({ succeeded: 3 });
  });
});

// ─── Custom Fields endpoints ─────────────────────────────────────────────────

describe('ReportCardsEnhancedController — custom fields', () => {
  let controller: ReportCardsEnhancedController;

  beforeEach(async () => {
    controller = await buildModule();
  });

  afterEach(() => jest.clearAllMocks());

  it('should get a single custom field definition', async () => {
    const field = { id: 'cf-1', name: 'Behaviour' };
    mockCustomFieldsService.findOneFieldDef.mockResolvedValue(field);

    const result = await controller.getCustomField(tenantContext, 'cf-1');

    expect(mockCustomFieldsService.findOneFieldDef).toHaveBeenCalledWith(TENANT_ID, 'cf-1');
    expect(result).toEqual(field);
  });

  it('should update a custom field definition', async () => {
    const updated = { id: 'cf-1', label: 'Updated Behaviour' };
    mockCustomFieldsService.updateFieldDef.mockResolvedValue(updated);

    const result = await controller.updateCustomField(tenantContext, 'cf-1', {
      label: 'Updated Behaviour',
    });

    expect(mockCustomFieldsService.updateFieldDef).toHaveBeenCalledWith(TENANT_ID, 'cf-1', {
      label: 'Updated Behaviour',
    });
    expect(result).toEqual(updated);
  });

  it('should delete a custom field definition', async () => {
    mockCustomFieldsService.removeFieldDef.mockResolvedValue({ deleted: true });

    const result = await controller.deleteCustomField(tenantContext, 'cf-1');

    expect(mockCustomFieldsService.removeFieldDef).toHaveBeenCalledWith(TENANT_ID, 'cf-1');
    expect(result).toEqual({ deleted: true });
  });

  it('should save custom field values for a report card', async () => {
    mockCustomFieldsService.saveFieldValues.mockResolvedValue({ saved: 3 });

    const result = await controller.saveCustomFieldValues(
      tenantContext,
      jwtUser as never,
      REPORT_CARD_ID,
      { values: [{ field_def_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', value: 'Good' }] },
    );

    expect(mockCustomFieldsService.saveFieldValues).toHaveBeenCalledWith(
      TENANT_ID,
      REPORT_CARD_ID,
      USER_ID,
      [{ field_def_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', value: 'Good' }],
    );
    expect(result).toMatchObject({ saved: 3 });
  });

  it('should get custom field values for a report card', async () => {
    const values = [{ field_id: 'cf-1', value: 'Good' }];
    mockCustomFieldsService.getFieldValues.mockResolvedValue(values);

    const result = await controller.getCustomFieldValues(tenantContext, REPORT_CARD_ID);

    expect(mockCustomFieldsService.getFieldValues).toHaveBeenCalledWith(TENANT_ID, REPORT_CARD_ID);
    expect(result).toEqual(values);
  });

  it('should list all custom field definitions', async () => {
    const fields = [{ id: 'cf-1' }];
    mockCustomFieldsService.findAllFieldDefs.mockResolvedValue(fields);

    const result = await controller.listCustomFields(tenantContext);

    expect(mockCustomFieldsService.findAllFieldDefs).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual(fields);
  });

  it('should create a custom field definition', async () => {
    const created = { id: 'cf-2', name: 'Sports' };
    mockCustomFieldsService.createFieldDef.mockResolvedValue(created);

    const result = await controller.createCustomField(tenantContext, {
      name: 'Sports',
      label: 'Sports Activity',
      field_type: 'text',
      section_type: 'extracurricular',
    });

    expect(mockCustomFieldsService.createFieldDef).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ name: 'Sports' }),
    );
    expect(result).toEqual(created);
  });
});

// ─── Grade Thresholds endpoints ──────────────────────────────────────────────

describe('ReportCardsEnhancedController — grade thresholds', () => {
  let controller: ReportCardsEnhancedController;

  beforeEach(async () => {
    controller = await buildModule();
  });

  afterEach(() => jest.clearAllMocks());

  it('should get a single threshold config', async () => {
    const threshold = { id: 'th-1', name: 'Standard' };
    mockThresholdService.findOne.mockResolvedValue(threshold);

    const result = await controller.getThreshold(tenantContext, 'th-1');

    expect(mockThresholdService.findOne).toHaveBeenCalledWith(TENANT_ID, 'th-1');
    expect(result).toEqual(threshold);
  });

  it('should update a threshold config', async () => {
    const updated = { id: 'th-1', name: 'Updated' };
    mockThresholdService.update.mockResolvedValue(updated);

    const result = await controller.updateThreshold(tenantContext, 'th-1', { name: 'Updated' });

    expect(mockThresholdService.update).toHaveBeenCalledWith(TENANT_ID, 'th-1', {
      name: 'Updated',
    });
    expect(result).toEqual(updated);
  });

  it('should delete a threshold config', async () => {
    mockThresholdService.remove.mockResolvedValue({ deleted: true });

    const result = await controller.deleteThreshold(tenantContext, 'th-1');

    expect(mockThresholdService.remove).toHaveBeenCalledWith(TENANT_ID, 'th-1');
    expect(result).toEqual({ deleted: true });
  });

  it('should list all threshold configs', async () => {
    const thresholds = [{ id: 'th-1' }];
    mockThresholdService.findAll.mockResolvedValue(thresholds);

    const result = await controller.listThresholds(tenantContext);

    expect(mockThresholdService.findAll).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual(thresholds);
  });

  it('should create a threshold config', async () => {
    const created = { id: 'th-2' };
    mockThresholdService.create.mockResolvedValue(created);

    const result = await controller.createThreshold(tenantContext, {
      name: 'New',
      thresholds_json: [{ min_score: 90, label: 'A', label_ar: 'ممتاز' }],
    });

    expect(mockThresholdService.create).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ name: 'New' }),
    );
    expect(result).toEqual(created);
  });
});

// ─── Acknowledgment endpoints ────────────────────────────────────────────────

describe('ReportCardsEnhancedController — acknowledgment', () => {
  let controller: ReportCardsEnhancedController;

  beforeEach(async () => {
    controller = await buildModule();
  });

  afterEach(() => jest.clearAllMocks());

  it('should acknowledge a report card with IP from x-forwarded-for', async () => {
    mockAcknowledgmentService.acknowledge.mockResolvedValue({ acknowledged: true });

    const mockReq = {
      headers: { 'x-forwarded-for': '1.2.3.4' },
      socket: { remoteAddress: '127.0.0.1' },
    };

    const result = await controller.acknowledgeReportCard(
      tenantContext,
      jwtUser as never,
      REPORT_CARD_ID,
      mockReq as never,
    );

    expect(mockAcknowledgmentService.acknowledge).toHaveBeenCalledWith(
      TENANT_ID,
      REPORT_CARD_ID,
      USER_ID,
      '1.2.3.4',
    );
    expect(result).toEqual({ acknowledged: true });
  });

  it('should fall back to socket remoteAddress when x-forwarded-for is missing', async () => {
    mockAcknowledgmentService.acknowledge.mockResolvedValue({ acknowledged: true });

    const mockReq = {
      headers: {},
      socket: { remoteAddress: '10.0.0.1' },
    };

    await controller.acknowledgeReportCard(
      tenantContext,
      jwtUser as never,
      REPORT_CARD_ID,
      mockReq as never,
    );

    expect(mockAcknowledgmentService.acknowledge).toHaveBeenCalledWith(
      TENANT_ID,
      REPORT_CARD_ID,
      USER_ID,
      '10.0.0.1',
    );
  });

  it('should pass undefined IP when both forwarded-for and remoteAddress are absent', async () => {
    mockAcknowledgmentService.acknowledge.mockResolvedValue({ acknowledged: true });

    const mockReq = {
      headers: {},
      socket: {},
    };

    await controller.acknowledgeReportCard(
      tenantContext,
      jwtUser as never,
      REPORT_CARD_ID,
      mockReq as never,
    );

    expect(mockAcknowledgmentService.acknowledge).toHaveBeenCalledWith(
      TENANT_ID,
      REPORT_CARD_ID,
      USER_ID,
      undefined,
    );
  });

  it('should get acknowledgment status', async () => {
    const status = { acknowledged: true, acknowledged_at: '2026-01-01' };
    mockAcknowledgmentService.getAcknowledgmentStatus.mockResolvedValue(status);

    const result = await controller.getAcknowledgmentStatus(tenantContext, REPORT_CARD_ID);

    expect(mockAcknowledgmentService.getAcknowledgmentStatus).toHaveBeenCalledWith(
      TENANT_ID,
      REPORT_CARD_ID,
    );
    expect(result).toEqual(status);
  });
});

// ─── Verification token and class comparison ─────────────────────────────────

describe('ReportCardsEnhancedController — verification and analytics branches', () => {
  let controller: ReportCardsEnhancedController;

  beforeEach(async () => {
    controller = await buildModule();
  });

  afterEach(() => jest.clearAllMocks());

  it('should generate a verification token', async () => {
    const token = { token: 'abc-123', url: 'https://example.com/verify/abc-123' };
    mockVerificationService.generateToken.mockResolvedValue(token);

    const result = await controller.generateVerificationToken(tenantContext, REPORT_CARD_ID);

    expect(mockVerificationService.generateToken).toHaveBeenCalledWith(TENANT_ID, REPORT_CARD_ID);
    expect(result).toEqual(token);
  });

  it('should use empty string for class comparison when academic_period_id is undefined', async () => {
    mockAnalyticsService.getClassComparison.mockResolvedValue({ classes: [] });

    const result = await controller.getClassComparison(tenantContext, {});

    expect(mockAnalyticsService.getClassComparison).toHaveBeenCalledWith(TENANT_ID, '');
    expect(result).toEqual({ classes: [] });
  });

  it('should pass analytics dashboard query with undefined academic_period_id', async () => {
    mockAnalyticsService.getDashboard.mockResolvedValue({ data: {} });

    const result = await controller.getAnalyticsDashboard(tenantContext, {});

    expect(mockAnalyticsService.getDashboard).toHaveBeenCalledWith(TENANT_ID, undefined);
    expect(result).toEqual({ data: {} });
  });

  it('should call list approval configs', async () => {
    mockApprovalService.findAllConfigs.mockResolvedValue([{ id: 'cfg-1' }]);

    const result = await controller.listApprovalConfigs(tenantContext);

    expect(mockApprovalService.findAllConfigs).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual([{ id: 'cfg-1' }]);
  });

  it('should enqueue batch PDF with template_id when provided', async () => {
    mockGradebookQueue.add.mockResolvedValue({ id: 'job-2' });

    const result = await controller.enqueueBatchPdf(tenantContext, jwtUser as never, {
      class_id: 'class-1',
      academic_period_id: 'period-1',
      template_id: 'tmpl-x',
    });

    expect(mockGradebookQueue.add).toHaveBeenCalledWith(
      'gradebook:batch-pdf',
      expect.objectContaining({
        template_id: 'tmpl-x',
      }),
    );
    expect(result).toMatchObject({ status: 'queued' });
  });
});
