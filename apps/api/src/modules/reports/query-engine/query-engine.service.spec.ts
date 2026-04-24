import { BadRequestException, HttpException } from '@nestjs/common';

import {
  OWNER_SENTINEL_PERMISSION,
  ReportsSubjectRegistryService,
} from '../subject-registry/reports-subject-registry.service';

import { QueryEngineService } from './query-engine.service';
import { QUERY_ENGINE_ERROR_CODES, QUERY_ENGINE_ROW_CAP } from './query-engine.types';
import type { SavedReportQuery } from './query-engine.types';

// ─── RLS client mock ────────────────────────────────────────────────────────
// The engine wraps every call in `createRlsClient(...).$transaction(fn)`.
// We intercept `createRlsClient` to return an object whose `$transaction`
// immediately invokes the callback with a mocked tx client. This lets us
// drive the engine entirely from tx-level stubs without a real database.

const mockStudentDelegate = {
  count: jest.fn<Promise<number>, [{ where: Record<string, unknown> }]>(),
  findMany: jest.fn<
    Promise<unknown[]>,
    [
      {
        where: Record<string, unknown>;
        select: Record<string, unknown>;
        orderBy: Array<Record<string, unknown>>;
        skip: number;
        take: number;
      },
    ]
  >(),
};

const mockTx = {
  student: mockStudentDelegate,
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

describe('QueryEngineService', () => {
  const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const OWNER_PERMS = [OWNER_SENTINEL_PERMISSION];

  let registry: ReportsSubjectRegistryService;
  let engine: QueryEngineService;

  beforeEach(() => {
    mockStudentDelegate.count.mockReset();
    mockStudentDelegate.findMany.mockReset();

    registry = new ReportsSubjectRegistryService();
    engine = new QueryEngineService(
      // The engine only uses `prisma` to build an RLS client, which is
      // mocked above. Empty object is fine.
      {} as never,
      registry,
    );
  });

  it('executes a simple student query and returns rows + columns + meta', async () => {
    mockStudentDelegate.count.mockResolvedValue(1);
    mockStudentDelegate.findMany.mockResolvedValue([
      {
        id: 's-1',
        first_name: 'Alice',
        last_name: 'Smith',
        student_number: null,
        national_id: null,
        middle_name: null,
        date_of_birth: new Date('2015-01-01'),
        gender: 'female',
        nationality: 'IE',
        status: 'active',
        entry_date: null,
        exit_date: null,
        has_allergy: false,
        allergy_details: null,
        created_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-01'),
        year_group: null,
        homeroom_class: null,
        household: null,
      },
    ]);

    const query: SavedReportQuery = {
      subject: 'student',
      columns: [
        { field_id: 'student.identity.first_name' },
        { field_id: 'student.identity.last_name' },
      ],
    };

    const result = await engine.execute(TENANT_ID, USER_ID, OWNER_PERMS, query, {
      page: 1,
      pageSize: 50,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({
      'student.identity.first_name': 'Alice',
      'student.identity.last_name': 'Smith',
    });
    expect(result.columns).toHaveLength(2);
    expect(result.meta.row_count).toBe(1);
    expect(result.meta.truncated).toBe(false);
    expect(typeof result.meta.execution_ms).toBe('number');
  });

  it('rejects queries that reference unknown fields with REPORT_UNKNOWN_FIELD', async () => {
    const query: SavedReportQuery = {
      subject: 'student',
      columns: [{ field_id: 'student.does_not_exist' }],
    };

    await expect(
      engine.execute(TENANT_ID, USER_ID, OWNER_PERMS, query, { page: 1, pageSize: 50 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects queries that reference permission-stripped fields', async () => {
    const query: SavedReportQuery = {
      subject: 'student',
      columns: [{ field_id: 'student.identity.national_id' }],
    };

    // Caller does NOT have `students.view_sensitive`.
    await expect(
      engine.execute(TENANT_ID, USER_ID, [], query, { page: 1, pageSize: 50 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects queries with zero columns', async () => {
    const query: SavedReportQuery = {
      subject: 'student',
      columns: [],
    };

    await expect(
      engine.execute(TENANT_ID, USER_ID, OWNER_PERMS, query, { page: 1, pageSize: 50 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects group-by on a non-groupable field', async () => {
    const query: SavedReportQuery = {
      subject: 'student',
      columns: [{ field_id: 'student.identity.first_name' }],
      group_by: [{ field_id: 'student.identity.first_name' }],
    };

    await expect(
      engine.execute(TENANT_ID, USER_ID, OWNER_PERMS, query, { page: 1, pageSize: 50 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws REPORT_ROW_CAP_EXCEEDED when count > 50 000 and no group-by', async () => {
    mockStudentDelegate.count.mockResolvedValue(QUERY_ENGINE_ROW_CAP + 1);
    mockStudentDelegate.findMany.mockResolvedValue([]);

    const query: SavedReportQuery = {
      subject: 'student',
      columns: [{ field_id: 'student.identity.first_name' }],
    };

    await expect(
      engine.execute(TENANT_ID, USER_ID, OWNER_PERMS, query, { page: 1, pageSize: 50 }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: QUERY_ENGINE_ERROR_CODES.ROW_CAP_EXCEEDED,
      }),
    });
  });

  it('races Prisma against a timeout and rejects with REPORT_QUERY_TIMEOUT', async () => {
    jest.useFakeTimers();

    mockStudentDelegate.count.mockImplementation(() => new Promise(() => {}));
    mockStudentDelegate.findMany.mockImplementation(() => new Promise(() => {}));

    const query: SavedReportQuery = {
      subject: 'student',
      columns: [{ field_id: 'student.identity.first_name' }],
    };

    const promise = engine.execute(TENANT_ID, USER_ID, OWNER_PERMS, query, {
      page: 1,
      pageSize: 50,
    });

    // Advance past the 30-second timeout.
    jest.advanceTimersByTime(31_000);

    await expect(promise).rejects.toBeInstanceOf(HttpException);
    await expect(promise).rejects.toMatchObject({
      response: expect.objectContaining({
        code: QUERY_ENGINE_ERROR_CODES.QUERY_TIMEOUT,
      }),
    });

    jest.useRealTimers();
  });

  it('sets `truncated: true` when more rows exist beyond the current page', async () => {
    mockStudentDelegate.count.mockResolvedValue(120);
    mockStudentDelegate.findMany.mockResolvedValue([]);

    const query: SavedReportQuery = {
      subject: 'student',
      columns: [{ field_id: 'student.identity.first_name' }],
    };

    const result = await engine.execute(TENANT_ID, USER_ID, OWNER_PERMS, query, {
      page: 1,
      pageSize: 50,
    });

    expect(result.meta.row_count).toBe(120);
    expect(result.meta.truncated).toBe(true);
  });
});
