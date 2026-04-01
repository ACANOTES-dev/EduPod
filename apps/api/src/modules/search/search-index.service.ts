import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { MeilisearchClient } from './meilisearch.client';

interface EntityBase {
  id: string;
  tenant_id: string;
  [key: string]: unknown;
}

@Injectable()
export class SearchIndexService {
  private readonly logger = new Logger(SearchIndexService.name);

  constructor(
    private readonly meilisearch: MeilisearchClient,
    private readonly prisma: PrismaService,
  ) {}

  async indexEntity(entityType: string, entity: EntityBase): Promise<void> {
    const doc = this.formatDocument(entityType, entity);
    try {
      await this.meilisearch.addDocuments(entityType, [doc]);
      try {
        await this.prisma.searchIndexStatus.upsert({
          where: {
            idx_search_index_status_unique: {
              tenant_id: entity.tenant_id,
              entity_type: entityType,
              entity_id: entity.id,
            },
          },
          update: { index_status: 'indexed' },
          create: {
            tenant_id: entity.tenant_id,
            entity_type: entityType,
            entity_id: entity.id,
            index_status: 'indexed',
          },
        });
      } catch (e) {
        // Non-blocking — log and continue
        this.logger.warn(`Failed to upsert search_index_status for ${entityType}/${entity.id}`, e);
      }
    } catch (err) {
      // Meilisearch addDocuments failed — record status as search_failed
      try {
        await this.prisma.searchIndexStatus.upsert({
          where: {
            idx_search_index_status_unique: {
              tenant_id: entity.tenant_id,
              entity_type: entityType,
              entity_id: entity.id,
            },
          },
          update: { index_status: 'search_failed' },
          create: {
            tenant_id: entity.tenant_id,
            entity_type: entityType,
            entity_id: entity.id,
            index_status: 'search_failed',
          },
        });
      } catch (e) {
        // Non-blocking
        this.logger.warn(
          `Failed to upsert search_index_status (failed) for ${entityType}/${entity.id}`,
          e,
        );
      }
      throw err;
    }
  }

  async removeEntity(entityType: string, entityId: string): Promise<void> {
    await this.meilisearch.deleteDocument(entityType, entityId);
    try {
      await this.prisma.searchIndexStatus.deleteMany({
        where: { entity_type: entityType, entity_id: entityId },
      });
    } catch (e) {
      // Non-blocking
      this.logger.warn(`Failed to delete search_index_status for ${entityType}/${entityId}`, e);
    }
  }

  async reconcile(tenantId: string): Promise<{ reindexed: number; failed: number }> {
    const pending = await this.prisma.searchIndexStatus.findMany({
      where: {
        tenant_id: tenantId,
        index_status: { in: ['pending', 'search_failed'] },
      },
    });

    let reindexed = 0;
    let failed = 0;

    for (const record of pending) {
      try {
        const entity = await this.fetchEntity(record.entity_type, record.entity_id);
        if (entity) {
          await this.indexEntity(record.entity_type, entity);
          reindexed++;
        } else {
          // Entity no longer exists — clean up the status row
          await this.prisma.searchIndexStatus.deleteMany({
            where: { id: record.id },
          });
          failed++;
        }
      } catch (err) {
        this.logger.warn(`Failed to reindex ${record.entity_type}/${record.entity_id}`, err);
        failed++;
      }
    }

    return { reindexed, failed };
  }

  private async fetchEntity(entityType: string, entityId: string): Promise<EntityBase | null> {
    switch (entityType) {
      case 'students':
        return this.prisma.student.findUnique({
          where: { id: entityId },
        }) as Promise<EntityBase | null>;
      case 'parents':
        return this.prisma.parent.findUnique({
          where: { id: entityId },
        }) as Promise<EntityBase | null>;
      case 'staff':
        return this.prisma.staffProfile.findUnique({
          where: { id: entityId },
          include: { user: { select: { first_name: true, last_name: true } } },
        }) as Promise<EntityBase | null>;
      case 'households':
        return this.prisma.household.findUnique({
          where: { id: entityId },
        }) as Promise<EntityBase | null>;
      case 'applications':
        return this.prisma.application.findUnique({
          where: { id: entityId },
        }) as Promise<EntityBase | null>;
      default:
        return null;
    }
  }

  private formatDocument(entityType: string, entity: EntityBase): Record<string, unknown> {
    const base = { id: entity.id, tenant_id: entity.tenant_id };

    switch (entityType) {
      case 'students':
        return {
          ...base,
          first_name: entity.first_name,
          last_name: entity.last_name,
          full_name: entity.full_name,
          student_number: entity.student_number,
          status: entity.status,
        };

      case 'parents': {
        return {
          ...base,
          first_name: entity.first_name,
          last_name: entity.last_name,
          email: entity.email,
          phone: entity.phone,
          status: entity.status,
        };
      }

      case 'staff': {
        const userEntity = entity.user as { first_name?: string; last_name?: string } | undefined;
        return {
          ...base,
          first_name: userEntity?.first_name,
          last_name: userEntity?.last_name,
          job_title: entity.job_title,
          department: entity.department,
          employment_status: entity.employment_status,
        };
      }

      case 'households':
        return {
          ...base,
          household_name: entity.household_name,
          status: entity.status,
        };

      case 'applications':
        return {
          ...base,
          student_first_name: entity.student_first_name,
          student_last_name: entity.student_last_name,
          application_number: entity.application_number,
          status: entity.status,
        };

      default:
        return base;
    }
  }
}
