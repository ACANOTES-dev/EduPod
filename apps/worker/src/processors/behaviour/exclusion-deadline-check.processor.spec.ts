import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  BEHAVIOUR_EXCLUSION_DEADLINE_CHECK_JOB,
  BehaviourExclusionDeadlineCheckProcessor,
} from './exclusion-deadline-check.processor';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CASE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const DECIDED_BY_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

function buildMockPrisma() {
  const findMany = jest.fn();
  const taskFindFirst = jest.fn().mockResolvedValue(null);
  const taskCreate = jest.fn().mockResolvedValue({
    id: 'task-1',
    assigned_to_id: DECIDED_BY_ID,
    title: 'Exclusion EX-202604-000001 — Written notice to parents overdue',
  });
  const notificationCreate = jest.fn().mockResolvedValue({ id: 'notif-1' });
  const executeRaw = jest.fn().mockResolvedValue(undefined);

  const prisma = {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        behaviourExclusionCase: { findMany },
        behaviourTask: { findFirst: taskFindFirst, create: taskCreate },
        notification: { create: notificationCreate },
        $executeRaw: executeRaw,
      };
      return fn(tx);
    }),
  };

  return { prisma, findMany, taskFindFirst, taskCreate, notificationCreate };
}

function buildJob(payload: Record<string, unknown>, name = BEHAVIOUR_EXCLUSION_DEADLINE_CHECK_JOB) {
  return { name, data: payload } as unknown as Job;
}

describe('BehaviourExclusionDeadlineCheckProcessor', () => {
  it('creates task + notification when timeline step is breached', async () => {
    const m = buildMockPrisma();
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
    m.findMany.mockResolvedValue([
      {
        id: CASE_ID,
        case_number: 'EX-202604-000001',
        student_id: STUDENT_ID,
        decided_by_id: DECIDED_BY_ID,
        status: 'notice_issued',
        statutory_timeline: [
          {
            step: 'Written notice to parents',
            required_by: past,
            completed_at: null,
            status: 'pending',
          },
          {
            step: 'Hearing held',
            required_by: null,
            completed_at: null,
            status: 'not_started',
          },
        ],
      },
    ]);

    const proc = new BehaviourExclusionDeadlineCheckProcessor(m.prisma as unknown as PrismaClient);
    await proc.process(buildJob({ tenant_id: TENANT_ID }));

    expect(m.taskCreate).toHaveBeenCalledTimes(1);
    expect(m.notificationCreate).toHaveBeenCalledTimes(1);
    const notifCall = m.notificationCreate.mock.calls[0]![0] as { data: { payload_json: unknown } };
    expect((notifCall.data.payload_json as { event: string }).event).toBe('sla.breach');
  });

  it('skips task creation when an overdue task already exists for the step', async () => {
    const m = buildMockPrisma();
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
    m.findMany.mockResolvedValue([
      {
        id: CASE_ID,
        case_number: 'EX-202604-000002',
        student_id: STUDENT_ID,
        decided_by_id: null,
        status: 'notice_issued',
        statutory_timeline: [
          {
            step: 'Written notice to parents',
            required_by: past,
            completed_at: null,
            status: 'pending',
          },
        ],
      },
    ]);
    m.taskFindFirst.mockResolvedValue({ id: 'existing-task' });

    const proc = new BehaviourExclusionDeadlineCheckProcessor(m.prisma as unknown as PrismaClient);
    await proc.process(buildJob({ tenant_id: TENANT_ID }));

    expect(m.taskCreate).not.toHaveBeenCalled();
    expect(m.notificationCreate).not.toHaveBeenCalled();
  });

  it('ignores jobs with a non-matching name', async () => {
    const m = buildMockPrisma();
    const proc = new BehaviourExclusionDeadlineCheckProcessor(m.prisma as unknown as PrismaClient);
    await proc.process(buildJob({ tenant_id: TENANT_ID }, 'some:other-job'));
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws when tenant_id is missing', async () => {
    const m = buildMockPrisma();
    const proc = new BehaviourExclusionDeadlineCheckProcessor(m.prisma as unknown as PrismaClient);
    await expect(proc.process(buildJob({}))).rejects.toThrow(/tenant_id/);
  });
});
