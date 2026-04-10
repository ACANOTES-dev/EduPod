import { Job } from 'bullmq';

import {
  REPORT_CARD_AUTO_GENERATE_JOB,
  ReportCardAutoGenerateProcessor,
} from './report-card-auto-generate.processor';

const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';
const PERIOD_ID = '33333333-3333-3333-3333-333333333333';
const STUDENT_A_ID = '44444444-4444-4444-4444-444444444444';
const STUDENT_B_ID = '55555555-5555-5555-5555-555555555555';

function buildMockPrisma() {
  return {
    academicPeriod: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    classEnrolment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    reportCard: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    tenant: {
      findMany: jest.fn().mockResolvedValue([{ default_locale: 'en', id: TENANT_A_ID }]),
    },
  };
}

function buildJob(name: string = REPORT_CARD_AUTO_GENERATE_JOB): Job {
  return { data: {}, name } as unknown as Job;
}

describe('ReportCardAutoGenerateProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should skip tenants with no recently ended periods', async () => {
    const mockPrisma = buildMockPrisma();
    const processor = new ReportCardAutoGenerateProcessor(mockPrisma as never);

    await processor.process(buildJob());

    expect(mockPrisma.reportCard.createMany).not.toHaveBeenCalled();
  });

  it('should create draft report cards for students missing them', async () => {
    const mockPrisma = buildMockPrisma();
    mockPrisma.tenant.findMany.mockResolvedValue([
      { default_locale: 'en', id: TENANT_A_ID },
      { default_locale: 'ar', id: TENANT_B_ID },
    ]);
    mockPrisma.academicPeriod.findMany
      .mockResolvedValueOnce([{ id: PERIOD_ID, name: 'Term 2' }])
      .mockResolvedValueOnce([]);
    mockPrisma.classEnrolment.findMany.mockResolvedValue([
      { student_id: STUDENT_A_ID },
      { student_id: STUDENT_B_ID },
    ]);
    mockPrisma.reportCard.findMany.mockResolvedValue([{ student_id: STUDENT_A_ID }]);
    const processor = new ReportCardAutoGenerateProcessor(mockPrisma as never);

    await processor.process(buildJob());

    expect(mockPrisma.classEnrolment.findMany).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_A_ID,
        class_entity: {
          academic_year: {
            periods: {
              some: { id: PERIOD_ID },
            },
          },
        },
        status: 'active',
      },
      select: { student_id: true },
      distinct: ['student_id'],
    });
    expect(mockPrisma.reportCard.createMany).toHaveBeenCalledWith({
      data: [
        {
          tenant_id: TENANT_A_ID,
          student_id: STUDENT_B_ID,
          academic_period_id: PERIOD_ID,
          status: 'draft',
          template_locale: 'en',
          snapshot_payload_json: {},
        },
      ],
      skipDuplicates: true,
    });
  });
});
