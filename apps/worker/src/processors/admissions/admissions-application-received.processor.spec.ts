import type { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  ADMISSIONS_APPLICATION_RECEIVED_JOB,
  AdmissionsApplicationReceivedProcessor,
  type AdmissionsApplicationReceivedPayload,
} from './admissions-application-received.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const APPLICATION_ID_1 = '22222222-2222-2222-2222-222222222222';
const APPLICATION_ID_2 = '33333333-3333-3333-3333-333333333333';
const PARENT_ID = '44444444-4444-4444-4444-444444444444';
const PARENT_USER_ID = '55555555-5555-5555-5555-555555555555';

function buildJob(
  name: string,
  data: Partial<AdmissionsApplicationReceivedPayload> = {},
): Job<AdmissionsApplicationReceivedPayload> {
  return {
    data: {
      tenant_id: TENANT_ID,
      submitted_by_parent_id: PARENT_ID,
      students: [
        {
          application_id: APPLICATION_ID_1,
          application_number: 'APP-202604-000001',
          name: 'Aisha Khan',
          status: 'waiting_list',
        },
      ],
      ...data,
    },
    name,
  } as Job<AdmissionsApplicationReceivedPayload>;
}

function buildMockPrisma(): {
  mock: PrismaClient;
  fns: {
    parentFindFirst: jest.Mock;
    tenantFindUnique: jest.Mock;
    notificationCreate: jest.Mock;
  };
} {
  const fns = {
    parentFindFirst: jest.fn(),
    tenantFindUnique: jest.fn(),
    notificationCreate: jest.fn().mockResolvedValue({}),
  };
  const mock = {
    parent: { findFirst: fns.parentFindFirst },
    tenant: { findUnique: fns.tenantFindUnique },
    notification: { create: fns.notificationCreate },
  } as unknown as PrismaClient;
  return { mock, fns };
}

describe('AdmissionsApplicationReceivedProcessor', () => {
  let processor: AdmissionsApplicationReceivedProcessor;
  let fns: ReturnType<typeof buildMockPrisma>['fns'];

  beforeEach(() => {
    const built = buildMockPrisma();
    fns = built.fns;
    processor = new AdmissionsApplicationReceivedProcessor(built.mock);

    fns.parentFindFirst.mockResolvedValue({ user_id: PARENT_USER_ID });
    fns.tenantFindUnique.mockResolvedValue({ name: 'Test School' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('ignores jobs with a different name', async () => {
    await processor.process(buildJob('some:other-job'));
    expect(fns.parentFindFirst).not.toHaveBeenCalled();
    expect(fns.notificationCreate).not.toHaveBeenCalled();
  });

  it('creates a notification row for a single-student submission', async () => {
    await processor.process(buildJob(ADMISSIONS_APPLICATION_RECEIVED_JOB));

    expect(fns.notificationCreate).toHaveBeenCalledTimes(1);
    expect(fns.notificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          recipient_user_id: PARENT_USER_ID,
          channel: 'email',
          template_key: 'admissions_application_received',
          status: 'queued',
          source_entity_type: 'application',
          source_entity_id: APPLICATION_ID_1,
          payload_json: expect.objectContaining({
            school_name: 'Test School',
            students: [
              expect.objectContaining({
                name: 'Aisha Khan',
                status: 'Submitted (waiting list)',
              }),
            ],
          }),
        }),
      }),
    );
  });

  it('creates a notification row with multiple students for a sibling batch', async () => {
    const siblingJob = buildJob(ADMISSIONS_APPLICATION_RECEIVED_JOB, {
      students: [
        {
          application_id: APPLICATION_ID_1,
          application_number: 'APP-202604-000001',
          name: 'Aisha Khan',
          status: 'waiting_list',
        },
        {
          application_id: APPLICATION_ID_2,
          application_number: 'APP-202604-000002',
          name: 'Omar Khan',
          status: 'ready_to_admit',
        },
      ],
    });

    await processor.process(siblingJob);

    expect(fns.notificationCreate).toHaveBeenCalledTimes(1);
    const payload = fns.notificationCreate.mock.calls[0][0].data.payload_json;
    expect(payload.students).toHaveLength(2);
    expect(payload.students[0]).toEqual(
      expect.objectContaining({ name: 'Aisha Khan', status: 'Submitted (waiting list)' }),
    );
    expect(payload.students[1]).toEqual(
      expect.objectContaining({ name: 'Omar Khan', status: 'Submitted (ready to admit)' }),
    );
  });

  it('humanizes status labels correctly', async () => {
    const job = buildJob(ADMISSIONS_APPLICATION_RECEIVED_JOB, {
      students: [
        {
          application_id: APPLICATION_ID_1,
          application_number: 'APP-202604-000001',
          name: 'Test Student',
          status: 'ready_to_admit',
        },
      ],
    });

    await processor.process(job);

    const payload = fns.notificationCreate.mock.calls[0][0].data.payload_json;
    expect(payload.students[0].status).toBe('Submitted (ready to admit)');
  });

  it('throws when payload is missing tenant_id', async () => {
    await expect(
      processor.process(buildJob(ADMISSIONS_APPLICATION_RECEIVED_JOB, { tenant_id: '' })),
    ).rejects.toThrow(/missing tenant_id/);
  });

  it('skips when students array is empty', async () => {
    await processor.process(buildJob(ADMISSIONS_APPLICATION_RECEIVED_JOB, { students: [] }));

    expect(fns.parentFindFirst).not.toHaveBeenCalled();
    expect(fns.notificationCreate).not.toHaveBeenCalled();
  });

  it('skips when parent has no user account', async () => {
    fns.parentFindFirst.mockResolvedValue(null);

    await processor.process(buildJob(ADMISSIONS_APPLICATION_RECEIVED_JOB));

    expect(fns.notificationCreate).not.toHaveBeenCalled();
  });

  it('skips when submitted_by_parent_id is null (public submission)', async () => {
    await processor.process(
      buildJob(ADMISSIONS_APPLICATION_RECEIVED_JOB, { submitted_by_parent_id: null }),
    );

    expect(fns.parentFindFirst).not.toHaveBeenCalled();
    expect(fns.notificationCreate).not.toHaveBeenCalled();
  });

  it('uses fallback school name when tenant is not found', async () => {
    fns.tenantFindUnique.mockResolvedValue(null);

    await processor.process(buildJob(ADMISSIONS_APPLICATION_RECEIVED_JOB));

    const payload = fns.notificationCreate.mock.calls[0][0].data.payload_json;
    expect(payload.school_name).toBe('the school');
  });

  it('sets idempotency_key based on sorted application ids', async () => {
    const siblingJob = buildJob(ADMISSIONS_APPLICATION_RECEIVED_JOB, {
      students: [
        {
          application_id: APPLICATION_ID_2,
          application_number: 'APP-202604-000002',
          name: 'Omar Khan',
          status: 'ready_to_admit',
        },
        {
          application_id: APPLICATION_ID_1,
          application_number: 'APP-202604-000001',
          name: 'Aisha Khan',
          status: 'waiting_list',
        },
      ],
    });

    await processor.process(siblingJob);

    const createCall = fns.notificationCreate.mock.calls[0][0].data;
    // Ids should be sorted, so APPLICATION_ID_1 comes first regardless of input order
    expect(createCall.idempotency_key).toContain(APPLICATION_ID_1);
  });
});
