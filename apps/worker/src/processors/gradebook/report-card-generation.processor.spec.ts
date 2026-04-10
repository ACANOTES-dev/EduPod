import { PrismaClient } from '@prisma/client';

import type { ReportCardRenderer } from '../report-card-render.contract';

import {
  NullReportCardStorageWriter,
  REPORT_CARD_GENERATION_JOB,
  ReportCardGenerationJob,
  type ReportCardGenerationPayload,
} from './report-card-generation.processor';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BATCH_JOB_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TEMPLATE_ID_EN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TEMPLATE_ID_AR = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PERIOD_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const CLASS_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const STUDENT_EN = '11111111-1111-4111-8111-111111111111';
const STUDENT_AR = '22222222-2222-4222-8222-222222222222';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function baseBatchJob(overrides: Record<string, unknown> = {}) {
  return {
    id: BATCH_JOB_ID,
    tenant_id: TENANT_ID,
    class_id: CLASS_ID,
    academic_period_id: PERIOD_ID,
    template_id: TEMPLATE_ID_EN,
    status: 'queued',
    scope_type: 'class',
    scope_ids_json: [CLASS_ID],
    personal_info_fields_json: ['full_name'],
    languages_requested: ['en', 'ar'],
    students_generated_count: 0,
    students_blocked_count: 0,
    total_count: 0,
    errors_json: [],
    requested_by_user_id: 'user-1',
    ...overrides,
  };
}

function buildMockTx(overrides?: {
  batchJob?: Record<string, unknown> | null;
  tenant?: Record<string, unknown> | null;
  template?: Record<string, unknown> | null;
  arTemplate?: Record<string, unknown> | null;
  period?: Record<string, unknown> | null;
  enrolments?: Array<{ student_id: string; class_id: string }>;
  students?: Array<Record<string, unknown>>;
  snapshots?: Array<Record<string, unknown>>;
  subjectComments?: Array<Record<string, unknown>>;
  overallComments?: Array<Record<string, unknown>>;
  existingReportCard?: Record<string, unknown> | null;
}) {
  const batchJobUpdate = jest.fn().mockResolvedValue({});
  const reportCardFindFirst = jest.fn().mockResolvedValue(overrides?.existingReportCard ?? null);
  const reportCardUpdate = jest.fn().mockResolvedValue({ id: 'rc-1' });
  const reportCardCreate = jest.fn().mockResolvedValue({ id: 'rc-1' });

  const templateFindFirst = jest
    .fn()
    // First call (en template load)
    .mockResolvedValueOnce(
      overrides?.template ?? {
        id: TEMPLATE_ID_EN,
        tenant_id: TENANT_ID,
        locale: 'en',
        content_scope: 'grades_only',
        branding_overrides_json: null,
      },
    )
    // Second call (ar template lookup)
    .mockResolvedValueOnce(
      overrides?.arTemplate === undefined
        ? {
            id: TEMPLATE_ID_AR,
            tenant_id: TENANT_ID,
            locale: 'ar',
            content_scope: 'grades_only',
            branding_overrides_json: null,
          }
        : overrides.arTemplate,
    );

  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    reportCardBatchJob: {
      findFirst: jest.fn().mockResolvedValue(overrides?.batchJob ?? baseBatchJob()),
      update: batchJobUpdate,
    },
    tenant: {
      findFirst: jest.fn().mockResolvedValue(
        overrides?.tenant ?? {
          id: TENANT_ID,
          name: 'Test School',
          default_locale: 'en',
          branding: { logo_url: 'http://example.com/logo.png' },
        },
      ),
    },
    reportCardTenantSettings: {
      findFirst: jest.fn().mockResolvedValue({
        settings_json: {
          show_top_rank_badge: false,
          principal_signature_storage_key: null,
          principal_name: null,
        },
      }),
    },
    reportCardTemplate: {
      findFirst: templateFindFirst,
    },
    classEnrolment: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          overrides?.enrolments ?? [{ student_id: STUDENT_EN, class_id: CLASS_ID }],
        ),
    },
    class: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    academicPeriod: {
      findFirst: jest.fn().mockResolvedValue(
        overrides?.period ?? {
          id: PERIOD_ID,
          name: 'Term 1',
          academic_year: { name: '2025-2026' },
        },
      ),
    },
    student: {
      findMany: jest.fn().mockResolvedValue(overrides?.students ?? [buildStudent(STUDENT_EN)]),
    },
    periodGradeSnapshot: {
      findMany: jest.fn().mockResolvedValue(overrides?.snapshots ?? []),
    },
    reportCardSubjectComment: {
      findMany: jest.fn().mockResolvedValue(overrides?.subjectComments ?? []),
    },
    reportCardOverallComment: {
      findMany: jest.fn().mockResolvedValue(overrides?.overallComments ?? []),
    },
    reportCard: {
      findFirst: reportCardFindFirst,
      update: reportCardUpdate,
      create: reportCardCreate,
    },
  };

  return { tx, batchJobUpdate, reportCardFindFirst, reportCardUpdate, reportCardCreate };
}

function buildStudent(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    first_name: 'Ali',
    last_name: 'Hassan',
    student_number: 'STU001',
    date_of_birth: new Date('2015-05-01'),
    gender: 'male',
    nationality: null,
    entry_date: null,
    preferred_second_language: null,
    year_group: { id: 'yg-1', name: 'Year 5' },
    homeroom_class: { id: CLASS_ID, name: '5A' },
    ...overrides,
  };
}

function buildFakeRenderer(): { renderer: ReportCardRenderer; render: jest.Mock } {
  const render = jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4\n%%EOF', 'latin1'));
  return { renderer: { render }, render };
}

// Build a fake prisma client that proxies $transaction to the provided tx
// while bypassing RLS setup for the unit spec.
function buildFakePrisma(tx: unknown): PrismaClient {
  return {
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaClient;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ReportCardGenerationProcessor — job name constant', () => {
  it('exports the conventional job name', () => {
    expect(REPORT_CARD_GENERATION_JOB).toBe('report-cards:generate');
  });
});

describe('ReportCardGenerationJob — tenant isolation guard', () => {
  it('rejects a job without tenant_id', async () => {
    const storage = new NullReportCardStorageWriter();
    const { renderer } = buildFakeRenderer();
    const prisma = buildFakePrisma({});
    const job = new ReportCardGenerationJob(prisma, renderer, storage);

    await expect(
      job.execute({ batch_job_id: BATCH_JOB_ID } as unknown as ReportCardGenerationPayload),
    ).rejects.toThrow(/tenant_id/);
  });

  it('rejects a job with an invalid tenant_id format', async () => {
    const storage = new NullReportCardStorageWriter();
    const { renderer } = buildFakeRenderer();
    const prisma = buildFakePrisma({});
    const job = new ReportCardGenerationJob(prisma, renderer, storage);

    await expect(
      job.execute({ tenant_id: 'not-a-uuid', batch_job_id: BATCH_JOB_ID }),
    ).rejects.toThrow(/invalid tenant_id/);
  });
});

describe('ReportCardGenerationJob — happy path', () => {
  it('generates a single english report card for a scope with one student', async () => {
    const { tx, batchJobUpdate, reportCardCreate } = buildMockTx();
    const { renderer, render } = buildFakeRenderer();
    const storage = new NullReportCardStorageWriter();
    const prisma = buildFakePrisma(tx);
    const job = new ReportCardGenerationJob(prisma, renderer, storage);

    await job.execute({ tenant_id: TENANT_ID, batch_job_id: BATCH_JOB_ID });

    expect(render).toHaveBeenCalledTimes(1);
    expect(reportCardCreate).toHaveBeenCalledTimes(1);
    // pending → running → completed
    expect(batchJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'processing' }),
      }),
    );
    expect(batchJobUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'completed',
          students_generated_count: 1,
          students_blocked_count: 0,
        }),
      }),
    );
  });

  it('renders an additional arabic PDF for ar-preferred students', async () => {
    const { tx, reportCardCreate } = buildMockTx({
      enrolments: [
        { student_id: STUDENT_EN, class_id: CLASS_ID },
        { student_id: STUDENT_AR, class_id: CLASS_ID },
      ],
      students: [
        buildStudent(STUDENT_EN, { preferred_second_language: null }),
        buildStudent(STUDENT_AR, { preferred_second_language: 'ar' }),
      ],
    });
    const { renderer, render } = buildFakeRenderer();
    const storage = new NullReportCardStorageWriter();
    const prisma = buildFakePrisma(tx);
    const job = new ReportCardGenerationJob(prisma, renderer, storage);

    await job.execute({ tenant_id: TENANT_ID, batch_job_id: BATCH_JOB_ID });

    // 2 students + 1 second-language copy = 3 render calls
    expect(render).toHaveBeenCalledTimes(3);
    expect(reportCardCreate).toHaveBeenCalledTimes(3);
  });

  it('does NOT render an ar copy when the template has no ar locale row', async () => {
    const { tx, reportCardCreate } = buildMockTx({
      enrolments: [{ student_id: STUDENT_AR, class_id: CLASS_ID }],
      students: [buildStudent(STUDENT_AR, { preferred_second_language: 'ar' })],
      arTemplate: null,
    });
    const { renderer, render } = buildFakeRenderer();
    const storage = new NullReportCardStorageWriter();
    const prisma = buildFakePrisma(tx);
    const job = new ReportCardGenerationJob(prisma, renderer, storage);

    await job.execute({ tenant_id: TENANT_ID, batch_job_id: BATCH_JOB_ID });

    expect(render).toHaveBeenCalledTimes(1); // en only
    expect(reportCardCreate).toHaveBeenCalledTimes(1);
  });

  it('continues on per-student errors and increments students_blocked_count', async () => {
    const { tx, batchJobUpdate, reportCardCreate } = buildMockTx({
      enrolments: [
        { student_id: STUDENT_EN, class_id: CLASS_ID },
        { student_id: STUDENT_AR, class_id: CLASS_ID },
      ],
      students: [buildStudent(STUDENT_EN), buildStudent(STUDENT_AR)],
    });
    const render = jest
      .fn<Promise<Buffer>, [unknown]>()
      .mockResolvedValueOnce(Buffer.from('%PDF', 'latin1'))
      .mockRejectedValueOnce(new Error('renderer exploded'));
    const storage = new NullReportCardStorageWriter();
    const prisma = buildFakePrisma(tx);
    const job = new ReportCardGenerationJob(prisma, { render }, storage);

    await job.execute({ tenant_id: TENANT_ID, batch_job_id: BATCH_JOB_ID });

    expect(reportCardCreate).toHaveBeenCalledTimes(1);
    const lastCall = batchJobUpdate.mock.calls[batchJobUpdate.mock.calls.length - 1]?.[0] as
      | { data?: Record<string, unknown> }
      | undefined;
    expect(lastCall?.data?.students_generated_count).toBe(1);
    expect(lastCall?.data?.students_blocked_count).toBe(1);
    expect(lastCall?.data?.status).toBe('completed');
  });

  it('upserts existing report card row on re-runs and deletes old PDF', async () => {
    const { tx, reportCardCreate, reportCardUpdate } = buildMockTx({
      existingReportCard: { id: 'rc-existing', pdf_storage_key: 'old-key' },
    });
    const deleteSpy = jest.fn().mockResolvedValue(undefined);
    const storage: NullReportCardStorageWriter = new NullReportCardStorageWriter();
    storage.delete = deleteSpy;
    // Force a DIFFERENT storage key so the delete branch fires.
    storage.upload = jest.fn().mockResolvedValue('new-key');
    const { renderer } = buildFakeRenderer();
    const prisma = buildFakePrisma(tx);
    const job = new ReportCardGenerationJob(prisma, renderer, storage);

    await job.execute({ tenant_id: TENANT_ID, batch_job_id: BATCH_JOB_ID });

    expect(reportCardCreate).not.toHaveBeenCalled();
    expect(reportCardUpdate).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledWith('old-key');
  });
});
