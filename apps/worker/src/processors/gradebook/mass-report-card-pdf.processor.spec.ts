import { Job } from 'bullmq';

import {
  MASS_REPORT_CARD_PDF_JOB,
  type MassReportCardPdfPayload,
  MassReportCardPdfProcessor,
} from './mass-report-card-pdf.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const PERIOD_ID = '22222222-2222-2222-2222-222222222222';
const REPORT_CARD_A = '33333333-3333-3333-3333-333333333333';
const REPORT_CARD_B = '44444444-4444-4444-4444-444444444444';

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    reportCard: {
      findMany: jest.fn().mockResolvedValue([]),
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
  name: string = MASS_REPORT_CARD_PDF_JOB,
  data: Partial<MassReportCardPdfPayload> = {},
): Job<MassReportCardPdfPayload> {
  return {
    data: {
      academic_period_id: PERIOD_ID,
      report_card_ids: [REPORT_CARD_A, REPORT_CARD_B],
      requested_by_user_id: '55555555-5555-5555-5555-555555555555',
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<MassReportCardPdfPayload>;
}

describe('MassReportCardPdfProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const processor = new MassReportCardPdfProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob('gradebook:other-job'));

    expect(mockTx.reportCard.findMany).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const mockTx = buildMockTx();
    const processor = new MassReportCardPdfProcessor(buildMockPrisma(mockTx) as never);

    await expect(
      processor.process(buildJob(MASS_REPORT_CARD_PDF_JOB, { tenant_id: '' })),
    ).rejects.toThrow('Job rejected: missing tenant_id in payload.');
  });

  it('should load only published report cards from the requested batch', async () => {
    const mockTx = buildMockTx();
    mockTx.reportCard.findMany.mockResolvedValue([
      {
        id: REPORT_CARD_A,
        snapshot_payload_json: { student_name: 'Amina OBrien' },
        template_locale: 'en',
      },
    ]);
    const processor = new MassReportCardPdfProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.reportCard.findMany).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        id: { in: [REPORT_CARD_A, REPORT_CARD_B] },
        status: 'published',
      },
      select: {
        id: true,
        template_locale: true,
        snapshot_payload_json: true,
      },
    });
  });

  it('should be safe to rerun the same PDF batch payload', async () => {
    const mockTx = buildMockTx();
    mockTx.reportCard.findMany.mockResolvedValue([
      {
        id: REPORT_CARD_A,
        snapshot_payload_json: { student_name: 'Amina OBrien' },
        template_locale: 'en',
      },
    ]);
    const processor = new MassReportCardPdfProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());
    await processor.process(buildJob());

    expect(mockTx.reportCard.findMany).toHaveBeenCalledTimes(2);
  });
});
