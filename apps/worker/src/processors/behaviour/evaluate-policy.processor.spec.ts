import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';

import { EARLY_WARNING_COMPUTE_STUDENT_JOB } from '@school/shared/early-warning';

import { QUEUE_NAMES } from '../../base/queue.constants';

import {
  EVALUATE_POLICY_JOB,
  type EvaluatePolicyPayload,
  EvaluatePolicyProcessor,
} from './evaluate-policy.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const INCIDENT_ID = '22222222-2222-2222-2222-222222222222';
const STUDENT_ID = '33333333-3333-3333-3333-333333333333';
const PARTICIPANT_ID = '44444444-4444-4444-4444-444444444444';
const REPORTER_ID = '55555555-5555-5555-5555-555555555555';
const CATEGORY_ID = '66666666-6666-6666-6666-666666666666';
const NOW_ISO = '2026-04-01T10:00:00.000Z';

type PolicyStage = 'consequence' | 'approval_stage' | 'notification_stage' | 'support' | 'alerting';

interface MockRuleAction {
  action_config: Record<string, unknown>;
  action_type:
    | 'auto_escalate'
    | 'create_intervention'
    | 'create_sanction'
    | 'create_task'
    | 'flag_for_review'
    | 'notify_roles'
    | 'notify_users'
    | 'require_approval'
    | 'require_parent_meeting'
    | 'require_parent_notification'
    | 'block_without_approval';
  execution_order: number;
}

interface MockRule {
  actions: MockRuleAction[];
  conditions: Record<string, unknown>;
  current_version: number;
  id: string;
  match_strategy: 'all_matching' | 'first_match';
  priority: number;
  stage: PolicyStage;
  stop_processing_stage: boolean;
}

interface BuildMockTxOptions {
  cooldownActionTypes?: MockRuleAction['action_type'][];
  duplicateActionTypes?: MockRuleAction['action_type'][];
  existingStages?: PolicyStage[];
  failCreateTask?: boolean;
  incidentStatus?: 'active' | 'draft' | 'withdrawn' | 'under_review';
  rulesByStage?: Partial<Record<PolicyStage, MockRule[]>>;
}

interface IncidentState {
  approval_status: 'not_required' | 'pending';
  parent_notification_status: 'not_required' | 'pending';
  policy_evaluation_id: string | null;
  status: 'active' | 'draft' | 'withdrawn' | 'under_review';
}

function buildRule(
  stage: PolicyStage,
  action: MockRuleAction,
  overrides: Partial<MockRule> = {},
): MockRule {
  return {
    actions: [action],
    conditions: {},
    current_version: 1,
    id: `rule-${stage}`,
    match_strategy: 'all_matching',
    priority: 1,
    stage,
    stop_processing_stage: false,
    ...overrides,
  };
}

function buildJob(
  name: string,
  data: Partial<EvaluatePolicyPayload> = {},
): Job<EvaluatePolicyPayload> {
  return {
    data: {
      incident_id: INCIDENT_ID,
      tenant_id: TENANT_ID,
      trigger: 'incident_created',
      triggered_at: NOW_ISO,
      ...data,
    },
    name,
  } as Job<EvaluatePolicyPayload>;
}

function buildMockTx(options: BuildMockTxOptions = {}) {
  const incidentState: IncidentState = {
    approval_status: 'not_required',
    parent_notification_status: 'not_required',
    policy_evaluation_id: null,
    status: options.incidentStatus ?? 'active',
  };

  const incident = {
    category: { name: 'Disruption' },
    category_id: CATEGORY_ID,
    context_type: 'classroom',
    id: INCIDENT_ID,
    incident_number: 'INC-001',
    occurred_at: new Date(NOW_ISO),
    participants: [
      {
        id: PARTICIPANT_ID,
        participant_type: 'student',
        role: 'subject',
        student_id: STUDENT_ID,
        student_snapshot: {
          had_active_intervention: false,
          has_send: true,
          year_group_id: '77777777-7777-7777-7777-777777777777',
          year_group_name: 'Year 9',
        },
      },
    ],
    period_order: 2,
    polarity: 'negative',
    reported_by_id: REPORTER_ID,
    severity: 3,
    status: incidentState.status,
    tenant_id: TENANT_ID,
    weekday: 3,
  };

  const rulesByStage: Record<PolicyStage, MockRule[]> = {
    consequence: options.rulesByStage?.consequence ?? [],
    approval_stage: options.rulesByStage?.approval_stage ?? [],
    notification_stage: options.rulesByStage?.notification_stage ?? [],
    support: options.rulesByStage?.support ?? [],
    alerting: options.rulesByStage?.alerting ?? [],
  };

  const behaviourIncident = {
    findFirst: jest.fn().mockImplementation(
      async (args: {
        include?: { participants?: unknown };
        select?: {
          approval_status?: boolean;
          parent_notification_status?: boolean;
          status?: boolean;
        };
      }) => {
        if (args.include?.participants) {
          return { ...incident, status: incidentState.status };
        }

        if (args.select?.approval_status) {
          return { approval_status: incidentState.approval_status };
        }

        if (args.select?.parent_notification_status) {
          return {
            parent_notification_status: incidentState.parent_notification_status,
          };
        }

        if (args.select?.status) {
          return { status: incidentState.status };
        }

        return null;
      },
    ),
    update: jest.fn().mockImplementation(
      async (args: {
        data: {
          approval_status?: IncidentState['approval_status'];
          parent_notification_status?: IncidentState['parent_notification_status'];
          policy_evaluation_id?: string | null;
          status?: IncidentState['status'];
        };
      }) => {
        if (args.data.approval_status) {
          incidentState.approval_status = args.data.approval_status;
        }

        if (args.data.parent_notification_status) {
          incidentState.parent_notification_status = args.data.parent_notification_status;
        }

        if (args.data.policy_evaluation_id !== undefined) {
          incidentState.policy_evaluation_id = args.data.policy_evaluation_id;
        }

        if (args.data.status) {
          incidentState.status = args.data.status;
        }

        return { id: INCIDENT_ID };
      },
    ),
  };

  const behaviourPolicyEvaluation = {
    create: jest.fn().mockImplementation(async (args: { data: { stage: PolicyStage } }) => ({
      id: `eval-${args.data.stage}`,
    })),
    findMany: jest
      .fn()
      .mockResolvedValue((options.existingStages ?? []).map((stage) => ({ stage }))),
  };

  const behaviourPolicyRule = {
    findMany: jest
      .fn()
      .mockImplementation(
        async (args: { where: { stage: PolicyStage } }) => rulesByStage[args.where.stage] ?? [],
      ),
  };

  const behaviourPolicyRuleVersion = {
    findFirst: jest.fn().mockImplementation(async (args: { where: { rule_id: string } }) => ({
      id: `version-${args.where.rule_id}`,
    })),
  };

  const behaviourPolicyActionExecution = {
    create: jest.fn().mockResolvedValue({ id: 'action-execution-id' }),
    findFirst: jest.fn().mockImplementation(
      async (args: {
        where: {
          action_type: MockRuleAction['action_type'];
          created_at?: { gte: Date };
          evaluation_id?: string;
        };
      }) => {
        if (
          args.where.created_at &&
          options.cooldownActionTypes?.includes(args.where.action_type)
        ) {
          return {
            created_at: new Date(NOW_ISO),
            id: `cooldown-${args.where.action_type}`,
          };
        }

        if (
          args.where.evaluation_id &&
          options.duplicateActionTypes?.includes(args.where.action_type)
        ) {
          return {
            id: `duplicate-${args.where.action_type}`,
          };
        }

        return null;
      },
    ),
  };

  const behaviourTask = {
    create: jest.fn().mockImplementation(async () => {
      if (options.failCreateTask) {
        throw new Error('Task write failed');
      }

      return { id: 'task-created-id' };
    }),
    findFirst: jest.fn().mockResolvedValue(null),
  };

  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    behaviourIncident,
    behaviourIncidentParticipant: {
      count: jest.fn().mockResolvedValue(0),
    },
    behaviourPolicyActionExecution,
    behaviourPolicyEvaluation,
    behaviourPolicyRule,
    behaviourPolicyRuleVersion,
    behaviourTask,
  };

  return { incidentState, tx };
}

function buildMockPrisma(tx: ReturnType<typeof buildMockTx>['tx']) {
  return {
    $transaction: jest.fn(async (callback: (transactionClient: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
}

async function setup(options: BuildMockTxOptions = {}) {
  const { incidentState, tx } = buildMockTx(options);
  const mockPrisma = buildMockPrisma(tx);
  const earlyWarningQueue = {
    add: jest.fn().mockResolvedValue({ id: 'queue-job-id' }),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      EvaluatePolicyProcessor,
      { provide: 'PRISMA_CLIENT', useValue: mockPrisma },
      {
        provide: getQueueToken(QUEUE_NAMES.EARLY_WARNING),
        useValue: earlyWarningQueue,
      },
    ],
  }).compile();

  return {
    earlyWarningQueue,
    incidentState,
    module,
    mockPrisma,
    processor: module.get(EvaluatePolicyProcessor),
    tx,
  };
}

describe('EvaluatePolicyProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const { module, processor, tx } = await setup();

    await processor.process(buildJob('behaviour:some-other-job'));

    expect(tx.behaviourIncident.findFirst).not.toHaveBeenCalled();
    await module.close();
  });

  it('should reject jobs without tenant_id', async () => {
    const { module, processor } = await setup();

    await expect(
      processor.process(buildJob(EVALUATE_POLICY_JOB, { tenant_id: undefined })),
    ).rejects.toThrow('missing tenant_id');

    await module.close();
  });

  it('should run the five-stage pipeline, apply side effects, and enqueue early warning for exclusion actions', async () => {
    const { earlyWarningQueue, incidentState, module, processor, tx } = await setup({
      rulesByStage: {
        consequence: [
          buildRule('consequence', {
            action_config: {},
            action_type: 'create_sanction',
            execution_order: 1,
          }),
        ],
        approval_stage: [
          buildRule('approval_stage', {
            action_config: {},
            action_type: 'require_approval',
            execution_order: 1,
          }),
        ],
        notification_stage: [
          buildRule('notification_stage', {
            action_config: {},
            action_type: 'require_parent_notification',
            execution_order: 1,
          }),
        ],
        support: [
          buildRule('support', {
            action_config: {
              priority: 'high',
              task_type: 'follow_up',
              title: 'Follow up on incident',
            },
            action_type: 'create_task',
            execution_order: 1,
          }),
        ],
        alerting: [
          buildRule('alerting', {
            action_config: {},
            action_type: 'flag_for_review',
            execution_order: 1,
          }),
        ],
      },
    });

    await processor.process(buildJob(EVALUATE_POLICY_JOB));

    expect(
      tx.behaviourPolicyEvaluation.create.mock.calls.map(
        (call) => (call[0] as { data: { stage: PolicyStage } }).data.stage,
      ),
    ).toEqual(['consequence', 'approval_stage', 'notification_stage', 'support', 'alerting']);

    expect(incidentState.approval_status).toBe('pending');
    expect(incidentState.parent_notification_status).toBe('pending');
    expect(incidentState.policy_evaluation_id).toBe('eval-consequence');
    expect(incidentState.status).toBe('under_review');

    expect(tx.behaviourTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assigned_to_id: REPORTER_ID,
        priority: 'high',
        task_type: 'follow_up',
        tenant_id: TENANT_ID,
        title: 'Follow up on incident',
      }),
    });

    expect(earlyWarningQueue.add).toHaveBeenCalledWith(
      EARLY_WARNING_COMPUTE_STUDENT_JOB,
      {
        student_id: STUDENT_ID,
        tenant_id: TENANT_ID,
        trigger_event: 'suspension',
      },
      { attempts: 3, backoff: { delay: 5000, type: 'exponential' } },
    );

    expect(tx.behaviourPolicyActionExecution.create).toHaveBeenCalledTimes(5);
    await module.close();
  });

  it('should skip stages that already have evaluations for the student', async () => {
    const { module, processor, tx } = await setup({
      existingStages: ['consequence', 'approval_stage'],
      rulesByStage: {
        consequence: [
          buildRule('consequence', {
            action_config: {},
            action_type: 'create_sanction',
            execution_order: 1,
          }),
        ],
        approval_stage: [
          buildRule('approval_stage', {
            action_config: {},
            action_type: 'require_approval',
            execution_order: 1,
          }),
        ],
        notification_stage: [
          buildRule('notification_stage', {
            action_config: {},
            action_type: 'require_parent_notification',
            execution_order: 1,
          }),
        ],
        support: [
          buildRule('support', {
            action_config: {
              task_type: 'follow_up',
            },
            action_type: 'create_task',
            execution_order: 1,
          }),
        ],
        alerting: [
          buildRule('alerting', {
            action_config: {},
            action_type: 'flag_for_review',
            execution_order: 1,
          }),
        ],
      },
    });

    await processor.process(buildJob(EVALUATE_POLICY_JOB));

    expect(
      tx.behaviourPolicyRule.findMany.mock.calls.map(
        (call) => (call[0] as { where: { stage: PolicyStage } }).where.stage,
      ),
    ).toEqual(['notification_stage', 'support', 'alerting']);

    expect(tx.behaviourPolicyEvaluation.create).toHaveBeenCalledTimes(3);
    await module.close();
  });

  it('should skip actions when cooldown is active for the same rule and student', async () => {
    const { earlyWarningQueue, module, processor, tx } = await setup({
      cooldownActionTypes: ['create_sanction'],
      rulesByStage: {
        consequence: [
          buildRule('consequence', {
            action_config: {},
            action_type: 'create_sanction',
            execution_order: 1,
          }),
        ],
      },
    });

    await processor.process(buildJob(EVALUATE_POLICY_JOB));

    expect(earlyWarningQueue.add).not.toHaveBeenCalled();
    expect(
      tx.behaviourPolicyActionExecution.create.mock.calls.filter((call) => {
        const actionType = (call[0] as { data: { action_type: string } }).data.action_type;
        return actionType === 'create_sanction';
      }),
    ).toHaveLength(0);

    await module.close();
  });

  it('should record skipped_duplicate when an action was already executed for the evaluation', async () => {
    const { module, processor, tx } = await setup({
      duplicateActionTypes: ['create_task'],
      rulesByStage: {
        support: [
          buildRule('support', {
            action_config: { task_type: 'follow_up' },
            action_type: 'create_task',
            execution_order: 1,
          }),
        ],
      },
    });

    await processor.process(buildJob(EVALUATE_POLICY_JOB));

    expect(tx.behaviourTask.create).not.toHaveBeenCalled();
    expect(tx.behaviourPolicyActionExecution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action_type: 'create_task',
        execution_status: 'skipped_duplicate',
      }),
    });

    await module.close();
  });

  it('should record failed action executions and continue later stages', async () => {
    const { incidentState, module, processor, tx } = await setup({
      failCreateTask: true,
      rulesByStage: {
        support: [
          buildRule('support', {
            action_config: { task_type: 'follow_up' },
            action_type: 'create_task',
            execution_order: 1,
          }),
        ],
        alerting: [
          buildRule('alerting', {
            action_config: {},
            action_type: 'flag_for_review',
            execution_order: 1,
          }),
        ],
      },
    });

    await expect(processor.process(buildJob(EVALUATE_POLICY_JOB))).resolves.toBeUndefined();

    expect(tx.behaviourPolicyActionExecution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action_type: 'create_task',
        execution_status: 'failed',
        failure_reason: 'Task write failed',
      }),
    });

    expect(
      tx.behaviourPolicyEvaluation.create.mock.calls.map(
        (call) => (call[0] as { data: { stage: PolicyStage } }).data.stage,
      ),
    ).toContain('alerting');
    expect(incidentState.status).toBe('under_review');

    await module.close();
  });
});
