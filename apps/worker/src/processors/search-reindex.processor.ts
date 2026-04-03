import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

// Only tenant_id is required — reindexes all entity types for the tenant.
export type SearchFullReindexPayload = TenantJobPayload;

// ─── Job name ─────────────────────────────────────────────────────────────────

export const SEARCH_FULL_REINDEX_JOB = 'search:full-reindex';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.SEARCH_SYNC, {
  lockDuration: 120_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class SearchReindexProcessor extends WorkerHost {
  private readonly logger = new Logger(SearchReindexProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<SearchFullReindexPayload>): Promise<void> {
    if (job.name !== SEARCH_FULL_REINDEX_JOB) {
      // This processor only handles search:full-reindex jobs.
      // Other job names on this queue are handled by other processors.
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(`Processing ${SEARCH_FULL_REINDEX_JOB} for tenant ${tenant_id}`);

    const reindexJob = new SearchFullReindexJob(this.prisma);
    await reindexJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

/**
 * Batch sizes for each entity type — controls how many records are loaded
 * and pushed to the search index per iteration.
 */
const BATCH_SIZE = 200;

class SearchFullReindexJob extends TenantAwareJob<SearchFullReindexPayload> {
  private readonly logger = new Logger(SearchFullReindexJob.name);

  protected async processJob(data: SearchFullReindexPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id } = data;

    this.logger.log(`Starting full reindex for tenant ${tenant_id}`);

    await this.reindexStudents(tenant_id, tx);
    await this.reindexParents(tenant_id, tx);
    await this.reindexStaff(tenant_id, tx);
    await this.reindexHouseholds(tenant_id, tx);

    this.logger.log(`Full reindex complete for tenant ${tenant_id}`);
  }

  // ─── Entity reindexers ─────────────────────────────────────────────────────

  private async reindexStudents(tenantId: string, tx: PrismaClient): Promise<void> {
    let skip = 0;
    let batch: unknown[];

    do {
      batch = await tx.student.findMany({
        where: { tenant_id: tenantId },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          full_name: true,
          first_name_ar: true,
          last_name_ar: true,
          full_name_ar: true,
          student_number: true,
          status: true,
          year_group: { select: { name: true } },
          household: { select: { household_name: true } },
        },
        skip,
        take: BATCH_SIZE,
        orderBy: { created_at: 'asc' },
      });

      if (batch.length > 0) {
        const documents = (
          batch as Array<{
            id: string;
            first_name: string;
            last_name: string;
            full_name: string | null;
            first_name_ar: string | null;
            last_name_ar: string | null;
            full_name_ar: string | null;
            student_number: string | null;
            status: string;
            year_group: { name: string } | null;
            household: { household_name: string };
          }>
        ).map((s) => ({
          id: s.id,
          entity_type: 'student',
          primary_label: s.full_name ?? `${s.first_name} ${s.last_name}`.trim(),
          primary_label_ar: s.full_name_ar ?? null,
          student_number: s.student_number,
          status: s.status,
          year_group_name: s.year_group?.name ?? null,
          household_name: s.household.household_name,
        }));

        // TODO: Push documents batch to Meilisearch once the search service is wired.
        // Pattern: await meilisearchClient.index(`${tenantId}_students`).addDocuments(documents);
        this.logger.log(
          `[stub] Would index ${String(documents.length)} students for tenant ${tenantId}`,
        );

        skip += BATCH_SIZE;
      }
    } while (batch.length === BATCH_SIZE);
  }

  private async reindexParents(tenantId: string, tx: PrismaClient): Promise<void> {
    let skip = 0;
    let batch: unknown[];

    do {
      batch = await tx.parent.findMany({
        where: { tenant_id: tenantId },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          phone: true,
          status: true,
        },
        skip,
        take: BATCH_SIZE,
        orderBy: { created_at: 'asc' },
      });

      if (batch.length > 0) {
        const documents = (
          batch as Array<{
            id: string;
            first_name: string;
            last_name: string;
            email: string | null;
            phone: string | null;
            status: string;
          }>
        ).map((p) => ({
          id: p.id,
          entity_type: 'parent',
          primary_label: `${p.first_name} ${p.last_name}`.trim(),
          email: p.email,
          phone: p.phone,
          status: p.status,
        }));

        // TODO: Push documents batch to Meilisearch once the search service is wired.
        // Pattern: await meilisearchClient.index(`${tenantId}_parents`).addDocuments(documents);
        this.logger.log(
          `[stub] Would index ${String(documents.length)} parents for tenant ${tenantId}`,
        );

        skip += BATCH_SIZE;
      }
    } while (batch.length === BATCH_SIZE);
  }

  private async reindexStaff(tenantId: string, tx: PrismaClient): Promise<void> {
    let skip = 0;
    let batch: unknown[];

    do {
      batch = await tx.staffProfile.findMany({
        where: { tenant_id: tenantId },
        select: {
          id: true,
          staff_number: true,
          job_title: true,
          department: true,
          employment_status: true,
          user: {
            select: {
              first_name: true,
              last_name: true,
              email: true,
            },
          },
        },
        skip,
        take: BATCH_SIZE,
        orderBy: { created_at: 'asc' },
      });

      if (batch.length > 0) {
        const documents = (
          batch as Array<{
            id: string;
            staff_number: string | null;
            job_title: string | null;
            department: string | null;
            employment_status: string;
            user: { first_name: string; last_name: string; email: string };
          }>
        ).map((s) => ({
          id: s.id,
          entity_type: 'staff',
          primary_label: `${s.user.first_name} ${s.user.last_name}`.trim(),
          staff_number: s.staff_number,
          job_title: s.job_title,
          department: s.department,
          status: s.employment_status,
        }));

        // TODO: Push documents batch to Meilisearch once the search service is wired.
        // Pattern: await meilisearchClient.index(`${tenantId}_staff`).addDocuments(documents);
        this.logger.log(
          `[stub] Would index ${String(documents.length)} staff for tenant ${tenantId}`,
        );

        skip += BATCH_SIZE;
      }
    } while (batch.length === BATCH_SIZE);
  }

  private async reindexHouseholds(tenantId: string, tx: PrismaClient): Promise<void> {
    let skip = 0;
    let batch: unknown[];

    do {
      batch = await tx.household.findMany({
        where: { tenant_id: tenantId },
        select: {
          id: true,
          household_name: true,
          city: true,
          status: true,
        },
        skip,
        take: BATCH_SIZE,
        orderBy: { created_at: 'asc' },
      });

      if (batch.length > 0) {
        const documents = (
          batch as Array<{
            id: string;
            household_name: string;
            city: string | null;
            status: string;
          }>
        ).map((h) => ({
          id: h.id,
          entity_type: 'household',
          primary_label: h.household_name,
          city: h.city,
          status: h.status,
        }));

        // TODO: Push documents batch to Meilisearch once the search service is wired.
        // Pattern: await meilisearchClient.index(`${tenantId}_households`).addDocuments(documents);
        this.logger.log(
          `[stub] Would index ${String(documents.length)} households for tenant ${tenantId}`,
        );

        skip += BATCH_SIZE;
      }
    } while (batch.length === BATCH_SIZE);
  }
}
