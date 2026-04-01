import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  WELLBEING_FLAG_EXPIRY_JOB,
  WellbeingFlagExpiryProcessor,
  type WellbeingFlagExpiryPayload,
} from './wellbeing-flag-expiry.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';
const AFFECTED_ID = '33333333-3333-3333-3333-333333333333';
const INCIDENT_ID = '44444444-4444-4444-4444-444444444444';

function buildJob(
  name: string,
  data: Partial<WellbeingFlagExpiryPayload> = {},
): Job<WellbeingFlagExpiryPayload> {
  return {
    data: {
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<WellbeingFlagExpiryPayload>;
}

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    criticalIncidentAffected: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: AFFECTED_ID,
          incident_id: INCIDENT_ID,
          student_id: STUDENT_ID,
        },
      ]),
      update: jest.fn().mockResolvedValue({ id: AFFECTED_ID }),
    },
    pastoralEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-id' }),
    },
  };
}

function buildMockPrisma(tx: ReturnType<typeof buildMockTx>) {
  return {
    $transaction: jest.fn(async (callback: (transactionClient: typeof tx) => Promise<void>) =>
      callback(tx),
    ),
  } as unknown as PrismaClient;
}

describe('WellbeingFlagExpiryProcessor', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const tx = buildMockTx();
    const processor = new WellbeingFlagExpiryProcessor(buildMockPrisma(tx));

    await processor.process(buildJob('pastoral:other-job'));

    expect(tx.criticalIncidentAffected.findMany).not.toHaveBeenCalled();
  });

  it('should deactivate expired flags and record an event for linked students', async () => {
    const tx = buildMockTx();
    const processor = new WellbeingFlagExpiryProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(WELLBEING_FLAG_EXPIRY_JOB));

    expect(tx.criticalIncidentAffected.update).toHaveBeenCalledWith({
      data: { wellbeing_flag_active: false },
      where: { id: AFFECTED_ID },
    });
    expect(tx.pastoralEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entity_id: INCIDENT_ID,
        entity_type: 'critical_incident',
        event_type: 'wellbeing_flag_expired',
        student_id: STUDENT_ID,
        tenant_id: TENANT_ID,
      }),
    });
  });

  it('should skip cleanly when there are no expired flags', async () => {
    const tx = buildMockTx();
    tx.criticalIncidentAffected.findMany.mockResolvedValue([]);

    const processor = new WellbeingFlagExpiryProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(WELLBEING_FLAG_EXPIRY_JOB));

    expect(tx.criticalIncidentAffected.update).not.toHaveBeenCalled();
    expect(tx.pastoralEvent.create).not.toHaveBeenCalled();
  });
});
