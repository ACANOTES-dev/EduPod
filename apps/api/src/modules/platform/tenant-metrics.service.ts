import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, type PlatformTenantMetric } from '@prisma/client';

import {
  MODULE_KEYS_ARRAY,
  tenantMetricsSnapshotSchema,
  type ModuleKey,
  type TenantMetricsSnapshot,
} from '@school/shared';

import { TenantModuleService } from '../../common/services/tenant-module.service';
import { AttendanceReadFacade } from '../attendance/attendance-read.facade';
import { FinanceReadFacade } from '../finance/finance-read.facade';
import { ParentReadFacade } from '../parents/parent-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { RbacReadFacade } from '../rbac/rbac-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';
import { StudentReadFacade } from '../students/student-read.facade';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

const METRICS_COLLECTION_INTERVAL_MS = 60 * 60 * 1000;

export interface TenantMetricsHistoryPoint {
  snapshot_date: string;
  metrics: TenantMetricsSnapshot;
}

export interface TenantMetricsResponse {
  latest: TenantMetricsSnapshot | null;
  history: TenantMetricsHistoryPoint[];
}

export interface TenantMetricsCompareResponse extends TenantMetricsResponse {
  tenant_id: string;
  tenant_name: string;
}

@Injectable()
export class TenantMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TenantMetricsService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private lastCollectionRun: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceReadFacade: AttendanceReadFacade,
    private readonly financeReadFacade: FinanceReadFacade,
    private readonly parentReadFacade: ParentReadFacade,
    private readonly rbacReadFacade: RbacReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly tenantReadFacade: TenantReadFacade,
    private readonly tenantModuleService: TenantModuleService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      void this.runDueCollection();
    }, METRICS_COLLECTION_INTERVAL_MS);
    void this.runDueCollection();
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async runDueCollection(now = new Date()): Promise<void> {
    const dayKey = now.toISOString().slice(0, 10);
    if (now.getUTCHours() < 2 || this.lastCollectionRun === dayKey) {
      return;
    }

    await this.collectDailyMetrics(now);
    this.lastCollectionRun = dayKey;
  }

  async collectDailyMetrics(now = new Date()): Promise<void> {
    this.logger.log('Starting daily tenant metrics collection');
    const tenants = await this.tenantReadFacade.findActivePlatformSummaries();
    const snapshotDate = startOfUtcDay(now);

    for (const tenant of tenants) {
      try {
        const metrics = await this.collectMetricsForTenant(tenant.id, now);
        await this.prisma.platformTenantMetric.upsert({
          where: {
            tenant_id_snapshot_date: {
              tenant_id: tenant.id,
              snapshot_date: snapshotDate,
            },
          },
          create: {
            tenant_id: tenant.id,
            snapshot_date: snapshotDate,
            metrics: toJson(metrics),
          },
          update: { metrics: toJson(metrics) },
        });
      } catch (err: unknown) {
        this.logger.error(
          `Failed to collect metrics for tenant "${tenant.name}" (${tenant.id})`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    this.logger.log(`Collected metrics for ${tenants.length} tenant(s)`);
  }

  async getMetricsForTenant(tenantId: string, days: number): Promise<TenantMetricsResponse> {
    const snapshots = await this.findSnapshots([tenantId], days);
    return this.toMetricsResponse(snapshots);
  }

  async compareMetrics(tenantIds: string[], days: number): Promise<TenantMetricsCompareResponse[]> {
    const [tenants, snapshots] = await Promise.all([
      this.tenantReadFacade.findPlatformSummariesByIds(tenantIds),
      this.findSnapshots(tenantIds, days),
    ]);
    const tenantNameById = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));

    return tenantIds.map((tenantId) => ({
      tenant_id: tenantId,
      tenant_name: tenantNameById.get(tenantId) ?? 'Unknown tenant',
      ...this.toMetricsResponse(snapshots.filter((snapshot) => snapshot.tenant_id === tenantId)),
    }));
  }

  private async collectMetricsForTenant(
    tenantId: string,
    now: Date,
  ): Promise<TenantMetricsSnapshot> {
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      studentsCount,
      staffCount,
      parentsCount,
      activeUsers24h,
      activeUsers7d,
      invoicesTotal,
      invoicesOverdue,
      enabledModules,
      lastLogin,
      errors24h,
      attendanceRateAvg,
    ] = await Promise.all([
      this.studentReadFacade.count(tenantId, { status: 'active' }),
      this.staffProfileReadFacade.count(tenantId, { employment_status: 'active' }),
      this.parentReadFacade.count(tenantId, { status: 'active' }),
      this.rbacReadFacade.countActiveMembershipsWithLoginSince(tenantId, twentyFourHoursAgo),
      this.rbacReadFacade.countActiveMembershipsWithLoginSince(tenantId, sevenDaysAgo),
      this.financeReadFacade.countInvoices(tenantId),
      this.financeReadFacade.countInvoices(tenantId, { status: 'overdue' }),
      this.tenantModuleService.getEnabledModules(tenantId),
      this.rbacReadFacade.findLastActiveMembershipLogin(tenantId),
      this.countTenantErrorsSince(tenantId, twentyFourHoursAgo),
      this.calculateAttendanceRate(tenantId, thirtyDaysAgo),
    ]);

    const enabledModuleSet = new Set<ModuleKey>(enabledModules);

    return {
      students_count: studentsCount,
      staff_count: staffCount,
      parents_count: parentsCount,
      active_users_24h: activeUsers24h,
      active_users_7d: activeUsers7d,
      invoices_total: invoicesTotal,
      invoices_overdue: invoicesOverdue,
      attendance_rate_avg: attendanceRateAvg,
      api_requests_24h: 0,
      errors_24h: errors24h,
      storage_mb: 0,
      enabled_modules: enabledModules,
      disabled_modules: MODULE_KEYS_ARRAY.filter((key) => !enabledModuleSet.has(key)),
      last_login_at: lastLogin?.toISOString() ?? null,
    };
  }

  private async countTenantErrorsSince(tenantId: string, since: Date): Promise<number> {
    const rows = await this.prisma.platformErrorLog.findMany({
      where: { tenant_id_redacted: tenantId, last_seen_at: { gte: since } },
      select: { count: true },
    });
    return rows.reduce((sum, row) => sum + row.count, 0);
  }

  private async calculateAttendanceRate(tenantId: string, since: Date): Promise<number> {
    const summaries = await this.attendanceReadFacade.groupTenantSummariesByStatus(tenantId, since);
    const total = summaries.reduce((sum, row) => sum + row._count._all, 0);
    if (total === 0) {
      return 0;
    }

    const presentEquivalent = summaries.reduce((sum, row) => {
      if (row.derived_status === 'present') return sum + row._count._all;
      if (row.derived_status === 'partially_absent' || row.derived_status === 'late') {
        return sum + row._count._all * 0.5;
      }
      return sum;
    }, 0);

    return Math.round((presentEquivalent / total) * 1000) / 10;
  }

  private async findSnapshots(tenantIds: string[], days: number): Promise<PlatformTenantMetric[]> {
    const since = startOfUtcDay(new Date());
    since.setUTCDate(since.getUTCDate() - days + 1);
    return this.prisma.platformTenantMetric.findMany({
      where: { tenant_id: { in: tenantIds }, snapshot_date: { gte: since } },
      orderBy: [{ tenant_id: 'asc' }, { snapshot_date: 'desc' }],
    });
  }

  private toMetricsResponse(snapshots: PlatformTenantMetric[]): TenantMetricsResponse {
    return {
      latest: snapshots[0] ? tenantMetricsSnapshotSchema.parse(snapshots[0].metrics) : null,
      history: snapshots.map((snapshot) => ({
        snapshot_date: snapshot.snapshot_date.toISOString().slice(0, 10),
        metrics: tenantMetricsSnapshotSchema.parse(snapshot.metrics),
      })),
    };
  }
}

function startOfUtcDay(value: Date): Date {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}
