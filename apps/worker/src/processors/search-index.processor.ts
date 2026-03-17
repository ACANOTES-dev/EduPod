import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface SearchIndexEntityPayload extends TenantJobPayload {
  entity_type: 'student' | 'parent' | 'staff' | 'household';
  entity_id: string;
  action: 'upsert' | 'delete';
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const SEARCH_INDEX_ENTITY_JOB = 'search:index-entity';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.SEARCH_SYNC)
export class SearchIndexProcessor extends WorkerHost {
  private readonly logger = new Logger(SearchIndexProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<SearchIndexEntityPayload>): Promise<void> {
    if (job.name !== SEARCH_INDEX_ENTITY_JOB) {
      // This processor only handles search:index-entity jobs.
      // Other job names on this queue are handled by other processors.
      return;
    }

    const { tenant_id, entity_type, entity_id, action } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${SEARCH_INDEX_ENTITY_JOB} — ${action} ${entity_type}:${entity_id} for tenant ${tenant_id}`,
    );

    const indexJob = new SearchIndexEntityJob(this.prisma);
    await indexJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class SearchIndexEntityJob extends TenantAwareJob<SearchIndexEntityPayload> {
  private readonly logger = new Logger(SearchIndexEntityJob.name);

  protected async processJob(
    data: SearchIndexEntityPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id, entity_type, entity_id, action } = data;

    if (action === 'upsert') {
      const document = await this.buildDocument(entity_type, entity_id, tenant_id, tx);

      if (!document) {
        this.logger.warn(
          `Entity not found during upsert: ${entity_type}:${entity_id} (tenant ${tenant_id}) — skipping`,
        );
        return;
      }

      // TODO: Push document to Meilisearch once the search service is wired.
      // Pattern: await meilisearchClient.index(`${tenant_id}_${entity_type}s`).addDocuments([document]);
      this.logger.log(
        `[stub] Would upsert ${entity_type}:${entity_id} to search index for tenant ${tenant_id}`,
      );
    } else {
      // action === 'delete'
      // TODO: Remove document from Meilisearch once the search service is wired.
      // Pattern: await meilisearchClient.index(`${tenant_id}_${entity_type}s`).deleteDocument(entity_id);
      this.logger.log(
        `[stub] Would delete ${entity_type}:${entity_id} from search index for tenant ${tenant_id}`,
      );
    }
  }

  /**
   * Load entity data and format it as a search document.
   * Returns null if the entity no longer exists (safe to skip).
   */
  private async buildDocument(
    entityType: SearchIndexEntityPayload['entity_type'],
    entityId: string,
    tenantId: string,
    tx: PrismaClient,
  ): Promise<Record<string, unknown> | null> {
    switch (entityType) {
      case 'student': {
        const student = await tx.student.findFirst({
          where: { id: entityId, tenant_id: tenantId },
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
        });

        if (!student) return null;

        return {
          id: student.id,
          entity_type: 'student',
          primary_label: student.full_name ?? `${student.first_name} ${student.last_name}`.trim(),
          primary_label_ar: student.full_name_ar ?? null,
          student_number: student.student_number,
          status: student.status,
          year_group_name: student.year_group?.name ?? null,
          household_name: student.household.household_name,
        };
      }

      case 'parent': {
        const parent = await tx.parent.findFirst({
          where: { id: entityId, tenant_id: tenantId },
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            phone: true,
            status: true,
          },
        });

        if (!parent) return null;

        return {
          id: parent.id,
          entity_type: 'parent',
          primary_label: `${parent.first_name} ${parent.last_name}`.trim(),
          email: parent.email,
          phone: parent.phone,
          status: parent.status,
        };
      }

      case 'staff': {
        const staff = await tx.staffProfile.findFirst({
          where: { id: entityId, tenant_id: tenantId },
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
        });

        if (!staff) return null;

        return {
          id: staff.id,
          entity_type: 'staff',
          primary_label: `${staff.user.first_name} ${staff.user.last_name}`.trim(),
          staff_number: staff.staff_number,
          job_title: staff.job_title,
          department: staff.department,
          status: staff.employment_status,
        };
      }

      case 'household': {
        const household = await tx.household.findFirst({
          where: { id: entityId, tenant_id: tenantId },
          select: {
            id: true,
            household_name: true,
            city: true,
            status: true,
          },
        });

        if (!household) return null;

        return {
          id: household.id,
          entity_type: 'household',
          primary_label: household.household_name,
          city: household.city,
          status: household.status,
        };
      }

      default: {
        const exhaustiveCheck: never = entityType;
        throw new Error(`Unknown entity type: ${String(exhaustiveCheck)}`);
      }
    }
  }
}
