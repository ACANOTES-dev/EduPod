/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { PolicyReplayService } from '../policy-engine/policy-replay.service';
import { PolicyRulesService } from '../policy-engine/policy-rules.service';

import { BehaviourConfigController } from './behaviour-config.controller';
import { BehaviourConfigService } from './behaviour-config.service';
import { BehaviourDocumentTemplateService } from './behaviour-document-template.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CATEGORY_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const TEMPLATE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const POLICY_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const DOC_TEMPLATE_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER: JwtPayload = {
  sub: USER_ID,
  tenant_id: TENANT_ID,
  email: 'admin@test.com',
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

const mockConfigService = {
  listCategories: jest.fn(),
  createCategory: jest.fn(),
  updateCategory: jest.fn(),
  listTemplates: jest.fn(),
  createTemplate: jest.fn(),
  updateTemplate: jest.fn(),
};

const mockPolicyRulesService = {
  listRules: jest.fn(),
  createRule: jest.fn(),
  exportRules: jest.fn(),
  importRules: jest.fn(),
  getRule: jest.fn(),
  updateRule: jest.fn(),
  deleteRule: jest.fn(),
  getVersionHistory: jest.fn(),
  getVersion: jest.fn(),
  updatePriority: jest.fn(),
};

const mockPolicyReplayService = {
  replayRule: jest.fn(),
  dryRun: jest.fn(),
};

const mockDocumentTemplateService = {
  listTemplates: jest.fn(),
  createTemplate: jest.fn(),
  updateTemplate: jest.fn(),
};

describe('BehaviourConfigController', () => {
  let controller: BehaviourConfigController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BehaviourConfigController],
      providers: [
        { provide: BehaviourConfigService, useValue: mockConfigService },
        { provide: PolicyRulesService, useValue: mockPolicyRulesService },
        { provide: PolicyReplayService, useValue: mockPolicyReplayService },
        { provide: BehaviourDocumentTemplateService, useValue: mockDocumentTemplateService },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/module-enabled.guard').ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BehaviourConfigController>(BehaviourConfigController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Categories ──────────────────────────────────────────────────────────

  it('should call configService.listCategories with tenant_id', async () => {
    mockConfigService.listCategories.mockResolvedValue([{ id: CATEGORY_ID }]);

    const result = await controller.listCategories(TENANT);

    expect(mockConfigService.listCategories).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual([{ id: CATEGORY_ID }]);
  });

  it('should call configService.createCategory with tenant_id and dto', async () => {
    const dto = { name: 'Disruption', points: -5 };
    mockConfigService.createCategory.mockResolvedValue({ id: CATEGORY_ID });

    const result = await controller.createCategory(TENANT, dto as never);

    expect(mockConfigService.createCategory).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toEqual({ id: CATEGORY_ID });
  });

  it('should call configService.updateCategory with tenant_id, id, and dto', async () => {
    const dto = { name: 'Updated' };
    mockConfigService.updateCategory.mockResolvedValue({ id: CATEGORY_ID, name: 'Updated' });

    const result = await controller.updateCategory(TENANT, CATEGORY_ID, dto as never);

    expect(mockConfigService.updateCategory).toHaveBeenCalledWith(TENANT_ID, CATEGORY_ID, dto);
    expect(result).toEqual({ id: CATEGORY_ID, name: 'Updated' });
  });

  // ─── Description Templates ───────────────────────────────────────────────

  it('should call configService.listTemplates with tenant_id and optional category_id', async () => {
    const query = { category_id: CATEGORY_ID };
    mockConfigService.listTemplates.mockResolvedValue([{ id: TEMPLATE_ID }]);

    const result = await controller.listTemplates(TENANT, query);

    expect(mockConfigService.listTemplates).toHaveBeenCalledWith(TENANT_ID, CATEGORY_ID);
    expect(result).toEqual([{ id: TEMPLATE_ID }]);
  });

  it('should call configService.createTemplate with tenant_id and dto', async () => {
    const dto = { name: 'Template 1', description: 'Desc' };
    mockConfigService.createTemplate.mockResolvedValue({ id: TEMPLATE_ID });

    const result = await controller.createTemplate(TENANT, dto as never);

    expect(mockConfigService.createTemplate).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toEqual({ id: TEMPLATE_ID });
  });

  it('should call configService.updateTemplate with tenant_id, id, and dto', async () => {
    const dto = { name: 'Updated Template' };
    mockConfigService.updateTemplate.mockResolvedValue({
      id: TEMPLATE_ID,
      name: 'Updated Template',
    });

    const result = await controller.updateTemplate(TENANT, TEMPLATE_ID, dto as never);

    expect(mockConfigService.updateTemplate).toHaveBeenCalledWith(TENANT_ID, TEMPLATE_ID, dto);
    expect(result).toEqual({ id: TEMPLATE_ID, name: 'Updated Template' });
  });

  // ─── Policy Rules CRUD ───────────────────────────────────────────────────

  it('should call policyRulesService.listRules with tenant_id and query', async () => {
    const query = { page: 1, pageSize: 20 };
    mockPolicyRulesService.listRules.mockResolvedValue({ data: [] });

    const result = await controller.listPolicies(TENANT, query as never);

    expect(mockPolicyRulesService.listRules).toHaveBeenCalledWith(TENANT_ID, query);
    expect(result).toEqual({ data: [] });
  });

  it('should call policyRulesService.createRule with tenant_id, user_id, and dto', async () => {
    const dto = { name: 'Auto Detention', trigger: 'points_threshold' };
    mockPolicyRulesService.createRule.mockResolvedValue({ id: POLICY_ID });

    const result = await controller.createPolicy(TENANT, USER, dto as never);

    expect(mockPolicyRulesService.createRule).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    expect(result).toEqual({ id: POLICY_ID });
  });

  it('should call policyRulesService.exportRules with tenant_id', async () => {
    mockPolicyRulesService.exportRules.mockResolvedValue({ rules: [] });

    const result = await controller.exportPolicies(TENANT);

    expect(mockPolicyRulesService.exportRules).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual({ rules: [] });
  });

  it('should call policyRulesService.importRules with tenant_id, user_id, and dto', async () => {
    const dto = { rules: [{ name: 'Rule 1' }] };
    mockPolicyRulesService.importRules.mockResolvedValue({ imported: 1 });

    const result = await controller.importPolicies(TENANT, USER, dto as never);

    expect(mockPolicyRulesService.importRules).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    expect(result).toEqual({ imported: 1 });
  });

  it('should call policyReplayService.replayRule with tenant_id and dto', async () => {
    const dto = { rule_id: POLICY_ID };
    mockPolicyReplayService.replayRule.mockResolvedValue({ affected: 5 });

    const result = await controller.replayPolicy(TENANT, dto as never);

    expect(mockPolicyReplayService.replayRule).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toEqual({ affected: 5 });
  });

  it('should call policyRulesService.getRule with tenant_id and id', async () => {
    mockPolicyRulesService.getRule.mockResolvedValue({ id: POLICY_ID, name: 'Rule' });

    const result = await controller.getPolicy(TENANT, POLICY_ID);

    expect(mockPolicyRulesService.getRule).toHaveBeenCalledWith(TENANT_ID, POLICY_ID);
    expect(result).toEqual({ id: POLICY_ID, name: 'Rule' });
  });

  it('should call policyRulesService.updateRule with tenant_id, id, user_id, and dto', async () => {
    const dto = { name: 'Updated Rule' };
    mockPolicyRulesService.updateRule.mockResolvedValue({ id: POLICY_ID, name: 'Updated Rule' });

    const result = await controller.updatePolicy(TENANT, USER, POLICY_ID, dto as never);

    expect(mockPolicyRulesService.updateRule).toHaveBeenCalledWith(
      TENANT_ID,
      POLICY_ID,
      USER_ID,
      dto,
    );
    expect(result).toEqual({ id: POLICY_ID, name: 'Updated Rule' });
  });

  it('should call policyRulesService.deleteRule with tenant_id and id', async () => {
    mockPolicyRulesService.deleteRule.mockResolvedValue({ deleted: true });

    const result = await controller.deletePolicy(TENANT, POLICY_ID);

    expect(mockPolicyRulesService.deleteRule).toHaveBeenCalledWith(TENANT_ID, POLICY_ID);
    expect(result).toEqual({ deleted: true });
  });

  it('should call policyRulesService.getVersionHistory with tenant_id and id', async () => {
    mockPolicyRulesService.getVersionHistory.mockResolvedValue([{ version: 1 }]);

    const result = await controller.getPolicyVersions(TENANT, POLICY_ID);

    expect(mockPolicyRulesService.getVersionHistory).toHaveBeenCalledWith(TENANT_ID, POLICY_ID);
    expect(result).toEqual([{ version: 1 }]);
  });

  it('should call policyRulesService.getVersion with tenant_id, id, and version number', async () => {
    mockPolicyRulesService.getVersion.mockResolvedValue({ version: 2, name: 'Rule v2' });

    const result = await controller.getPolicyVersion(TENANT, POLICY_ID, 2);

    expect(mockPolicyRulesService.getVersion).toHaveBeenCalledWith(TENANT_ID, POLICY_ID, 2);
    expect(result).toEqual({ version: 2, name: 'Rule v2' });
  });

  it('should call policyRulesService.updatePriority with tenant_id, id, and dto', async () => {
    const dto = { priority: 10 };
    mockPolicyRulesService.updatePriority.mockResolvedValue({ id: POLICY_ID, priority: 10 });

    const result = await controller.updatePolicyPriority(TENANT, POLICY_ID, dto as never);

    expect(mockPolicyRulesService.updatePriority).toHaveBeenCalledWith(TENANT_ID, POLICY_ID, dto);
    expect(result).toEqual({ id: POLICY_ID, priority: 10 });
  });

  // ─── Document Templates ──────────────────────────────────────────────────

  it('should call documentTemplateService.listTemplates with tenant_id and query', async () => {
    const query = { page: 1, pageSize: 20 };
    mockDocumentTemplateService.listTemplates.mockResolvedValue({ data: [] });

    const result = await controller.listDocumentTemplates(TENANT, query as never);

    expect(mockDocumentTemplateService.listTemplates).toHaveBeenCalledWith(TENANT_ID, query);
    expect(result).toEqual({ data: [] });
  });

  it('should call documentTemplateService.createTemplate with tenant_id and dto', async () => {
    const dto = { name: 'Letter', body_template: '<p>Dear Parent</p>' };
    mockDocumentTemplateService.createTemplate.mockResolvedValue({ id: DOC_TEMPLATE_ID });

    const result = await controller.createDocumentTemplate(TENANT, dto as never);

    expect(mockDocumentTemplateService.createTemplate).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toEqual({ id: DOC_TEMPLATE_ID });
  });

  it('should call documentTemplateService.updateTemplate with tenant_id, id, and dto', async () => {
    const dto = { name: 'Updated Letter' };
    mockDocumentTemplateService.updateTemplate.mockResolvedValue({
      id: DOC_TEMPLATE_ID,
      name: 'Updated Letter',
    });

    const result = await controller.updateDocumentTemplate(TENANT, DOC_TEMPLATE_ID, dto as never);

    expect(mockDocumentTemplateService.updateTemplate).toHaveBeenCalledWith(
      TENANT_ID,
      DOC_TEMPLATE_ID,
      dto,
    );
    expect(result).toEqual({ id: DOC_TEMPLATE_ID, name: 'Updated Letter' });
  });

  // ─── Admin Dry-Run ───────────────────────────────────────────────────────

  it('should call policyReplayService.dryRun with tenant_id and dto', async () => {
    const dto = { incident_data: { category_id: 'cat-1' } };
    mockPolicyReplayService.dryRun.mockResolvedValue({ actions: ['notify'] });

    const result = await controller.policyDryRun(TENANT, dto as never);

    expect(mockPolicyReplayService.dryRun).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toEqual({ actions: ['notify'] });
  });
});
