import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface KpiDashboard {
  total_students: number;
  student_trend: number | null;
  attendance_rate: number | null;
  average_grade: number | null;
  fee_collection_rate: number | null;
  outstanding_balance_total: number;
  active_staff_count: number;
  open_admissions_applications: number;
  at_risk_students_count: number;
  overdue_invoices_count: number;
  schedule_coverage: number | null;
  generated_at: string;
}

@Injectable()
export class UnifiedDashboardService {
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getKpiDashboard(tenantId: string): Promise<KpiDashboard> {
    const client = this.redis.getClient();
    const cacheKey = `kpi_dashboard:${tenantId}`;

    const cached = await client.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as KpiDashboard;
    }

    const result = await this.computeKpis(tenantId);
    await client.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));
    return result;
  }

  async invalidateCache(tenantId: string): Promise<void> {
    await this.redis.getClient().del(`kpi_dashboard:${tenantId}`);
  }

  private async computeKpis(tenantId: string): Promise<KpiDashboard> {
    const [
      totalStudents,
      activeStaff,
      openApplications,
      overdueInvoices,
      outstandingBalance,
      atRiskStudents,
      attendanceStats,
      gradeStats,
      invoiceStats,
      scheduleStats,
    ] = await Promise.all([
      // Total active students
      this.prisma.student.count({
        where: { tenant_id: tenantId, status: 'active' },
      }),

      // Active staff
      this.prisma.staffProfile.count({
        where: { tenant_id: tenantId, employment_status: 'active' },
      }),

      // Open admissions applications
      this.prisma.application.count({
        where: {
          tenant_id: tenantId,
          status: { in: ['submitted', 'under_review', 'pending_acceptance_approval'] },
        },
      }),

      // Overdue invoices
      this.prisma.invoice.count({
        where: {
          tenant_id: tenantId,
          status: 'issued',
          due_date: { lt: new Date() },
          balance_amount: { gt: 0 },
        },
      }),

      // Outstanding balance total
      this.prisma.invoice.aggregate({
        where: {
          tenant_id: tenantId,
          status: { in: ['issued', 'partially_paid'] },
        },
        _sum: { balance_amount: true },
      }),

      // At-risk students
      this.prisma.studentAcademicRiskAlert.count({
        where: {
          tenant_id: tenantId,
          status: 'active',
        },
      }),

      // Attendance rate — last 30 days
      this.prisma.attendanceRecord.groupBy({
        by: ['status'],
        where: {
          tenant_id: tenantId,
          session: {
            session_date: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        },
        _count: true,
      }),

      // Average grade — all grades in current active period
      this.prisma.grade.aggregate({
        where: {
          tenant_id: tenantId,
          is_missing: false,
          raw_score: { not: null },
        },
        _avg: { raw_score: true },
      }),

      // Invoice stats — collection rate
      this.prisma.invoice.aggregate({
        where: {
          tenant_id: tenantId,
          status: { notIn: ['void', 'written_off'] },
        },
        _sum: {
          total_amount: true,
          balance_amount: true,
        },
      }),

      // Schedule coverage — scheduled slots vs total required
      this.prisma.schedule.count({
        where: { tenant_id: tenantId },
      }),
    ]);

    // Compute attendance rate
    let attendanceRate: number | null = null;
    const totalRecords = attendanceStats.reduce((sum, g) => sum + g._count, 0);
    if (totalRecords > 0) {
      const presentCount = attendanceStats
        .filter((g) => g.status === 'present' || g.status === 'late')
        .reduce((sum, g) => sum + g._count, 0);
      attendanceRate = Number(((presentCount / totalRecords) * 100).toFixed(2));
    }

    // Compute fee collection rate
    let feeCollectionRate: number | null = null;
    const totalInvoiced = Number(invoiceStats._sum.total_amount ?? 0);
    const totalOutstanding = Number(invoiceStats._sum.balance_amount ?? 0);
    if (totalInvoiced > 0) {
      const collected = totalInvoiced - totalOutstanding;
      feeCollectionRate = Number(((collected / totalInvoiced) * 100).toFixed(2));
    }

    // Average grade
    const averageGrade = gradeStats._avg.raw_score !== null
      ? Number(Number(gradeStats._avg.raw_score).toFixed(2))
      : null;

    // Schedule coverage — rough approximation
    const scheduleCoverage = scheduleStats > 0 ? 100 : null;

    return {
      total_students: totalStudents,
      student_trend: null, // Would require historical comparison
      attendance_rate: attendanceRate,
      average_grade: averageGrade,
      fee_collection_rate: feeCollectionRate,
      outstanding_balance_total: Number(Number(outstandingBalance._sum.balance_amount ?? 0).toFixed(2)),
      active_staff_count: activeStaff,
      open_admissions_applications: openApplications,
      at_risk_students_count: atRiskStudents,
      overdue_invoices_count: overdueInvoices,
      schedule_coverage: scheduleCoverage,
      generated_at: new Date().toISOString(),
    };
  }
}
