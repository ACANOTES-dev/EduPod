import type { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  ADMISSIONS_APPLICATION_WITHDRAWN_JOB,
  AdmissionsApplicationWithdrawnProcessor,
  type AdmissionsApplicationWithdrawnPayload,
} from './admissions-application-withdrawn.processor';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const APPLICATION_ID = '22222222-2222-2222-2222-222222222222';
const PARENT_ID = '33333333-3333-3333-3333-333333333333';
const PARENT_USER_ID = '44444444-4444-4444-4444-444444444444';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildJob(
  name: string,
  data: Partial<AdmissionsApplicationWithdrawnPayload> = {},
): Job<AdmissionsApplicationWithdrawnPayload> {
  return {
    data: {
      tenant_id: TENANT_ID,
      application_id: APPLICATION_ID,
      application_number: 'APP-202604-000001',
      student_first_name: 'Layla',
      student_last_name: 'Ahmed',
      submitted_by_parent_id: PARENT_ID,
      ...data,
    },
    name,
  } as Job<AdmissionsApplicationWithdrawnPayload>;
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AdmissionsApplicationWithdrawnProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('skips jobs with a different name', async () => {
    const { mock, fns } = buildMockPrisma();
    const processor = new AdmissionsApplicationWithdrawnProcessor(mock);
    await processor.process(buildJob('some-other-job'));
    expect(fns.notificationCreate).not.toHaveBeenCalled();
  });

  it('creates a queued email notification for the parent', async () => {
    const { mock, fns } = buildMockPrisma();
    fns.parentFindFirst.mockResolvedValue({ user_id: PARENT_USER_ID });
    fns.tenantFindUnique.mockResolvedValue({ name: 'Al-Noor Academy' });

    const processor = new AdmissionsApplicationWithdrawnProcessor(mock);
    await processor.process(buildJob(ADMISSIONS_APPLICATION_WITHDRAWN_JOB));

    expect(fns.notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenant_id: TENANT_ID,
        recipient_user_id: PARENT_USER_ID,
        channel: 'email',
        template_key: 'admissions_application_withdrawn',
        locale: 'en',
        status: 'queued',
        source_entity_type: 'application',
        source_entity_id: APPLICATION_ID,
        payload_json: expect.objectContaining({
          application_id: APPLICATION_ID,
          application_number: 'APP-202604-000001',
          student_name: 'Layla Ahmed',
          school_name: 'Al-Noor Academy',
        }),
      }),
    });
  });

  it('skips notification when there is no submitted_by_parent_id', async () => {
    const { mock, fns } = buildMockPrisma();

    const processor = new AdmissionsApplicationWithdrawnProcessor(mock);
    await processor.process(
      buildJob(ADMISSIONS_APPLICATION_WITHDRAWN_JOB, {
        submitted_by_parent_id: null,
      }),
    );

    expect(fns.notificationCreate).not.toHaveBeenCalled();
  });

  it('skips notification when the parent has no user account', async () => {
    const { mock, fns } = buildMockPrisma();
    fns.parentFindFirst.mockResolvedValue(null);

    const processor = new AdmissionsApplicationWithdrawnProcessor(mock);
    await processor.process(buildJob(ADMISSIONS_APPLICATION_WITHDRAWN_JOB));

    expect(fns.notificationCreate).not.toHaveBeenCalled();
  });

  it('uses fallback school name when tenant is not found', async () => {
    const { mock, fns } = buildMockPrisma();
    fns.parentFindFirst.mockResolvedValue({ user_id: PARENT_USER_ID });
    fns.tenantFindUnique.mockResolvedValue(null);

    const processor = new AdmissionsApplicationWithdrawnProcessor(mock);
    await processor.process(buildJob(ADMISSIONS_APPLICATION_WITHDRAWN_JOB));

    expect(fns.notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payload_json: expect.objectContaining({
          school_name: 'the school',
        }),
      }),
    });
  });

  it('throws when tenant_id is missing', async () => {
    const { mock } = buildMockPrisma();
    const processor = new AdmissionsApplicationWithdrawnProcessor(mock);

    await expect(
      processor.process(
        buildJob(ADMISSIONS_APPLICATION_WITHDRAWN_JOB, {
          tenant_id: '',
        } as unknown as Partial<AdmissionsApplicationWithdrawnPayload>),
      ),
    ).rejects.toThrow('Job rejected');
  });
});
