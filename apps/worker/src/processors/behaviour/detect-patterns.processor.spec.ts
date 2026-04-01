import { Job } from 'bullmq';

import {
  BEHAVIOUR_DETECT_PATTERNS_JOB,
  type DetectPatternsPayload,
  DetectPatternsProcessor,
} from './detect-patterns.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';
const SECOND_STUDENT_ID = '33333333-3333-3333-3333-333333333333';
const STAFF_ID = '44444444-4444-4444-4444-444444444444';
const ADMIN_ID = '55555555-5555-5555-5555-555555555555';
const SUBJECT_ID = '66666666-6666-6666-6666-666666666666';
const OTHER_SUBJECT_ID = '77777777-7777-7777-7777-777777777777';
const THIRD_SUBJECT_ID = '88888888-8888-8888-8888-888888888888';
const INTERVENTION_ID = '99999999-9999-9999-9999-999999999999';
const SANCTION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

interface ParticipantGroupRow {
  _count: number;
  student_id: string | null;
}

interface SubjectGroupRow {
  _count: number;
  subject_id: string | null;
}

interface OverdueInterventionRow {
  assigned_to_id: string;
  id: string;
  next_review_date: Date | null;
  student_id: string;
}

interface CompletionInterventionRow {
  assigned_to_id: string;
  id: string;
  intervention_number: string;
  student_id: string;
  target_end_date: Date | null;
}

interface UpcomingReturnRow {
  id: string;
  student_id: string;
  suspension_end_date: Date | null;
}

interface MatchedEvaluationRow {
  _count: { action_executions: number };
  id: string;
  incident_id: string;
  student_id: string;
}

interface BuildMockTxOptions {
  adminUserIds?: string[];
  approachingCompletion?: CompletionInterventionRow[];
  existingAlertKeys?: string[];
  existingCompletionReminderEntityIds?: string[];
  existingReturnCheckInEntityIds?: string[];
  incidentsBySubject?: SubjectGroupRow[];
  lastLoggedAtByStaff?: Record<string, Date | null>;
  matchedEvaluations?: MatchedEvaluationRow[];
  overdueInterventions?: OverdueInterventionRow[];
  priorNegatives?: ParticipantGroupRow[];
  recentNegativeCountByStudent?: Record<string, number>;
  recentNegatives?: ParticipantGroupRow[];
  recentPositiveCountByStudent?: Record<string, number>;
  staffWithLogPermission?: string[];
  studentsWithPriorPositive?: ParticipantGroupRow[];
  upcomingReturns?: UpcomingReturnRow[];
}

function existingAlertKey(params: {
  alertType: string;
  staffId?: string;
  studentId?: string;
  subjectId?: string;
}): string {
  return [
    params.alertType,
    params.studentId ?? 'null',
    params.subjectId ?? 'null',
    params.staffId ?? 'null',
  ].join('::');
}

function buildMockTx(options: BuildMockTxOptions = {}) {
  const existingAlertKeys = new Set(options.existingAlertKeys ?? []);
  const existingCompletionReminderEntityIds = new Set(
    options.existingCompletionReminderEntityIds ?? [],
  );
  const existingReturnCheckInEntityIds = new Set(options.existingReturnCheckInEntityIds ?? []);

  let participantGroupByCall = 0;

  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    behaviourAlert: {
      create: jest.fn().mockImplementation(async (args: { data: { alert_type: string } }) => ({
        id: `alert-${args.data.alert_type}`,
      })),
      findFirst: jest.fn().mockImplementation(
        async (args: {
          where: {
            alert_type: string;
            staff_id?: string;
            student_id?: string;
            subject_id?: string;
          };
        }) => {
          const key = existingAlertKey({
            alertType: args.where.alert_type,
            staffId: args.where.staff_id,
            studentId: args.where.student_id,
            subjectId: args.where.subject_id,
          });

          return existingAlertKeys.has(key) ? { id: `existing-${key}` } : null;
        },
      ),
      update: jest.fn().mockResolvedValue({ id: 'updated-alert-id' }),
    },
    behaviourAlertRecipient: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    behaviourIncident: {
      findFirst: jest
        .fn()
        .mockImplementation(async (args: { where: { reported_by_id: string } }) => {
          const occurredAt = options.lastLoggedAtByStaff?.[args.where.reported_by_id];

          return occurredAt ? { occurred_at: occurredAt } : null;
        }),
      groupBy: jest.fn().mockResolvedValue(options.incidentsBySubject ?? []),
    },
    behaviourIncidentParticipant: {
      count: jest.fn().mockImplementation(
        async (args: {
          where: {
            incident: { polarity: string };
            student_id: string;
          };
        }) => {
          if (args.where.incident.polarity === 'positive') {
            return options.recentPositiveCountByStudent?.[args.where.student_id] ?? 0;
          }

          return options.recentNegativeCountByStudent?.[args.where.student_id] ?? 0;
        },
      ),
      groupBy: jest.fn().mockImplementation(async () => {
        participantGroupByCall += 1;

        if (participantGroupByCall === 1) {
          return options.recentNegatives ?? [];
        }

        if (participantGroupByCall === 2) {
          return options.priorNegatives ?? [];
        }

        return options.studentsWithPriorPositive ?? [];
      }),
    },
    behaviourIntervention: {
      findMany: jest
        .fn()
        .mockImplementation(
          async (args: { where: { next_review_date?: unknown; target_end_date?: unknown } }) => {
            if (args.where.next_review_date) {
              return options.overdueInterventions ?? [];
            }

            return options.approachingCompletion ?? [];
          },
        ),
    },
    behaviourPolicyEvaluation: {
      findMany: jest.fn().mockResolvedValue(options.matchedEvaluations ?? []),
    },
    behaviourSanction: {
      findMany: jest.fn().mockResolvedValue(options.upcomingReturns ?? []),
    },
    behaviourTask: {
      create: jest.fn().mockResolvedValue({ id: 'created-task-id' }),
      findFirst: jest.fn().mockImplementation(
        async (args: {
          where: {
            entity_id: string;
            entity_type: string;
          };
        }) => {
          if (args.where.entity_type === 'intervention') {
            return existingCompletionReminderEntityIds.has(args.where.entity_id)
              ? { id: 'existing-completion-task-id' }
              : null;
          }

          if (args.where.entity_type === 'sanction') {
            return existingReturnCheckInEntityIds.has(args.where.entity_id)
              ? { id: 'existing-return-task-id' }
              : null;
          }

          return null;
        },
      ),
    },
    tenantMembership: {
      findMany: jest.fn().mockImplementation(
        async (args: {
          where: {
            membership_roles: {
              some: {
                role: {
                  role_permissions: {
                    some: { permission: { permission_key: string } };
                  };
                };
              };
            };
          };
        }) => {
          const permissionKey =
            args.where.membership_roles.some.role.role_permissions.some.permission.permission_key;

          if (permissionKey === 'behaviour.log') {
            return (options.staffWithLogPermission ?? []).map((user_id) => ({
              user_id,
            }));
          }

          return (options.adminUserIds ?? []).map((user_id) => ({ user_id }));
        },
      ),
    },
  };
}

type MockTx = ReturnType<typeof buildMockTx>;

function buildMockPrisma(mockTx: MockTx) {
  return {
    $transaction: jest.fn(async (callback: (tx: MockTx) => Promise<unknown>) => callback(mockTx)),
  };
}

function buildJob(
  name: string = BEHAVIOUR_DETECT_PATTERNS_JOB,
  data: Partial<DetectPatternsPayload> = {},
): Job<DetectPatternsPayload> {
  return {
    data: {
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<DetectPatternsPayload>;
}

describe('DetectPatternsProcessor', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new DetectPatternsProcessor(mockPrisma as never);

    await processor.process(buildJob('behaviour:other-job'));

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new DetectPatternsProcessor(mockPrisma as never);

    await expect(
      processor.process(buildJob(BEHAVIOUR_DETECT_PATTERNS_JOB, { tenant_id: undefined })),
    ).rejects.toThrow('missing tenant_id');
  });

  it('should create escalating student alerts and assign recipients', async () => {
    const mockTx = buildMockTx({
      adminUserIds: [ADMIN_ID],
      priorNegatives: [{ _count: 1, student_id: STUDENT_ID }],
      recentNegatives: [{ _count: 4, student_id: STUDENT_ID }],
    });
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new DetectPatternsProcessor(mockPrisma as never);

    await processor.process(buildJob());

    expect(mockTx.behaviourAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        alert_type: 'escalating_student',
        severity: 'warning',
        student_id: STUDENT_ID,
      }),
    });
    expect(mockTx.behaviourAlertRecipient.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          alert_id: 'alert-escalating_student',
          recipient_id: ADMIN_ID,
        }),
      ],
    });
  });

  it('should update existing active alerts instead of creating duplicates', async () => {
    const mockTx = buildMockTx({
      existingAlertKeys: [
        existingAlertKey({
          alertType: 'escalating_student',
          studentId: STUDENT_ID,
        }),
      ],
      priorNegatives: [{ _count: 1, student_id: STUDENT_ID }],
      recentNegatives: [{ _count: 4, student_id: STUDENT_ID }],
    });
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new DetectPatternsProcessor(mockPrisma as never);

    await processor.process(buildJob());

    expect(mockTx.behaviourAlert.update).toHaveBeenCalledWith({
      where: { id: expect.stringContaining('escalating_student') },
      data: expect.objectContaining({
        title: expect.stringContaining('Escalating behaviour'),
      }),
    });
    expect(mockTx.behaviourAlert.create).not.toHaveBeenCalled();
  });

  it('should create disengaging student alerts when positive activity disappears and negative incidents remain', async () => {
    const mockTx = buildMockTx({
      adminUserIds: [ADMIN_ID],
      recentNegativeCountByStudent: { [STUDENT_ID]: 2 },
      recentPositiveCountByStudent: { [STUDENT_ID]: 0 },
      studentsWithPriorPositive: [{ _count: 3, student_id: STUDENT_ID }],
    });
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new DetectPatternsProcessor(mockPrisma as never);

    await processor.process(buildJob());

    expect(mockTx.behaviourAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        alert_type: 'disengaging_student',
        severity: 'info',
        student_id: STUDENT_ID,
      }),
    });
  });

  it('should create logging gap alerts for staff with behaviour.log permission and stale activity', async () => {
    const mockTx = buildMockTx({
      adminUserIds: [ADMIN_ID],
      lastLoggedAtByStaff: {
        [STAFF_ID]: new Date('2026-03-01T09:00:00.000Z'),
      },
      staffWithLogPermission: [STAFF_ID],
    });
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new DetectPatternsProcessor(mockPrisma as never);

    await processor.process(buildJob());

    expect(mockTx.behaviourAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        alert_type: 'logging_gap',
        staff_id: STAFF_ID,
        severity: 'info',
      }),
    });
  });

  it('should create overdue review alerts and completion reminder tasks', async () => {
    const mockTx = buildMockTx({
      adminUserIds: [ADMIN_ID],
      overdueInterventions: [
        {
          assigned_to_id: STAFF_ID,
          id: INTERVENTION_ID,
          next_review_date: new Date('2026-03-25T09:00:00.000Z'),
          student_id: STUDENT_ID,
        },
      ],
      approachingCompletion: [
        {
          assigned_to_id: STAFF_ID,
          id: INTERVENTION_ID,
          intervention_number: 'INT-001',
          student_id: STUDENT_ID,
          target_end_date: new Date('2026-04-08T09:00:00.000Z'),
        },
      ],
    });
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new DetectPatternsProcessor(mockPrisma as never);

    await processor.process(buildJob());

    expect(mockTx.behaviourAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        alert_type: 'overdue_review',
        student_id: STUDENT_ID,
      }),
    });
    expect(mockTx.behaviourTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entity_id: INTERVENTION_ID,
        entity_type: 'intervention',
        title: expect.stringContaining('Completion reminder:'),
      }),
    });
  });

  it('should skip duplicate completion reminder tasks when one already exists', async () => {
    const mockTx = buildMockTx({
      approachingCompletion: [
        {
          assigned_to_id: STAFF_ID,
          id: INTERVENTION_ID,
          intervention_number: 'INT-001',
          student_id: STUDENT_ID,
          target_end_date: new Date('2026-04-08T09:00:00.000Z'),
        },
      ],
      existingCompletionReminderEntityIds: [INTERVENTION_ID],
    });
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new DetectPatternsProcessor(mockPrisma as never);

    await processor.process(buildJob());

    expect(mockTx.behaviourTask.create).not.toHaveBeenCalled();
  });

  it('should create hotspot, suspension return, and policy threshold breach alerts', async () => {
    const mockTx = buildMockTx({
      adminUserIds: [ADMIN_ID],
      incidentsBySubject: [
        { _count: 10, subject_id: SUBJECT_ID },
        { _count: 2, subject_id: OTHER_SUBJECT_ID },
        { _count: 1, subject_id: THIRD_SUBJECT_ID },
      ],
      matchedEvaluations: [
        {
          _count: { action_executions: 0 },
          id: 'eval-1',
          incident_id: 'incident-1',
          student_id: STUDENT_ID,
        },
        {
          _count: { action_executions: 1 },
          id: 'eval-2',
          incident_id: 'incident-2',
          student_id: STUDENT_ID,
        },
      ],
      upcomingReturns: [
        {
          id: SANCTION_ID,
          student_id: SECOND_STUDENT_ID,
          suspension_end_date: new Date('2026-04-03T09:00:00.000Z'),
        },
      ],
    });
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new DetectPatternsProcessor(mockPrisma as never);

    await processor.process(buildJob());

    const createdAlertTypes = mockTx.behaviourAlert.create.mock.calls.map(
      (call) => (call[0] as { data: { alert_type: string } }).data.alert_type,
    );

    expect(createdAlertTypes).toEqual(
      expect.arrayContaining(['hotspot', 'suspension_return', 'policy_threshold_breach']),
    );
  });
});
