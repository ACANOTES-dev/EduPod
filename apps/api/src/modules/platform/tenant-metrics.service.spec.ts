import { Test, TestingModule } from '@nestjs/testing';

import { TenantModuleService } from '../../common/services/tenant-module.service';
import { AttendanceReadFacade } from '../attendance/attendance-read.facade';
import { FinanceReadFacade } from '../finance/finance-read.facade';
import { ParentReadFacade } from '../parents/parent-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { RbacReadFacade } from '../rbac/rbac-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';
import { StudentReadFacade } from '../students/student-read.facade';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

import { TenantMetricsService } from './tenant-metrics.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_TWO_ID = '22222222-2222-4222-8222-222222222222';

function buildMockPrisma() {
  return {
    platformErrorLog: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    platformTenantMetric: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({ id: 'metric-1' }),
    },
  };
}

describe('TenantMetricsService', () => {
  let service: TenantMetricsService;
  let prisma: ReturnType<typeof buildMockPrisma>;
  let attendanceReadFacade: { groupTenantSummariesByStatus: jest.Mock };
  let financeReadFacade: { countInvoices: jest.Mock };
  let parentReadFacade: { count: jest.Mock };
  let rbacReadFacade: {
    countActiveMembershipsWithLoginSince: jest.Mock;
    findLastActiveMembershipLogin: jest.Mock;
  };
  let staffProfileReadFacade: { count: jest.Mock };
  let studentReadFacade: { count: jest.Mock };
  let tenantReadFacade: {
    findActivePlatformSummaries: jest.Mock;
    findPlatformSummariesByIds: jest.Mock;
  };
  let tenantModuleService: { getEnabledModules: jest.Mock };

  beforeEach(async () => {
    prisma = buildMockPrisma();
    attendanceReadFacade = { groupTenantSummariesByStatus: jest.fn().mockResolvedValue([]) };
    financeReadFacade = { countInvoices: jest.fn().mockResolvedValue(0) };
    parentReadFacade = { count: jest.fn().mockResolvedValue(0) };
    rbacReadFacade = {
      countActiveMembershipsWithLoginSince: jest.fn().mockResolvedValue(0),
      findLastActiveMembershipLogin: jest.fn().mockResolvedValue(null),
    };
    staffProfileReadFacade = { count: jest.fn().mockResolvedValue(0) };
    studentReadFacade = { count: jest.fn().mockResolvedValue(0) };
    tenantReadFacade = {
      findActivePlatformSummaries: jest.fn().mockResolvedValue([]),
      findPlatformSummariesByIds: jest.fn().mockResolvedValue([]),
    };
    tenantModuleService = { getEnabledModules: jest.fn().mockResolvedValue(['attendance']) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantMetricsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AttendanceReadFacade, useValue: attendanceReadFacade },
        { provide: FinanceReadFacade, useValue: financeReadFacade },
        { provide: ParentReadFacade, useValue: parentReadFacade },
        { provide: RbacReadFacade, useValue: rbacReadFacade },
        { provide: StaffProfileReadFacade, useValue: staffProfileReadFacade },
        { provide: StudentReadFacade, useValue: studentReadFacade },
        { provide: TenantReadFacade, useValue: tenantReadFacade },
        { provide: TenantModuleService, useValue: tenantModuleService },
      ],
    }).compile();

    service = module.get<TenantMetricsService>(TenantMetricsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('collects metrics for active tenants and upserts today snapshot', async () => {
    tenantReadFacade.findActivePlatformSummaries.mockResolvedValueOnce([
      { id: TENANT_ID, name: 'North High' },
    ]);
    studentReadFacade.count.mockResolvedValueOnce(12);
    staffProfileReadFacade.count.mockResolvedValueOnce(3);
    parentReadFacade.count.mockResolvedValueOnce(7);
    financeReadFacade.countInvoices.mockResolvedValueOnce(5).mockResolvedValueOnce(1);
    rbacReadFacade.countActiveMembershipsWithLoginSince
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(4);
    rbacReadFacade.findLastActiveMembershipLogin.mockResolvedValueOnce(
      new Date('2026-05-16T01:00:00.000Z'),
    );
    prisma.platformErrorLog.findMany.mockResolvedValueOnce([{ count: 2 }, { count: 3 }]);
    attendanceReadFacade.groupTenantSummariesByStatus.mockResolvedValueOnce([
      { derived_status: 'present', _count: { _all: 8 } },
      { derived_status: 'absent', _count: { _all: 2 } },
    ]);

    await service.collectDailyMetrics(new Date('2026-05-16T02:30:00.000Z'));

    expect(tenantReadFacade.findActivePlatformSummaries).toHaveBeenCalledWith();
    expect(prisma.platformTenantMetric.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenant_id_snapshot_date: {
            tenant_id: TENANT_ID,
            snapshot_date: new Date('2026-05-16T00:00:00.000Z'),
          },
        },
        create: expect.objectContaining({
          tenant_id: TENANT_ID,
          metrics: expect.objectContaining({
            students_count: 12,
            staff_count: 3,
            parents_count: 7,
            active_users_24h: 2,
            active_users_7d: 4,
            invoices_total: 5,
            invoices_overdue: 1,
            errors_24h: 5,
            attendance_rate_avg: 80,
            enabled_modules: ['attendance'],
          }),
        }),
      }),
    );
  });

  it('continues collecting when one tenant fails', async () => {
    tenantReadFacade.findActivePlatformSummaries.mockResolvedValueOnce([
      { id: TENANT_ID, name: 'North High' },
      { id: TENANT_TWO_ID, name: 'South High' },
    ]);
    studentReadFacade.count
      .mockRejectedValueOnce(new Error('tenant failed'))
      .mockResolvedValueOnce(1);

    await service.collectDailyMetrics(new Date('2026-05-16T02:30:00.000Z'));

    expect(prisma.platformTenantMetric.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.platformTenantMetric.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ tenant_id: TENANT_TWO_ID }),
      }),
    );
  });

  it('returns latest and history for a tenant', async () => {
    prisma.platformTenantMetric.findMany.mockResolvedValueOnce([
      {
        tenant_id: TENANT_ID,
        snapshot_date: new Date('2026-05-16T00:00:00.000Z'),
        metrics: buildMetrics({ students_count: 12 }),
      },
      {
        tenant_id: TENANT_ID,
        snapshot_date: new Date('2026-05-15T00:00:00.000Z'),
        metrics: buildMetrics({ students_count: 10 }),
      },
    ]);

    await expect(service.getMetricsForTenant(TENANT_ID, 30)).resolves.toMatchObject({
      latest: { students_count: 12 },
      history: [
        { snapshot_date: '2026-05-16', metrics: { students_count: 12 } },
        { snapshot_date: '2026-05-15', metrics: { students_count: 10 } },
      ],
    });
  });

  it('returns comparison data in requested tenant order', async () => {
    tenantReadFacade.findPlatformSummariesByIds.mockResolvedValueOnce([
      { id: TENANT_ID, name: 'North High' },
      { id: TENANT_TWO_ID, name: 'South High' },
    ]);
    prisma.platformTenantMetric.findMany.mockResolvedValueOnce([
      {
        tenant_id: TENANT_TWO_ID,
        snapshot_date: new Date('2026-05-16T00:00:00.000Z'),
        metrics: buildMetrics({ students_count: 3 }),
      },
      {
        tenant_id: TENANT_ID,
        snapshot_date: new Date('2026-05-16T00:00:00.000Z'),
        metrics: buildMetrics({ students_count: 8 }),
      },
    ]);

    await expect(service.compareMetrics([TENANT_TWO_ID, TENANT_ID], 7)).resolves.toMatchObject([
      { tenant_id: TENANT_TWO_ID, tenant_name: 'South High', latest: { students_count: 3 } },
      { tenant_id: TENANT_ID, tenant_name: 'North High', latest: { students_count: 8 } },
    ]);
  });

  it('runs due collection once per UTC day after 2 AM', async () => {
    const collectSpy = jest.spyOn(service, 'collectDailyMetrics').mockResolvedValue(undefined);

    await service.runDueCollection(new Date('2026-05-16T01:59:00.000Z'));
    await service.runDueCollection(new Date('2026-05-16T02:01:00.000Z'));
    await service.runDueCollection(new Date('2026-05-16T03:01:00.000Z'));

    expect(collectSpy).toHaveBeenCalledTimes(1);
  });
});

function buildMetrics(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    students_count: 0,
    staff_count: 0,
    parents_count: 0,
    active_users_24h: 0,
    active_users_7d: 0,
    invoices_total: 0,
    invoices_overdue: 0,
    attendance_rate_avg: 0,
    api_requests_24h: 0,
    errors_24h: 0,
    storage_mb: 0,
    enabled_modules: [],
    disabled_modules: [],
    last_login_at: null,
    ...overrides,
  };
}
