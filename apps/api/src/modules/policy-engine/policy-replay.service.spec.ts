import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  BehaviourReadFacade,
  AcademicReadFacade,
} from '../../common/tests/mock-facades';
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
        ...MOCK_FACADE_PROVIDERS,
        PolicyReplayService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PolicyEvaluationEngine, useValue: mockEvaluationEngine },
        {
          provide: BehaviourReadFacade,
          useValue: {
            findPolicyRuleById: jest
              .fn()
              .mockImplementation(() => mockPrisma.behaviourPolicyRule!.findFirst!()),
            findIncidentsForReplay: jest
              .fn()
              .mockImplementation(() => mockPrisma.behaviourIncident!.findMany!()),
            findCategoryById: jest
              .fn()
              .mockImplementation(() => mockPrisma.behaviourCategory!.findFirst!()),
            findPolicyRulesPaginated: jest.fn().mockImplementation(async () => {
              const data = await mockPrisma.behaviourPolicyRule!.findMany!();
              return { data: data ?? [], total: data?.length ?? 0 };
            }),
            findPolicyEvaluationTrace: jest
              .fn()
              .mockImplementation(() => mockPrisma.behaviourPolicyEvaluation!.findMany!()),
          },
        },
        {
          provide: AcademicReadFacade,
          useValue: {
            findYearGroupById: jest
              .fn()
              .mockImplementation(() => mockPrisma.yearGroup!.findFirst!()),
          },
        },
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

    it('should throw NotFoundException when rule is not found', async () => {
      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(null);

      await expect(service.replayRule(TENANT_ID, baseDto)).rejects.toThrow(NotFoundException);
    });

    it('should skip participants without student_id', async () => {
      const incidentNoStudent = {
        ...MOCK_INCIDENT,
        participants: [
          {
            student_id: null,
            role: 'witness',
            participant_type: 'staff',
            student_snapshot: null,
          },
        ],
      };

      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(MOCK_RULE);
      mockPrisma.behaviourIncident!.findMany!.mockResolvedValue([incidentNoStudent]);

      const result = await service.replayRule(TENANT_ID, baseDto);

      expect(result.incidents_evaluated).toBe(1);
      expect(result.incidents_matched).toBe(0);
      expect(result.students_affected).toBe(0);
      expect(mockEvaluationEngine.evaluateConditions).not.toHaveBeenCalled();
    });

    it('should count create_sanction actions for sanction estimates', async () => {
      const ruleWithSanctions = {
        ...MOCK_RULE,
        actions: [
          {
            action_type: 'create_sanction',
            action_config: { sanction_type: 'detention' },
            execution_order: 0,
          },
          {
            action_type: 'create_sanction',
            action_config: { sanction_type: 'exclusion' },
            execution_order: 1,
          },
        ],
      };

      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(ruleWithSanctions);
      mockPrisma.behaviourIncident!.findMany!.mockResolvedValue([MOCK_INCIDENT]);
      mockEvaluationEngine.evaluateConditions.mockReturnValue(true);

      const result = await service.replayRule(TENANT_ID, baseDto);

      expect(result.estimated_sanctions_created).toEqual({
        detention: 1,
        exclusion: 1,
      });
    });

    it('should count require_approval and block_without_approval for approval estimates', async () => {
      const ruleWithApproval = {
        ...MOCK_RULE,
        actions: [
          { action_type: 'require_approval', action_config: {}, execution_order: 0 },
          { action_type: 'block_without_approval', action_config: {}, execution_order: 1 },
        ],
      };

      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(ruleWithApproval);
      mockPrisma.behaviourIncident!.findMany!.mockResolvedValue([MOCK_INCIDENT]);
      mockEvaluationEngine.evaluateConditions.mockReturnValue(true);

      const result = await service.replayRule(TENANT_ID, baseDto);

      expect(result.estimated_approvals_created).toBe(2);
    });

    it('should cap sample matches at 10', async () => {
      const manyIncidents = Array.from({ length: 15 }, (_, i) => ({
        ...MOCK_INCIDENT,
        id: `inc-${String(i).padStart(3, '0')}`,
        incident_number: `BH-${String(i).padStart(6, '0')}`,
        participants: [
          {
            student_id: `student-${String(i).padStart(3, '0')}`,
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
      }));

      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(MOCK_RULE);
      mockPrisma.behaviourIncident!.findMany!.mockResolvedValue(manyIncidents);
      mockEvaluationEngine.evaluateConditions.mockReturnValue(true);

      const result = await service.replayRule(TENANT_ID, baseDto);

      expect(result.sample_matches).toHaveLength(10);
      expect(result.incidents_matched).toBe(15);
    });

    it('should reuse student label for repeated students', async () => {
      // Two incidents for the same student
      const incidents = [
        MOCK_INCIDENT,
        {
          ...MOCK_INCIDENT,
          id: 'inc-002',
          incident_number: 'BH-000002',
          // Same student
        },
      ];

      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(MOCK_RULE);
      mockPrisma.behaviourIncident!.findMany!.mockResolvedValue(incidents);
      mockEvaluationEngine.evaluateConditions.mockReturnValue(true);

      const result = await service.replayRule(TENANT_ID, baseDto);

      expect(result.sample_matches).toHaveLength(2);
      // Same student should get same label
      expect(result.sample_matches[0]!.student_label).toBe('Student A');
      expect(result.sample_matches[1]!.student_label).toBe('Student A');
    });

    it('should handle incidents with no matching participants', async () => {
      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(MOCK_RULE);
      mockPrisma.behaviourIncident!.findMany!.mockResolvedValue([MOCK_INCIDENT]);
      mockEvaluationEngine.evaluateConditions.mockReturnValue(false);

      const result = await service.replayRule(TENANT_ID, baseDto);

      expect(result.incidents_matched).toBe(0);
      expect(result.students_affected).toBe(0);
      expect(result.sample_matches).toHaveLength(0);
      expect(result.actions_that_would_fire).toEqual({});
    });

    it('should handle create_sanction with missing sanction_type', async () => {
      const ruleWithBadConfig = {
        ...MOCK_RULE,
        actions: [
          {
            action_type: 'create_sanction',
            action_config: {}, // no sanction_type
            execution_order: 0,
          },
        ],
      };

      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(ruleWithBadConfig);
      mockPrisma.behaviourIncident!.findMany!.mockResolvedValue([MOCK_INCIDENT]);
      mockEvaluationEngine.evaluateConditions.mockReturnValue(true);

      const result = await service.replayRule(TENANT_ID, baseDto);

      expect(result.estimated_sanctions_created).toEqual({ other: 1 });
    });

    it('should handle null student_snapshot in participants', async () => {
      const incidentNullSnapshot = {
        ...MOCK_INCIDENT,
        participants: [
          {
            student_id: 'student-001',
            role: 'subject',
            participant_type: 'student',
            student_snapshot: null,
          },
        ],
      };

      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(MOCK_RULE);
      mockPrisma.behaviourIncident!.findMany!.mockResolvedValue([incidentNullSnapshot]);
      mockEvaluationEngine.evaluateConditions.mockReturnValue(true);

      const result = await service.replayRule(TENANT_ID, baseDto);

      expect(result.incidents_matched).toBe(1);
      // year_group_name is null in snapshot
      expect(result.affected_year_groups).toEqual([]);
    });
  });

  describe('dryRun — additional branches', () => {
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

    it('should skip rules with invalid conditions in safeParse', async () => {
      const ruleWithInvalidConditions = {
        id: 'rule-bad',
        name: 'Bad Rule',
        conditions: 'not-an-object', // will fail safeParse
        stop_processing_stage: false,
        match_strategy: 'all_matching',
        actions: [],
      };

      mockPrisma.behaviourCategory!.findFirst!.mockResolvedValue({ name: 'Test' });
      mockPrisma
        .behaviourPolicyRule!.findMany!.mockResolvedValueOnce([ruleWithInvalidConditions])
        .mockResolvedValue([]);

      const result = await service.dryRun(TENANT_ID, baseDryRunDto);

      expect(result.stage_results[0]!.rules_evaluated).toBe(1);
      expect(result.stage_results[0]!.matched_rules).toHaveLength(0);
    });

    it('should stop processing stage when stop_processing_stage is true', async () => {
      const ruleA = {
        id: 'rule-a',
        name: 'Rule A',
        conditions: {},
        stop_processing_stage: true,
        match_strategy: 'all_matching',
        actions: [{ action_type: 'flag_for_review', action_config: {} }],
      };
      const ruleB = {
        id: 'rule-b',
        name: 'Rule B',
        conditions: {},
        stop_processing_stage: false,
        match_strategy: 'all_matching',
        actions: [{ action_type: 'notify_roles', action_config: {} }],
      };

      mockPrisma.behaviourCategory!.findFirst!.mockResolvedValue({ name: 'Test' });
      mockPrisma
        .behaviourPolicyRule!.findMany!.mockResolvedValueOnce([ruleA, ruleB])
        .mockResolvedValue([]);
      mockEvaluationEngine.evaluateConditions.mockReturnValue(true);

      const result = await service.dryRun(TENANT_ID, baseDryRunDto);

      // Only rule A should be in matched_rules (stop_processing_stage = true)
      expect(result.stage_results[0]!.matched_rules).toHaveLength(1);
      expect(result.stage_results[0]!.matched_rules[0]!.rule_id).toBe('rule-a');
    });

    it('should stop processing stage when match_strategy is first_match', async () => {
      const ruleA = {
        id: 'rule-a',
        name: 'Rule A',
        conditions: {},
        stop_processing_stage: false,
        match_strategy: 'first_match',
        actions: [],
      };
      const ruleB = {
        id: 'rule-b',
        name: 'Rule B',
        conditions: {},
        stop_processing_stage: false,
        match_strategy: 'first_match',
        actions: [],
      };

      mockPrisma.behaviourCategory!.findFirst!.mockResolvedValue({ name: 'Test' });
      mockPrisma
        .behaviourPolicyRule!.findMany!.mockResolvedValueOnce([ruleA, ruleB])
        .mockResolvedValue([]);
      mockEvaluationEngine.evaluateConditions.mockReturnValue(true);

      const result = await service.dryRun(TENANT_ID, baseDryRunDto);

      // Only first match
      expect(result.stage_results[0]!.matched_rules).toHaveLength(1);
      expect(result.stage_results[0]!.matched_rules[0]!.rule_id).toBe('rule-a');
    });

    it('should not resolve year group name when ID is not provided', async () => {
      mockPrisma.behaviourCategory!.findFirst!.mockResolvedValue({ name: 'Test' });
      mockPrisma.behaviourPolicyRule!.findMany!.mockResolvedValue([]);

      const result = await service.dryRun(TENANT_ID, baseDryRunDto);

      expect(mockPrisma.yearGroup!.findFirst).not.toHaveBeenCalled();
      const input = result.hypothetical_input as Record<string, unknown>;
      expect(input.year_group_name).toBeNull();
    });

    it('should handle year group not found (null result)', async () => {
      const dtoWithYearGroup = {
        ...baseDryRunDto,
        student_year_group_id: 'yg-nonexistent',
      };

      mockPrisma.behaviourCategory!.findFirst!.mockResolvedValue({ name: 'Test' });
      mockPrisma.yearGroup!.findFirst!.mockResolvedValue(null);
      mockPrisma.behaviourPolicyRule!.findMany!.mockResolvedValue([]);

      const result = await service.dryRun(TENANT_ID, dtoWithYearGroup);

      const input = result.hypothetical_input as Record<string, unknown>;
      expect(input.year_group_name).toBeNull();
    });

    it('should include weekday and period_order in hypothetical input when provided', async () => {
      const dtoWithTimeFilters = {
        ...baseDryRunDto,
        weekday: 3,
        period_order: 2,
      };

      mockPrisma.behaviourCategory!.findFirst!.mockResolvedValue({ name: 'Test' });
      mockPrisma.behaviourPolicyRule!.findMany!.mockResolvedValue([]);

      const result = await service.dryRun(TENANT_ID, dtoWithTimeFilters);

      const input = result.hypothetical_input as Record<string, unknown>;
      expect(input.weekday).toBe(3);
      expect(input.period_order).toBe(2);
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

      const input = result.hypothetical_input as Record<string, unknown>;
      expect(input.year_group_name).toBe('Year 9');
      expect(input.year_group_id).toBe('yg-001');
    });
  });

  // ─── buildEvaluatedInputFromSnapshot branches ────────────────────────────

  describe('replayRule — buildEvaluatedInputFromSnapshot branches', () => {
    const baseDto = {
      rule_id: 'rule-001',
      replay_period: { from: '2026-01-01', to: '2026-01-31' },
      dry_run: true,
    };

    it('should use empty string for category_name when category is null', async () => {
      const incidentNoCategory = {
        ...MOCK_INCIDENT,
        category: null,
      };

      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(MOCK_RULE);
      mockPrisma.behaviourIncident!.findMany!.mockResolvedValue([incidentNoCategory]);
      mockEvaluationEngine.evaluateConditions.mockReturnValue(true);

      const result = await service.replayRule(TENANT_ID, baseDto);

      // Should still match
      expect(result.incidents_matched).toBe(1);
      // Verify the input passed to evaluateConditions has empty category_name
      const input = mockEvaluationEngine.evaluateConditions.mock.calls[0]![1] as Record<
        string,
        unknown
      >;
      expect(input.category_name).toBe('');
    });

    it('should default student_snapshot fields to null/false when snapshot is null', async () => {
      const incidentNullSnapshot = {
        ...MOCK_INCIDENT,
        participants: [
          {
            student_id: 'student-001',
            role: 'subject',
            participant_type: 'student',
            student_snapshot: null,
          },
        ],
      };

      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(MOCK_RULE);
      mockPrisma.behaviourIncident!.findMany!.mockResolvedValue([incidentNullSnapshot]);
      mockEvaluationEngine.evaluateConditions.mockReturnValue(false);

      await service.replayRule(TENANT_ID, baseDto);

      const input = mockEvaluationEngine.evaluateConditions.mock.calls[0]![1] as Record<
        string,
        unknown
      >;
      expect(input.year_group_id).toBeNull();
      expect(input.year_group_name).toBeNull();
      expect(input.has_send).toBe(false);
      expect(input.had_active_intervention).toBe(false);
    });

    it('should set repeat_count to 0 in replay (never recomputed from DB)', async () => {
      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(MOCK_RULE);
      mockPrisma.behaviourIncident!.findMany!.mockResolvedValue([MOCK_INCIDENT]);
      mockEvaluationEngine.evaluateConditions.mockReturnValue(true);

      await service.replayRule(TENANT_ID, baseDto);

      const input = mockEvaluationEngine.evaluateConditions.mock.calls[0]![1] as Record<
        string,
        unknown
      >;
      expect(input.repeat_count).toBe(0);
    });

    it('should pass repeat_window_days and repeat_category_ids from rule conditions', async () => {
      const ruleWithRepeat = {
        ...MOCK_RULE,
        conditions: {
          polarity: 'negative',
          repeat_window_days: 30,
          repeat_category_ids: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'],
        },
      };

      mockPrisma.behaviourPolicyRule!.findFirst!.mockResolvedValue(ruleWithRepeat);
      mockPrisma.behaviourIncident!.findMany!.mockResolvedValue([MOCK_INCIDENT]);
      mockEvaluationEngine.evaluateConditions.mockReturnValue(false);

      await service.replayRule(TENANT_ID, baseDto);

      const input = mockEvaluationEngine.evaluateConditions.mock.calls[0]![1] as Record<
        string,
        unknown
      >;
      expect(input.repeat_window_days_used).toBe(30);
      expect(input.repeat_category_ids_used).toEqual(['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']);
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
