import { Job } from 'bullmq';

import {
  BUDGETING_BOARD_PACK_RENDER_JOB,
  BoardPackRenderProcessor,
} from './board-pack-render.processor';

// Mock the renderer modules so this spec doesn't actually launch puppeteer
// or build an exceljs workbook — we're testing the orchestration: snapshot
// load → render → S3 upload → row update.
jest.mock('../../../../api/src/modules/budgeting/exports/pdf-renderer.service', () => ({
  PdfRendererService: jest.fn().mockImplementation(() => ({
    renderBoardPackPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock')),
  })),
}));

jest.mock('../../../../api/src/modules/budgeting/exports/excel-renderer.service', () => ({
  ExcelRendererService: jest.fn().mockImplementation(() => ({
    renderBoardPackExcel: jest.fn().mockResolvedValue(Buffer.from('PK\x03\x04 mock')),
  })),
}));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const SNAPSHOT_ID = '22222222-2222-4222-8222-222222222222';

function buildMockTx() {
  return {
    financialModelSnapshot: {
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
}

function buildMockPrisma(tx: ReturnType<typeof buildMockTx>) {
  return {
    $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  };
}

function buildMockS3() {
  return {
    upload: jest
      .fn()
      .mockImplementation(async (tenantId: string, key: string) => `${tenantId}/${key}`),
  };
}

const baseSnapshot = {
  id: SNAPSHOT_ID,
  version_number: 1,
  executive_summary: 's',
  published_at: new Date('2026-04-01'),
  payload: {
    schema_version: 1,
    model: { drivers: { capex_items: [] } },
    base_case: {
      line_items: [],
      totals_by_year: [],
      per_pupil_unit_economics: [],
    },
    scenarios: [],
  },
  tenant: { name: 'Acme', currency_code: 'EUR' },
  publisher: { first_name: 'Pub', last_name: 'Lisher', email: 'p@a' },
  parent_model: {
    name: 'FY26',
    fiscal_year_start: new Date('2026-09-01'),
    fiscal_year_end: new Date('2027-06-30'),
  },
};

describe('BoardPackRenderProcessor', () => {
  it('rejects payload without tenant_id', async () => {
    const tx = buildMockTx();
    const prisma = buildMockPrisma(tx);
    const s3 = buildMockS3();
    const proc = new BoardPackRenderProcessor(prisma as never, s3 as never);
    await proc.process({
      id: 'job',
      name: BUDGETING_BOARD_PACK_RENDER_JOB,
      data: { snapshot_id: SNAPSHOT_ID, format: 'all' },
    } as unknown as Job);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('renders both pdf and excel when format=all and updates the row', async () => {
    const tx = buildMockTx();
    tx.financialModelSnapshot.findFirst.mockResolvedValue(baseSnapshot);
    const prisma = buildMockPrisma(tx);
    const s3 = buildMockS3();
    const proc = new BoardPackRenderProcessor(prisma as never, s3 as never);
    await proc.process({
      id: 'job',
      name: BUDGETING_BOARD_PACK_RENDER_JOB,
      data: { tenant_id: TENANT_ID, snapshot_id: SNAPSHOT_ID, format: 'all' },
    } as unknown as Job);

    expect(s3.upload).toHaveBeenCalledTimes(2);
    const updateCall = tx.financialModelSnapshot.update.mock.calls[0]![0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(updateCall.where).toEqual({ id: SNAPSHOT_ID });
    expect(updateCall.data.pdf_object_key).toContain(SNAPSHOT_ID);
    expect(updateCall.data.excel_object_key).toContain(SNAPSHOT_ID);
    expect(updateCall.data.rendered_at).toBeInstanceOf(Date);
  });

  it('renders only pdf when format=pdf', async () => {
    const tx = buildMockTx();
    tx.financialModelSnapshot.findFirst.mockResolvedValue(baseSnapshot);
    const prisma = buildMockPrisma(tx);
    const s3 = buildMockS3();
    const proc = new BoardPackRenderProcessor(prisma as never, s3 as never);
    await proc.process({
      id: 'job',
      name: BUDGETING_BOARD_PACK_RENDER_JOB,
      data: { tenant_id: TENANT_ID, snapshot_id: SNAPSHOT_ID, format: 'pdf' },
    } as unknown as Job);

    expect(s3.upload).toHaveBeenCalledTimes(1);
    const updateCall = tx.financialModelSnapshot.update.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(updateCall.data.pdf_object_key).toBeDefined();
    expect(updateCall.data.excel_object_key).toBeUndefined();
  });

  it('skips silently when snapshot not found in tenant', async () => {
    const tx = buildMockTx();
    tx.financialModelSnapshot.findFirst.mockResolvedValue(null);
    const prisma = buildMockPrisma(tx);
    const s3 = buildMockS3();
    const proc = new BoardPackRenderProcessor(prisma as never, s3 as never);
    await proc.process({
      id: 'job',
      name: BUDGETING_BOARD_PACK_RENDER_JOB,
      data: { tenant_id: TENANT_ID, snapshot_id: SNAPSHOT_ID, format: 'all' },
    } as unknown as Job);
    expect(tx.financialModelSnapshot.update).not.toHaveBeenCalled();
    expect(s3.upload).not.toHaveBeenCalled();
  });

  it('ignores jobs with a different name', async () => {
    const tx = buildMockTx();
    const prisma = buildMockPrisma(tx);
    const s3 = buildMockS3();
    const proc = new BoardPackRenderProcessor(prisma as never, s3 as never);
    await proc.process({
      id: 'job',
      name: 'unrelated:job',
      data: { tenant_id: TENANT_ID, snapshot_id: SNAPSHOT_ID, format: 'all' },
    } as unknown as Job);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
