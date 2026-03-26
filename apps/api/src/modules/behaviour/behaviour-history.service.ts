import { Injectable } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BehaviourHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Append a history entry inside an existing transaction.
   * This is append-only -- no updates or deletes.
   */
  async recordHistory(
    tx: PrismaService,
    tenantId: string,
    entityType: string,
    entityId: string,
    changedById: string,
    changeType: string,
    previousValues: Record<string, unknown> | null,
    newValues: Record<string, unknown>,
    reason?: string,
  ): Promise<void> {
    await tx.behaviourEntityHistory.create({
      data: {
        tenant_id: tenantId,
        entity_type: entityType as $Enums.BehaviourEntityType,
        entity_id: entityId,
        changed_by_id: changedById,
        change_type: changeType,
        previous_values:
          previousValues !== null
            ? (previousValues as Prisma.InputJsonValue)
            : Prisma.DbNull,
        new_values: newValues as Prisma.InputJsonValue,
        reason,
      },
    });
  }

  /**
   * Retrieve paginated history for a given entity.
   */
  async getHistory(
    tenantId: string,
    entityType: string,
    entityId: string,
    page: number,
    pageSize: number,
  ) {
    const where = {
      tenant_id: tenantId,
      entity_type: entityType as $Enums.BehaviourEntityType,
      entity_id: entityId,
    };

    const [data, total] = await Promise.all([
      this.prisma.behaviourEntityHistory.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          changed_by: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.behaviourEntityHistory.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }
}
