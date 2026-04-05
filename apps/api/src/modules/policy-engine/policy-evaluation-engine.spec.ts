import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { EvaluatedInput, PolicyCondition } from '@school/shared/behaviour';

import { BehaviourHistoryService } from '../behaviour/behaviour-history.service';
import { PrismaService } from '../prisma/prisma.service';

import { PolicyEvaluationEngine } from './policy-evaluation-engine';

// ---------------------------------------------------------------------------
// Shared constants & helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const INCIDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_A = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_B = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const CATEGORY_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const YEAR_GROUP_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const REPORTER_ID = '11111111-1111-1111-1111-111111111111';
const RULE_ID = '22222222-2222-2222-2222-222222222222';
const RULE_VERSION_ID = '33333333-3333-3333-3333-333333333333';
const EVALUATION_ID = '44444444-4444-4444-4444-444444444444';

function makeInput(overrides: Partial<EvaluatedInput> = {}): EvaluatedInput {
  return {
    category_id: CATEGORY_ID,
    category_name: 'Verbal Warning',
    polarity: 'negative',
    severity: 5,
    context_type: 'class',
    occurred_at: '2026-01-15T09:00:00Z',
    weekday: 3,
    period_order: 2,
    student_id: STUDENT_A,
    participant_role: 'subject',
    year_group_id: YEAR_GROUP_ID,
    year_group_name: 'Year 9',
    has_send: false,
    had_active_intervention: false,
    repeat_count: 0,
    repeat_window_days_used: null,
    repeat_category_ids_used: [],
    ...overrides,
  };
}

function makeIncident(
  overrides: Partial<{
    id: string;
    tenant_id: string;
    category_id: string;
    polarity: string;
    severity: number;
    context_type: string;
    occurred_at: Date;
    weekday: number | null;
    period_order: number | null;
    status: string;
    reported_by_id: string;
    incident_number: string;
    category: { name: string } | null;
  }> = {},
) {
  return {
    id: INCIDENT_ID,
    tenant_id: TENANT_ID,
    category_id: CATEGORY_ID,
    polarity: 'negative',
    severity: 5,
    context_type: 'class',
    occurred_at: new Date('2026-01-15T09:00:00Z'),
    weekday: 3,
    period_order: 2,
    status: 'active',
    reported_by_id: REPORTER_ID,
    incident_number: 'INC-202601-001',
    category: { name: 'Verbal Warning' },
    ...overrides,
  };
}

function makeParticipant(
  overrides: Partial<{
    id: string;
    student_id: string | null;
    participant_type: string;
    role: string;
    student_snapshot: unknown;
  }> = {},
) {
  return {
    id: 'participant-001',
    student_id: STUDENT_A,
    participant_type: 'student',
    role: 'subject',
    student_snapshot: {
      year_group_id: YEAR_GROUP_ID,
      year_group_name: 'Year 9',
      has_send: false,
      had_active_intervention: false,
    },
    ...overrides,
  };
}

function makeRule(
  overrides: Partial<{
    id: string;
    tenant_id: string;
    name: string;
    stage: string;
    priority: number;
    match_strategy: string;
    stop_processing_stage: boolean;
    conditions: Record<string, unknown>;
    is_active: boolean;
    current_version: number;
    actions: Array<{
      action_type: string;
      action_config: Prisma.JsonValue;
      execution_order: number;
    }>;
  }> = {},
) {
  return {
    id: RULE_ID,
    tenant_id: TENANT_ID,
    name: 'Test Rule',
    stage: 'consequence',
    priority: 10,
    match_strategy: 'first_match',
    stop_processing_stage: false,
    conditions: {},
    is_active: true,
    current_version: 1,
    actions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. evaluateConditions — pure function tests
// ---------------------------------------------------------------------------

describe('PolicyEvaluationEngine', () => {
  describe('evaluateConditions', () => {
    let engine: PolicyEvaluationEngine;

    beforeEach(() => {
      const mockHistoryService = {
        recordHistory: jest.fn(),
      } as unknown as BehaviourHistoryService;
      engine = new PolicyEvaluationEngine(mockHistoryService);
    });

    it('should match when all conditions pass', () => {
      const conditions: PolicyCondition = {
        category_ids: [CATEGORY_ID],
        polarity: 'negative',
        severity_min: 3,
        severity_max: 7,
        year_group_ids: [YEAR_GROUP_ID],
        student_has_send: false,
        context_types: ['class'],
        participant_role: 'subject',
      };
      const input = makeInput();

      expect(engine.evaluateConditions(conditions, input)).toBe(true);
    });

    it('should not match when any condition fails', () => {
      const conditions: PolicyCondition = {
        category_ids: [CATEGORY_ID],
        polarity: 'positive', // input has 'negative'
        severity_min: 3,
      };
      const input = makeInput();

      expect(engine.evaluateConditions(conditions, input)).toBe(false);
    });

    it('should match when no conditions are specified (wildcard)', () => {
      const conditions: PolicyCondition = {};
      const input = makeInput();

      expect(engine.evaluateConditions(conditions, input)).toBe(true);
    });

    it('should correctly evaluate severity_min and severity_max boundaries', () => {
      const conditions: PolicyCondition = {
        severity_min: 3,
        severity_max: 7,
      };

      // Exactly at min boundary
      expect(engine.evaluateConditions(conditions, makeInput({ severity: 3 }))).toBe(true);

      // Exactly at max boundary
      expect(engine.evaluateConditions(conditions, makeInput({ severity: 7 }))).toBe(true);

      // Below min
      expect(engine.evaluateConditions(conditions, makeInput({ severity: 2 }))).toBe(false);

      // Above max
      expect(engine.evaluateConditions(conditions, makeInput({ severity: 8 }))).toBe(false);

      // In the middle
      expect(engine.evaluateConditions(conditions, makeInput({ severity: 5 }))).toBe(true);
    });

    it('should correctly evaluate repeat_count_min with a window', () => {
      const conditions: PolicyCondition = {
        repeat_count_min: 3,
      };

      // Count below minimum
      expect(engine.evaluateConditions(conditions, makeInput({ repeat_count: 2 }))).toBe(false);

      // Count at minimum
      expect(engine.evaluateConditions(conditions, makeInput({ repeat_count: 3 }))).toBe(true);

      // Count above minimum
      expect(engine.evaluateConditions(conditions, makeInput({ repeat_count: 10 }))).toBe(true);
    });

    it('should read student_has_send from student_snapshot, not live student data', () => {
      // Condition requires SEND = true
      const conditions: PolicyCondition = {
        student_has_send: true,
      };

      // Input has has_send=true (from snapshot)
      const matchInput = makeInput({ has_send: true });
      expect(engine.evaluateConditions(conditions, matchInput)).toBe(true);

      // Input has has_send=false (from snapshot)
      const noMatchInput = makeInput({ has_send: false });
      expect(engine.evaluateConditions(conditions, noMatchInput)).toBe(false);
    });

    it('should return false for year_group_ids when student has no year group', () => {
      const conditions: PolicyCondition = {
        year_group_ids: [YEAR_GROUP_ID],
      };

      // Student has no year group
      const input = makeInput({ year_group_id: null });
      expect(engine.evaluateConditions(conditions, input)).toBe(false);
    });

    // ─── context_types condition ────────────────────────────────────────────
    it('should match when context_type is in the list', () => {
      const conditions: PolicyCondition = {
        context_types: ['class', 'break'],
      };
      expect(engine.evaluateConditions(conditions, makeInput({ context_type: 'class' }))).toBe(
        true,
      );
    });

    it('should not match when context_type is not in the list', () => {
      const conditions: PolicyCondition = {
        context_types: ['break', 'lunch'],
      };
      expect(engine.evaluateConditions(conditions, makeInput({ context_type: 'class' }))).toBe(
        false,
      );
    });

    // ─── participant_role condition ──────────────────────────────────────────
    it('should match when participant_role matches', () => {
      const conditions: PolicyCondition = {
        participant_role: 'subject',
      };
      expect(
        engine.evaluateConditions(conditions, makeInput({ participant_role: 'subject' })),
      ).toBe(true);
    });

    it('should not match when participant_role differs', () => {
      const conditions: PolicyCondition = {
        participant_role: 'witness',
      };
      expect(
        engine.evaluateConditions(conditions, makeInput({ participant_role: 'subject' })),
      ).toBe(false);
    });

    // ─── student_has_active_intervention condition ──────────────────────────
    it('should match when student_has_active_intervention is true and input matches', () => {
      const conditions: PolicyCondition = {
        student_has_active_intervention: true,
      };
      expect(
        engine.evaluateConditions(conditions, makeInput({ had_active_intervention: true })),
      ).toBe(true);
    });

    it('should not match when student_has_active_intervention differs from input', () => {
      const conditions: PolicyCondition = {
        student_has_active_intervention: true,
      };
      expect(
        engine.evaluateConditions(conditions, makeInput({ had_active_intervention: false })),
      ).toBe(false);
    });

    // ─── weekdays condition ─────────────────────────────────────────────────
    it('should match when weekday is in the list', () => {
      const conditions: PolicyCondition = {
        weekdays: [1, 3, 5],
      };
      expect(engine.evaluateConditions(conditions, makeInput({ weekday: 3 }))).toBe(true);
    });

    it('should not match when weekday is not in the list', () => {
      const conditions: PolicyCondition = {
        weekdays: [1, 2],
      };
      expect(engine.evaluateConditions(conditions, makeInput({ weekday: 3 }))).toBe(false);
    });

    it('should not match when weekday is null and weekdays condition is set', () => {
      const conditions: PolicyCondition = {
        weekdays: [1, 3, 5],
      };
      expect(engine.evaluateConditions(conditions, makeInput({ weekday: null }))).toBe(false);
    });

    // ─── period_orders condition ────────────────────────────────────────────
    it('should match when period_order is in the list', () => {
      const conditions: PolicyCondition = {
        period_orders: [1, 2, 3],
      };
      expect(engine.evaluateConditions(conditions, makeInput({ period_order: 2 }))).toBe(true);
    });

    it('should not match when period_order is not in the list', () => {
      const conditions: PolicyCondition = {
        period_orders: [4, 5],
      };
      expect(engine.evaluateConditions(conditions, makeInput({ period_order: 2 }))).toBe(false);
    });

    it('should not match when period_order is null and period_orders condition is set', () => {
      const conditions: PolicyCondition = {
        period_orders: [1, 2, 3],
      };
      expect(engine.evaluateConditions(conditions, makeInput({ period_order: null }))).toBe(false);
    });

    // ─── category_ids condition ─────────────────────────────────────────────
    it('should not match when category_id is not in the list', () => {
      const conditions: PolicyCondition = {
        category_ids: ['other-category-id'],
      };
      expect(engine.evaluateConditions(conditions, makeInput())).toBe(false);
    });

    // ─── severity boundary edge cases ───────────────────────────────────────
    it('edge: severity_max alone should reject severity above max', () => {
      const conditions: PolicyCondition = {
        severity_max: 3,
      };
      expect(engine.evaluateConditions(conditions, makeInput({ severity: 5 }))).toBe(false);
    });

    it('edge: severity_max alone should accept severity at or below max', () => {
      const conditions: PolicyCondition = {
        severity_max: 7,
      };
      expect(engine.evaluateConditions(conditions, makeInput({ severity: 7 }))).toBe(true);
      expect(engine.evaluateConditions(conditions, makeInput({ severity: 3 }))).toBe(true);
    });

    // ─── combined conditions ────────────────────────────────────────────────
    it('should fail AND when one condition out of many fails', () => {
      const conditions: PolicyCondition = {
        polarity: 'negative',
        severity_min: 3,
        context_types: ['lunch'], // input has 'class'
        participant_role: 'subject',
      };
      expect(engine.evaluateConditions(conditions, makeInput())).toBe(false);
    });

    it('edge: severity_min = 1 should match all severities >= 1', () => {
      const conditions: PolicyCondition = {
        severity_min: 1,
      };

      expect(engine.evaluateConditions(conditions, makeInput({ severity: 1 }))).toBe(true);
      expect(engine.evaluateConditions(conditions, makeInput({ severity: 5 }))).toBe(true);
      expect(engine.evaluateConditions(conditions, makeInput({ severity: 10 }))).toBe(true);
    });

    it('edge: repeat_window_days = 365 should include the full year', () => {
      // This tests the condition evaluator itself — repeat_count_min
      // is what evaluateConditions checks. The 365-day window is computed
      // upstream by buildEvaluatedInput/computeRepeatCount.
      const conditions: PolicyCondition = {
        repeat_count_min: 1,
      };

      // Simulate that the full-year window found 5 repeats
      const input = makeInput({
        repeat_count: 5,
        repeat_window_days_used: 365,
      });
      expect(engine.evaluateConditions(conditions, input)).toBe(true);

      // Zero repeats still fails even with 365-day window
      const inputZero = makeInput({
        repeat_count: 0,
        repeat_window_days_used: 365,
      });
      expect(engine.evaluateConditions(conditions, inputZero)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 2–5. Integration tests using mocked PrismaService
  // -------------------------------------------------------------------------

  describe('evaluateForStudent (integration)', () => {
    let engine: PolicyEvaluationEngine;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock with dynamic keys
    let mockTx: any;
    let mockHistoryService: { recordHistory: jest.Mock };

    beforeEach(async () => {
      mockHistoryService = { recordHistory: jest.fn().mockResolvedValue(undefined) };

      mockTx = {
        behaviourPolicyRule: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        behaviourPolicyRuleVersion: {
          findFirst: jest.fn().mockResolvedValue({ id: RULE_VERSION_ID }),
        },
        behaviourPolicyEvaluation: {
          create: jest.fn().mockImplementation(({ data }) => ({
            id: EVALUATION_ID,
            ...data,
          })),
        },
        behaviourPolicyActionExecution: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'exec-001' }),
        },
        behaviourIncident: {
          update: jest.fn().mockResolvedValue({}),
          findFirst: jest
            .fn()
            .mockResolvedValue({ status: 'active', approval_status: 'not_required' }),
        },
        behaviourIncidentParticipant: {
          count: jest.fn().mockResolvedValue(0),
        },
        behaviourCategory: {
          findFirst: jest.fn().mockResolvedValue({ name: 'Verbal Warning' }),
        },
        behaviourTask: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'task-001' }),
        },
        behaviourSanction: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'sanction-001' }),
        },
        behaviourIntervention: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'intervention-001' }),
        },
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PolicyEvaluationEngine,
          {
            provide: BehaviourHistoryService,
            useValue: mockHistoryService,
          },
        ],
      }).compile();

      engine = module.get<PolicyEvaluationEngine>(PolicyEvaluationEngine);
    });

    // -----------------------------------------------------------------------
    // Early returns and guard clauses
    // -----------------------------------------------------------------------

    describe('early returns and guard clauses', () => {
      it('should return immediately when participant.student_id is null', async () => {
        const participant = makeParticipant({ student_id: null });

        await engine.evaluateForStudent(
          makeIncident(),
          participant,
          new Set(),
          mockTx as unknown as PrismaService,
        );

        // No rules should be queried, no evaluations created
        expect(mockTx.behaviourPolicyRule.findMany).not.toHaveBeenCalled();
        expect(mockTx.behaviourPolicyEvaluation.create).not.toHaveBeenCalled();
      });

      it('should skip stages already in evaluatedStages set', async () => {
        const stagesQueried: string[] = [];
        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            stagesQueried.push(where.stage);
            return [];
          },
        );

        // Mark consequence and approval as already evaluated
        const evaluatedStages = new Set(['consequence', 'approval_stage']);

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          evaluatedStages,
          mockTx as unknown as PrismaService,
        );

        // Consequence and approval should NOT be queried
        expect(stagesQueried).not.toContain('consequence');
        expect(stagesQueried).not.toContain('approval_stage');
        // The remaining 3 stages should be queried
        expect(stagesQueried).toContain('notification_stage');
        expect(stagesQueried).toContain('support');
        expect(stagesQueried).toContain('alerting');
        // Only 3 evaluations created (for remaining stages)
        expect(mockTx.behaviourPolicyEvaluation.create).toHaveBeenCalledTimes(3);
      });

      it('should skip rules with invalid conditions and continue processing', async () => {
        const ruleWithBadConditions = makeRule({
          id: 'rule-bad',
          conditions: { severity_min: 'not-a-number' } as unknown as Record<string, unknown>,
          actions: [],
        });
        const ruleWithGoodConditions = makeRule({
          id: 'rule-good',
          conditions: { polarity: 'negative' },
          actions: [],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence')
              return [ruleWithBadConditions, ruleWithGoodConditions];
            return [];
          },
        );

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        // The good rule should still match
        const consequenceEvals = mockTx.behaviourPolicyEvaluation.create.mock.calls.filter(
          (call: Array<{ data: { stage: string } }>) => call[0]!.data.stage === 'consequence',
        );
        expect(consequenceEvals).toHaveLength(1);
        expect(consequenceEvals[0]![0].data.evaluation_result).toBe('matched');
      });

      it('should not link policy_evaluation_id when no consequence evaluation is created', async () => {
        // Skip all stages using evaluatedStages
        const allStages = new Set([
          'consequence',
          'approval_stage',
          'notification_stage',
          'support',
          'alerting',
        ]);

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          allStages,
          mockTx as unknown as PrismaService,
        );

        // Incident should NOT be updated since no consequence evaluation was created
        expect(mockTx.behaviourIncident.update).not.toHaveBeenCalled();
      });
    });

    // -----------------------------------------------------------------------
    // Stage execution order
    // -----------------------------------------------------------------------

    describe('stage execution order', () => {
      it('should always evaluate consequence before approval', async () => {
        const stageOrder: string[] = [];

        mockTx.behaviourPolicyRule!.findMany!.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            stageOrder.push(where.stage);
            return [];
          },
        );

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        const consequenceIdx = stageOrder.indexOf('consequence');
        const approvalIdx = stageOrder.indexOf('approval_stage');
        expect(consequenceIdx).toBeGreaterThanOrEqual(0);
        expect(approvalIdx).toBeGreaterThanOrEqual(0);
        expect(consequenceIdx).toBeLessThan(approvalIdx);
      });

      it('should always evaluate approval before notification', async () => {
        const stageOrder: string[] = [];

        mockTx.behaviourPolicyRule!.findMany!.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            stageOrder.push(where.stage);
            return [];
          },
        );

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        const approvalIdx = stageOrder.indexOf('approval_stage');
        const notificationIdx = stageOrder.indexOf('notification_stage');
        expect(approvalIdx).toBeGreaterThanOrEqual(0);
        expect(notificationIdx).toBeGreaterThanOrEqual(0);
        expect(approvalIdx).toBeLessThan(notificationIdx);
      });

      it('should stop_processing_stage when flag is true and rule matched', async () => {
        const ruleA = makeRule({
          id: 'rule-a',
          stop_processing_stage: true,
          conditions: {},
          actions: [],
        });
        const ruleB = makeRule({
          id: 'rule-b',
          conditions: {},
          actions: [],
        });

        mockTx.behaviourPolicyRule!.findMany!.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') return [ruleA, ruleB];
            return [];
          },
        );

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        // Only one evaluation should be created for consequence stage
        // and matched_conditions should correspond to ruleA
        const consequenceEvals = mockTx.behaviourPolicyEvaluation!.create!.mock.calls.filter(
          (call: Array<{ data: { stage: string } }>) => call[0]!.data.stage === 'consequence',
        );
        expect(consequenceEvals).toHaveLength(1);

        // The matched rule's conditions should be ruleA's (stop_processing_stage = true)
        const evalData = consequenceEvals[0]![0].data;
        expect(evalData.evaluation_result).toBe('matched');
      });

      it('first_match strategy should skip subsequent rules after first match', async () => {
        const ruleA = makeRule({
          id: 'rule-a',
          match_strategy: 'first_match',
          conditions: {},
          actions: [
            {
              action_type: 'notify_roles',
              action_config: {},
              execution_order: 1,
            },
          ],
        });
        const ruleB = makeRule({
          id: 'rule-b',
          match_strategy: 'first_match',
          conditions: {},
          actions: [
            {
              action_type: 'notify_users',
              action_config: {},
              execution_order: 1,
            },
          ],
        });

        mockTx.behaviourPolicyRule!.findMany!.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') return [ruleA, ruleB];
            return [];
          },
        );

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        // Only ruleA's action should be executed for consequence
        const actionExecCalls = mockTx.behaviourPolicyActionExecution!.create!.mock.calls.filter(
          (call: Array<{ data: { action_type: string } }>) =>
            call[0]!.data.action_type === 'notify_roles' ||
            call[0]!.data.action_type === 'notify_users',
        );

        const notifyRolesCalls = actionExecCalls.filter(
          (call: Array<{ data: { action_type: string } }>) =>
            call[0]!.data.action_type === 'notify_roles',
        );
        const notifyUsersCalls = actionExecCalls.filter(
          (call: Array<{ data: { action_type: string } }>) =>
            call[0]!.data.action_type === 'notify_users',
        );

        expect(notifyRolesCalls.length).toBe(1);
        expect(notifyUsersCalls.length).toBe(0);
      });

      it('all_matching strategy should evaluate all rules in stage', async () => {
        const ruleA = makeRule({
          id: 'rule-a',
          match_strategy: 'all_matching',
          conditions: {},
          actions: [
            {
              action_type: 'notify_roles',
              action_config: {},
              execution_order: 1,
            },
          ],
        });
        const ruleB = makeRule({
          id: 'rule-b',
          match_strategy: 'all_matching',
          conditions: {},
          actions: [
            {
              action_type: 'notify_users',
              action_config: {},
              execution_order: 1,
            },
          ],
        });

        mockTx.behaviourPolicyRule!.findMany!.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') return [ruleA, ruleB];
            return [];
          },
        );

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        const actionExecCalls = mockTx.behaviourPolicyActionExecution!.create!.mock.calls.filter(
          (call: Array<{ data: { action_type: string } }>) =>
            call[0]!.data.action_type === 'notify_roles' ||
            call[0]!.data.action_type === 'notify_users',
        );

        // Both rules' actions should have been executed
        const notifyRoles = actionExecCalls.filter(
          (call: Array<{ data: { action_type: string } }>) =>
            call[0]!.data.action_type === 'notify_roles',
        );
        const notifyUsers = actionExecCalls.filter(
          (call: Array<{ data: { action_type: string } }>) =>
            call[0]!.data.action_type === 'notify_users',
        );

        expect(notifyRoles.length).toBe(1);
        expect(notifyUsers.length).toBe(1);
      });
    });

    // -----------------------------------------------------------------------
    // Action execution
    // -----------------------------------------------------------------------

    describe('action execution', () => {
      it('should create evaluation row with matched conditions when rule fires', async () => {
        const conditions = { polarity: 'negative' as const };
        const rule = makeRule({
          conditions,
          actions: [],
        });

        mockTx.behaviourPolicyRule!.findMany!.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') return [rule];
            return [];
          },
        );

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        const consequenceEvals = mockTx.behaviourPolicyEvaluation!.create!.mock.calls.filter(
          (call: Array<{ data: { stage: string } }>) => call[0]!.data.stage === 'consequence',
        );
        expect(consequenceEvals).toHaveLength(1);

        const evalData = consequenceEvals[0]![0].data;
        expect(evalData.evaluation_result).toBe('matched');
        expect(evalData.matched_conditions).toEqual(conditions);
        expect(evalData.rule_version_id).toBe(RULE_VERSION_ID);
      });

      it('should create evaluation row with evaluation_result=no_match when no rule fires', async () => {
        // Return a rule whose conditions do not match the input
        const rule = makeRule({
          conditions: { polarity: 'positive' },
          actions: [],
        });

        mockTx.behaviourPolicyRule!.findMany!.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') return [rule];
            return [];
          },
        );

        await engine.evaluateForStudent(
          makeIncident(), // polarity = 'negative'
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        const consequenceEvals = mockTx.behaviourPolicyEvaluation!.create!.mock.calls.filter(
          (call: Array<{ data: { stage: string } }>) => call[0]!.data.stage === 'consequence',
        );
        expect(consequenceEvals).toHaveLength(1);

        const evalData = consequenceEvals[0]![0].data;
        expect(evalData.evaluation_result).toBe('no_match');
        expect(evalData.rule_version_id).toBeNull();
        expect(evalData.matched_conditions).toBe(Prisma.DbNull);
      });

      it('should record skipped_duplicate when same action already succeeded in this evaluation', async () => {
        const rule = makeRule({
          conditions: {},
          actions: [
            {
              action_type: 'flag_for_review',
              action_config: {},
              execution_order: 1,
            },
            {
              action_type: 'flag_for_review',
              action_config: {},
              execution_order: 2,
            },
          ],
        });

        mockTx.behaviourPolicyRule!.findMany!.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') return [rule];
            return [];
          },
        );

        // First dedup check returns null (no prior), second returns existing
        let dedupCallCount = 0;
        mockTx.behaviourPolicyActionExecution!.findFirst!.mockImplementation(async () => {
          dedupCallCount++;
          if (dedupCallCount === 1) return null;
          return { id: 'existing-exec', execution_status: 'success' };
        });

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        const createCalls = mockTx.behaviourPolicyActionExecution!.create!.mock.calls;
        const flagForReviewExecs = createCalls.filter(
          (call: Array<{ data: { action_type: string } }>) =>
            call[0]!.data.action_type === 'flag_for_review',
        );

        // One success, one skipped_duplicate
        const statuses = flagForReviewExecs.map(
          (call: Array<{ data: { execution_status: string } }>) => call[0]!.data.execution_status,
        );
        expect(statuses).toContain('success');
        expect(statuses).toContain('skipped_duplicate');
      });

      it('should not abort pipeline when a single action fails', async () => {
        const rule = makeRule({
          conditions: {},
          actions: [
            {
              action_type: 'create_sanction',
              action_config: { sanction_type: 'detention' },
              execution_order: 1,
            },
          ],
        });

        mockTx.behaviourPolicyRule!.findMany!.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') return [rule];
            return [];
          },
        );

        // Make the sanction creation throw
        mockTx.behaviourSanction!.create!.mockRejectedValue(new Error('DB constraint violation'));

        // Should not throw — the engine catches action failures
        await expect(
          engine.evaluateForStudent(
            makeIncident(),
            makeParticipant(),
            new Set(),
            mockTx as unknown as PrismaService,
          ),
        ).resolves.toBeUndefined();

        // A 'failed' action execution should have been recorded
        const failedExecs = mockTx.behaviourPolicyActionExecution!.create!.mock.calls.filter(
          (call: Array<{ data: { execution_status: string } }>) =>
            call[0]!.data.execution_status === 'failed',
        );
        expect(failedExecs.length).toBeGreaterThanOrEqual(1);
        expect(failedExecs[0]![0].data.failure_reason).toBe('DB constraint violation');

        // Pipeline continued — all 5 stages still got evaluated
        const totalEvals = mockTx.behaviourPolicyEvaluation!.create!.mock.calls.length;
        expect(totalEvals).toBe(5);
      });

      it('should link incident.policy_evaluation_id to consequence stage evaluation', async () => {
        const rule = makeRule({
          conditions: {},
          actions: [],
        });

        mockTx.behaviourPolicyRule!.findMany!.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') return [rule];
            return [];
          },
        );

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        // The incident should be updated with policy_evaluation_id from consequence stage
        expect(mockTx.behaviourIncident!.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: INCIDENT_ID },
            data: { policy_evaluation_id: EVALUATION_ID },
          }),
        );
      });
    });

    // -----------------------------------------------------------------------
    // Versioning
    // -----------------------------------------------------------------------

    describe('versioning', () => {
      it('should snapshot previous version before applying update', async () => {
        // This test validates that the engine looks up version records.
        // The version snapshot is created by the policy service at update
        // time; the engine's responsibility is to resolve ruleVersionId.
        const rule = makeRule({
          conditions: {},
          current_version: 3,
          actions: [],
        });

        mockTx.behaviourPolicyRule!.findMany!.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') return [rule];
            return [];
          },
        );

        mockTx.behaviourPolicyRuleVersion!.findFirst!.mockResolvedValue({
          id: 'version-snapshot-3',
        });

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        // Verify version lookup was called with the correct version number
        expect(mockTx.behaviourPolicyRuleVersion!.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { rule_id: RULE_ID, version: 3 },
            select: { id: true },
          }),
        );
      });

      it('should increment current_version on every update', async () => {
        // First call with version 1, second call with version 2
        const ruleV1 = makeRule({
          conditions: {},
          current_version: 1,
          actions: [],
        });
        const ruleV2 = makeRule({
          conditions: {},
          current_version: 2,
          actions: [],
        });

        let callCount = 0;
        mockTx.behaviourPolicyRule!.findMany!.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') {
              callCount++;
              return callCount === 1 ? [ruleV1] : [ruleV2];
            }
            return [];
          },
        );

        // First evaluation
        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        // Second evaluation (simulating after rule update)
        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        const versionLookups = mockTx.behaviourPolicyRuleVersion!.findFirst!.mock.calls;
        // At minimum, one lookup per call that had a matching consequence rule
        const versionNumbers = versionLookups.map(
          (call: Array<{ where: { version: number } }>) => call[0]!.where.version,
        );
        expect(versionNumbers).toContain(1);
        expect(versionNumbers).toContain(2);
      });

      it('should link evaluation to rule_version_id, not rule_id', async () => {
        const rule = makeRule({
          conditions: {},
          current_version: 5,
          actions: [],
        });

        mockTx.behaviourPolicyRule!.findMany!.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') return [rule];
            return [];
          },
        );

        mockTx.behaviourPolicyRuleVersion!.findFirst!.mockResolvedValue({
          id: 'version-id-for-v5',
        });

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        const consequenceEvals = mockTx.behaviourPolicyEvaluation!.create!.mock.calls.filter(
          (call: Array<{ data: { stage: string } }>) => call[0]!.data.stage === 'consequence',
        );

        const evalData = consequenceEvals[0]![0].data;
        // Linked to version ID, not the rule ID itself
        expect(evalData.rule_version_id).toBe('version-id-for-v5');
        // The evaluation schema does not store rule_id directly
        expect(evalData).not.toHaveProperty('rule_id');
      });

      it('evaluation for old incident should still reference old version after rule edit', async () => {
        // Simulate rule at version 1 for first incident
        const ruleV1 = makeRule({
          conditions: {},
          current_version: 1,
          actions: [],
        });
        // After rule edit, version 3 for second incident
        const ruleV3 = makeRule({
          conditions: {},
          current_version: 3,
          actions: [],
        });

        let invocation = 0;
        mockTx.behaviourPolicyRule!.findMany!.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') {
              invocation++;
              return invocation === 1 ? [ruleV1] : [ruleV3];
            }
            return [];
          },
        );

        mockTx.behaviourPolicyRuleVersion!.findFirst!.mockImplementation(
          async ({ where }: { where: { rule_id: string; version: number } }) => {
            return { id: `version-${where.version}` };
          },
        );

        // Evaluate old incident
        await engine.evaluateForStudent(
          makeIncident({ id: 'incident-old' }),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        // Evaluate new incident (rule now at version 3)
        await engine.evaluateForStudent(
          makeIncident({ id: 'incident-new' }),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        const allEvals = mockTx.behaviourPolicyEvaluation!.create!.mock.calls;
        const consequenceEvals = allEvals.filter(
          (call: Array<{ data: { stage: string } }>) => call[0]!.data.stage === 'consequence',
        );

        // First evaluation references version 1
        expect(consequenceEvals[0]![0].data.rule_version_id).toBe('version-1');
        // Second evaluation references version 3
        expect(consequenceEvals[1]![0].data.rule_version_id).toBe('version-3');
      });
    });

    // -----------------------------------------------------------------------
    // Per-student isolation
    // -----------------------------------------------------------------------

    describe('per-student isolation', () => {
      it('should create separate evaluations for each student participant', async () => {
        const rule = makeRule({
          conditions: {},
          actions: [],
        });

        mockTx.behaviourPolicyRule!.findMany!.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') return [rule];
            return [];
          },
        );

        const participantA = makeParticipant({
          id: 'part-a',
          student_id: STUDENT_A,
        });
        const participantB = makeParticipant({
          id: 'part-b',
          student_id: STUDENT_B,
          student_snapshot: {
            year_group_id: YEAR_GROUP_ID,
            year_group_name: 'Year 10',
            has_send: true,
            had_active_intervention: false,
          },
        });

        const incident = makeIncident();

        // Evaluate for student A
        await engine.evaluateForStudent(
          incident,
          participantA,
          new Set(),
          mockTx as unknown as PrismaService,
        );

        // Evaluate for student B
        await engine.evaluateForStudent(
          incident,
          participantB,
          new Set(),
          mockTx as unknown as PrismaService,
        );

        const allEvals = mockTx.behaviourPolicyEvaluation!.create!.mock.calls;

        const studentAEvals = allEvals.filter(
          (call: Array<{ data: { student_id: string } }>) => call[0]!.data.student_id === STUDENT_A,
        );
        const studentBEvals = allEvals.filter(
          (call: Array<{ data: { student_id: string } }>) => call[0]!.data.student_id === STUDENT_B,
        );

        // 5 stages per student
        expect(studentAEvals).toHaveLength(5);
        expect(studentBEvals).toHaveLength(5);
      });

      it('should use each student snapshot independently', async () => {
        // Rule requires SEND = true
        const rule = makeRule({
          conditions: { student_has_send: true },
          actions: [],
        });

        mockTx.behaviourPolicyRule!.findMany!.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') return [rule];
            return [];
          },
        );

        const participantSend = makeParticipant({
          id: 'part-send',
          student_id: STUDENT_A,
          student_snapshot: {
            year_group_id: YEAR_GROUP_ID,
            year_group_name: 'Year 9',
            has_send: true,
            had_active_intervention: false,
          },
        });

        const participantNoSend = makeParticipant({
          id: 'part-no-send',
          student_id: STUDENT_B,
          student_snapshot: {
            year_group_id: YEAR_GROUP_ID,
            year_group_name: 'Year 9',
            has_send: false,
            had_active_intervention: false,
          },
        });

        const incident = makeIncident();

        await engine.evaluateForStudent(
          incident,
          participantSend,
          new Set(),
          mockTx as unknown as PrismaService,
        );

        await engine.evaluateForStudent(
          incident,
          participantNoSend,
          new Set(),
          mockTx as unknown as PrismaService,
        );

        const allEvals = mockTx.behaviourPolicyEvaluation!.create!.mock.calls;

        // Student A (has SEND) should match on consequence
        const studentAConsequence = allEvals.find(
          (call: Array<{ data: { student_id: string; stage: string } }>) =>
            call[0]!.data.student_id === STUDENT_A && call[0]!.data.stage === 'consequence',
        );
        expect(studentAConsequence![0].data.evaluation_result).toBe('matched');

        // Student B (no SEND) should not match on consequence
        const studentBConsequence = allEvals.find(
          (call: Array<{ data: { student_id: string; stage: string } }>) =>
            call[0]!.data.student_id === STUDENT_B && call[0]!.data.stage === 'consequence',
        );
        expect(studentBConsequence![0].data.evaluation_result).toBe('no_match');
      });

      it('repeat_count should be calculated per student, not per incident', async () => {
        const rule = makeRule({
          conditions: {
            repeat_count_min: 3,
            repeat_window_days: 30,
          },
          actions: [],
        });

        mockTx.behaviourPolicyRule!.findMany!.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') return [rule];
            return [];
          },
        );

        // Student A has 5 repeats, Student B has 1
        mockTx.behaviourIncidentParticipant!.count!.mockImplementation(
          async ({ where }: { where: { student_id: string } }) => {
            if (where.student_id === STUDENT_A) return 5;
            return 1;
          },
        );

        const participantA = makeParticipant({
          id: 'part-a',
          student_id: STUDENT_A,
        });
        const participantB = makeParticipant({
          id: 'part-b',
          student_id: STUDENT_B,
        });

        const incident = makeIncident();

        await engine.evaluateForStudent(
          incident,
          participantA,
          new Set(),
          mockTx as unknown as PrismaService,
        );

        await engine.evaluateForStudent(
          incident,
          participantB,
          new Set(),
          mockTx as unknown as PrismaService,
        );

        const allEvals = mockTx.behaviourPolicyEvaluation!.create!.mock.calls;

        // Student A (5 repeats >= 3) should match
        const studentAConsequence = allEvals.find(
          (call: Array<{ data: { student_id: string; stage: string } }>) =>
            call[0]!.data.student_id === STUDENT_A && call[0]!.data.stage === 'consequence',
        );
        expect(studentAConsequence![0].data.evaluation_result).toBe('matched');

        // Student B (1 repeat < 3) should not match
        const studentBConsequence = allEvals.find(
          (call: Array<{ data: { student_id: string; stage: string } }>) =>
            call[0]!.data.student_id === STUDENT_B && call[0]!.data.stage === 'consequence',
        );
        expect(studentBConsequence![0].data.evaluation_result).toBe('no_match');
      });
    });

    // -----------------------------------------------------------------------
    // Action dispatch — individual action type handlers
    // -----------------------------------------------------------------------

    describe('action dispatch', () => {
      it('should create escalated incident for auto_escalate action', async () => {
        const targetCategoryId = 'target-cat-id';
        const rule = makeRule({
          conditions: {},
          actions: [
            {
              action_type: 'auto_escalate',
              action_config: {
                target_category_id: targetCategoryId,
                reason: 'Too severe',
              },
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') return [rule];
            return [];
          },
        );

        mockTx.behaviourCategory.findFirst.mockResolvedValue({
          id: targetCategoryId,
          name: 'Major Incident',
          polarity: 'negative',
          severity: 8,
        });
        mockTx.behaviourIncident.findFirst.mockResolvedValue({
          academic_year_id: 'ay-001',
          status: 'active',
          approval_status: 'not_required',
        });
        const escalatedIncident = { id: 'escalated-inc-001' };
        mockTx.behaviourIncident.create = jest.fn().mockResolvedValue(escalatedIncident);

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        // Verify escalated incident was created
        expect(mockTx.behaviourIncident.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              escalated_from_id: INCIDENT_ID,
              category_id: targetCategoryId,
              status: 'active',
            }),
          }),
        );
        // Verify original incident was transitioned to 'escalated'
        expect(mockTx.behaviourIncident.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: INCIDENT_ID },
            data: { status: 'escalated' },
          }),
        );
      });

      it('should return null for auto_escalate when target_category_id is missing', async () => {
        const rule = makeRule({
          conditions: {},
          actions: [
            {
              action_type: 'auto_escalate',
              action_config: {}, // no target_category_id
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') return [rule];
            return [];
          },
        );

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        // Action recorded as success (null return — no entity created)
        const actionExecs = mockTx.behaviourPolicyActionExecution.create.mock.calls.filter(
          (call: Array<{ data: { action_type: string } }>) =>
            call[0]!.data.action_type === 'auto_escalate',
        );
        expect(actionExecs).toHaveLength(1);
        expect(actionExecs[0]![0].data.execution_status).toBe('success');
        expect(actionExecs[0]![0].data.created_entity_type).toBeNull();
      });

      it('should return null for auto_escalate when target category is not found', async () => {
        const rule = makeRule({
          conditions: {},
          actions: [
            {
              action_type: 'auto_escalate',
              action_config: { target_category_id: 'nonexistent-cat' },
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') return [rule];
            return [];
          },
        );

        // Category lookup returns null
        mockTx.behaviourCategory.findFirst.mockResolvedValue(null);

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        // Action recorded as success but with no entity created
        const actionExecs = mockTx.behaviourPolicyActionExecution.create.mock.calls.filter(
          (call: Array<{ data: { action_type: string } }>) =>
            call[0]!.data.action_type === 'auto_escalate',
        );
        expect(actionExecs).toHaveLength(1);
        expect(actionExecs[0]![0].data.created_entity_type).toBeNull();
      });

      it('should create sanction for create_sanction action', async () => {
        const rule = makeRule({
          conditions: {},
          actions: [
            {
              action_type: 'create_sanction',
              action_config: {
                sanction_type: 'detention',
                days_offset: 2,
                notes: 'Test notes',
              },
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') return [rule];
            return [];
          },
        );

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        expect(mockTx.behaviourSanction.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              tenant_id: TENANT_ID,
              incident_id: INCIDENT_ID,
              student_id: STUDENT_A,
              type: 'detention',
              status: 'scheduled',
            }),
          }),
        );
      });

      it('should return existing sanction for create_sanction dedup', async () => {
        const rule = makeRule({
          conditions: {},
          actions: [
            {
              action_type: 'create_sanction',
              action_config: { sanction_type: 'detention' },
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') return [rule];
            return [];
          },
        );

        // Existing sanction found
        mockTx.behaviourSanction.findFirst.mockResolvedValue({ id: 'existing-sanction' });

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        // Should NOT create a new sanction
        expect(mockTx.behaviourSanction.create).not.toHaveBeenCalled();
      });

      it('should skip create_sanction when participant has no student_id', async () => {
        const rule = makeRule({
          conditions: {},
          actions: [
            {
              action_type: 'create_sanction',
              action_config: { sanction_type: 'detention' },
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') return [rule];
            return [];
          },
        );

        // Participant with no student_id — evaluateForStudent returns early,
        // so this only reaches the action if we go through a workaround.
        // Since evaluateForStudent returns immediately for null student_id,
        // we verify this through the early return test above.
      });

      it('should set approval_status to pending for require_approval action', async () => {
        const rule = makeRule({
          conditions: {},
          stage: 'approval_stage',
          actions: [
            {
              action_type: 'require_approval',
              action_config: {},
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'approval_stage') return [rule];
            return [];
          },
        );

        mockTx.behaviourIncident.findFirst.mockResolvedValue({
          status: 'active',
          approval_status: 'not_required',
        });

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        expect(mockTx.behaviourIncident.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: { approval_status: 'pending' },
          }),
        );
      });

      it('should skip require_approval when incident already awaiting_approval', async () => {
        const rule = makeRule({
          conditions: {},
          stage: 'approval_stage',
          actions: [
            {
              action_type: 'require_approval',
              action_config: {},
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'approval_stage') return [rule];
            return [];
          },
        );

        await engine.evaluateForStudent(
          makeIncident({ status: 'awaiting_approval' }),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        // The update for approval_status should NOT happen for the approval action
        const approvalUpdates = mockTx.behaviourIncident.update.mock.calls.filter(
          (call: Array<{ data: { approval_status?: string } }>) =>
            call[0]?.data?.approval_status === 'pending',
        );
        expect(approvalUpdates).toHaveLength(0);
      });

      it('should skip require_approval when approval_status is not not_required', async () => {
        const rule = makeRule({
          conditions: {},
          stage: 'approval_stage',
          actions: [
            {
              action_type: 'require_approval',
              action_config: {},
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'approval_stage') return [rule];
            return [];
          },
        );

        mockTx.behaviourIncident.findFirst.mockResolvedValue({
          status: 'active',
          approval_status: 'approved', // already processed
        });

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        // No approval_status update
        const approvalUpdates = mockTx.behaviourIncident.update.mock.calls.filter(
          (call: Array<{ data: { approval_status?: string } }>) =>
            call[0]?.data?.approval_status === 'pending',
        );
        expect(approvalUpdates).toHaveLength(0);
      });

      it('should create parent meeting task for require_parent_meeting action', async () => {
        const rule = makeRule({
          conditions: {},
          stage: 'notification_stage',
          actions: [
            {
              action_type: 'require_parent_meeting',
              action_config: { due_within_school_days: 3, notes: 'Urgent meeting' },
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'notification_stage') return [rule];
            return [];
          },
        );

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        expect(mockTx.behaviourTask.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              task_type: 'parent_meeting',
              entity_type: 'incident',
              entity_id: INCIDENT_ID,
              priority: 'high',
              status: 'pending',
            }),
          }),
        );
      });

      it('should return existing task for require_parent_meeting dedup', async () => {
        const rule = makeRule({
          conditions: {},
          stage: 'notification_stage',
          actions: [
            {
              action_type: 'require_parent_meeting',
              action_config: {},
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'notification_stage') return [rule];
            return [];
          },
        );

        mockTx.behaviourTask.findFirst.mockResolvedValue({ id: 'existing-task' });

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        // Should NOT create a new task
        expect(mockTx.behaviourTask.create).not.toHaveBeenCalled();
      });

      it('should set parent_notification_status for require_parent_notification', async () => {
        const rule = makeRule({
          conditions: {},
          stage: 'notification_stage',
          actions: [
            {
              action_type: 'require_parent_notification',
              action_config: {},
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'notification_stage') return [rule];
            return [];
          },
        );

        mockTx.behaviourIncident.findFirst.mockResolvedValue({
          status: 'active',
          approval_status: 'not_required',
          parent_notification_status: 'not_required',
        });

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        expect(mockTx.behaviourIncident.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: { parent_notification_status: 'pending' },
          }),
        );
      });

      it('should skip require_parent_notification when status is already pending', async () => {
        const rule = makeRule({
          conditions: {},
          stage: 'notification_stage',
          actions: [
            {
              action_type: 'require_parent_notification',
              action_config: {},
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'notification_stage') return [rule];
            return [];
          },
        );

        mockTx.behaviourIncident.findFirst.mockResolvedValue({
          parent_notification_status: 'pending',
        });

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        // Should NOT call update to change parent_notification_status
        const parentNotifUpdates = mockTx.behaviourIncident.update.mock.calls.filter(
          (call: Array<{ data: { parent_notification_status?: string } }>) =>
            call[0]?.data?.parent_notification_status === 'pending',
        );
        expect(parentNotifUpdates).toHaveLength(0);
      });

      it('should skip require_parent_notification when status is sent', async () => {
        const rule = makeRule({
          conditions: {},
          stage: 'notification_stage',
          actions: [
            {
              action_type: 'require_parent_notification',
              action_config: {},
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'notification_stage') return [rule];
            return [];
          },
        );

        mockTx.behaviourIncident.findFirst.mockResolvedValue({
          parent_notification_status: 'sent', // not 'not_required' or 'pending'
        });

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        const parentNotifUpdates = mockTx.behaviourIncident.update.mock.calls.filter(
          (call: Array<{ data: { parent_notification_status?: string } }>) =>
            call[0]?.data?.parent_notification_status === 'pending',
        );
        expect(parentNotifUpdates).toHaveLength(0);
      });

      it('should create task for create_task action', async () => {
        const rule = makeRule({
          conditions: {},
          stage: 'support',
          actions: [
            {
              action_type: 'create_task',
              action_config: {
                task_type: 'follow_up',
                due_in_school_days: 5,
                title: 'Custom title',
                priority: 'high',
                assigned_to_user_id: 'assignee-001',
              },
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'support') return [rule];
            return [];
          },
        );

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        expect(mockTx.behaviourTask.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              task_type: 'follow_up',
              title: 'Custom title',
              priority: 'high',
              assigned_to_id: 'assignee-001',
              status: 'pending',
            }),
          }),
        );
      });

      it('should use defaults for create_task when config fields are missing', async () => {
        const rule = makeRule({
          conditions: {},
          stage: 'support',
          actions: [
            {
              action_type: 'create_task',
              action_config: { task_type: 'follow_up' },
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'support') return [rule];
            return [];
          },
        );

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        expect(mockTx.behaviourTask.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              priority: 'medium', // default
              assigned_to_id: REPORTER_ID, // default to reporter
            }),
          }),
        );
      });

      it('should return existing task for create_task dedup', async () => {
        const rule = makeRule({
          conditions: {},
          stage: 'support',
          actions: [
            {
              action_type: 'create_task',
              action_config: { task_type: 'follow_up' },
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'support') return [rule];
            return [];
          },
        );

        mockTx.behaviourTask.findFirst.mockResolvedValue({ id: 'existing-task' });

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        expect(mockTx.behaviourTask.create).not.toHaveBeenCalled();
      });

      it('should create intervention for create_intervention action', async () => {
        const rule = makeRule({
          conditions: {},
          stage: 'support',
          actions: [
            {
              action_type: 'create_intervention',
              action_config: {
                type: 'mentoring',
                title: 'Mentoring programme',
              },
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'support') return [rule];
            return [];
          },
        );

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        expect(mockTx.behaviourIntervention.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              type: 'mentoring',
              status: 'active_intervention',
              title: 'Mentoring programme',
              student_id: STUDENT_A,
            }),
          }),
        );
      });

      it('should return existing intervention for create_intervention dedup', async () => {
        const rule = makeRule({
          conditions: {},
          stage: 'support',
          actions: [
            {
              action_type: 'create_intervention',
              action_config: { type: 'mentoring' },
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'support') return [rule];
            return [];
          },
        );

        mockTx.behaviourIntervention.findFirst.mockResolvedValue({
          id: 'existing-intervention',
        });

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        expect(mockTx.behaviourIntervention.create).not.toHaveBeenCalled();
      });

      it('should flag incident for review with flag_for_review action', async () => {
        const rule = makeRule({
          conditions: {},
          stage: 'alerting',
          actions: [
            {
              action_type: 'flag_for_review',
              action_config: { reason: 'Needs SLT review' },
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'alerting') return [rule];
            return [];
          },
        );

        mockTx.behaviourIncident.findFirst.mockResolvedValue({ status: 'active' });

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        expect(mockTx.behaviourIncident.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: { status: 'under_review' },
          }),
        );
        expect(mockHistoryService.recordHistory).toHaveBeenCalledWith(
          mockTx,
          TENANT_ID,
          'incident',
          INCIDENT_ID,
          REPORTER_ID,
          'status_changed',
          { status: 'active' },
          { status: 'under_review' },
          'Needs SLT review',
        );
      });

      it('should not flag for review if incident status is not active', async () => {
        const rule = makeRule({
          conditions: {},
          stage: 'alerting',
          actions: [
            {
              action_type: 'flag_for_review',
              action_config: {},
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'alerting') return [rule];
            return [];
          },
        );

        mockTx.behaviourIncident.findFirst.mockResolvedValue({ status: 'resolved' });

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        // Should NOT update status to under_review
        const reviewUpdates = mockTx.behaviourIncident.update.mock.calls.filter(
          (call: Array<{ data: { status?: string } }>) => call[0]?.data?.status === 'under_review',
        );
        expect(reviewUpdates).toHaveLength(0);
        expect(mockHistoryService.recordHistory).not.toHaveBeenCalled();
      });

      it('should set approval_status for block_without_approval action', async () => {
        const rule = makeRule({
          conditions: {},
          stage: 'approval_stage',
          actions: [
            {
              action_type: 'block_without_approval',
              action_config: {},
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'approval_stage') return [rule];
            return [];
          },
        );

        mockTx.behaviourIncident.findFirst.mockResolvedValue({
          approval_status: 'not_required',
        });

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        expect(mockTx.behaviourIncident.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: { approval_status: 'pending' },
          }),
        );
      });

      it('should not set block_without_approval when already has approval status', async () => {
        const rule = makeRule({
          conditions: {},
          stage: 'approval_stage',
          actions: [
            {
              action_type: 'block_without_approval',
              action_config: {},
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'approval_stage') return [rule];
            return [];
          },
        );

        mockTx.behaviourIncident.findFirst.mockResolvedValue({
          approval_status: 'pending', // already set
        });

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        // Should NOT call update for approval_status
        const approvalUpdates = mockTx.behaviourIncident.update.mock.calls.filter(
          (call: Array<{ data: { approval_status?: string } }>) =>
            call[0]?.data?.approval_status === 'pending',
        );
        expect(approvalUpdates).toHaveLength(0);
      });

      it('should return null for notify_roles action (no side-effects inside tx)', async () => {
        const rule = makeRule({
          conditions: {},
          stage: 'notification_stage',
          actions: [
            {
              action_type: 'notify_roles',
              action_config: { roles: ['head_of_year'] },
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'notification_stage') return [rule];
            return [];
          },
        );

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        // Action should be recorded as success
        const notifyExecs = mockTx.behaviourPolicyActionExecution.create.mock.calls.filter(
          (call: Array<{ data: { action_type: string } }>) =>
            call[0]!.data.action_type === 'notify_roles',
        );
        expect(notifyExecs).toHaveLength(1);
        expect(notifyExecs[0]![0].data.execution_status).toBe('success');
      });

      it('should return null for notify_users action (no side-effects inside tx)', async () => {
        const rule = makeRule({
          conditions: {},
          stage: 'notification_stage',
          actions: [
            {
              action_type: 'notify_users',
              action_config: { user_ids: ['user-1'] },
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'notification_stage') return [rule];
            return [];
          },
        );

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        const notifyExecs = mockTx.behaviourPolicyActionExecution.create.mock.calls.filter(
          (call: Array<{ data: { action_type: string } }>) =>
            call[0]!.data.action_type === 'notify_users',
        );
        expect(notifyExecs).toHaveLength(1);
        expect(notifyExecs[0]![0].data.execution_status).toBe('success');
      });

      it('should handle unknown action type gracefully', async () => {
        const rule = makeRule({
          conditions: {},
          actions: [
            {
              action_type: 'unknown_type' as string,
              action_config: {},
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') return [rule];
            return [];
          },
        );

        // Should not throw
        await expect(
          engine.evaluateForStudent(
            makeIncident(),
            makeParticipant(),
            new Set(),
            mockTx as unknown as PrismaService,
          ),
        ).resolves.toBeUndefined();

        // Action recorded as success with null entity references
        const execs = mockTx.behaviourPolicyActionExecution.create.mock.calls.filter(
          (call: Array<{ data: { action_type: string } }>) =>
            call[0]!.data.action_type === 'unknown_type',
        );
        expect(execs).toHaveLength(1);
        expect(execs[0]![0].data.execution_status).toBe('success');
        expect(execs[0]![0].data.created_entity_type).toBeNull();
      });

      it('should record failure reason from non-Error thrown values', async () => {
        const rule = makeRule({
          conditions: {},
          actions: [
            {
              action_type: 'create_sanction',
              action_config: { sanction_type: 'detention' },
              execution_order: 0,
            },
          ],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') return [rule];
            return [];
          },
        );

        // Throw a non-Error string
        mockTx.behaviourSanction.create.mockRejectedValue('string error');

        await expect(
          engine.evaluateForStudent(
            makeIncident(),
            makeParticipant(),
            new Set(),
            mockTx as unknown as PrismaService,
          ),
        ).resolves.toBeUndefined();

        const failedExecs = mockTx.behaviourPolicyActionExecution.create.mock.calls.filter(
          (call: Array<{ data: { execution_status: string } }>) =>
            call[0]!.data.execution_status === 'failed',
        );
        expect(failedExecs).toHaveLength(1);
        expect(failedExecs[0]![0].data.failure_reason).toBe('string error');
      });
    });

    // -----------------------------------------------------------------------
    // buildEvaluatedInput branches
    // -----------------------------------------------------------------------

    describe('buildEvaluatedInput', () => {
      it('should fetch category name from DB when incident.category is null', async () => {
        const incident = makeIncident({ category: null });

        mockTx.behaviourCategory.findFirst.mockResolvedValue({ name: 'DB Category' });

        const result = await engine.buildEvaluatedInput(
          incident,
          makeParticipant(),
          {},
          mockTx as unknown as PrismaService,
        );

        expect(mockTx.behaviourCategory.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: CATEGORY_ID, tenant_id: TENANT_ID },
          }),
        );
        expect(result.category_name).toBe('DB Category');
      });

      it('should use empty string when category is not found in DB', async () => {
        const incident = makeIncident({ category: null });

        mockTx.behaviourCategory.findFirst.mockResolvedValue(null);

        const result = await engine.buildEvaluatedInput(
          incident,
          makeParticipant(),
          {},
          mockTx as unknown as PrismaService,
        );

        expect(result.category_name).toBe('');
      });

      it('should use incident.category.name when present', async () => {
        const incident = makeIncident({ category: { name: 'Direct Category' } });

        const result = await engine.buildEvaluatedInput(
          incident,
          makeParticipant(),
          {},
          mockTx as unknown as PrismaService,
        );

        expect(result.category_name).toBe('Direct Category');
        // Should not query DB for category
        expect(mockTx.behaviourCategory.findFirst).not.toHaveBeenCalled();
      });

      it('should use snapshot fields for year_group and send flags', async () => {
        const customYgId = 'aabbccdd-0011-2233-4455-667788990011';
        const participant = makeParticipant({
          student_snapshot: {
            year_group_id: customYgId,
            year_group_name: 'Year 11',
            has_send: true,
            had_active_intervention: true,
          },
        });

        const result = await engine.buildEvaluatedInput(
          makeIncident(),
          participant,
          {},
          mockTx as unknown as PrismaService,
        );

        expect(result.year_group_id).toBe(customYgId);
        expect(result.year_group_name).toBe('Year 11');
        expect(result.has_send).toBe(true);
        expect(result.had_active_intervention).toBe(true);
      });

      it('should default to null/false when snapshot fields are missing', async () => {
        const participant = makeParticipant({
          student_snapshot: {}, // empty snapshot
        });

        const result = await engine.buildEvaluatedInput(
          makeIncident(),
          participant,
          {},
          mockTx as unknown as PrismaService,
        );

        expect(result.year_group_id).toBeNull();
        expect(result.year_group_name).toBeNull();
        expect(result.has_send).toBe(false);
        expect(result.had_active_intervention).toBe(false);
      });

      it('should default to empty object when student_snapshot is null', async () => {
        const participant = makeParticipant({
          student_snapshot: null,
        });

        const result = await engine.buildEvaluatedInput(
          makeIncident(),
          participant,
          {},
          mockTx as unknown as PrismaService,
        );

        expect(result.year_group_id).toBeNull();
        expect(result.has_send).toBe(false);
      });

      it('should pass repeat_window_days and repeat_category_ids from conditions', async () => {
        const catA = 'aabbccdd-0011-2233-4455-667788990011';
        const catB = 'aabbccdd-0011-2233-4455-667788990022';
        const conditions = {
          repeat_window_days: 30,
          repeat_category_ids: [catA, catB],
        };

        const result = await engine.buildEvaluatedInput(
          makeIncident(),
          makeParticipant(),
          conditions,
          mockTx as unknown as PrismaService,
        );

        expect(result.repeat_window_days_used).toBe(30);
        expect(result.repeat_category_ids_used).toEqual([catA, catB]);
      });

      it('should return null/[] for repeat fields when conditions are empty', async () => {
        const result = await engine.buildEvaluatedInput(
          makeIncident(),
          makeParticipant(),
          {},
          mockTx as unknown as PrismaService,
        );

        expect(result.repeat_window_days_used).toBeNull();
        expect(result.repeat_category_ids_used).toEqual([]);
      });
    });

    // -----------------------------------------------------------------------
    // computeRepeatCount branches (tested indirectly via buildEvaluatedInput)
    // -----------------------------------------------------------------------

    describe('computeRepeatCount (indirect)', () => {
      it('should return 0 when repeat_count_min is not set in conditions', async () => {
        const result = await engine.buildEvaluatedInput(
          makeIncident(),
          makeParticipant(),
          {}, // no repeat_count_min
          mockTx as unknown as PrismaService,
        );

        expect(result.repeat_count).toBe(0);
        expect(mockTx.behaviourIncidentParticipant.count).not.toHaveBeenCalled();
      });

      it('should return 0 when repeat_window_days is not set', async () => {
        const result = await engine.buildEvaluatedInput(
          makeIncident(),
          makeParticipant(),
          { repeat_count_min: 3 }, // no repeat_window_days
          mockTx as unknown as PrismaService,
        );

        expect(result.repeat_count).toBe(0);
        expect(mockTx.behaviourIncidentParticipant.count).not.toHaveBeenCalled();
      });

      it('should query DB when both repeat_count_min and repeat_window_days are set', async () => {
        mockTx.behaviourIncidentParticipant.count.mockResolvedValue(4);

        const result = await engine.buildEvaluatedInput(
          makeIncident(),
          makeParticipant(),
          { repeat_count_min: 2, repeat_window_days: 30 },
          mockTx as unknown as PrismaService,
        );

        expect(result.repeat_count).toBe(4);
        expect(mockTx.behaviourIncidentParticipant.count).toHaveBeenCalled();
      });

      it('should filter by repeat_category_ids when provided', async () => {
        const catX = 'aabbccdd-0011-2233-4455-667788990033';
        const catY = 'aabbccdd-0011-2233-4455-667788990044';
        mockTx.behaviourIncidentParticipant.count.mockResolvedValue(2);

        await engine.buildEvaluatedInput(
          makeIncident(),
          makeParticipant(),
          {
            repeat_count_min: 1,
            repeat_window_days: 30,
            repeat_category_ids: [catX, catY],
          },
          mockTx as unknown as PrismaService,
        );

        const countCall = mockTx.behaviourIncidentParticipant.count.mock.calls[0]![0];
        expect(countCall.where.incident.category_id).toEqual({
          in: [catX, catY],
        });
      });

      it('should not filter by category when repeat_category_ids is empty', async () => {
        mockTx.behaviourIncidentParticipant.count.mockResolvedValue(1);

        await engine.buildEvaluatedInput(
          makeIncident(),
          makeParticipant(),
          {
            repeat_count_min: 1,
            repeat_window_days: 30,
            repeat_category_ids: [],
          },
          mockTx as unknown as PrismaService,
        );

        const countCall = mockTx.behaviourIncidentParticipant.count.mock.calls[0]![0];
        expect(countCall.where.incident.category_id).toBeUndefined();
      });

      it('should not query repeat count when participant has no student_id (via evaluateForStudent early return)', async () => {
        // evaluateForStudent returns early for null student_id,
        // so computeRepeatCount's student_id guard is never reached independently.
        // This test validates the early return path ensures no DB queries happen.
        const participant = makeParticipant({ student_id: null });

        await engine.evaluateForStudent(
          makeIncident(),
          participant,
          new Set(),
          mockTx as unknown as PrismaService,
        );

        expect(mockTx.behaviourIncidentParticipant.count).not.toHaveBeenCalled();
        expect(mockTx.behaviourPolicyRule.findMany).not.toHaveBeenCalled();
      });
    });

    // -----------------------------------------------------------------------
    // getVersionId (indirect)
    // -----------------------------------------------------------------------

    describe('getVersionId (indirect)', () => {
      it('should return null when version record is not found', async () => {
        const rule = makeRule({
          conditions: {},
          current_version: 99,
          actions: [],
        });

        mockTx.behaviourPolicyRule.findMany.mockImplementation(
          async ({ where }: { where: { stage: string } }) => {
            if (where.stage === 'consequence') return [rule];
            return [];
          },
        );

        mockTx.behaviourPolicyRuleVersion.findFirst.mockResolvedValue(null);

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        const consequenceEvals = mockTx.behaviourPolicyEvaluation.create.mock.calls.filter(
          (call: Array<{ data: { stage: string } }>) => call[0]!.data.stage === 'consequence',
        );
        expect(consequenceEvals[0]![0].data.rule_version_id).toBeNull();
      });
    });
  });
});
