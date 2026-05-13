import { Job } from 'bullmq';

import {
  REGULATORY_TUSLA_THRESHOLD_SCAN_JOB,
  RegulatoryTuslaThresholdScanProcessor,
} from './tusla-threshold-scan.processor';

const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';
const STUDENT_A_ID = '33333333-3333-3333-3333-333333333333';
const STUDENT_B_ID = '44444444-4444-4444-4444-444444444444';

interface BuildMockPrismaOptions {
  absentDaysByStudent?: Record<string, number>;
  activeTenants?: Array<{ id: string }>;
  alertCreateError?: unknown;
  failingTenants?: string[];
  studentsByTenant?: Record<string, Array<{ id: string }>>;
}

function buildMockPrisma(options: BuildMockPrismaOptions = {}) {
  const failingTenants = new Set(options.failingTenants ?? []);

  return {
    attendancePatternAlert: {
      create: jest.fn().mockImplementation(async () => {
        if (options.alertCreateError) {
          throw options.alertCreateError;
        }

        return { id: 'alert-id' };
      }),
    },
    attendanceRecord: {
      count: jest
        .fn()
        .mockImplementation(
          async (args: { where: { student_id: string; tenant_id: string } }) =>
            options.absentDaysByStudent?.[args.where.student_id] ?? 0,
        ),
    },
    student: {
      findMany: jest.fn().mockImplementation(async (args: { where: { tenant_id: string } }) => {
        const tenantId = args.where.tenant_id;

        if (failingTenants.has(tenantId)) {
          throw new Error(`failed tenant ${tenantId}`);
        }

        return options.studentsByTenant?.[tenantId] ?? [];
      }),
    },
    tenant: {
      findMany: jest.fn().mockResolvedValue(options.activeTenants ?? [{ id: TENANT_A_ID }]),
    },
  };
}

function buildJob(name: string = REGULATORY_TUSLA_THRESHOLD_SCAN_JOB): Job {
  return { data: {}, name } as unknown as Job;
}

function buildTenantModuleService(disabledTenants: string[] = []) {
  return {
    isEnabled: jest
      .fn()
      .mockImplementation((tenantId: string) =>
        Promise.resolve(!disabledTenants.includes(tenantId)),
      ),
  };
}

describe('RegulatoryTuslaThresholdScanProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockPrisma = buildMockPrisma();
    const tenantModuleService = buildTenantModuleService();
    const processor = new RegulatoryTuslaThresholdScanProcessor(
      mockPrisma as never,
      tenantModuleService as never,
    );

    await processor.process(buildJob('regulatory:other-job'));

    expect(tenantModuleService.isEnabled).not.toHaveBeenCalled();
    expect(mockPrisma.tenant.findMany).not.toHaveBeenCalled();
  });

  it('should iterate active tenants and continue after a tenant failure', async () => {
    const mockPrisma = buildMockPrisma({
      activeTenants: [{ id: TENANT_A_ID }, { id: TENANT_B_ID }],
      failingTenants: [TENANT_A_ID],
      studentsByTenant: { [TENANT_B_ID]: [] },
    });
    const processor = new RegulatoryTuslaThresholdScanProcessor(
      mockPrisma as never,
      buildTenantModuleService() as never,
    );

    await expect(processor.process(buildJob())).resolves.toBeUndefined();

    expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith({
      where: { status: 'active' },
      select: { id: true },
    });
    expect(mockPrisma.student.findMany).toHaveBeenCalledTimes(2);
  });

  it('should skip disabled tenants without scanning their attendance', async () => {
    const mockPrisma = buildMockPrisma({
      activeTenants: [{ id: TENANT_A_ID }, { id: TENANT_B_ID }],
      studentsByTenant: {
        [TENANT_A_ID]: [{ id: STUDENT_A_ID }],
        [TENANT_B_ID]: [{ id: STUDENT_B_ID }],
      },
    });
    const tenantModuleService = buildTenantModuleService([TENANT_A_ID]);
    const processor = new RegulatoryTuslaThresholdScanProcessor(
      mockPrisma as never,
      tenantModuleService as never,
    );

    await processor.process(buildJob());

    expect(tenantModuleService.isEnabled).toHaveBeenCalledWith(TENANT_A_ID, 'compliance_advanced');
    expect(tenantModuleService.isEnabled).toHaveBeenCalledWith(TENANT_B_ID, 'compliance_advanced');
    expect(mockPrisma.student.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.student.findMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_B_ID, status: 'active' },
      select: { id: true },
    });
  });

  it('should create an approaching-threshold alert when absences reach 80 percent of threshold', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T12:00:00.000Z'));

    try {
      const mockPrisma = buildMockPrisma({
        absentDaysByStudent: { [STUDENT_A_ID]: 16 },
        studentsByTenant: { [TENANT_A_ID]: [{ id: STUDENT_A_ID }] },
      });
      const processor = new RegulatoryTuslaThresholdScanProcessor(
        mockPrisma as never,
        buildTenantModuleService() as never,
      );

      await processor.process(buildJob());

      expect(mockPrisma.attendanceRecord.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          student_id: STUDENT_A_ID,
          tenant_id: TENANT_A_ID,
        }),
      });
      expect(mockPrisma.attendancePatternAlert.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          alert_type: 'excessive_absences',
          details_json: expect.objectContaining({
            count: 16,
            source: 'tusla_threshold_scan',
            status: 'approaching',
            threshold: 20,
          }),
          student_id: STUDENT_A_ID,
          tenant_id: TENANT_A_ID,
        }),
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('should create an exceeded-threshold alert when absences meet the threshold', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T12:00:00.000Z'));

    try {
      const mockPrisma = buildMockPrisma({
        absentDaysByStudent: { [STUDENT_B_ID]: 22 },
        studentsByTenant: { [TENANT_A_ID]: [{ id: STUDENT_B_ID }] },
      });
      const processor = new RegulatoryTuslaThresholdScanProcessor(
        mockPrisma as never,
        buildTenantModuleService() as never,
      );

      await processor.process(buildJob());

      expect(mockPrisma.attendancePatternAlert.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          details_json: expect.objectContaining({
            count: 22,
            status: 'exceeded',
            threshold: 20,
          }),
          student_id: STUDENT_B_ID,
        }),
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('should swallow duplicate-alert P2002 errors', async () => {
    const mockPrisma = buildMockPrisma({
      alertCreateError: { code: 'P2002' },
      absentDaysByStudent: { [STUDENT_A_ID]: 22 },
      studentsByTenant: { [TENANT_A_ID]: [{ id: STUDENT_A_ID }] },
    });
    const processor = new RegulatoryTuslaThresholdScanProcessor(
      mockPrisma as never,
      buildTenantModuleService() as never,
    );

    await expect(processor.process(buildJob())).resolves.toBeUndefined();

    expect(mockPrisma.attendancePatternAlert.create).toHaveBeenCalledTimes(1);
  });
});
