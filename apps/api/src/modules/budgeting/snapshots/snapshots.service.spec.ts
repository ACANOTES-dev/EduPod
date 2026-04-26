import { getQueueToken } from '@nestjs/bullmq';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../s3/s3.service';
import { ScenariosService } from '../scenarios/scenarios.service';

import { SnapshotsService } from './snapshots.service';

// ─── createRlsClient mock ────────────────────────────────────────────────

const mockRlsTx: Record<string, unknown> = {};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Constants ───────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const MODEL_ID = '33333333-3333-4333-8333-333333333333';
const SNAPSHOT_ID = '44444444-4444-4444-8444-444444444444';
const LINE_ID = '55555555-5555-4555-8555-555555555555';
const SCENARIO_ID = '66666666-6666-4666-8666-666666666666';

// ─── Mock prisma factory ──────────────────────────────────────────────────

function buildMockPrisma() {
  const mock = {
    financialModel: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    financialModelLineItem: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    financialModelSnapshot: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    scenario: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
    },
  };
  Object.assign(mockRlsTx, mock);
  return mock;
}

// ─── Builders ─────────────────────────────────────────────────────────────

function buildParentModel(overrides: Record<string, unknown> = {}) {
  return {
    id: MODEL_ID,
    tenant_id: TENANT_ID,
    name: 'Tenant FY 2026/27',
    description: null,
    fiscal_year_start: new Date('2026-09-01'),
    fiscal_year_end: new Date('2027-09-01'),
    horizon_years: 1,
    drivers: {
      enrollment_growth_pct_by_year_group: {},
      fee_uplift_pct_by_year_group: {},
      staff_headcount_delta_by_department: {},
      salary_uplift_pct: 0,
      discount_capture_pct: 0,
      scholarship_capture_pct: 0,
      utilities_inflation_pct: 0,
      materials_inflation_pct: 0,
      capex_items: [],
      donations_forecast: 0,
      grants_forecast: 0,
      custom: {},
    },
    source_snapshot_json: {
      captured_at: '2026-04-26T00:00:00.000Z',
      tenant_id: TENANT_ID,
      fiscal_year_start: '2026-09-01',
      fiscal_year_end: '2027-09-01',
      currency_code: 'USD',
      total_active_students: 100,
      total_active_households: 80,
      students_by_year_group: [],
      fees_by_year_group: [],
      staff_by_department: [],
    },
    status: 'draft',
    current_snapshot_id: null,
    archived_at: null,
    ...overrides,
  };
}

function buildLineItem(overrides: Record<string, unknown> = {}) {
  return {
    id: LINE_ID,
    parent_model_id: MODEL_ID,
    scenario_id: null,
    category: 'income',
    subcategory: 'tuition_net',
    name: 'Tuition (net)',
    fiscal_year: 1,
    source: 'driver_derived',
    amount: 100_000,
    is_locked: false,
    notes: null,
    references_event_budget_id: null,
    ...overrides,
  };
}

function buildScenario(overrides: Record<string, unknown> = {}) {
  return {
    id: SCENARIO_ID,
    tenant_id: TENANT_ID,
    parent_model_id: MODEL_ID,
    name: 'Cautious',
    position: 0,
    driver_overrides: { salary_uplift_pct: 1.5 },
    notes: null,
    created_at: new Date('2026-04-26T00:00:00.000Z'),
    updated_at: new Date('2026-04-26T00:00:00.000Z'),
    ...overrides,
  };
}

/** Persisted snapshot row whose payload validates against
 *  `snapshotPayloadSchema`. Used by the restore tests. */
function buildSnapshotWithPayload(overrides: Record<string, unknown> = {}) {
  const parent = buildParentModel();
  return {
    id: SNAPSHOT_ID,
    tenant_id: TENANT_ID,
    parent_model_id: MODEL_ID,
    version_number: 1,
    payload: {
      schema_version: 1,
      model: {
        id: parent.id,
        name: parent.name,
        description: parent.description,
        fiscal_year_start: '2026-09-01',
        fiscal_year_end: '2027-09-01',
        horizon_years: 1,
        drivers: parent.drivers,
      },
      scenarios: [],
      base_case: {
        line_items: [
          {
            id: LINE_ID,
            category: 'operations',
            subcategory: 'maintenance',
            name: 'Roof',
            fiscal_year: 1,
            source: 'custom',
            amount: 12000,
            is_locked: true,
            notes: 'Manual',
            references_event_budget_id: null,
          },
        ],
        totals_by_year: [{ fiscal_year: 1, revenue: 0, expenditure: 12000, net_result: -12000 }],
        per_pupil_unit_economics: [
          {
            fiscal_year: 1,
            revenue_per_student: 0,
            expenditure_per_student: 120,
            net_per_student: -120,
            revenue_per_household: 0,
            breakeven_students: null,
          },
        ],
      },
      source_snapshot: parent.source_snapshot_json,
      executive_summary: 'previous',
      published_at: '2026-03-01T00:00:00.000Z',
      published_by: { user_id: USER_ID, name: null },
    },
    executive_summary: 'previous',
    published_at: new Date('2026-03-01T00:00:00.000Z'),
    published_by: USER_ID,
    pdf_object_key: null,
    excel_object_key: null,
    rendered_at: null,
    ...overrides,
  };
}

// ─── Mocks for queue + S3 ─────────────────────────────────────────────────

function buildMockQueue() {
  return {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };
}

function buildMockS3() {
  return {
    getPresignedUrl: jest.fn().mockResolvedValue('https://signed.example/render.pdf'),
  };
}

/**
 * Stub `financialModelSnapshot.create` to echo the data back as a
 * persisted row. Used to verify the args passed by the service.
 */
function stubSnapshotCreate(prisma: ReturnType<typeof buildMockPrisma>) {
  prisma.financialModelSnapshot.create.mockImplementation(
    async (args: { data: Record<string, unknown> }) => ({
      id: SNAPSHOT_ID,
      version_number: args.data.version_number,
      tenant_id: args.data.tenant_id,
      parent_model_id: args.data.parent_model_id,
      payload: args.data.payload,
      executive_summary: args.data.executive_summary,
      published_at: new Date('2026-04-26T00:00:00.000Z'),
      published_by: args.data.published_by,
      pdf_object_key: null,
      excel_object_key: null,
      rendered_at: null,
    }),
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────

describe('SnapshotsService', () => {
  let service: SnapshotsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockQueue: ReturnType<typeof buildMockQueue>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockQueue = buildMockQueue();
    mockS3 = buildMockS3();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ScenariosService,
        SnapshotsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
        { provide: getQueueToken('budgeting'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<SnapshotsService>(SnapshotsService);
    jest.clearAllMocks();
  });

  // ─── publish ───────────────────────────────────────────────────────────

  describe('publish', () => {
    it('increments version_number from MAX + 1 (first publish → v1)', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelLineItem.findMany.mockResolvedValue([buildLineItem()]);
      mockPrisma.scenario.findMany.mockResolvedValue([]);
      mockPrisma.user.findFirst.mockResolvedValue({
        id: USER_ID,
        first_name: 'Pat',
        last_name: 'Principal',
      });
      mockPrisma.financialModelSnapshot.findFirst.mockResolvedValue(null);
      stubSnapshotCreate(mockPrisma);
      mockPrisma.financialModel.update.mockResolvedValue({});

      const result = await service.publish(TENANT_ID, USER_ID, MODEL_ID, {
        executive_summary: 'Smoke',
      });

      expect(result.version_number).toBe(1);
      const createArgs = mockPrisma.financialModelSnapshot.create.mock.calls[0]![0];
      expect(createArgs.data.version_number).toBe(1);
    });

    it('increments to MAX + 1 (subsequent publish → v2)', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(
        buildParentModel({ status: 'published' }),
      );
      mockPrisma.financialModelLineItem.findMany.mockResolvedValue([]);
      mockPrisma.scenario.findMany.mockResolvedValue([]);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.financialModelSnapshot.findFirst.mockResolvedValue({ version_number: 1 });
      stubSnapshotCreate(mockPrisma);

      const result = await service.publish(TENANT_ID, USER_ID, MODEL_ID, {
        executive_summary: 'Smoke',
      });

      expect(result.version_number).toBe(2);
    });

    it('first publish on a draft model transitions status to published', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel({ status: 'draft' }));
      mockPrisma.financialModelLineItem.findMany.mockResolvedValue([]);
      mockPrisma.scenario.findMany.mockResolvedValue([]);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.financialModelSnapshot.findFirst.mockResolvedValue(null);
      stubSnapshotCreate(mockPrisma);

      await service.publish(TENANT_ID, USER_ID, MODEL_ID, { executive_summary: 'x' });

      const updateArgs = mockPrisma.financialModel.update.mock.calls[0]![0];
      expect(updateArgs.data.current_snapshot_id).toBe(SNAPSHOT_ID);
      expect(updateArgs.data.status).toBe('published');
    });

    it('subsequent publish on a published model leaves status unchanged', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(
        buildParentModel({ status: 'published' }),
      );
      mockPrisma.financialModelLineItem.findMany.mockResolvedValue([]);
      mockPrisma.scenario.findMany.mockResolvedValue([]);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.financialModelSnapshot.findFirst.mockResolvedValue({ version_number: 3 });
      stubSnapshotCreate(mockPrisma);

      await service.publish(TENANT_ID, USER_ID, MODEL_ID, { executive_summary: 'x' });

      const updateArgs = mockPrisma.financialModel.update.mock.calls[0]![0];
      expect(updateArgs.data.current_snapshot_id).toBe(SNAPSHOT_ID);
      expect(updateArgs.data.status).toBeUndefined();
    });

    it('throws ConflictException(CANNOT_PUBLISH_ARCHIVED_MODEL) when model is archived', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(
        buildParentModel({ status: 'archived' }),
      );
      await expect(
        service.publish(TENANT_ID, USER_ID, MODEL_ID, { executive_summary: 'x' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('enqueues budgeting:board-pack-render job exactly once with correct payload', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelLineItem.findMany.mockResolvedValue([]);
      mockPrisma.scenario.findMany.mockResolvedValue([]);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.financialModelSnapshot.findFirst.mockResolvedValue(null);
      stubSnapshotCreate(mockPrisma);

      await service.publish(TENANT_ID, USER_ID, MODEL_ID, { executive_summary: 'x' });

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      const [jobName, payload] = mockQueue.add.mock.calls[0]!;
      expect(jobName).toBe('budgeting:board-pack-render');
      expect(payload).toEqual({
        tenant_id: TENANT_ID,
        snapshot_id: SNAPSHOT_ID,
        format: 'all',
      });
    });

    it('includes ALL line-item rows (derived + custom + override + locked) in payload.base_case', async () => {
      const id1 = '11111111-1111-4111-8111-aaaaaaaaaaaa';
      const id2 = '22222222-2222-4222-8222-bbbbbbbbbbbb';
      const id3 = '33333333-3333-4333-8333-cccccccccccc';
      const id4 = '44444444-4444-4444-8444-dddddddddddd';
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelLineItem.findMany.mockResolvedValue([
        buildLineItem({ id: id1, source: 'driver_derived', is_locked: false, amount: 100 }),
        buildLineItem({ id: id2, source: 'custom', amount: 200 }),
        buildLineItem({ id: id3, source: 'override', amount: 300 }),
        buildLineItem({ id: id4, source: 'driver_derived', is_locked: true, amount: 400 }),
      ]);
      mockPrisma.scenario.findMany.mockResolvedValue([]);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.financialModelSnapshot.findFirst.mockResolvedValue(null);
      let baseCaseLineCount = 0;
      mockPrisma.financialModelSnapshot.create.mockImplementation(
        async (args: {
          data: {
            payload: { base_case: { line_items: unknown[] } };
          } & Record<string, unknown>;
        }) => {
          baseCaseLineCount = args.data.payload.base_case.line_items.length;
          return {
            id: SNAPSHOT_ID,
            version_number: 1,
            tenant_id: TENANT_ID,
            parent_model_id: MODEL_ID,
            payload: args.data.payload,
            executive_summary: args.data.executive_summary,
            published_at: new Date(),
            published_by: args.data.published_by,
            pdf_object_key: null,
            excel_object_key: null,
            rendered_at: null,
          };
        },
      );

      await service.publish(TENANT_ID, USER_ID, MODEL_ID, { executive_summary: 'x' });

      expect(baseCaseLineCount).toBe(4);
    });

    it('includes scenario merged_drivers in the payload', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelLineItem.findMany.mockResolvedValue([]);
      mockPrisma.scenario.findMany.mockResolvedValue([buildScenario()]);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.financialModelSnapshot.findFirst.mockResolvedValue(null);
      let mergedSalaryUplift: number | null = null;
      mockPrisma.financialModelSnapshot.create.mockImplementation(
        async (args: {
          data: {
            payload: {
              scenarios: Array<{ merged_drivers: { salary_uplift_pct: number } }>;
            };
          } & Record<string, unknown>;
        }) => {
          const first = args.data.payload.scenarios[0];
          if (first) {
            mergedSalaryUplift = first.merged_drivers.salary_uplift_pct;
          }
          return {
            id: SNAPSHOT_ID,
            version_number: 1,
            tenant_id: TENANT_ID,
            parent_model_id: MODEL_ID,
            payload: args.data.payload,
            executive_summary: args.data.executive_summary,
            published_at: new Date(),
            published_by: args.data.published_by,
            pdf_object_key: null,
            excel_object_key: null,
            rendered_at: null,
          };
        },
      );

      await service.publish(TENANT_ID, USER_ID, MODEL_ID, { executive_summary: 'x' });

      // The scenario's salary_uplift_pct=1.5 override should appear in merged_drivers.
      expect(mergedSalaryUplift).toBe(1.5);
    });
  });

  // ─── restore ───────────────────────────────────────────────────────────

  describe('restore', () => {
    it("replaces parent model's drivers / horizon / source from the snapshot's payload", async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelSnapshot.findFirst.mockResolvedValue(buildSnapshotWithPayload());

      await service.restore(TENANT_ID, USER_ID, MODEL_ID, SNAPSHOT_ID);

      const updateCalls = mockPrisma.financialModel.update.mock.calls;
      expect(updateCalls.length).toBeGreaterThan(0);
      const firstUpdate = updateCalls[0]![0];
      expect(firstUpdate.data.status).toBe('draft');
      expect(firstUpdate.data.horizon_years).toBe(1);
      expect(firstUpdate.data.drivers).toBeDefined();
      expect(firstUpdate.data.source_snapshot_json).toBeDefined();
      // current_snapshot_id is NOT touched by restore.
      expect(firstUpdate.data.current_snapshot_id).toBeUndefined();
    });

    it('preserves source / is_locked / notes on restored line items', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelSnapshot.findFirst.mockResolvedValue(buildSnapshotWithPayload());

      await service.restore(TENANT_ID, USER_ID, MODEL_ID, SNAPSHOT_ID);

      expect(mockPrisma.financialModelLineItem.deleteMany).toHaveBeenCalledTimes(1);
      const createArgs = mockPrisma.financialModelLineItem.createMany.mock.calls[0]![0];
      expect(createArgs.data).toHaveLength(1);
      expect(createArgs.data[0].source).toBe('custom');
      expect(createArgs.data[0].is_locked).toBe(true);
      expect(createArgs.data[0].notes).toBe('Manual');
    });

    it('throws NotFoundException when snapshot does not belong to the parent model', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelSnapshot.findFirst.mockResolvedValue(null);
      await expect(
        service.restore(TENANT_ID, USER_ID, MODEL_ID, SNAPSHOT_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── findAll / findOne ─────────────────────────────────────────────────

  describe('findAll', () => {
    it('lists snapshots ordered by published_at DESC and excludes payload from list response', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelSnapshot.findMany.mockResolvedValue([
        {
          id: 'a',
          parent_model_id: MODEL_ID,
          version_number: 2,
          executive_summary: 'v2',
          published_at: new Date('2026-04-01'),
          published_by: USER_ID,
          pdf_object_key: null,
          excel_object_key: null,
          rendered_at: null,
        },
      ]);
      mockPrisma.financialModelSnapshot.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, MODEL_ID, { page: 1, pageSize: 20 });
      expect(result.meta.total).toBe(1);
      expect(result.data).toHaveLength(1);
      const args = mockPrisma.financialModelSnapshot.findMany.mock.calls[0]![0];
      expect(args.orderBy).toEqual({ published_at: 'desc' });
      // The select object does not pull `payload`.
      expect(args.select.payload).toBeUndefined();
    });
  });

  describe('findOne', () => {
    function buildPersistedSnapshot(overrides: Record<string, unknown> = {}) {
      return {
        id: SNAPSHOT_ID,
        tenant_id: TENANT_ID,
        parent_model_id: MODEL_ID,
        version_number: 1,
        payload: { schema_version: 1 },
        executive_summary: 'x',
        published_at: new Date(),
        published_by: USER_ID,
        pdf_object_key: null,
        excel_object_key: null,
        rendered_at: null,
        ...overrides,
      };
    }

    it('includes payload + signed URLs when object keys are present', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelSnapshot.findFirst.mockResolvedValue(
        buildPersistedSnapshot({
          pdf_object_key: 'tenant/snap.pdf',
          excel_object_key: 'tenant/snap.xlsx',
          rendered_at: new Date(),
        }),
      );

      const result = await service.findOne(TENANT_ID, MODEL_ID, SNAPSHOT_ID);
      expect(result.pdf_signed_url).toBe('https://signed.example/render.pdf');
      expect(result.excel_signed_url).toBe('https://signed.example/render.pdf');
      expect(mockS3.getPresignedUrl).toHaveBeenCalledTimes(2);
    });

    it('returns null signed URLs when object keys are absent', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelSnapshot.findFirst.mockResolvedValue(buildPersistedSnapshot());

      const result = await service.findOne(TENANT_ID, MODEL_ID, SNAPSHOT_ID);
      expect(result.pdf_signed_url).toBeNull();
      expect(result.excel_signed_url).toBeNull();
      expect(mockS3.getPresignedUrl).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for missing or wrong-tenant snapshots', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelSnapshot.findFirst.mockResolvedValue(null);
      await expect(service.findOne(TENANT_ID, MODEL_ID, SNAPSHOT_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
