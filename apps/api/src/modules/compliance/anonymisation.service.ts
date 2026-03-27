import { Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import {
  ComplianceAnonymisationCore,
} from '@school/prisma';
import type {
  AnonymisationCleanupPlan,
  AnonymisationResult,
} from '@school/prisma';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { SearchIndexService } from '../search/search-index.service';

@Injectable()
export class AnonymisationService {
  private readonly logger = new Logger(AnonymisationService.name);
  private readonly core = new ComplianceAnonymisationCore();

  constructor(
    private readonly prisma: PrismaService,
    private readonly searchIndexService: SearchIndexService,
    private readonly s3Service: S3Service,
    private readonly redis: RedisService,
  ) {}

  async anonymiseSubject(
    tenantId: string,
    subjectType: string,
    subjectId: string,
  ): Promise<{ anonymised_entities: string[] }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    const result = await rlsClient.$transaction(async (tx: PrismaClient) => {
      return this.core.anonymiseSubject(tenantId, subjectType, subjectId, tx);
    }) as AnonymisationResult;

    await this.runCleanupPlan(tenantId, result.cleanup);

    this.logger.log(
      `Anonymised subject ${subjectType}:${subjectId} in tenant ${tenantId}. Entities: ${result.anonymised_entities.join(', ')}`,
    );

    return { anonymised_entities: result.anonymised_entities };
  }

  async anonymiseParent(
    tenantId: string,
    parentId: string,
    tx: PrismaClient,
  ): Promise<void> {
    await this.core.anonymiseParent(tenantId, parentId, tx);
  }

  async anonymiseStudent(
    tenantId: string,
    studentId: string,
    tx: PrismaClient,
  ): Promise<void> {
    await this.core.anonymiseStudent(tenantId, studentId, tx);
  }

  async anonymiseHousehold(
    tenantId: string,
    householdId: string,
    tx: PrismaClient,
  ): Promise<void> {
    await this.core.anonymiseHousehold(tenantId, householdId, tx);
  }

  async anonymiseStaff(
    tenantId: string,
    staffProfileId: string,
    tx: PrismaClient,
  ): Promise<void> {
    await this.core.anonymiseStaff(tenantId, staffProfileId, tx);
  }

  // ─── Secondary cleanup ────────────────────────────────────────────────────

  private async runCleanupPlan(
    tenantId: string,
    cleanup: AnonymisationCleanupPlan,
  ): Promise<void> {
    const results = await Promise.allSettled([
      this.removeSearchEntries(cleanup),
      this.deleteComplianceExports(cleanup),
      this.clearExportPointers(cleanup),
      this.clearRedisArtifacts(tenantId, cleanup),
    ]);

    this.logSettledFailures(results, 'runCleanupPlan');
  }

  private async removeSearchEntries(
    cleanup: AnonymisationCleanupPlan,
  ): Promise<void> {
    const results = await Promise.allSettled(
      cleanup.searchRemovals.map((removal) =>
        this.searchIndexService.removeEntity(removal.entityType, removal.entityId),
      ),
    );

    this.logSettledFailures(results, 'removeSearchEntries');
  }

  private async deleteComplianceExports(
    cleanup: AnonymisationCleanupPlan,
  ): Promise<void> {
    const results = await Promise.allSettled(
      cleanup.s3ObjectKeys.map((key) => this.s3Service.delete(key)),
    );

    this.logSettledFailures(results, 'deleteComplianceExports');
  }

  private async clearExportPointers(
    cleanup: AnonymisationCleanupPlan,
  ): Promise<void> {
    if (cleanup.complianceRequestIdsToClear.length === 0) {
      return;
    }

    await this.prisma.complianceRequest.updateMany({
      where: {
        id: { in: cleanup.complianceRequestIdsToClear },
      },
      data: {
        export_file_key: null,
      },
    });
  }

  private async clearRedisArtifacts(
    tenantId: string,
    cleanup: AnonymisationCleanupPlan,
  ): Promise<void> {
    const client = this.redis.getClient();
    const directKeys = new Set<string>(cleanup.previewKeys);

    for (const userId of cleanup.unreadNotificationUserIds) {
      directKeys.add(`tenant:${tenantId}:user:${userId}:unread_notifications`);
    }

    for (const pattern of cleanup.cachePatterns) {
      const keys = await this.findKeysByPattern(pattern);
      for (const key of keys) {
        directKeys.add(key);
      }
    }

    if (directKeys.size > 0 || cleanup.permissionMembershipIds.length > 0) {
      const pipeline = client.pipeline();

      for (const key of directKeys) {
        pipeline.del(key);
      }

      for (const membershipId of cleanup.permissionMembershipIds) {
        pipeline.del(`permissions:${membershipId}`);
      }

      await pipeline.exec();
    }

    for (const userId of cleanup.sessionUserIds) {
      const sessionIds = await client.smembers(`user_sessions:${userId}`);
      if (sessionIds.length > 0) {
        await client.del(...sessionIds.map((sessionId) => `session:${sessionId}`));
      }
      await client.del(`user_sessions:${userId}`);
    }
  }

  private async findKeysByPattern(pattern: string): Promise<string[]> {
    const client = this.redis.getClient();
    const keys = new Set<string>();
    let cursor = '0';

    do {
      const [nextCursor, foundKeys] = await client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        '100',
      );
      cursor = nextCursor;
      for (const key of foundKeys) {
        keys.add(key);
      }
    } while (cursor !== '0');

    return Array.from(keys);
  }

  private logSettledFailures(
    results: PromiseSettledResult<unknown>[],
    label: string,
  ): void {
    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.error(
          `[${label}] ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
        );
      }
    }
  }
}
