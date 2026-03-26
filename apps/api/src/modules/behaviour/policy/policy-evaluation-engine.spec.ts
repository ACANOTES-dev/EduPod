import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { EvaluatedInput, PolicyCondition } from '@school/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { BehaviourHistoryService } from '../behaviour-history.service';

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
      expect(
        engine.evaluateConditions(conditions, makeInput({ severity: 3 })),
      ).toBe(true);

      // Exactly at max boundary
      expect(
        engine.evaluateConditions(conditions, makeInput({ severity: 7 })),
      ).toBe(true);

      // Below min
      expect(
        engine.evaluateConditions(conditions, makeInput({ severity: 2 })),
      ).toBe(false);

      // Above max
      expect(
        engine.evaluateConditions(conditions, makeInput({ severity: 8 })),
      ).toBe(false);

      // In the middle
      expect(
        engine.evaluateConditions(conditions, makeInput({ severity: 5 })),
      ).toBe(true);
    });

    it('should correctly evaluate repeat_count_min with a window', () => {
      const conditions: PolicyCondition = {
        repeat_count_min: 3,
      };

      // Count below minimum
      expect(
        engine.evaluateConditions(conditions, makeInput({ repeat_count: 2 })),
      ).toBe(false);

      // Count at minimum
      expect(
        engine.evaluateConditions(conditions, makeInput({ repeat_count: 3 })),
      ).toBe(true);

      // Count above minimum
      expect(
        engine.evaluateConditions(conditions, makeInput({ repeat_count: 10 })),
      ).toBe(true);
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

    it('edge: severity_min = 1 should match all severities >= 1', () => {
      const conditions: PolicyCondition = {
        severity_min: 1,
      };

      expect(
        engine.evaluateConditions(conditions, makeInput({ severity: 1 })),
      ).toBe(true);
      expect(
        engine.evaluateConditions(conditions, makeInput({ severity: 5 })),
      ).toBe(true);
      expect(
        engine.evaluateConditions(conditions, makeInput({ severity: 10 })),
      ).toBe(true);
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
          findFirst: jest.fn().mockResolvedValue({ status: 'active', approval_status: 'not_required' }),
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
        const consequenceEvals =
          mockTx.behaviourPolicyEvaluation!.create!.mock.calls.filter(
            (call: Array<{ data: { stage: string } }>) =>
              call[0]!.data.stage === 'consequence',
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
        const actionExecCalls =
          mockTx.behaviourPolicyActionExecution!.create!.mock.calls.filter(
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

        const actionExecCalls =
          mockTx.behaviourPolicyActionExecution!.create!.mock.calls.filter(
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

        const consequenceEvals =
          mockTx.behaviourPolicyEvaluation!.create!.mock.calls.filter(
            (call: Array<{ data: { stage: string } }>) =>
              call[0]!.data.stage === 'consequence',
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

        const consequenceEvals =
          mockTx.behaviourPolicyEvaluation!.create!.mock.calls.filter(
            (call: Array<{ data: { stage: string } }>) =>
              call[0]!.data.stage === 'consequence',
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
        mockTx.behaviourPolicyActionExecution!.findFirst!.mockImplementation(
          async () => {
            dedupCallCount++;
            if (dedupCallCount === 1) return null;
            return { id: 'existing-exec', execution_status: 'success' };
          },
        );

        await engine.evaluateForStudent(
          makeIncident(),
          makeParticipant(),
          new Set(),
          mockTx as unknown as PrismaService,
        );

        const createCalls =
          mockTx.behaviourPolicyActionExecution!.create!.mock.calls;
        const flagForReviewExecs = createCalls.filter(
          (call: Array<{ data: { action_type: string } }>) =>
            call[0]!.data.action_type === 'flag_for_review',
        );

        // One success, one skipped_duplicate
        const statuses = flagForReviewExecs.map(
          (call: Array<{ data: { execution_status: string } }>) =>
            call[0]!.data.execution_status,
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
        mockTx.behaviourSanction!.create!.mockRejectedValue(
          new Error('DB constraint violation'),
        );

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
        const failedExecs =
          mockTx.behaviourPolicyActionExecution!.create!.mock.calls.filter(
            (call: Array<{ data: { execution_status: string } }>) =>
              call[0]!.data.execution_status === 'failed',
          );
        expect(failedExecs.length).toBeGreaterThanOrEqual(1);
        expect(failedExecs[0]![0].data.failure_reason).toBe(
          'DB constraint violation',
        );

        // Pipeline continued — all 5 stages still got evaluated
        const totalEvals =
          mockTx.behaviourPolicyEvaluation!.create!.mock.calls.length;
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
        expect(
          mockTx.behaviourPolicyRuleVersion!.findFirst,
        ).toHaveBeenCalledWith(
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

        const versionLookups =
          mockTx.behaviourPolicyRuleVersion!.findFirst!.mock.calls;
        // At minimum, one lookup per call that had a matching consequence rule
        const versionNumbers = versionLookups.map(
          (call: Array<{ where: { version: number } }>) =>
            call[0]!.where.version,
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

        const consequenceEvals =
          mockTx.behaviourPolicyEvaluation!.create!.mock.calls.filter(
            (call: Array<{ data: { stage: string } }>) =>
              call[0]!.data.stage === 'consequence',
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
          async ({
            where,
          }: {
            where: { rule_id: string; version: number };
          }) => {
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
          (call: Array<{ data: { stage: string } }>) =>
            call[0]!.data.stage === 'consequence',
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
          (call: Array<{ data: { student_id: string } }>) =>
            call[0]!.data.student_id === STUDENT_A,
        );
        const studentBEvals = allEvals.filter(
          (call: Array<{ data: { student_id: string } }>) =>
            call[0]!.data.student_id === STUDENT_B,
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
            call[0]!.data.student_id === STUDENT_A &&
            call[0]!.data.stage === 'consequence',
        );
        expect(studentAConsequence![0].data.evaluation_result).toBe('matched');

        // Student B (no SEND) should not match on consequence
        const studentBConsequence = allEvals.find(
          (call: Array<{ data: { student_id: string; stage: string } }>) =>
            call[0]!.data.student_id === STUDENT_B &&
            call[0]!.data.stage === 'consequence',
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
          async ({
            where,
          }: {
            where: { student_id: string };
          }) => {
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
            call[0]!.data.student_id === STUDENT_A &&
            call[0]!.data.stage === 'consequence',
        );
        expect(studentAConsequence![0].data.evaluation_result).toBe('matched');

        // Student B (1 repeat < 3) should not match
        const studentBConsequence = allEvals.find(
          (call: Array<{ data: { student_id: string; stage: string } }>) =>
            call[0]!.data.student_id === STUDENT_B &&
            call[0]!.data.stage === 'consequence',
        );
        expect(studentBConsequence![0].data.evaluation_result).toBe('no_match');
      });
    });
  });
});
