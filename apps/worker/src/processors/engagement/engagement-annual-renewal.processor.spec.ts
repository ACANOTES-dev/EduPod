import { PrismaClient } from '@prisma/client';

import {
  ANNUAL_CONSENT_RENEWAL_JOB,
  EngagementAnnualRenewalProcessor,
} from './engagement-annual-renewal.processor';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACTIVE_YEAR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const TEMPLATE_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const USER_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildMockTx(options?: {
  activeYear?: { id: string; name: string } | null;
  renewableRecords?: Array<{
    id: string;
    student_id: string;
    form_template_id: string;
    student: { first_name: string; last_name: string };
    form_template: { name: string };
  }>;
  existingRenewals?: Array<{ student_id: string; form_template_id: string }>;
  parentLinks?: Array<{ student_id: string; parent: { user_id: string | null } }>;
}) {
  return {
    academicYear: {
      findFirst: jest.fn().mockResolvedValue(
        options?.activeYear === undefined
          ? {
              id: ACTIVE_YEAR_ID,
              name: '2026/2027',
              start_date: new Date('2026-09-01T00:00:00.000Z'),
              end_date: new Date('2027-06-30T00:00:00.000Z'),
            }
          : options.activeYear,
      ),
    },
    engagementConsentRecord: {
      findMany: jest.fn().mockResolvedValue(
        options?.renewableRecords ?? [
          {
            id: 'renewal-1',
            student_id: STUDENT_ID,
            form_template_id: TEMPLATE_ID,
            student: { first_name: 'Layla', last_name: 'Khan' },
            form_template: { name: 'Medical consent' },
          },
        ],
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    engagementFormSubmission: {
      findMany: jest.fn().mockResolvedValue(options?.existingRenewals ?? []),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    studentParent: {
      findMany: jest.fn().mockResolvedValue(
        options?.parentLinks ?? [
          {
            student_id: STUDENT_ID,
            parent: { user_id: USER_ID },
          },
        ],
      ),
    },
    notification: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
}

function buildMockPrisma(mockTx: ReturnType<typeof buildMockTx>) {
  return {
    tenant: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: TENANT_ID,
          default_locale: 'en',
        },
      ]),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  } as unknown as PrismaClient;
}

function buildJob(name: string = ANNUAL_CONSENT_RENEWAL_JOB) {
  return { name, data: {} };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('EngagementAnnualRenewalProcessor', () => {
  afterEach(() => jest.clearAllMocks());

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new EngagementAnnualRenewalProcessor(mockPrisma);

    await processor.process(buildJob('engagement:other-job') as never);

    expect(mockPrisma.tenant.findMany).not.toHaveBeenCalled();
  });

  it('should expire old annual consents and create new pending submissions', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new EngagementAnnualRenewalProcessor(mockPrisma);

    await processor.process(buildJob() as never);

    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mockTx.engagementConsentRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          consent_type: 'annual',
          status: 'active',
          academic_year_id: { not: ACTIVE_YEAR_ID },
        }),
      }),
    );
    expect(mockTx.engagementFormSubmission.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            tenant_id: TENANT_ID,
            student_id: STUDENT_ID,
            form_template_id: TEMPLATE_ID,
            academic_year_id: ACTIVE_YEAR_ID,
            status: 'pending',
          }),
        ]),
      }),
    );
    expect(mockTx.engagementConsentRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          id: { in: ['renewal-1'] },
        }),
        data: { status: 'expired' },
      }),
    );
    expect(mockTx.notification.createMany).toHaveBeenCalled();
  });

  it('should skip renewal creation when a current-year submission already exists', async () => {
    const mockTx = buildMockTx({
      existingRenewals: [{ student_id: STUDENT_ID, form_template_id: TEMPLATE_ID }],
    });
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new EngagementAnnualRenewalProcessor(mockPrisma);

    await processor.process(buildJob() as never);

    expect(mockTx.engagementFormSubmission.createMany).not.toHaveBeenCalled();
    expect(mockTx.notification.createMany).not.toHaveBeenCalled();
    expect(mockTx.engagementConsentRecord.updateMany).toHaveBeenCalled();
  });

  it('should skip tenants without an active academic year', async () => {
    const mockTx = buildMockTx({ activeYear: null });
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new EngagementAnnualRenewalProcessor(mockPrisma);

    await processor.process(buildJob() as never);

    expect(mockTx.engagementConsentRecord.findMany).not.toHaveBeenCalled();
    expect(mockTx.engagementFormSubmission.createMany).not.toHaveBeenCalled();
    expect(mockTx.notification.createMany).not.toHaveBeenCalled();
  });
});
