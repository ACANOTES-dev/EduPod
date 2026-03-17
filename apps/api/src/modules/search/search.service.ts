import { Injectable } from '@nestjs/common';
import type { SearchResponse, SearchResult } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { MeilisearchClient } from './meilisearch.client';

@Injectable()
export class SearchService {
  constructor(
    private readonly meilisearch: MeilisearchClient,
    private readonly prisma: PrismaService,
  ) {}

  async search(
    tenantId: string,
    query: string,
    types: string[],
    page: number,
    pageSize: number,
  ): Promise<SearchResponse> {
    if (this.meilisearch.available) {
      const results = await this.searchMeilisearch(tenantId, query, types, page, pageSize);
      if (results) return results;
    }
    return this.fallbackSearch(tenantId, query, types, page, pageSize);
  }

  // ─── Private: Meilisearch path ──────────────────────────────────────────────

  private async searchMeilisearch(
    tenantId: string,
    query: string,
    types: string[],
    page: number,
    pageSize: number,
  ): Promise<SearchResponse | null> {
    const allResults: SearchResult[] = [];

    for (const type of types) {
      const result = await this.meilisearch.search(type, query, {
        filter: [`tenant_id = "${tenantId}"`],
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });

      if (result) {
        for (const hit of result.hits) {
          const firstName = hit.first_name as string | undefined;
          const lastName = hit.last_name as string | undefined;
          const householdName = hit.household_name as string | undefined;

          allResults.push({
            entity_type: type,
            id: hit.id as string,
            primary_label:
              firstName && lastName
                ? `${firstName} ${lastName}`
                : (householdName ?? (hit.name as string | undefined) ?? ''),
            secondary_label:
              (hit.job_title as string | undefined) ??
              (hit.email as string | undefined) ??
              (hit.student_number as string | undefined) ??
              '',
            status:
              (hit.status as string | undefined) ??
              (hit.employment_status as string | undefined) ??
              '',
            highlight: query,
          });
        }
      }
    }

    return {
      results: allResults.slice(0, pageSize),
      total: allResults.length,
    };
  }

  // ─── Private: PostgreSQL fallback ───────────────────────────────────────────

  private async fallbackSearch(
    tenantId: string,
    query: string,
    types: string[],
    page: number,
    pageSize: number,
  ): Promise<SearchResponse> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;
      const results: SearchResult[] = [];

      if (types.includes('students')) {
        const students = await txClient.student.findMany({
          where: {
            tenant_id: tenantId,
            OR: [
              { first_name: { contains: query, mode: 'insensitive' } },
              { last_name: { contains: query, mode: 'insensitive' } },
              { student_number: { contains: query, mode: 'insensitive' } },
            ],
          },
          take: pageSize,
          include: { year_group: { select: { name: true } } },
        });

        for (const s of students) {
          results.push({
            entity_type: 'students',
            id: s.id,
            primary_label: `${s.first_name} ${s.last_name}`,
            secondary_label: s.year_group?.name ?? '',
            status: s.status,
            highlight: query,
          });
        }
      }

      if (types.includes('parents')) {
        const parents = await txClient.parent.findMany({
          where: {
            tenant_id: tenantId,
            OR: [
              { first_name: { contains: query, mode: 'insensitive' } },
              { last_name: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
            ],
          },
          take: pageSize,
        });

        for (const p of parents) {
          results.push({
            entity_type: 'parents',
            id: p.id,
            primary_label: `${p.first_name} ${p.last_name}`,
            secondary_label: p.email ?? '',
            status: p.status,
            highlight: query,
          });
        }
      }

      if (types.includes('staff')) {
        const staff = await txClient.staffProfile.findMany({
          where: {
            tenant_id: tenantId,
            OR: [
              { user: { first_name: { contains: query, mode: 'insensitive' } } },
              { user: { last_name: { contains: query, mode: 'insensitive' } } },
              { department: { contains: query, mode: 'insensitive' } },
            ],
          },
          take: pageSize,
          include: {
            user: { select: { first_name: true, last_name: true } },
          },
        });

        for (const s of staff) {
          results.push({
            entity_type: 'staff',
            id: s.id,
            primary_label: `${s.user.first_name} ${s.user.last_name}`,
            secondary_label: s.job_title ?? s.department ?? '',
            status: s.employment_status,
            highlight: query,
          });
        }
      }

      if (types.includes('households')) {
        const households = await txClient.household.findMany({
          where: { tenant_id: tenantId, household_name: { contains: query, mode: 'insensitive' } },
          take: pageSize,
        });

        for (const h of households) {
          results.push({
            entity_type: 'households',
            id: h.id,
            primary_label: h.household_name,
            secondary_label: '',
            status: h.status,
            highlight: query,
          });
        }
      }

      return {
        results: results.slice(0, pageSize),
        total: results.length,
      };
    }) as Promise<SearchResponse>;
  }
}
