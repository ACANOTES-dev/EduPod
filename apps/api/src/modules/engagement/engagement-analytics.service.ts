import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────────────────

type EngagementAnalyticsEventType =
  | 'school_trip'
  | 'overnight_trip'
  | 'sports_event'
  | 'cultural_event'
  | 'in_school_event'
  | 'after_school_activity'
  | 'parent_conference'
  | 'policy_signoff';

interface EngagementAnalyticsFilters {
  academic_year_id?: string;
  event_type?: EngagementAnalyticsEventType;
  date_from?: string;
  date_to?: string;
}

interface CompletionRateRow {
  id: string;
  kind: 'event' | 'form';
  name: string;
  title_ar?: string | null;
  event_type?: EngagementAnalyticsEventType;
  form_type?: string;
  start_date?: Date | null;
  end_date?: Date | null;
  due_date?: Date | null;
  total_distributed: number;
  submitted: number;
  expired: number;
  outstanding_count: number;
  completion_percentage: number;
}

type SubmissionStatusBucket = {
  total: number;
  submitted: number;
  expired: number;
};

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class EngagementAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(tenantId: string, filters: EngagementAnalyticsFilters) {
    const eventWhere = this.buildEventWhere(tenantId, filters);
    const submissionWhere = this.buildSubmissionWhere(tenantId, filters);

    const [
      totalEvents,
      eventsByType,
      responseTimes,
      completionData,
      totalFormsDistributed,
      totalSubmittedForms,
      totalOutstandingForms,
    ] = await Promise.all([
      this.prisma.engagementEvent.count({ where: eventWhere }),
      this.prisma.engagementEvent.groupBy({
        by: ['event_type'],
        where: eventWhere,
        _count: { _all: true },
      }),
      this.prisma.engagementFormSubmission.findMany({
        where: {
          ...submissionWhere,
          submitted_at: { not: null },
        },
        select: {
          created_at: true,
          submitted_at: true,
        },
      }),
      this.buildCompletionRateData(tenantId, filters),
      this.prisma.engagementFormSubmission.count({ where: submissionWhere }),
      this.prisma.engagementFormSubmission.count({
        where: {
          ...submissionWhere,
          status: { in: ['submitted', 'acknowledged', 'revoked'] },
        },
      }),
      this.prisma.engagementFormSubmission.count({
        where: {
          ...submissionWhere,
          status: { in: ['pending', 'expired'] },
        },
      }),
    ]);

    const response_time_trend = this.buildResponseTimeTrend(responseTimes);
    const average_response_time_hours = this.calculateAverageResponseTimeHours(responseTimes);
    const average_completion_rate_pct =
      totalFormsDistributed === 0 ? 0 : (totalSubmittedForms / totalFormsDistributed) * 100;

    const outstanding_items = [...completionData.events, ...completionData.forms]
      .filter((row) => row.outstanding_count > 0)
      .sort((left, right) => {
        if (right.outstanding_count !== left.outstanding_count) {
          return right.outstanding_count - left.outstanding_count;
        }

        if (left.due_date && right.due_date) {
          return left.due_date.getTime() - right.due_date.getTime();
        }

        if (left.due_date) return -1;
        if (right.due_date) return 1;
        return left.name.localeCompare(right.name);
      })
      .slice(0, 12)
      .map((row) => ({
        ...row,
        start_date: row.start_date?.toISOString() ?? null,
        end_date: row.end_date?.toISOString() ?? null,
        due_date: row.due_date?.toISOString() ?? null,
      }));

    return {
      summary: {
        total_events: totalEvents,
        total_forms_distributed: totalFormsDistributed,
        total_submissions: totalSubmittedForms,
        average_response_time_hours,
        average_completion_rate_pct,
        outstanding_action_items_count: totalOutstandingForms,
      },
      events_by_type: eventsByType.map((entry) => ({
        event_type: entry.event_type,
        total: entry._count._all,
      })),
      response_time_trend,
      outstanding_items,
    };
  }

  async getCompletionRates(tenantId: string, filters: EngagementAnalyticsFilters) {
    const completionData = await this.buildCompletionRateData(tenantId, filters);

    return {
      filters,
      event_type_completion: completionData.event_type_completion,
      events: completionData.events.map((row) => ({
        ...row,
        start_date: row.start_date?.toISOString() ?? null,
        end_date: row.end_date?.toISOString() ?? null,
        due_date: row.due_date?.toISOString() ?? null,
      })),
      forms: completionData.forms.map((row) => ({
        ...row,
        start_date: row.start_date?.toISOString() ?? null,
        end_date: row.end_date?.toISOString() ?? null,
        due_date: row.due_date?.toISOString() ?? null,
      })),
    };
  }

  async getCalendarEvents(tenantId: string, filters: EngagementAnalyticsFilters) {
    const where = this.buildCalendarWhere(tenantId, filters);

    const events = await this.prisma.engagementEvent.findMany({
      where,
      orderBy: [{ start_date: 'asc' }, { created_at: 'asc' }],
      select: {
        id: true,
        title: true,
        title_ar: true,
        start_date: true,
        end_date: true,
        event_type: true,
        status: true,
        location: true,
        location_ar: true,
      },
    });

    return {
      data: events.map((event) => ({
        id: event.id,
        title: event.title,
        title_ar: event.title_ar,
        start_date: event.start_date?.toISOString() ?? null,
        end_date: event.end_date?.toISOString() ?? event.start_date?.toISOString() ?? null,
        event_type: event.event_type,
        status: event.status,
        colour_code: this.getCalendarColourCode(event.event_type),
        location: event.location,
        location_ar: event.location_ar,
        href: `/engagement/events/${event.id}`,
      })),
    };
  }

  // ─── Completion Rate Helpers ──────────────────────────────────────────────

  private async buildCompletionRateData(tenantId: string, filters: EngagementAnalyticsFilters) {
    const eventWhere = this.buildEventWhere(tenantId, filters);
    const submissionWhere = this.buildSubmissionWhere(tenantId, filters);

    const events = await this.prisma.engagementEvent.findMany({
      where: eventWhere,
      select: {
        id: true,
        title: true,
        title_ar: true,
        event_type: true,
        start_date: true,
        end_date: true,
        consent_deadline: true,
        payment_deadline: true,
      },
      orderBy: [{ start_date: 'asc' }, { title: 'asc' }],
    });

    const eventIds = events.map((event) => event.id);

    const [eventGroups, formGroups] = await Promise.all([
      eventIds.length === 0
        ? Promise.resolve([])
        : this.prisma.engagementFormSubmission.groupBy({
            by: ['event_id', 'status'],
            where: {
              tenant_id: tenantId,
              event_id: { in: eventIds },
            },
            _count: { _all: true },
          }),
      this.prisma.engagementFormSubmission.groupBy({
        by: ['form_template_id', 'status'],
        where: submissionWhere,
        _count: { _all: true },
      }),
    ]);

    const formTemplateIds = Array.from(
      new Set(formGroups.map((group) => group.form_template_id).filter(Boolean)),
    );

    const formTemplates =
      formTemplateIds.length === 0
        ? []
        : await this.prisma.engagementFormTemplate.findMany({
            where: {
              tenant_id: tenantId,
              id: { in: formTemplateIds },
            },
            select: {
              id: true,
              name: true,
              form_type: true,
            },
            orderBy: { name: 'asc' },
          });

    const eventBuckets = this.createStatusBucketMap(
      eventGroups
        .filter((group) => group.event_id)
        .map((group) => ({
          key: group.event_id!,
          status: group.status,
          count: group._count._all,
        })),
    );

    const formBuckets = this.createStatusBucketMap(
      formGroups.map((group) => ({
        key: group.form_template_id,
        status: group.status,
        count: group._count._all,
      })),
    );

    const eventRows: CompletionRateRow[] = events.map((event) => {
      const counts = eventBuckets.get(event.id) ?? this.emptySubmissionBucket();
      return this.toCompletionRateRow({
        id: event.id,
        kind: 'event',
        name: event.title,
        title_ar: event.title_ar,
        event_type: event.event_type,
        start_date: event.start_date,
        end_date: event.end_date,
        due_date: event.consent_deadline ?? event.payment_deadline ?? event.end_date,
        counts,
      });
    });

    const formRows: CompletionRateRow[] = formTemplates.map((template) => {
      const counts = formBuckets.get(template.id) ?? this.emptySubmissionBucket();
      return this.toCompletionRateRow({
        id: template.id,
        kind: 'form',
        name: template.name,
        form_type: template.form_type,
        counts,
      });
    });

    const eventTypeMap = new Map<
      EngagementAnalyticsEventType,
      SubmissionStatusBucket & { total_events: number }
    >();

    for (const row of eventRows) {
      if (!row.event_type) continue;

      const existing = eventTypeMap.get(row.event_type) ?? {
        ...this.emptySubmissionBucket(),
        total_events: 0,
      };

      existing.total += row.total_distributed;
      existing.submitted += row.submitted;
      existing.expired += row.expired;
      existing.total_events += 1;

      eventTypeMap.set(row.event_type, existing);
    }

    const event_type_completion = Array.from(eventTypeMap.entries()).map(([eventType, counts]) => {
      const outstanding_count = Math.max(counts.total - counts.submitted - counts.expired, 0);
      return {
        event_type: eventType,
        total_events: counts.total_events,
        total_distributed: counts.total,
        submitted: counts.submitted,
        expired: counts.expired,
        outstanding_count,
        completion_percentage:
          counts.total === 0 ? 0 : Number(((counts.submitted / counts.total) * 100).toFixed(1)),
      };
    });

    return {
      events: eventRows,
      forms: formRows,
      event_type_completion,
    };
  }

  private toCompletionRateRow(input: {
    id: string;
    kind: 'event' | 'form';
    name: string;
    title_ar?: string | null;
    event_type?: EngagementAnalyticsEventType;
    form_type?: string;
    start_date?: Date | null;
    end_date?: Date | null;
    due_date?: Date | null;
    counts: SubmissionStatusBucket;
  }): CompletionRateRow {
    const outstanding_count = Math.max(
      input.counts.total - input.counts.submitted - input.counts.expired,
      0,
    );

    return {
      id: input.id,
      kind: input.kind,
      name: input.name,
      title_ar: input.title_ar,
      event_type: input.event_type,
      form_type: input.form_type,
      start_date: input.start_date,
      end_date: input.end_date,
      due_date: input.due_date,
      total_distributed: input.counts.total,
      submitted: input.counts.submitted,
      expired: input.counts.expired,
      outstanding_count,
      completion_percentage:
        input.counts.total === 0
          ? 0
          : Number(((input.counts.submitted / input.counts.total) * 100).toFixed(1)),
    };
  }

  // ─── Query Builders ───────────────────────────────────────────────────────

  private buildEventWhere(
    tenantId: string,
    filters: EngagementAnalyticsFilters,
  ): Prisma.EngagementEventWhereInput {
    const where: Prisma.EngagementEventWhereInput = {
      tenant_id: tenantId,
    };

    if (filters.academic_year_id) {
      where.academic_year_id = filters.academic_year_id;
    }

    if (filters.event_type) {
      where.event_type = filters.event_type;
    }

    const dateFilter = this.buildEventDateRangeFilter(filters.date_from, filters.date_to);

    if (dateFilter) {
      const existingAnd = where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : [];
      where.AND = [...existingAnd, dateFilter];
    }

    return where;
  }

  private buildCalendarWhere(
    tenantId: string,
    filters: EngagementAnalyticsFilters,
  ): Prisma.EngagementEventWhereInput {
    const where = this.buildEventWhere(tenantId, filters);
    where.status = {
      in: ['published', 'open', 'closed', 'in_progress', 'completed'],
    };
    where.start_date = where.start_date
      ? { ...(where.start_date as Prisma.DateTimeNullableFilter), not: null }
      : { not: null };
    return where;
  }

  private buildSubmissionWhere(
    tenantId: string,
    filters: EngagementAnalyticsFilters,
  ): Prisma.EngagementFormSubmissionWhereInput {
    const where: Prisma.EngagementFormSubmissionWhereInput = {
      tenant_id: tenantId,
    };

    if (filters.academic_year_id) {
      where.academic_year_id = filters.academic_year_id;
    }

    const createdAt = this.buildCreatedAtFilter(filters.date_from, filters.date_to);
    if (createdAt) {
      where.created_at = createdAt;
    }

    if (filters.event_type) {
      where.event = {
        event_type: filters.event_type,
      };
    }

    return where;
  }

  private buildEventDateRangeFilter(
    dateFrom?: string,
    dateTo?: string,
  ): Prisma.EngagementEventWhereInput | null {
    const from = this.toStartOfDay(dateFrom);
    const to = this.toEndOfDay(dateTo);

    if (!from && !to) {
      return null;
    }

    if (from && to) {
      return {
        OR: [
          {
            start_date: {
              gte: from,
              lte: to,
            },
          },
          {
            end_date: {
              gte: from,
              lte: to,
            },
          },
          {
            AND: [
              {
                start_date: {
                  lte: from,
                },
              },
              {
                OR: [
                  {
                    end_date: {
                      gte: to,
                    },
                  },
                  {
                    end_date: null,
                  },
                ],
              },
            ],
          },
        ],
      };
    }

    if (from) {
      return {
        OR: [
          {
            start_date: {
              gte: from,
            },
          },
          {
            end_date: {
              gte: from,
            },
          },
        ],
      };
    }

    return {
      OR: [
        {
          start_date: {
            lte: to!,
          },
        },
        {
          end_date: {
            lte: to!,
          },
        },
      ],
    };
  }

  private buildCreatedAtFilter(dateFrom?: string, dateTo?: string): Prisma.DateTimeFilter | null {
    const from = this.toStartOfDay(dateFrom);
    const to = this.toEndOfDay(dateTo);

    if (!from && !to) {
      return null;
    }

    const filter: Prisma.DateTimeFilter = {};
    if (from) filter.gte = from;
    if (to) filter.lte = to;
    return filter;
  }

  // ─── Aggregation Helpers ──────────────────────────────────────────────────

  private createStatusBucketMap(
    groups: Array<{ key: string; status: string; count: number }>,
  ): Map<string, SubmissionStatusBucket> {
    const buckets = new Map<string, SubmissionStatusBucket>();

    for (const group of groups) {
      const bucket = buckets.get(group.key) ?? this.emptySubmissionBucket();
      bucket.total += group.count;

      if (['submitted', 'acknowledged', 'revoked'].includes(group.status)) {
        bucket.submitted += group.count;
      }

      if (group.status === 'expired') {
        bucket.expired += group.count;
      }

      buckets.set(group.key, bucket);
    }

    return buckets;
  }

  private emptySubmissionBucket(): SubmissionStatusBucket {
    return {
      total: 0,
      submitted: 0,
      expired: 0,
    };
  }

  private calculateAverageResponseTimeHours(
    rows: Array<{ created_at: Date; submitted_at: Date | null }>,
  ) {
    if (rows.length === 0) {
      return 0;
    }

    const totalHours = rows.reduce((sum, row) => {
      if (!row.submitted_at) {
        return sum;
      }

      return sum + (row.submitted_at.getTime() - row.created_at.getTime()) / 3_600_000;
    }, 0);

    return Number((totalHours / rows.length).toFixed(1));
  }

  private buildResponseTimeTrend(rows: Array<{ created_at: Date; submitted_at: Date | null }>) {
    const buckets = new Map<string, { totalHours: number; submissions: number }>();

    for (const row of rows) {
      if (!row.submitted_at) {
        continue;
      }

      const bucket = row.submitted_at.toISOString().slice(0, 7);
      const existing = buckets.get(bucket) ?? { totalHours: 0, submissions: 0 };
      existing.totalHours += (row.submitted_at.getTime() - row.created_at.getTime()) / 3_600_000;
      existing.submissions += 1;
      buckets.set(bucket, existing);
    }

    return Array.from(buckets.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([bucket, value]) => ({
        bucket,
        submissions: value.submissions,
        average_response_time_hours:
          value.submissions === 0 ? 0 : Number((value.totalHours / value.submissions).toFixed(1)),
      }));
  }

  // ─── Calendar Helpers ─────────────────────────────────────────────────────

  private getCalendarColourCode(eventType: EngagementAnalyticsEventType): string {
    switch (eventType) {
      case 'school_trip':
      case 'overnight_trip':
        return '#2563eb';
      case 'parent_conference':
        return '#7c3aed';
      case 'policy_signoff':
        return '#d97706';
      case 'sports_event':
        return '#16a34a';
      case 'cultural_event':
        return '#ea580c';
      case 'after_school_activity':
        return '#0891b2';
      case 'in_school_event':
      default:
        return '#475569';
    }
  }

  // ─── Date Helpers ─────────────────────────────────────────────────────────

  private toStartOfDay(value?: string): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private toEndOfDay(value?: string): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(`${value}T23:59:59.999Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
