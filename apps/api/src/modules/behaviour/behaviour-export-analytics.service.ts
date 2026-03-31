import { Injectable } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import type { BehaviourAnalyticsQuery, CsvExportQuery } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

import { buildCsv, buildIncidentWhere } from './behaviour-analytics-helpers';
import { BehaviourIncidentAnalyticsService } from './behaviour-incident-analytics.service';
import { BehaviourSanctionAnalyticsService } from './behaviour-sanction-analytics.service';
import { BehaviourScopeService } from './behaviour-scope.service';
import { BehaviourStaffAnalyticsService } from './behaviour-staff-analytics.service';

@Injectable()
export class BehaviourExportAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: BehaviourScopeService,
    private readonly incidentAnalytics: BehaviourIncidentAnalyticsService,
    private readonly sanctionAnalytics: BehaviourSanctionAnalyticsService,
    private readonly staffAnalytics: BehaviourStaffAnalyticsService,
  ) {}

  // ─── CSV Export ────────────────────────────────────────────────────────────

  async exportCsv(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: CsvExportQuery,
  ): Promise<{ content: string; filename: string }> {
    const { exportType, ...analyticsQuery } = query;
    const timestamp = new Date().toISOString().slice(0, 10);

    switch (exportType) {
      case 'incidents': {
        const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);
        const where = buildIncidentWhere(
          tenantId,
          analyticsQuery,
          scope,
          userId,
          this.scopeService,
        );
        const incidents = await this.prisma.behaviourIncident.findMany({
          where,
          select: {
            incident_number: true,
            polarity: true,
            severity: true,
            description: true,
            occurred_at: true,
            status: true,
            category: { select: { name: true } },
            reported_by: { select: { first_name: true, last_name: true } },
            participants: {
              where: { participant_type: 'student' as $Enums.ParticipantType },
              select: {
                student: { select: { first_name: true, last_name: true } },
              },
            },
          },
          orderBy: { occurred_at: 'desc' },
        });

        const headers = [
          'Incident Number',
          'Date',
          'Category',
          'Polarity',
          'Severity',
          'Status',
          'Reported By',
          'Students',
          'Description',
        ];
        const rows = incidents.map((inc) => [
          inc.incident_number,
          inc.occurred_at.toISOString(),
          inc.category.name,
          inc.polarity as string,
          String(inc.severity),
          inc.status as string,
          `${inc.reported_by.first_name} ${inc.reported_by.last_name}`,
          inc.participants
            .map((p) => (p.student ? `${p.student.first_name} ${p.student.last_name}` : ''))
            .filter(Boolean)
            .join('; '),
          inc.description,
        ]);

        return {
          content: buildCsv(headers, rows),
          filename: `behaviour-incidents-${timestamp}.csv`,
        };
      }

      case 'sanctions': {
        const sanctionResult = await this.sanctionAnalytics.getSanctions(
          tenantId,
          userId,
          permissions,
          analyticsQuery as BehaviourAnalyticsQuery,
        );
        const headers = ['Sanction Type', 'Total', 'Served', 'No Show'];
        const rows = sanctionResult.entries.map((e) => [
          e.sanction_type,
          String(e.total),
          String(e.served),
          String(e.no_show),
        ]);
        return {
          content: buildCsv(headers, rows),
          filename: `behaviour-sanctions-${timestamp}.csv`,
        };
      }

      case 'interventions': {
        const interventionResult = await this.sanctionAnalytics.getInterventionOutcomes(
          tenantId,
          analyticsQuery as BehaviourAnalyticsQuery,
        );
        const headers = ['Outcome', 'Count', 'SEND Count', 'Non-SEND Count'];
        const rows = interventionResult.entries.map((e) => [
          e.outcome,
          String(e.count),
          String(e.send_count),
          String(e.non_send_count),
        ]);
        return {
          content: buildCsv(headers, rows),
          filename: `behaviour-interventions-${timestamp}.csv`,
        };
      }

      case 'categories': {
        const categoryResult = await this.incidentAnalytics.getCategories(
          tenantId,
          userId,
          permissions,
          analyticsQuery as BehaviourAnalyticsQuery,
        );
        const headers = ['Category', 'Polarity', 'Count', 'Rate per 100 Students'];
        const rows = categoryResult.categories.map((c) => [
          c.category_name,
          c.polarity,
          String(c.count),
          c.rate_per_100 !== null ? String(c.rate_per_100) : '',
        ]);
        return {
          content: buildCsv(headers, rows),
          filename: `behaviour-categories-${timestamp}.csv`,
        };
      }

      case 'staff_activity': {
        const staffResult = await this.staffAnalytics.getStaffActivity(
          tenantId,
          analyticsQuery as BehaviourAnalyticsQuery,
        );
        const headers = [
          'Staff Name',
          'Last 7 Days',
          'Last 30 Days',
          'Year Total',
          'Last Logged At',
          'Inactive',
        ];
        const rows = staffResult.staff.map((s) => [
          s.staff_name,
          String(s.last_7_days),
          String(s.last_30_days),
          String(s.total_year),
          s.last_logged_at ?? '',
          s.inactive_flag ? 'Yes' : 'No',
        ]);
        return {
          content: buildCsv(headers, rows),
          filename: `behaviour-staff-activity-${timestamp}.csv`,
        };
      }

      default:
        return { content: '', filename: `behaviour-export-${timestamp}.csv` };
    }
  }
}
