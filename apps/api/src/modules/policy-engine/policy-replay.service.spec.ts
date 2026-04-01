import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { PolicyEvaluationEngine } from './policy-evaluation-engine';
import { PolicyReplayService } from './policy-replay.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

const MOCK_RULE = {
  id: 'rule-001',
  name: 'Test Rule',
  tenant_id: TENANT_ID,
  stage: 'consequence',
  conditions: { polarity: 'negative', severity_min: 3 },
  actions: [
    {
      action_type: 'flag_for_review',
      action_config: { reason: 'Test' },
      execution_order: 0,
    },
  ],
};

const MOCK_INCIDENT = {
  id: 'inc-001',
  tenant_id: TENANT_ID,
  category_id: 'cat-001',
  polarity: 'negative',
  severity: 5,
  context_type: 'class',
  occurred_at: new Date('2026-01-15'),
  weekday: 3,
  period_order: 2,
  incident_number: 'BH-000001',
  category: { name: 'Verbal Warning' },
  participants: [
    {
      student_id: 'student-001',
      role: 'subject',
      participant_type: 'student',
      student_snapshot: {
        year_group_id: 'yg-001',
        year_group_name: 'Year 9',
        has_send: false,
        had_active_intervention: false,
      },
    },
  ],
};

const mockPrisma: Record<string, Record<string, jest.Mock>> = {
  behaviourPolicyRule: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  behaviourIncident: {
    findMany: jest.fn(),
  },
  behaviourCategory: {
    findFirst: jest.fn(),
  },
  yearGroup: {
    findFirst: jest.fn(),
  },
  behaviourPolicyEvaluation: {
    findMany: jest.fn(),
  },
};

const mockEvaluationEngine = {
  evaluateConditions: jest.fn(),
};

describe('PolicyReplayService', () => {
  let service: PolicyReplayService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PolicyReplayService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PolicyEvaluationEngine, useValue: mockEvaluationEngine },
      ],
    }).compile();

    service = module.get<PolicyReplayService>(PolicyReplayService);
  });

  describe('replayRule', () => {
    const baseDto = {
      rule_id: 'rule-001',
      replay_period: { from: '2026-01-01', to: '2026-01-31' },
      dry_run: true,
    };

    it('should return correct incident count for the replay period', async () => {
      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(MOCK_RULE);
      mockPrisma.behaviourIncident!.findMany!.mockResolvedValue([
        MOCK_INCIDENT,
        { ...MOCK_INCIDENT, id: 'inc-002', participants: [] },
      ]);
      mockEvaluationEngine.evaluateConditions.mockReturnValue(true);

      const result = await service.replayRule(TENANT_ID, baseDto);

      expect(result.incidents_evaluated).toBe(2);
      expect(result.incidents_matched).toBe(1);
      expect(result.students_affected).toBe(1);
      expect(result.rule_id).toBe('rule-001');
      expect(result.rule_name).toBe('Test Rule');
      expect(result.stage).toBe('consequence');
    });

    it('should return correct match count using historical snapshots', async () => {
      const incident2 = {
        ...MOCK_INCIDENT,
        id: 'inc-002',
        incident_number: 'BH-000002',
        participants: [
          {
            student_id: 'student-002',
            role: 'subject',
            participant_type: 'student',
            student_snapshot: {
              year_group_id: 'yg-002',
              year_group_name: 'Year 10',
              has_send: true,
              had_active_intervention: false,
            },
          },
        ],
      };

      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(MOCK_RULE);
      mockPrisma.behaviourIncident!.findMany!.mockResolvedValue([MOCK_INCIDENT, incident2]);
      // First student matches, second does not
      mockEvaluationEngine.evaluateConditions.mockReturnValueOnce(true).mockReturnValueOnce(false);

      const result = await service.replayRule(TENANT_ID, baseDto);

      expect(result.incidents_matched).toBe(1);
      expect(result.students_affected).toBe(1);
      expect(result.affected_year_groups).toEqual(['Year 9']);
      expect(mockEvaluationEngine.evaluateConditions).toHaveBeenCalledTimes(2);

      // Verify the evaluated input passed to the engine uses snapshot data
      const firstCallInput = mockEvaluationEngine.evaluateConditions.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(firstCallInput.year_group_name).toBe('Year 9');
      expect(firstCallInput.has_send).toBe(false);
    });

    it('should not modify any database rows when dry_run = true', async () => {
      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(MOCK_RULE);
      mockPrisma.behaviourIncident!.findMany!.mockResolvedValue([MOCK_INCIDENT]);
      mockEvaluationEngine.evaluateConditions.mockReturnValue(true);

      await service.replayRule(TENANT_ID, baseDto);

      // Verify only read operations were called (findFirst, findMany) — no
      // create, update, delete, or upsert calls exist on the mock objects
      for (const [modelName, methods] of Object.entries(mockPrisma)) {
        for (const [methodName, fn] of Object.entries(methods)) {
          if (
            methodName.startsWith('create') ||
            methodName.startsWith('update') ||
            methodName.startsWith('delete') ||
            methodName.startsWith('upsert')
          ) {
            expect(fn).not.toHaveBeenCalled();
            if (fn.mock.calls.length > 0) {
              throw new Error(
                `Write operation ${modelName}.${methodName} was called during dry_run`,
              );
            }
          }
        }
      }
    });

    it('should reject replay windows exceeding 10,000 incidents', async () => {
      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(MOCK_RULE);

      // Create an array of 10,001 incidents
      const largeIncidentList = Array.from({ length: 10001 }, (_, i) => ({
        ...MOCK_INCIDENT,
        id: `inc-${String(i).padStart(5, '0')}`,
        participants: [],
      }));
      mockPrisma.behaviourIncident!.findMany!.mockResolvedValue(largeIncidentList);

      await expect(service.replayRule(TENANT_ID, baseDto)).rejects.toThrow(BadRequestException);
      await expect(service.replayRule(TENANT_ID, baseDto)).rejects.toThrow(/10,000/);
    });

    it('should use student_snapshot for student facts, not live student record', async () => {
      const snapshotIncident = {
        ...MOCK_INCIDENT,
        participants: [
          {
            student_id: 'student-001',
            role: 'subject',
            participant_type: 'student',
            student_snapshot: {
              year_group_id: 'yg-frozen',
              year_group_name: 'Year 7',
              has_send: true,
              had_active_intervention: true,
            },
          },
        ],
      };

      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(MOCK_RULE);
      mockPrisma.behaviourIncident!.findMany!.mockResolvedValue([snapshotIncident]);
      mockEvaluationEngine.evaluateConditions.mockReturnValue(true);

      await service.replayRule(TENANT_ID, baseDto);

      const evaluatedInput = mockEvaluationEngine.evaluateConditions.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(evaluatedInput.year_group_id).toBe('yg-frozen');
      expect(evaluatedInput.year_group_name).toBe('Year 7');
      expect(evaluatedInput.has_send).toBe(true);
      expect(evaluatedInput.had_active_intervention).toBe(true);
    });

    it('should return anonymised student labels in sample matches', async () => {
      const incident2 = {
        ...MOCK_INCIDENT,
        id: 'inc-002',
        incident_number: 'BH-000002',
        participants: [
          {
            student_id: 'student-002',
            role: 'subject',
            participant_type: 'student',
            student_snapshot: {
              year_group_id: 'yg-001',
              year_group_name: 'Year 9',
              has_send: false,
              had_active_intervention: false,
            },
          },
        ],
      };

      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(MOCK_RULE);
      mockPrisma.behaviourIncident!.findMany!.mockResolvedValue([MOCK_INCIDENT, incident2]);
      mockEvaluationEngine.evaluateConditions.mockReturnValue(true);

      const result = await service.replayRule(TENANT_ID, baseDto);

      expect(result.sample_matches).toHaveLength(2);
      expect(result.sample_matches[0]!.student_label).toBe('Student A');
      expect(result.sample_matches[1]!.student_label).toBe('Student B');
      // Student IDs are still present (for admin linking) but labels are anonymous
      expect(result.sample_matches[0]!.student_id).toBe('student-001');
      expect(result.sample_matches[1]!.student_id).toBe('student-002');
    });

    it('should reject when from is after to', async () => {
      const invalidDto = {
        rule_id: 'rule-001',
        replay_period: { from: '2026-02-15', to: '2026-01-01' },
        dry_run: true,
      };

      await expect(service.replayRule(TENANT_ID, invalidDto)).rejects.toThrow(BadRequestException);
      await expect(service.replayRule(TENANT_ID, invalidDto)).rejects.toThrow(
        /replay_period.from must be before/,
      );
    });
  });

  describe('dryRun', () => {
    const baseDryRunDto = {
      category_id: 'cat-001',
      polarity: 'negative' as const,
      severity: 5,
      context_type: 'class' as const,
      student_has_send: false,
      student_has_active_intervention: false,
      participant_role: 'subject' as const,
      repeat_count: 0,
    };

    it('should return all 5 stage results', async () => {
      mockPrisma.behaviourCategory!.findFirst!.mockResolvedValue({
        name: 'Verbal Warning',
      });
      mockPrisma.behaviourPolicyRule!.findMany!.mockResolvedValue([]);

      const result = await service.dryRun(TENANT_ID, baseDryRunDto);

      expect(result.stage_results).toHaveLength(5);
      const stageNames = result.stage_results.map((s) => s.stage);
      expect(stageNames).toEqual([
        'consequence',
        'approval',
        'notification',
        'support',
        'alerting',
      ]);
    });

    it('should correctly identify which rules match the hypothetical input', async () => {
      const matchingRule = {
        id: 'rule-match',
        name: 'Matching Rule',
        conditions: { polarity: 'negative', severity_min: 3 },
        stop_processing_stage: false,
        match_strategy: 'all_matching',
        actions: [
          {
            action_type: 'flag_for_review',
            action_config: { reason: 'test' },
          },
        ],
      };

      const nonMatchingRule = {
        id: 'rule-no-match',
        name: 'Non-matching Rule',
        conditions: { polarity: 'positive' },
        stop_processing_stage: false,
        match_strategy: 'all_matching',
        actions: [
          {
            action_type: 'notify_roles',
            action_config: { roles: ['teacher'] },
          },
        ],
      };

      mockPrisma.behaviourCategory!.findFirst!.mockResolvedValue({
        name: 'Verbal Warning',
      });

      // First stage call returns both rules, remaining stages return empty
      mockPrisma
        .behaviourPolicyRule!.findMany!.mockResolvedValueOnce([matchingRule, nonMatchingRule])
        .mockResolvedValue([]);

      mockEvaluationEngine.evaluateConditions
        .mockReturnValueOnce(true) // matching rule
        .mockReturnValueOnce(false); // non-matching rule

      const result = await service.dryRun(TENANT_ID, baseDryRunDto);

      const consequenceStage = result.stage_results[0]!;
      expect(consequenceStage.rules_evaluated).toBe(2);
      expect(consequenceStage.matched_rules).toHaveLength(1);
      expect(consequenceStage.matched_rules[0]!.rule_id).toBe('rule-match');
      expect(consequenceStage.matched_rules[0]!.actions_that_would_fire).toHaveLength(1);
      expect(consequenceStage.matched_rules[0]!.actions_that_would_fire[0]!.action_type).toBe(
        'flag_for_review',
      );
    });

    it('should throw NotFoundException for invalid category_id', async () => {
      mockPrisma.behaviourCategory!.findFirst!.mockResolvedValue(null);

      await expect(service.dryRun(TENANT_ID, baseDryRunDto)).rejects.toThrow(NotFoundException);
      await expect(service.dryRun(TENANT_ID, baseDryRunDto)).rejects.toThrow(/Category not found/);
    });

    it('should resolve year group name when ID provided', async () => {
      const dtoWithYearGroup = {
        ...baseDryRunDto,
        student_year_group_id: 'yg-001',
      };

      mockPrisma.behaviourCategory!.findFirst!.mockResolvedValue({
        name: 'Verbal Warning',
      });
      mockPrisma.yearGroup!.findFirst!.mockResolvedValue({ name: 'Year 9' });
      mockPrisma.behaviourPolicyRule!.findMany!.mockResolvedValue([]);

      const result = await service.dryRun(TENANT_ID, dtoWithYearGroup);

      expect(mockPrisma.yearGroup!.findFirst).toHaveBeenCalledWith({
        where: { id: 'yg-001', tenant_id: TENANT_ID },
        select: { name: true },
      });

      const input = result.hypothetical_input as Record<string, unknown>;
      expect(input.year_group_name).toBe('Year 9');
      expect(input.year_group_id).toBe('yg-001');
    });
  });

  describe('getIncidentEvaluationTrace', () => {
    it('should return evaluations with action executions', async () => {
      const mockEvaluations = [
        {
          id: 'eval-001',
          tenant_id: TENANT_ID,
          incident_id: 'inc-001',
          student_id: 'student-001',
          stage: 'consequence',
          evaluation_result: 'matched',
          created_at: new Date('2026-01-15'),
          action_executions: [
            {
              id: 'exec-001',
              action_type: 'flag_for_review',
              execution_status: 'success',
              executed_at: new Date('2026-01-15'),
            },
          ],
          rule_version: {
            id: 'rv-001',
            rule_id: 'rule-001',
            version: 1,
            stage: 'consequence',
            name: 'Test Rule',
          },
        },
      ];

      mockPrisma.behaviourPolicyEvaluation!.findMany!.mockResolvedValue(mockEvaluations);

      const result = await service.getIncidentEvaluationTrace(TENANT_ID, 'inc-001');

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.action_executions).toHaveLength(1);
      expect(result.data[0]!.action_executions[0]!.action_type).toBe('flag_for_review');
      expect(result.data[0]!.rule_version).toBeDefined();
      expect(result.data[0]!.rule_version?.name).toBe('Test Rule');
    });

    it('should map stage names to API format', async () => {
      const mockEvaluations = [
        {
          id: 'eval-001',
          stage: 'approval_stage',
          action_executions: [],
          rule_version: {
            id: 'rv-001',
            stage: 'notification_stage',
            name: 'Notify Rule',
          },
        },
        {
          id: 'eval-002',
          stage: 'notification_stage',
          action_executions: [],
          rule_version: null,
        },
        {
          id: 'eval-003',
          stage: 'support',
          action_executions: [],
          rule_version: { id: 'rv-002', stage: 'alerting', name: 'Alert Rule' },
        },
      ];

      mockPrisma.behaviourPolicyEvaluation!.findMany!.mockResolvedValue(mockEvaluations);

      const result = await service.getIncidentEvaluationTrace(TENANT_ID, 'inc-001');

      expect(result.data[0]!.stage).toBe('approval');
      expect(result.data[0]!.rule_version?.stage).toBe('notification');
      expect(result.data[1]!.stage).toBe('notification');
      expect(result.data[1]!.rule_version).toBeNull();
      expect(result.data[2]!.stage).toBe('support');
      expect(result.data[2]!.rule_version?.stage).toBe('alerting');
    });
  });
});
