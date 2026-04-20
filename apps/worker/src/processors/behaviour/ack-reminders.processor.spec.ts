import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  BEHAVIOUR_ACK_REMINDERS_JOB,
  BehaviourAckRemindersProcessor,
} from './ack-reminders.processor';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACK_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PARENT_USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function buildMockPrisma() {
  const ackFindMany = jest.fn();
  const notifFindFirst = jest.fn().mockResolvedValue(null);
  const notifCreate = jest.fn().mockResolvedValue({ id: 'notif-1' });
  const executeRaw = jest.fn().mockResolvedValue(undefined);

  const prisma = {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        behaviourParentAcknowledgement: { findMany: ackFindMany },
        notification: { findFirst: notifFindFirst, create: notifCreate },
        $executeRaw: executeRaw,
      };
      return fn(tx);
    }),
  };

  return { prisma, ackFindMany, notifFindFirst, notifCreate };
}

function buildJob(payload: Record<string, unknown>, name = BEHAVIOUR_ACK_REMINDERS_JOB) {
  return { name, data: payload } as unknown as Job;
}

describe('BehaviourAckRemindersProcessor', () => {
  it('sends reminder notification for stale ack with linked active parent', async () => {
    const m = buildMockPrisma();
    m.ackFindMany.mockResolvedValue([
      {
        id: ACK_ID,
        tenant_id: TENANT_ID,
        incident_id: 'incident-1',
        sanction_id: null,
        amendment_notice_id: null,
        sent_at: new Date('2026-04-01T00:00:00Z'),
        acknowledged_at: null,
        parent: { user_id: PARENT_USER_ID, status: 'active' },
      },
    ]);

    const proc = new BehaviourAckRemindersProcessor(m.prisma as unknown as PrismaClient);
    await proc.process(buildJob({ tenant_id: TENANT_ID }));

    expect(m.notifCreate).toHaveBeenCalledTimes(1);
    const call = m.notifCreate.mock.calls[0]![0] as {
      data: { template_key: string; payload_json: unknown; recipient_user_id: string };
    };
    expect(call.data.template_key).toBe('wellbeing_ack_reminder');
    expect(call.data.recipient_user_id).toBe(PARENT_USER_ID);
    expect((call.data.payload_json as { event: string }).event).toBe('reminder.acknowledgement');
  });

  it('skips ack rows without a linked parent user_id', async () => {
    const m = buildMockPrisma();
    m.ackFindMany.mockResolvedValue([
      {
        id: ACK_ID,
        tenant_id: TENANT_ID,
        sent_at: new Date('2026-04-01T00:00:00Z'),
        acknowledged_at: null,
        parent: { user_id: null, status: 'active' },
      },
    ]);

    const proc = new BehaviourAckRemindersProcessor(m.prisma as unknown as PrismaClient);
    await proc.process(buildJob({ tenant_id: TENANT_ID }));

    expect(m.notifCreate).not.toHaveBeenCalled();
  });

  it('skips when today reminder already exists (idempotent)', async () => {
    const m = buildMockPrisma();
    m.ackFindMany.mockResolvedValue([
      {
        id: ACK_ID,
        tenant_id: TENANT_ID,
        sent_at: new Date('2026-04-01T00:00:00Z'),
        acknowledged_at: null,
        parent: { user_id: PARENT_USER_ID, status: 'active' },
      },
    ]);
    m.notifFindFirst.mockResolvedValue({ id: 'existing-reminder' });

    const proc = new BehaviourAckRemindersProcessor(m.prisma as unknown as PrismaClient);
    await proc.process(buildJob({ tenant_id: TENANT_ID }));

    expect(m.notifCreate).not.toHaveBeenCalled();
  });

  it('ignores non-matching job names', async () => {
    const m = buildMockPrisma();
    const proc = new BehaviourAckRemindersProcessor(m.prisma as unknown as PrismaClient);
    await proc.process(buildJob({ tenant_id: TENANT_ID }, 'other:job'));
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
  });
});
