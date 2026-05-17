import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuthReadFacade } from '../auth/auth-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { QueueManagementService } from '../queue-admin/queue-management.service';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

export interface PlatformSearchResults {
  alerts: Array<{
    fired_at: Date;
    id: string;
    message: string;
    rule_name: string;
    severity: string;
    status: string;
  }>;
  jobs: Array<{
    attempts_made: number;
    failed_reason: string | null;
    id: string;
    name: string;
    queue: string;
    status: string;
    timestamp: number;
  }>;
  tenants: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
  }>;
  users: Array<{
    email: string;
    first_name: string;
    global_status: string;
    id: string;
    last_name: string;
  }>;
}

const EMPTY_RESULTS: PlatformSearchResults = {
  alerts: [],
  jobs: [],
  tenants: [],
  users: [],
};

@Injectable()
export class PlatformSearchService {
  private readonly logger = new Logger(PlatformSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authReadFacade: AuthReadFacade,
    private readonly queueManagementService: QueueManagementService,
    private readonly tenantReadFacade: TenantReadFacade,
  ) {}

  async search(rawQuery: string): Promise<PlatformSearchResults> {
    const query = rawQuery.trim();
    if (query.length < 2) {
      return EMPTY_RESULTS;
    }

    const [tenants, users, alerts, jobs] = await Promise.all([
      this.searchTenants(query),
      this.searchUsers(query),
      this.searchAlerts(query),
      this.searchJobs(query),
    ]);

    return { alerts, jobs, tenants, users };
  }

  private searchTenants(query: string) {
    return this.tenantReadFacade.searchPlatformSummaries(query, 5);
  }

  private searchUsers(query: string) {
    return this.authReadFacade.searchUserSummaries(query, 5);
  }

  private async searchAlerts(query: string): Promise<PlatformSearchResults['alerts']> {
    const alerts = await this.prisma.platformAlertHistory.findMany({
      where: {
        OR: [
          { message: { contains: query, mode: Prisma.QueryMode.insensitive } },
          { rule: { name: { contains: query, mode: Prisma.QueryMode.insensitive } } },
        ],
      },
      orderBy: { fired_at: 'desc' },
      select: {
        fired_at: true,
        id: true,
        message: true,
        rule: { select: { name: true } },
        severity: true,
        status: true,
      },
      take: 5,
    });

    return alerts.map((alert) => ({
      fired_at: alert.fired_at,
      id: alert.id,
      message: alert.message,
      rule_name: alert.rule.name,
      severity: alert.severity,
      status: alert.status,
    }));
  }

  private async searchJobs(query: string): Promise<PlatformSearchResults['jobs']> {
    const normalizedQuery = query.toLowerCase();
    const queueNames = this.queueManagementService.getKnownQueueNames();
    const results: PlatformSearchResults['jobs'] = [];

    await Promise.all(
      queueNames.map(async (queueName) => {
        if (results.length >= 5) {
          return;
        }

        try {
          const response = await this.queueManagementService.listJobs(queueName, {
            order: 'desc',
            page: 1,
            pageSize: 10,
          });
          for (const job of response.data) {
            const haystack = [queueName, job.id, job.name, job.status, job.failed_reason ?? '']
              .join(' ')
              .toLowerCase();

            if (haystack.includes(normalizedQuery)) {
              results.push({
                attempts_made: job.attempts_made,
                failed_reason: job.failed_reason,
                id: job.id,
                name: job.name,
                queue: queueName,
                status: job.status,
                timestamp: job.timestamp,
              });
            }
          }
        } catch (err: unknown) {
          this.logger.warn(
            `Failed to search queue "${queueName}"`,
            err instanceof Error ? err.stack : String(err),
          );
        }
      }),
    );

    return results.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
  }
}
