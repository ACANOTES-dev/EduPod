/* eslint-disable import/order -- jest.mock must precede mocked imports */
const mockPage = {
  close: jest.fn().mockResolvedValue(undefined),
  pdf: jest.fn().mockResolvedValue(Buffer.from('pdf-content')),
  setContent: jest.fn().mockResolvedValue(undefined),
};

const mockBrowser = {
  close: jest.fn().mockResolvedValue(undefined),
  newPage: jest.fn().mockResolvedValue(mockPage),
};

const mockLaunch = jest.fn().mockResolvedValue(mockBrowser);
const mockRedisClient = {
  quit: jest.fn().mockResolvedValue(undefined),
  set: jest.fn().mockResolvedValue('OK'),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisClient);
});

jest.mock('puppeteer', () => ({
  __esModule: true,
  default: {
    launch: mockLaunch,
  },
}));

import { Job } from 'bullmq';

import {
  buildMassExportPdfKey,
  buildMassExportStatusKey,
  MASS_EXPORT_PDF_TTL_SECONDS,
  MASS_EXPORT_STATUS_TTL_SECONDS,
  PAYROLL_MASS_EXPORT_JOB,
} from '@school/shared/payroll';

import { type MassExportPayload, PayrollMassExportProcessor } from './mass-export.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const PAYROLL_RUN_ID = '22222222-2222-2222-2222-222222222222';

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    payslip: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    tenant: {
      findFirst: jest.fn().mockResolvedValue({ name: 'EduPod School' }),
    },
    tenantBranding: {
      findUnique: jest.fn().mockResolvedValue({
        logo_url: null,
        primary_color: '#2563eb',
        school_name_ar: null,
      }),
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
  name: string = PAYROLL_MASS_EXPORT_JOB,
  data: Partial<MassExportPayload> = {},
): Job<MassExportPayload> {
  return {
    data: {
      locale: 'en',
      payroll_run_id: PAYROLL_RUN_ID,
      requested_by_user_id: '33333333-3333-3333-3333-333333333333',
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<MassExportPayload>;
}

describe('PayrollMassExportProcessor', () => {
  beforeEach(() => {
    mockRedisClient.set.mockResolvedValue('OK');
    mockRedisClient.quit.mockResolvedValue(undefined);
    mockPage.close.mockResolvedValue(undefined);
    mockPage.pdf.mockResolvedValue(Buffer.from('pdf-content'));
    mockPage.setContent.mockResolvedValue(undefined);
    mockBrowser.close.mockResolvedValue(undefined);
    mockBrowser.newPage.mockResolvedValue(mockPage);
    mockLaunch.mockResolvedValue(mockBrowser);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const processor = new PayrollMassExportProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob('payroll:other-job'));

    expect(mockTx.payslip.findMany).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const mockTx = buildMockTx();
    const processor = new PayrollMassExportProcessor(buildMockPrisma(mockTx) as never);

    await expect(
      processor.process(buildJob(PAYROLL_MASS_EXPORT_JOB, { tenant_id: '' })),
    ).rejects.toThrow('Job rejected: missing tenant_id in payload.');
  });

  it('should mark the export completed with count 0 when no payslips exist', async () => {
    const mockTx = buildMockTx();
    const processor = new PayrollMassExportProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockRedisClient.set).toHaveBeenCalledWith(
      buildMassExportStatusKey(TENANT_ID, PAYROLL_RUN_ID),
      JSON.stringify({ status: 'completed', progress: 100, count: 0 }),
      'EX',
      MASS_EXPORT_STATUS_TTL_SECONDS,
    );
    expect(mockLaunch).not.toHaveBeenCalled();
    // Wave 3 — Redis client is owned by the processor (constructor-level
    // singleton); .quit() only happens in onModuleDestroy.
    expect(mockRedisClient.quit).not.toHaveBeenCalled();
  });

  it('should render the PDF bundle and store the export with the canonical 1200s TTL', async () => {
    const mockTx = buildMockTx();
    mockTx.payslip.findMany.mockResolvedValue([
      {
        id: 'payslip-1',
        payslip_number: 'PSL-202603-000001',
        snapshot_payload_json: {
          calculations: { basic_pay: 3000, bonus_pay: 0, total_pay: 3000 },
          compensation: { type: 'salaried' },
          period: { label: 'March 2026' },
          payslip_number: 'PSL-202603-000001',
          school: { currency_code: 'EUR' },
          staff: { department: 'Primary', full_name: 'Amina OBrien', job_title: 'Teacher' },
        },
      },
    ]);
    const processor = new PayrollMassExportProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockLaunch).toHaveBeenCalled();
    expect(mockPage.setContent).toHaveBeenCalled();
    expect(mockPage.pdf).toHaveBeenCalledWith({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
    });
    expect(mockRedisClient.set).toHaveBeenCalledWith(
      buildMassExportPdfKey(TENANT_ID, PAYROLL_RUN_ID),
      Buffer.from('pdf-content').toString('base64'),
      'EX',
      MASS_EXPORT_PDF_TTL_SECONDS,
    );
    expect(MASS_EXPORT_PDF_TTL_SECONDS).toBe(1200); // explicit guard against TTL drift
    expect(mockRedisClient.set).toHaveBeenCalledWith(
      buildMassExportStatusKey(TENANT_ID, PAYROLL_RUN_ID),
      expect.stringContaining('"status":"completed"'),
      'EX',
      MASS_EXPORT_STATUS_TTL_SECONDS,
    );
  });

  it('should write a failed redis status and rethrow when rendering fails', async () => {
    const mockTx = buildMockTx();
    mockTx.payslip.findMany.mockResolvedValue([
      {
        id: 'payslip-1',
        payslip_number: 'PSL-202603-000001',
        snapshot_payload_json: {},
      },
    ]);
    mockPage.pdf.mockRejectedValueOnce(new Error('render exploded'));
    const processor = new PayrollMassExportProcessor(buildMockPrisma(mockTx) as never);

    await expect(processor.process(buildJob())).rejects.toThrow('render exploded');

    expect(mockRedisClient.set).toHaveBeenCalledWith(
      buildMassExportStatusKey(TENANT_ID, PAYROLL_RUN_ID),
      JSON.stringify({ status: 'failed', error: 'render exploded' }),
      'EX',
      MASS_EXPORT_STATUS_TTL_SECONDS,
    );
  });

  it('should disconnect the redis client on module destroy', async () => {
    const mockTx = buildMockTx();
    const processor = new PayrollMassExportProcessor(buildMockPrisma(mockTx) as never);

    await processor.onModuleDestroy();

    expect(mockRedisClient.quit).toHaveBeenCalled();
  });
});
