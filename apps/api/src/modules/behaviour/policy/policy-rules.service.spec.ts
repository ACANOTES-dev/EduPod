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

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      ),
  }),
}));

import { PrismaService } from '../../prisma/prisma.service';
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
        PolicyRulesService,
        { provide: PrismaService, useValue: mockPrisma },
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
      const snapshotOrder =
        mockTx.behaviourPolicyRuleVersion.create.mock.invocationCallOrder[0];
      const updateOrder =
        mockTx.behaviourPolicyRule.update.mock.invocationCallOrder[0];
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
      mockPrisma.behaviourPolicyRule.findFirst.mockResolvedValue({
        id: RULE_ID,
        tenant_id: TENANT_ID,
        is_active: true,
      });
      mockPrisma.behaviourPolicyRule.update.mockResolvedValue({
        id: RULE_ID,
        is_active: false,
      });

      const result = await service.deleteRule(TENANT_ID, RULE_ID);

      expect(mockPrisma.behaviourPolicyRule.update).toHaveBeenCalledWith({
        where: { id: RULE_ID },
        data: { is_active: false },
      });
      expect(result).toEqual({ success: true });
    });

    it('should throw NotFoundException for non-existent rule', async () => {
      mockPrisma.behaviourPolicyRule.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteRule(TENANT_ID, 'non-existent-id'),
      ).rejects.toThrow(NotFoundException);
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
      mockPrisma.behaviourPolicyRule.findMany.mockResolvedValue([sampleRule]);
      mockPrisma.behaviourPolicyRule.count.mockResolvedValue(1);

      await service.listRules(TENANT_ID, {
        page: 1,
        pageSize: 20,
        stage: 'approval',
      });

      expect(mockPrisma.behaviourPolicyRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            stage: 'approval_stage', // mapped from 'approval' to Prisma enum
          }),
        }),
      );
    });

    it('should filter by is_active', async () => {
      mockPrisma.behaviourPolicyRule.findMany.mockResolvedValue([sampleRule]);
      mockPrisma.behaviourPolicyRule.count.mockResolvedValue(1);

      await service.listRules(TENANT_ID, {
        page: 1,
        pageSize: 20,
        is_active: true,
      });

      expect(mockPrisma.behaviourPolicyRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            is_active: true,
          }),
        }),
      );
    });

    it('should paginate results', async () => {
      mockPrisma.behaviourPolicyRule.findMany.mockResolvedValue([sampleRule]);
      mockPrisma.behaviourPolicyRule.count.mockResolvedValue(50);

      const result = await service.listRules(TENANT_ID, {
        page: 3,
        pageSize: 10,
      });

      expect(mockPrisma.behaviourPolicyRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20, // (3 - 1) * 10
          take: 10,
        }),
      );
      expect(result.meta).toEqual({ page: 3, pageSize: 10, total: 50 });
    });
  });

  // ─── getVersionHistory ──────────────────────────────────────────────────────

  describe('getVersionHistory', () => {
    it('should return versions in descending order', async () => {
      mockPrisma.behaviourPolicyRule.findFirst.mockResolvedValue({
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
      mockPrisma.behaviourPolicyRuleVersion.findMany.mockResolvedValue(
        versions,
      );

      const result = await service.getVersionHistory(TENANT_ID, RULE_ID);

      // Descending order enforced by orderBy
      expect(
        mockPrisma.behaviourPolicyRuleVersion.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rule_id: RULE_ID, tenant_id: TENANT_ID },
          orderBy: { version: 'desc' },
        }),
      );

      // Stages are mapped back to API names
      expect(result.data[0].stage).toBe('consequence');
      expect(result.data[1].stage).toBe('approval');
      expect(result.data[2].stage).toBe('notification');
    });

    it('should throw NotFoundException for non-existent rule', async () => {
      mockPrisma.behaviourPolicyRule.findFirst.mockResolvedValue(null);

      await expect(
        service.getVersionHistory(TENANT_ID, 'non-existent-id'),
      ).rejects.toThrow(NotFoundException);
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

      mockPrisma.behaviourPolicyRule.findMany.mockResolvedValue(rules);
      mockPrisma.behaviourCategory.findMany!.mockResolvedValue([
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
