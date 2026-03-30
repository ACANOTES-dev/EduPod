import { Injectable } from '@nestjs/common';

import { ReportsDataAccessService } from './reports-data-access.service';

export interface PipelineFunnelResult {
  applied_count: number;
  under_review_count: number;
  accepted_count: number;
  enrolled_count: number;
  applied_to_review_rate: number;
  review_to_accepted_rate: number;
  accepted_to_enrolled_rate: number;
  overall_conversion_rate: number;
}

export interface ProcessingTimeResult {
  average_days_to_decision: number | null;
  min_days: number | null;
  max_days: number | null;
  sample_size: number;
}

export interface RejectionReasonEntry {
  reason: string;
  count: number;
  percentage: number;
}

export interface MonthlyApplicationsDataPoint {
  month: string;
  count: number;
  accepted_count: number;
  rejected_count: number;
}

export interface YearGroupDemandEntry {
  year_group_name: string | null;
  application_count: number;
  accepted_count: number;
  conversion_rate: number;
}

@Injectable()
export class AdmissionsAnalyticsService {
  constructor(private readonly dataAccess: ReportsDataAccessService) {}

  async pipelineFunnel(
    tenantId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<PipelineFunnelResult> {
    const dateFilter: Record<string, unknown> = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);
    const hasDates = Object.keys(dateFilter).length > 0;

    const baseWhere: Record<string, unknown> = {
      ...(hasDates && { submitted_at: dateFilter }),
    };

    const [appliedCount, underReviewCount, acceptedCount, enrolledCount] = await Promise.all([
      this.dataAccess.countApplications(tenantId, {
        ...baseWhere,
        status: { notIn: ['draft', 'withdrawn'] },
      }),
      this.dataAccess.countApplications(tenantId, {
        ...baseWhere,
        status: { in: ['under_review', 'pending_acceptance_approval'] },
      }),
      this.dataAccess.countApplications(tenantId, {
        ...baseWhere,
        status: 'accepted',
      }),
      this.dataAccess.countStudents(tenantId, { status: 'active' }),
    ]);

    const safe = (n: number, d: number): number => (d > 0 ? Number(((n / d) * 100).toFixed(2)) : 0);

    return {
      applied_count: appliedCount,
      under_review_count: underReviewCount,
      accepted_count: acceptedCount,
      enrolled_count: enrolledCount,
      applied_to_review_rate: safe(underReviewCount, appliedCount),
      review_to_accepted_rate: safe(acceptedCount, underReviewCount),
      accepted_to_enrolled_rate: safe(enrolledCount, acceptedCount),
      overall_conversion_rate: safe(enrolledCount, appliedCount),
    };
  }

  async processingTime(
    tenantId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<ProcessingTimeResult> {
    const dateFilter: Record<string, unknown> = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);
    const hasDates = Object.keys(dateFilter).length > 0;

    const decidedApplications = (await this.dataAccess.findApplications(tenantId, {
      where: {
        status: { in: ['accepted', 'rejected'] },
        submitted_at: { not: null },
        reviewed_at: { not: null },
        ...(hasDates && { submitted_at: dateFilter }),
      },
      select: { submitted_at: true, reviewed_at: true },
    })) as Array<{ submitted_at: Date | null; reviewed_at: Date | null }>;

    if (decidedApplications.length === 0) {
      return { average_days_to_decision: null, min_days: null, max_days: null, sample_size: 0 };
    }

    const daysArray = decidedApplications
      .filter((a) => a.submitted_at && a.reviewed_at)
      .map((a) => {
        const ms = new Date(a.reviewed_at!).getTime() - new Date(a.submitted_at!).getTime();
        return ms / (1000 * 60 * 60 * 24);
      });

    if (daysArray.length === 0) {
      return { average_days_to_decision: null, min_days: null, max_days: null, sample_size: 0 };
    }

    const avgDays = daysArray.reduce((s, d) => s + d, 0) / daysArray.length;

    return {
      average_days_to_decision: Number(avgDays.toFixed(1)),
      min_days: Number(Math.min(...daysArray).toFixed(1)),
      max_days: Number(Math.max(...daysArray).toFixed(1)),
      sample_size: daysArray.length,
    };
  }

  async rejectionReasons(
    tenantId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<RejectionReasonEntry[]> {
    const dateFilter: Record<string, unknown> = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);
    const hasDates = Object.keys(dateFilter).length > 0;

    const rejectedApplications = (await this.dataAccess.findApplications(tenantId, {
      where: {
        status: 'rejected',
        ...(hasDates && { decided_at: dateFilter }),
      },
      select: { rejection_reason: true },
    })) as Array<{ rejection_reason: string | null }>;

    const reasonMap = new Map<string, number>();
    for (const app of rejectedApplications) {
      const reason = app.rejection_reason ?? 'No reason provided';
      reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1);
    }

    const total = rejectedApplications.length;

    return Array.from(reasonMap.entries())
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: total > 0 ? Number(((count / total) * 100).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  async monthlyApplications(
    tenantId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<MonthlyApplicationsDataPoint[]> {
    const dateFilter: Record<string, unknown> = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);
    const hasDates = Object.keys(dateFilter).length > 0;

    const applications = (await this.dataAccess.findApplications(tenantId, {
      where: {
        submitted_at: { not: null },
        ...(hasDates && { submitted_at: dateFilter }),
      },
      select: { submitted_at: true, status: true },
      orderBy: { submitted_at: 'asc' },
    })) as Array<{ submitted_at: Date | null; status: string }>;

    const monthMap = new Map<string, { count: number; accepted: number; rejected: number }>();

    for (const app of applications) {
      if (!app.submitted_at) continue;
      const month = new Date(app.submitted_at).toISOString().slice(0, 7);
      const entry = monthMap.get(month) ?? { count: 0, accepted: 0, rejected: 0 };
      entry.count++;
      if (app.status === 'accepted') entry.accepted++;
      if (app.status === 'rejected') entry.rejected++;
      monthMap.set(month, entry);
    }

    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, stats]) => ({
        month,
        count: stats.count,
        accepted_count: stats.accepted,
        rejected_count: stats.rejected,
      }));
  }

  async yearGroupDemand(
    tenantId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<YearGroupDemandEntry[]> {
    const dateFilter: Record<string, unknown> = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);
    const hasDates = Object.keys(dateFilter).length > 0;

    const applications = (await this.dataAccess.findApplications(tenantId, {
      where: {
        submitted_at: { not: null },
        ...(hasDates && { submitted_at: dateFilter }),
        status: { notIn: ['draft', 'withdrawn'] },
      },
      select: { payload_json: true, status: true },
    })) as Array<{ payload_json: unknown; status: string }>;

    const demandMap = new Map<string, { count: number; accepted: number }>();

    for (const app of applications) {
      const payload = app.payload_json as Record<string, unknown>;
      const yearGroupName = (payload.year_group as string) ?? 'Not specified';
      const entry = demandMap.get(yearGroupName) ?? { count: 0, accepted: 0 };
      entry.count++;
      if (app.status === 'accepted') entry.accepted++;
      demandMap.set(yearGroupName, entry);
    }

    return Array.from(demandMap.entries())
      .map(([name, stats]) => ({
        year_group_name: name,
        application_count: stats.count,
        accepted_count: stats.accepted,
        conversion_rate:
          stats.count > 0 ? Number(((stats.accepted / stats.count) * 100).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.application_count - a.application_count);
  }
}
