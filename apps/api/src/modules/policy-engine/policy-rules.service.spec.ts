/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

const mockTx = {
  behaviourPolicyRule: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  behaviourPolicyRuleAction: {
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  behaviourPolicyRuleVersion: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  behaviourCategory: {
    findMany: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

import { MOCK_FACADE_PROVIDERS, BehaviourReadFacade } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';
import { PolicyRulesService } from './policy-rules.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const RULE_ID = '33333333-3333-3333-3333-333333333333';
const CATEGORY_ID = '44444444-4444-4444-4444-444444444444';

describe('PolicyRulesService', () => {
  let service: PolicyRulesService;
  let mockPrisma: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    mockPrisma = {
      behaviourPolicyRule: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
      },
      behaviourPolicyRuleVersion: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      behaviourCategory: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        PolicyRulesService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: BehaviourReadFacade,
          useValue: {
            findPolicyRulesPaginated: jest.fn().mockImplementation(async () => {
              const data = await mockPrisma.behaviourPolicyRule!.findMany!();
              const total = await mockPrisma.behaviourPolicyRule!.count!();
              return { data, total };
            }),
            findPolicyRuleById: jest.fn().mockImplementation((_t: string, _id: string) => {
              return mockPrisma.behaviourPolicyRule!.findFirst!();
            }),
            findPolicyRuleVersions: jest.fn().mockImplementation((_t: string, _ruleId: string) => {
              return mockPrisma.behaviourPolicyRuleVersion!.findMany!();
            }),
            findPolicyRuleVersion: jest.fn().mockImplementation(() => {
              return mockPrisma.behaviourPolicyRuleVersion!.findFirst!();
            }),
            findPolicyRules: jest.fn().mockImplementation(() => {
              return mockPrisma.behaviourPolicyRule!.findMany!();
            }),
            findCategories: jest.fn().mockImplementation(() => {
              return mockPrisma.behaviourCategory!.findMany!();
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PolicyRulesService>(PolicyRulesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createRule ─────────────────────────────────────────────────────────────

  describe('createRule', () => {
    const baseDto = {
      name: 'Repeated Disruption',
      description: 'Escalation for repeated disruption',
      stage: 'consequence' as const,
      priority: 10,
      match_strategy: 'first_match' as const,
      stop_processing_stage: false,
      is_active: true,
      conditions: { severity_min: 3 },
      actions: [
        {
          action_type: 'create_sanction' as const,
          action_config: { sanction_type: 'detention' },
          execution_order: 0,
        },
      ],
    };

    it('should create a rule and snapshot version 1', async () => {
      const createdRule = { id: RULE_ID, ...baseDto, current_version: 1 };
      mockTx.behaviourPolicyRule.create.mockResolvedValue(createdRule);
      mockTx.behaviourPolicyRuleAction.createMany.mockResolvedValue({
        count: 1,
      });
      mockTx.behaviourPolicyRuleVersion.create.mockResolvedValue({
        id: 'v-1',
      });
      mockTx.behaviourPolicyRule.findUniqueOrThrow.mockResolvedValue({
        ...createdRule,
        stage: 'consequence',
        actions: [
          {
            action_type: 'create_sanction',
            action_config: { sanction_type: 'detention' },
            execution_order: 0,
          },
        ],
      });

      await service.createRule(TENANT_ID, USER_ID, baseDto);

      // Verify rule creation
      expect(mockTx.behaviourPolicyRule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          name: 'Repeated Disruption',
          stage: 'consequence',
          current_version: 1,
        }),
      });

      // Verify version 1 snapshot
      expect(mockTx.behaviourPolicyRuleVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          rule_id: RULE_ID,
          version: 1,
          name: 'Repeated Disruption',
          changed_by_id: USER_ID,
          change_reason: 'Initial creation',
        }),
      });
    });

    it('should create rule actions', async () => {
      const createdRule = { id: RULE_ID, ...baseDto, current_version: 1 };
      mockTx.behaviourPolicyRule.create.mockResolvedValue(createdRule);
      mockTx.behaviourPolicyRuleAction.createMany.mockResolvedValue({
        count: 1,
      });
      mockTx.behaviourPolicyRuleVersion.create.mockResolvedValue({
        id: 'v-1',
      });
      mockTx.behaviourPolicyRule.findUniqueOrThrow.mockResolvedValue({
        ...createdRule,
        stage: 'consequence',
        actions: baseDto.actions,
      });

      await service.createRule(TENANT_ID, USER_ID, baseDto);

      expect(mockTx.behaviourPolicyRuleAction.createMany).toHaveBeenCalledWith({
        data: [
          {
            tenant_id: TENANT_ID,
            rule_id: RULE_ID,
            action_type: 'create_sanction',
            action_config: { sanction_type: 'detention' },
            execution_order: 0,
          },
        ],
      });
    });
  });

  // ─── updateRule ─────────────────────────────────────────────────────────────

  describe('updateRule', () => {
    const existingRule = {
      id: RULE_ID,
      tenant_id: TENANT_ID,
      name: 'Old Name',
      description: null,
      stage: 'consequence',
      priority: 10,
      match_strategy: 'first_match',
      stop_processing_stage: false,
      is_active: true,
      conditions: { severity_min: 3 },
      current_version: 2,
      actions: [
        {
          action_type: 'create_sanction',
          action_config: { sanction_type: 'detention' },
          execution_order: 0,
        },
      ],
    };

    beforeEach(() => {
      mockTx.behaviourPolicyRule.findFirst.mockResolvedValue(existingRule);
      mockTx.behaviourPolicyRuleVersion.create.mockResolvedValue({
        id: 'v-snap',
      });
      mockTx.behaviourPolicyRule.update.mockResolvedValue({
        ...existingRule,
        name: 'Updated Name',
        current_version: 3,
      });
      mockTx.behaviourPolicyRule.findUniqueOrThrow.mockResolvedValue({
        ...existingRule,
        name: 'Updated Name',
        current_version: 3,
        actions: existingRule.actions,
      });
    });

    it('should snapshot previous version before applying update', async () => {
      await service.updateRule(TENANT_ID, RULE_ID, USER_ID, {
        name: 'Updated Name',
      });

      // Snapshot must capture the CURRENT state before update
      expect(mockTx.behaviourPolicyRuleVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          rule_id: RULE_ID,
          version: 2, // current_version of existing rule
          name: 'Old Name',
          stage: 'consequence',
          changed_by_id: USER_ID,
        }),
      });

      // Verify snapshot was created before the rule update by checking call order
      const snapshotOrder = mockTx.behaviourPolicyRuleVersion.create.mock.invocationCallOrder[0]!;
      const updateOrder = mockTx.behaviourPolicyRule.update.mock.invocationCallOrder[0]!;
      expect(snapshotOrder).toBeLessThan(updateOrder);
    });

    it('should increment current_version on every update', async () => {
      await service.updateRule(TENANT_ID, RULE_ID, USER_ID, {
        name: 'Updated Name',
      });

      expect(mockTx.behaviourPolicyRule.update).toHaveBeenCalledWith({
        where: { id: RULE_ID },
        data: expect.objectContaining({
          current_version: { increment: 1 },
          name: 'Updated Name',
        }),
      });
    });

    it('should replace actions if provided', async () => {
      const newActions = [
        {
          action_type: 'notify_roles' as const,
          action_config: { roles: ['head_of_year'] },
          execution_order: 0,
        },
      ];

      mockTx.behaviourPolicyRuleAction.deleteMany.mockResolvedValue({
        count: 1,
      });
      mockTx.behaviourPolicyRuleAction.createMany.mockResolvedValue({
        count: 1,
      });
      mockTx.behaviourPolicyRule.findUniqueOrThrow.mockResolvedValue({
        ...existingRule,
        current_version: 3,
        actions: newActions,
      });

      await service.updateRule(TENANT_ID, RULE_ID, USER_ID, {
        actions: newActions,
      });

      expect(mockTx.behaviourPolicyRuleAction.deleteMany).toHaveBeenCalledWith({
        where: { rule_id: RULE_ID },
      });
      expect(mockTx.behaviourPolicyRuleAction.createMany).toHaveBeenCalledWith({
        data: [
          {
            tenant_id: TENANT_ID,
            rule_id: RULE_ID,
            action_type: 'notify_roles',
            action_config: { roles: ['head_of_year'] },
            execution_order: 0,
          },
        ],
      });
    });
  });

  // ─── deleteRule ─────────────────────────────────────────────────────────────

  describe('deleteRule', () => {
    it('should soft-delete by setting is_active to false', async () => {
      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue({
        id: RULE_ID,
        tenant_id: TENANT_ID,
        is_active: true,
      });
      mockTx.behaviourPolicyRule.update.mockResolvedValue({
        id: RULE_ID,
        is_active: false,
      });

      const result = await service.deleteRule(TENANT_ID, RULE_ID);

      expect(mockTx.behaviourPolicyRule.update).toHaveBeenCalledWith({
        where: { id: RULE_ID },
        data: { is_active: false },
      });
      expect(result).toEqual({ success: true });
    });

    it('should throw NotFoundException for non-existent rule', async () => {
      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(null);

      await expect(service.deleteRule(TENANT_ID, 'non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── listRules ──────────────────────────────────────────────────────────────

  describe('listRules', () => {
    const sampleRule = {
      id: RULE_ID,
      tenant_id: TENANT_ID,
      name: 'Sample Rule',
      stage: 'consequence',
      priority: 10,
      match_strategy: 'first_match',
      is_active: true,
      conditions: {},
      current_version: 1,
      actions: [],
    };

    it('should filter by stage', async () => {
      mockPrisma.behaviourPolicyRule!.findMany!.mockResolvedValue([sampleRule]);
      mockPrisma.behaviourPolicyRule!.count!.mockResolvedValue(1);

      const result = await service.listRules(TENANT_ID, {
        page: 1,
        pageSize: 20,
        stage: 'approval',
      });

      expect(result.data).toHaveLength(1);
    });

    it('should filter by is_active', async () => {
      mockPrisma.behaviourPolicyRule!.findMany!.mockResolvedValue([sampleRule]);
      mockPrisma.behaviourPolicyRule!.count!.mockResolvedValue(1);

      const result = await service.listRules(TENANT_ID, {
        page: 1,
        pageSize: 20,
        is_active: true,
      });

      expect(result.data).toHaveLength(1);
    });

    it('should paginate results', async () => {
      mockPrisma.behaviourPolicyRule!.findMany!.mockResolvedValue([sampleRule]);
      mockPrisma.behaviourPolicyRule!.count!.mockResolvedValue(50);

      const result = await service.listRules(TENANT_ID, {
        page: 3,
        pageSize: 10,
      });

      expect(result.meta).toEqual({ page: 3, pageSize: 10, total: 50 });
    });
  });

  // ─── getVersionHistory ──────────────────────────────────────────────────────

  describe('getVersionHistory', () => {
    it('should return versions in descending order', async () => {
      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue({
        id: RULE_ID,
        tenant_id: TENANT_ID,
      });

      const versions = [
        {
          id: 'v-3',
          version: 3,
          stage: 'consequence',
          changed_by: {
            id: USER_ID,
            first_name: 'John',
            last_name: 'Doe',
            email: 'john@test.com',
          },
        },
        {
          id: 'v-2',
          version: 2,
          stage: 'approval_stage',
          changed_by: {
            id: USER_ID,
            first_name: 'John',
            last_name: 'Doe',
            email: 'john@test.com',
          },
        },
        {
          id: 'v-1',
          version: 1,
          stage: 'notification_stage',
          changed_by: {
            id: USER_ID,
            first_name: 'John',
            last_name: 'Doe',
            email: 'john@test.com',
          },
        },
      ];
      mockPrisma.behaviourPolicyRuleVersion!.findMany!.mockResolvedValue(versions);

      const result = await service.getVersionHistory(TENANT_ID, RULE_ID);

      // Stages are mapped back to API names
      expect(result.data[0]!.stage).toBe('consequence');
      expect(result.data[1]!.stage).toBe('approval');
      expect(result.data[2]!.stage).toBe('notification');
    });

    it('should throw NotFoundException for non-existent rule', async () => {
      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(null);

      await expect(service.getVersionHistory(TENANT_ID, 'non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── importRules ────────────────────────────────────────────────────────────

  describe('importRules', () => {
    it('should resolve category name tokens to UUIDs', async () => {
      mockTx.behaviourCategory.findMany.mockResolvedValue([
        { id: CATEGORY_ID, name: 'Verbal Warning' },
      ]);

      const importDto = {
        rules: [
          {
            name: 'Auto escalation',
            stage: 'consequence' as const,
            priority: 10,
            match_strategy: 'first_match' as const,
            stop_processing_stage: false,
            conditions: { category_ids: ['__VERBAL_WARNING__'] },
            actions: [
              {
                action_type: 'create_sanction' as const,
                action_config: { target_category: '__VERBAL_WARNING__' },
                execution_order: 0,
              },
            ],
          },
        ],
      };

      const createdRule = { id: RULE_ID, current_version: 1 };
      mockTx.behaviourPolicyRule.create.mockResolvedValue(createdRule);
      mockTx.behaviourPolicyRuleAction.createMany.mockResolvedValue({
        count: 1,
      });
      mockTx.behaviourPolicyRuleVersion.create.mockResolvedValue({
        id: 'v-1',
      });

      await service.importRules(TENANT_ID, USER_ID, importDto);

      // Conditions should have token resolved to UUID
      expect(mockTx.behaviourPolicyRule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          conditions: expect.objectContaining({
            category_ids: [CATEGORY_ID],
          }),
        }),
      });

      // Action config should also have token resolved
      expect(mockTx.behaviourPolicyRuleAction.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            action_config: { target_category: CATEGORY_ID },
          }),
        ],
      });
    });

    it('should create version 1 snapshots for imported rules', async () => {
      mockTx.behaviourCategory.findMany.mockResolvedValue([]);

      const importDto = {
        rules: [
          {
            name: 'Imported Rule',
            stage: 'alerting' as const,
            priority: 5,
            match_strategy: 'all_matching' as const,
            stop_processing_stage: true,
            conditions: { severity_min: 7 },
            actions: [
              {
                action_type: 'flag_for_review' as const,
                action_config: {},
                execution_order: 0,
              },
            ],
          },
        ],
      };

      const createdRule = { id: RULE_ID, current_version: 1 };
      mockTx.behaviourPolicyRule.create.mockResolvedValue(createdRule);
      mockTx.behaviourPolicyRuleAction.createMany.mockResolvedValue({
        count: 1,
      });
      mockTx.behaviourPolicyRuleVersion.create.mockResolvedValue({
        id: 'v-1',
      });

      const result = await service.importRules(TENANT_ID, USER_ID, importDto);

      expect(mockTx.behaviourPolicyRuleVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          rule_id: RULE_ID,
          version: 1,
          name: 'Imported Rule',
          changed_by_id: USER_ID,
          change_reason: 'Imported',
        }),
      });
      expect(result).toEqual({ imported: 1, rule_ids: [RULE_ID] });
    });
  });

  // ─── getRule ────────────────────────────────────────────────────────────────

  describe('getRule', () => {
    it('should return mapped rule when found', async () => {
      const rule = {
        id: RULE_ID,
        tenant_id: TENANT_ID,
        name: 'Test Rule',
        stage: 'approval_stage',
        priority: 10,
        actions: [{ action_type: 'require_approval', action_config: {}, execution_order: 0 }],
      };
      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(rule);

      const result = await service.getRule(TENANT_ID, RULE_ID);

      expect(result.stage).toBe('approval');
      expect(result.name).toBe('Test Rule');
    });

    it('should throw NotFoundException when rule is not found', async () => {
      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(null);

      await expect(service.getRule(TENANT_ID, 'non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getVersion ───────────────────────────────────────────────────────────

  describe('getVersion', () => {
    it('should return version with mapped stage', async () => {
      mockPrisma.behaviourPolicyRuleVersion!.findFirst!.mockResolvedValue({
        id: 'v-1',
        version: 1,
        stage: 'notification_stage',
        name: 'Test',
      });

      const result = await service.getVersion(TENANT_ID, RULE_ID, 1);

      expect(result.stage).toBe('notification');
    });

    it('should throw NotFoundException when version is not found', async () => {
      mockPrisma.behaviourPolicyRuleVersion!.findFirst!.mockResolvedValue(null);

      await expect(service.getVersion(TENANT_ID, RULE_ID, 99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updatePriority ───────────────────────────────────────────────────────

  describe('updatePriority', () => {
    it('should update rule priority and return mapped result', async () => {
      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue({
        id: RULE_ID,
        tenant_id: TENANT_ID,
      });
      mockTx.behaviourPolicyRule.update.mockResolvedValue({
        id: RULE_ID,
        stage: 'support',
        priority: 5,
        actions: [],
      });

      const result = await service.updatePriority(TENANT_ID, RULE_ID, { priority: 5 });

      expect(result.stage).toBe('support');
    });

    it('should throw NotFoundException for non-existent rule', async () => {
      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(null);

      await expect(
        service.updatePriority(TENANT_ID, 'non-existent', { priority: 5 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateRule — NotFoundException branch ────────────────────────────────

  describe('updateRule — NotFoundException', () => {
    it('should throw NotFoundException when rule does not exist', async () => {
      mockTx.behaviourPolicyRule.findFirst.mockResolvedValue(null);

      await expect(
        service.updateRule(TENANT_ID, 'non-existent', USER_ID, { name: 'New' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateRule — partial update branches ─────────────────────────────────

  describe('updateRule — partial fields', () => {
    const existingRule = {
      id: RULE_ID,
      tenant_id: TENANT_ID,
      name: 'Old Name',
      description: null,
      stage: 'consequence',
      priority: 10,
      match_strategy: 'first_match',
      stop_processing_stage: false,
      is_active: true,
      conditions: { severity_min: 3 },
      current_version: 1,
      actions: [],
    };

    beforeEach(() => {
      mockTx.behaviourPolicyRule.findFirst.mockResolvedValue(existingRule);
      mockTx.behaviourPolicyRuleVersion.create.mockResolvedValue({ id: 'v-snap' });
      mockTx.behaviourPolicyRule.update.mockResolvedValue({
        ...existingRule,
        current_version: 2,
      });
      mockTx.behaviourPolicyRule.findUniqueOrThrow.mockResolvedValue({
        ...existingRule,
        current_version: 2,
        actions: [],
      });
    });

    it('should only update provided fields — stage', async () => {
      await service.updateRule(TENANT_ID, RULE_ID, USER_ID, { stage: 'approval' });

      expect(mockTx.behaviourPolicyRule.update).toHaveBeenCalledWith({
        where: { id: RULE_ID },
        data: expect.objectContaining({
          stage: 'approval_stage',
          current_version: { increment: 1 },
        }),
      });
    });

    it('should only update provided fields — description', async () => {
      await service.updateRule(TENANT_ID, RULE_ID, USER_ID, { description: 'New desc' });

      expect(mockTx.behaviourPolicyRule.update).toHaveBeenCalledWith({
        where: { id: RULE_ID },
        data: expect.objectContaining({
          description: 'New desc',
          current_version: { increment: 1 },
        }),
      });
    });

    it('should only update provided fields — match_strategy', async () => {
      await service.updateRule(TENANT_ID, RULE_ID, USER_ID, {
        match_strategy: 'all_matching',
      });

      expect(mockTx.behaviourPolicyRule.update).toHaveBeenCalledWith({
        where: { id: RULE_ID },
        data: expect.objectContaining({
          match_strategy: 'all_matching',
        }),
      });
    });

    it('should only update provided fields — stop_processing_stage', async () => {
      await service.updateRule(TENANT_ID, RULE_ID, USER_ID, {
        stop_processing_stage: true,
      });

      expect(mockTx.behaviourPolicyRule.update).toHaveBeenCalledWith({
        where: { id: RULE_ID },
        data: expect.objectContaining({
          stop_processing_stage: true,
        }),
      });
    });

    it('should only update provided fields — is_active', async () => {
      await service.updateRule(TENANT_ID, RULE_ID, USER_ID, { is_active: false });

      expect(mockTx.behaviourPolicyRule.update).toHaveBeenCalledWith({
        where: { id: RULE_ID },
        data: expect.objectContaining({
          is_active: false,
        }),
      });
    });

    it('should only update provided fields — conditions', async () => {
      await service.updateRule(TENANT_ID, RULE_ID, USER_ID, {
        conditions: { polarity: 'positive' },
      });

      expect(mockTx.behaviourPolicyRule.update).toHaveBeenCalledWith({
        where: { id: RULE_ID },
        data: expect.objectContaining({
          conditions: { polarity: 'positive' },
        }),
      });
    });

    it('should not replace actions when actions field is not provided', async () => {
      await service.updateRule(TENANT_ID, RULE_ID, USER_ID, { name: 'Just a name change' });

      expect(mockTx.behaviourPolicyRuleAction.deleteMany).not.toHaveBeenCalled();
      expect(mockTx.behaviourPolicyRuleAction.createMany).not.toHaveBeenCalled();
    });

    it('should store change_reason in version snapshot when provided', async () => {
      await service.updateRule(TENANT_ID, RULE_ID, USER_ID, {
        name: 'Updated',
        change_reason: 'Policy review Q1',
      });

      expect(mockTx.behaviourPolicyRuleVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          change_reason: 'Policy review Q1',
        }),
      });
    });

    it('should store null change_reason when not provided', async () => {
      await service.updateRule(TENANT_ID, RULE_ID, USER_ID, { name: 'Updated' });

      expect(mockTx.behaviourPolicyRuleVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          change_reason: null,
        }),
      });
    });
  });

  // ─── createRule — empty actions ───────────────────────────────────────────

  describe('createRule — empty actions', () => {
    it('should skip createMany when actions array is empty', async () => {
      const dto = {
        name: 'No actions rule',
        stage: 'consequence' as const,
        priority: 10,
        match_strategy: 'first_match' as const,
        stop_processing_stage: false,
        is_active: true,
        conditions: {},
        actions: [],
      };

      const createdRule = { id: RULE_ID, ...dto, current_version: 1 };
      mockTx.behaviourPolicyRule.create.mockResolvedValue(createdRule);
      mockTx.behaviourPolicyRuleVersion.create.mockResolvedValue({ id: 'v-1' });
      mockTx.behaviourPolicyRule.findUniqueOrThrow.mockResolvedValue({
        ...createdRule,
        stage: 'consequence',
        actions: [],
      });

      await service.createRule(TENANT_ID, USER_ID, dto);

      expect(mockTx.behaviourPolicyRuleAction.createMany).not.toHaveBeenCalled();
    });
  });

  // ─── listRules — no filters ───────────────────────────────────────────────

  describe('listRules — no filters', () => {
    it('should list rules without stage or is_active filters', async () => {
      mockPrisma.behaviourPolicyRule!.findMany!.mockResolvedValue([]);
      mockPrisma.behaviourPolicyRule!.count!.mockResolvedValue(0);

      const result = await service.listRules(TENANT_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toHaveLength(0);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 0 });
    });
  });

  // ─── listRules — stage mapping ────────────────────────────────────────────

  describe('listRules — stage mapping', () => {
    it('should map rule stages from Prisma to API format', async () => {
      const rules = [
        {
          id: RULE_ID,
          stage: 'notification_stage',
          actions: [{ action_type: 'notify_roles' }],
        },
      ];
      mockPrisma.behaviourPolicyRule!.findMany!.mockResolvedValue(rules);
      mockPrisma.behaviourPolicyRule!.count!.mockResolvedValue(1);

      const result = await service.listRules(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data[0]!.stage).toBe('notification');
    });
  });

  // ─── importRules — empty actions array ────────────────────────────────────

  describe('importRules — empty actions', () => {
    it('should skip createMany when imported rule has no actions', async () => {
      mockTx.behaviourCategory.findMany.mockResolvedValue([]);

      const importDto = {
        rules: [
          {
            name: 'No actions',
            stage: 'consequence' as const,
            priority: 1,
            match_strategy: 'first_match' as const,
            stop_processing_stage: false,
            conditions: {},
            actions: [],
          },
        ],
      };

      mockTx.behaviourPolicyRule.create.mockResolvedValue({ id: RULE_ID });
      mockTx.behaviourPolicyRuleVersion.create.mockResolvedValue({ id: 'v-1' });

      const result = await service.importRules(TENANT_ID, USER_ID, importDto);

      expect(result.imported).toBe(1);
      expect(mockTx.behaviourPolicyRuleAction.createMany).not.toHaveBeenCalled();
    });
  });

  // ─── resolveCategoryTokens — non-token values ────────────────────────────

  describe('importRules — non-token values', () => {
    it('should leave non-token string values unchanged', async () => {
      mockTx.behaviourCategory.findMany.mockResolvedValue([
        { id: CATEGORY_ID, name: 'Verbal Warning' },
      ]);

      const importDto = {
        rules: [
          {
            name: 'Keep plain values',
            stage: 'consequence' as const,
            priority: 1,
            match_strategy: 'first_match' as const,
            stop_processing_stage: false,
            conditions: { polarity: 'negative' },
            actions: [
              {
                action_type: 'flag_for_review' as const,
                action_config: { reason: 'Just a plain string' },
                execution_order: 0,
              },
            ],
          },
        ],
      };

      mockTx.behaviourPolicyRule.create.mockResolvedValue({ id: RULE_ID });
      mockTx.behaviourPolicyRuleAction.createMany.mockResolvedValue({ count: 1 });
      mockTx.behaviourPolicyRuleVersion.create.mockResolvedValue({ id: 'v-1' });

      await service.importRules(TENANT_ID, USER_ID, importDto);

      // Action config should remain unchanged
      expect(mockTx.behaviourPolicyRuleAction.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            action_config: { reason: 'Just a plain string' },
          }),
        ],
      });
    });

    it('should leave non-token array values unchanged during resolution', async () => {
      mockTx.behaviourCategory.findMany.mockResolvedValue([
        { id: CATEGORY_ID, name: 'Verbal Warning' },
      ]);

      // Mix of token and plain UUID in an array
      const importDto = {
        rules: [
          {
            name: 'Mixed array',
            stage: 'consequence' as const,
            priority: 1,
            match_strategy: 'first_match' as const,
            stop_processing_stage: false,
            conditions: { category_ids: ['__VERBAL_WARNING__', CATEGORY_ID] },
            actions: [],
          },
        ],
      };

      mockTx.behaviourPolicyRule.create.mockResolvedValue({ id: RULE_ID });
      mockTx.behaviourPolicyRuleVersion.create.mockResolvedValue({ id: 'v-1' });

      await service.importRules(TENANT_ID, USER_ID, importDto);

      // Both should resolve to the same UUID (token resolved, plain UUID untouched)
      expect(mockTx.behaviourPolicyRule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          conditions: expect.objectContaining({
            category_ids: [CATEGORY_ID, CATEGORY_ID],
          }),
        }),
      });
    });
  });

  // ─── exportRules ────────────────────────────────────────────────────────────

  describe('exportRules', () => {
    it('should tokenize category UUIDs to name tokens', async () => {
      const rules = [
        {
          id: RULE_ID,
          tenant_id: TENANT_ID,
          name: 'Export Rule',
          description: null,
          stage: 'approval_stage',
          priority: 10,
          match_strategy: 'first_match',
          stop_processing_stage: false,
          is_active: true,
          conditions: { category_ids: [CATEGORY_ID] },
          current_version: 1,
          actions: [
            {
              action_type: 'create_sanction',
              action_config: { target_category: CATEGORY_ID },
              execution_order: 0,
            },
          ],
        },
      ];

      mockPrisma.behaviourPolicyRule!.findMany!.mockResolvedValue(rules);
      mockPrisma.behaviourCategory!.findMany!.mockResolvedValue([
        { id: CATEGORY_ID, name: 'Verbal Warning' },
      ]);

      const result = await service.exportRules(TENANT_ID);

      expect(result).toHaveLength(1);
      // Category UUID replaced with token
      const conditions = result[0]!.conditions as Record<string, unknown>;
      expect(conditions.category_ids).toEqual(['__VERBAL_WARNING__']);
      // Action config category UUID replaced with token
      const actionConfig = result[0]!.actions[0]!.action_config as Record<string, unknown>;
      expect(actionConfig.target_category).toBe('__VERBAL_WARNING__');
      // Stage mapped back to API name
      expect(result[0]!.stage).toBe('approval');
    });
  });
});
