import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { MergeHouseholdDto, SplitHouseholdDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { buildHouseholdPreviewResult } from './households.helpers';

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class HouseholdsStructuralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ─── Merge ────────────────────────────────────────────────────────────────

  async merge(tenantId: string, dto: MergeHouseholdDto) {
    const { source_household_id: sourceId, target_household_id: targetId } = dto;

    if (sourceId === targetId) {
      throw new BadRequestException({
        error: {
          code: 'SAME_HOUSEHOLD',
          message: 'Source and target households must be different',
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Lock in sorted ID order to prevent deadlocks
      const [h1Id, h2Id] = [sourceId, targetId].sort();
      const rawTx = tx as unknown as { $queryRaw: (sql: Prisma.Sql) => Promise<unknown> };
      // eslint-disable-next-line school/no-raw-sql-outside-rls -- SELECT FOR UPDATE lock ordering within RLS transaction
      await rawTx.$queryRaw(
        Prisma.sql`SELECT id FROM households WHERE id = ${h1Id}::uuid FOR UPDATE`,
      );
      // eslint-disable-next-line school/no-raw-sql-outside-rls -- SELECT FOR UPDATE lock ordering within RLS transaction
      await rawTx.$queryRaw(
        Prisma.sql`SELECT id FROM households WHERE id = ${h2Id}::uuid FOR UPDATE`,
      );

      const [source, target] = await Promise.all([
        db.household.findFirst({ where: { id: sourceId, tenant_id: tenantId } }),
        db.household.findFirst({ where: { id: targetId, tenant_id: tenantId } }),
      ]);

      if (!source) {
        throw new NotFoundException({
          error: {
            code: 'HOUSEHOLD_NOT_FOUND',
            message: `Source household "${sourceId}" not found`,
          },
        });
      }

      if (!target) {
        throw new NotFoundException({
          error: {
            code: 'HOUSEHOLD_NOT_FOUND',
            message: `Target household "${targetId}" not found`,
          },
        });
      }

      if (source.status === 'archived') {
        throw new BadRequestException({
          error: {
            code: 'HOUSEHOLD_ARCHIVED',
            message: 'Source household is archived and cannot be merged',
          },
        });
      }

      if (target.status === 'archived') {
        throw new BadRequestException({
          error: {
            code: 'HOUSEHOLD_ARCHIVED',
            message: 'Target household is archived and cannot be merged',
          },
        });
      }

      // 1. Move all students from source to target
      await db.student.updateMany({
        where: { household_id: sourceId, tenant_id: tenantId },
        data: { household_id: targetId },
      });

      // 2. Move parent links — skip duplicates
      const sourceParents = await db.householdParent.findMany({
        where: { household_id: sourceId, tenant_id: tenantId },
      });

      const targetParents = await db.householdParent.findMany({
        where: { household_id: targetId, tenant_id: tenantId },
        select: { parent_id: true },
      });

      const targetParentIds = new Set(targetParents.map((p) => p.parent_id));

      for (const sp of sourceParents) {
        if (!targetParentIds.has(sp.parent_id)) {
          await db.householdParent.create({
            data: {
              tenant_id: tenantId,
              household_id: targetId,
              parent_id: sp.parent_id,
              role_label: sp.role_label,
            },
          });
        }
      }

      // 3. Move emergency contacts — up to 3 total on target
      const targetContactCount = await db.householdEmergencyContact.count({
        where: { household_id: targetId, tenant_id: tenantId },
      });

      if (targetContactCount < 3) {
        const sourceContacts = await db.householdEmergencyContact.findMany({
          where: { household_id: sourceId, tenant_id: tenantId },
          orderBy: { display_order: 'asc' },
        });

        const slotsAvailable = 3 - targetContactCount;
        const contactsToMove = sourceContacts.slice(0, slotsAvailable);

        for (let index = 0; index < contactsToMove.length; index++) {
          const contact = contactsToMove[index]!;
          await db.householdEmergencyContact.create({
            data: {
              tenant_id: tenantId,
              household_id: targetId,
              contact_name: contact.contact_name,
              phone: contact.phone,
              relationship_label: contact.relationship_label,
              display_order: targetContactCount + index + 1,
            },
          });
        }
      }

      // 4. Archive source
      await db.household.update({
        where: { id: sourceId },
        data: { status: 'archived' },
      });

      // 5. Recalculate needs_completion on target
      await this.checkNeedsCompletion(tenantId, targetId, db);

      // Return updated target
      return db.household.findFirst({
        where: { id: targetId, tenant_id: tenantId },
        include: {
          billing_parent: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
              phone: true,
              preferred_contact_channels: true,
              is_primary_contact: true,
              is_billing_contact: true,
            },
          },
          emergency_contacts: { orderBy: { display_order: 'asc' } },
          household_parents: {
            include: {
              parent: {
                select: {
                  id: true,
                  first_name: true,
                  last_name: true,
                  email: true,
                  phone: true,
                  preferred_contact_channels: true,
                  is_primary_contact: true,
                  is_billing_contact: true,
                },
              },
            },
          },
          students: {
            select: { id: true, first_name: true, last_name: true, status: true },
          },
        },
      });
    });

    // Invalidate preview cache for affected households
    await this.invalidatePreviewCache(sourceId);
    await this.invalidatePreviewCache(targetId);

    return result;
  }

  // ─── Split ────────────────────────────────────────────────────────────────

  async split(tenantId: string, dto: SplitHouseholdDto) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Lock source household
      const rawTx = tx as unknown as { $queryRaw: (sql: Prisma.Sql) => Promise<unknown> };
      // eslint-disable-next-line school/no-raw-sql-outside-rls -- SELECT FOR UPDATE lock within RLS transaction
      await rawTx.$queryRaw(
        Prisma.sql`SELECT id FROM households WHERE id = ${dto.source_household_id}::uuid FOR UPDATE`,
      );

      const source = await db.household.findFirst({
        where: { id: dto.source_household_id, tenant_id: tenantId },
      });

      if (!source) {
        throw new NotFoundException({
          error: {
            code: 'HOUSEHOLD_NOT_FOUND',
            message: `Source household "${dto.source_household_id}" not found`,
          },
        });
      }

      if (source.status === 'archived') {
        throw new BadRequestException({
          error: {
            code: 'HOUSEHOLD_ARCHIVED',
            message: 'Cannot split an archived household',
          },
        });
      }

      // 1. Create new household
      const newHousehold = await db.household.create({
        data: {
          tenant_id: tenantId,
          household_name: dto.new_household_name,
          status: 'active',
          needs_completion: true,
        },
      });

      // 2. Create emergency contacts on new household
      for (const contact of dto.emergency_contacts) {
        await db.householdEmergencyContact.create({
          data: {
            tenant_id: tenantId,
            household_id: newHousehold.id,
            contact_name: contact.contact_name,
            phone: contact.phone,
            relationship_label: contact.relationship_label ?? '',
            display_order: contact.display_order,
          },
        });
      }

      // 3. Move selected students to new household
      if (dto.student_ids.length > 0) {
        await db.student.updateMany({
          where: {
            id: { in: dto.student_ids },
            household_id: dto.source_household_id,
            tenant_id: tenantId,
          },
          data: { household_id: newHousehold.id },
        });
      }

      // 4. Link selected parents to new household
      for (const parentId of dto.parent_ids) {
        try {
          await db.householdParent.create({
            data: {
              tenant_id: tenantId,
              household_id: newHousehold.id,
              parent_id: parentId,
            },
          });
        } catch (err: unknown) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            // Already linked — skip
            continue;
          }
          throw err;
        }
      }

      // 5. Recalculate needs_completion on new household
      await this.checkNeedsCompletion(tenantId, newHousehold.id, db);

      return db.household.findFirst({
        where: { id: newHousehold.id, tenant_id: tenantId },
        include: {
          emergency_contacts: { orderBy: { display_order: 'asc' } },
          household_parents: {
            include: {
              parent: {
                select: {
                  id: true,
                  first_name: true,
                  last_name: true,
                  email: true,
                  phone: true,
                  preferred_contact_channels: true,
                  is_primary_contact: true,
                  is_billing_contact: true,
                },
              },
            },
          },
          students: {
            select: { id: true, first_name: true, last_name: true, status: true },
          },
        },
      });
    });

    // Invalidate preview cache for affected households
    await this.invalidatePreviewCache(dto.source_household_id);
    if (result) {
      await this.invalidatePreviewCache((result as { id: string }).id);
    }

    return result;
  }

  // ─── Preview ──────────────────────────────────────────────────────────────

  async preview(tenantId: string, id: string) {
    const cacheKey = `preview:household:${id}`;
    const client = this.redis.getClient();

    const cached = await client.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as unknown;
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const household = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.household.findFirst({
        where: { id, tenant_id: tenantId },
        include: {
          billing_parent: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
            },
          },
          _count: {
            select: {
              students: true,
              household_parents: true,
              emergency_contacts: true,
            },
          },
        },
      });
    })) as {
      id: string;
      household_name: string;
      status: string;
      billing_parent: { first_name: string; last_name: string } | null;
      _count: { students: number; household_parents: number; emergency_contacts: number };
    } | null;

    if (!household) {
      throw new NotFoundException({
        error: {
          code: 'HOUSEHOLD_NOT_FOUND',
          message: `Household with id "${id}" not found`,
        },
      });
    }

    const result = buildHouseholdPreviewResult(household);

    await client.setex(cacheKey, 30, JSON.stringify(result));

    return result;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async checkNeedsCompletion(
    tenantId: string,
    householdId: string,
    db: PrismaService,
  ): Promise<void> {
    const household = await db.household.findFirst({
      where: { id: householdId, tenant_id: tenantId },
      include: {
        _count: { select: { emergency_contacts: true } },
      },
    });

    if (!household) return;

    const hh = household as unknown as {
      primary_billing_parent_id: string | null;
      _count: { emergency_contacts: number };
    };

    const hasContacts = hh._count.emergency_contacts >= 1;
    const hasBillingParent = hh.primary_billing_parent_id !== null;
    const needsCompletion = !(hasContacts && hasBillingParent);

    await db.household.update({
      where: { id: householdId },
      data: { needs_completion: needsCompletion },
    });
  }

  private async invalidatePreviewCache(householdId: string): Promise<void> {
    const client = this.redis.getClient();
    await client.del(`preview:household:${householdId}`);
  }
}
