import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { EmergencyContactDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class HouseholdsRelationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Set Billing Parent ───────────────────────────────────────────────────

  async setBillingParent(tenantId: string, id: string, parentId: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.household.findFirst({
        where: { id, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          error: {
            code: 'HOUSEHOLD_NOT_FOUND',
            message: `Household with id "${id}" not found`,
          },
        });
      }

      // Validate parent is linked to this household
      const link = await db.householdParent.findUnique({
        where: {
          household_id_parent_id: {
            household_id: id,
            parent_id: parentId,
          },
        },
      });

      if (!link) {
        throw new BadRequestException({
          error: {
            code: 'PARENT_NOT_IN_HOUSEHOLD',
            message: 'The specified parent is not linked to this household',
          },
        });
      }

      const updated = await db.household.update({
        where: { id },
        data: { primary_billing_parent_id: parentId },
      });

      await this.checkNeedsCompletion(tenantId, id, db);

      return updated;
    });
  }

  // ─── Emergency Contacts ───────────────────────────────────────────────────

  async addEmergencyContact(tenantId: string, householdId: string, dto: EmergencyContactDto) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const household = await db.household.findFirst({
        where: { id: householdId, tenant_id: tenantId },
        include: { _count: { select: { emergency_contacts: true } } },
      });

      if (!household) {
        throw new NotFoundException({
          error: {
            code: 'HOUSEHOLD_NOT_FOUND',
            message: `Household with id "${householdId}" not found`,
          },
        });
      }

      const count = (household as unknown as { _count: { emergency_contacts: number } })._count
        .emergency_contacts;

      if (count >= 3) {
        throw new BadRequestException({
          error: {
            code: 'CONTACTS_LIMIT_REACHED',
            message: 'A household may have a maximum of 3 emergency contacts',
          },
        });
      }

      const contact = await db.householdEmergencyContact.create({
        data: {
          tenant_id: tenantId,
          household_id: householdId,
          contact_name: dto.contact_name,
          phone: dto.phone,
          relationship_label: dto.relationship_label ?? '',
          display_order: dto.display_order,
        },
      });

      await this.checkNeedsCompletion(tenantId, householdId, db);

      return contact;
    });
  }

  async updateEmergencyContact(
    tenantId: string,
    householdId: string,
    contactId: string,
    dto: EmergencyContactDto,
  ) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.householdEmergencyContact.findFirst({
        where: { id: contactId, household_id: householdId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          error: {
            code: 'EMERGENCY_CONTACT_NOT_FOUND',
            message: `Emergency contact with id "${contactId}" not found`,
          },
        });
      }

      return db.householdEmergencyContact.update({
        where: { id: contactId },
        data: {
          contact_name: dto.contact_name,
          phone: dto.phone,
          relationship_label: dto.relationship_label ?? existing.relationship_label,
          display_order: dto.display_order,
        },
      });
    });
  }

  async removeEmergencyContact(tenantId: string, householdId: string, contactId: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const household = await db.household.findFirst({
        where: { id: householdId, tenant_id: tenantId },
        include: { _count: { select: { emergency_contacts: true } } },
      });

      if (!household) {
        throw new NotFoundException({
          error: {
            code: 'HOUSEHOLD_NOT_FOUND',
            message: `Household with id "${householdId}" not found`,
          },
        });
      }

      const count = (household as unknown as { _count: { emergency_contacts: number } })._count
        .emergency_contacts;

      if (count <= 1) {
        throw new BadRequestException({
          error: {
            code: 'MIN_CONTACTS_REQUIRED',
            message: 'A household must have at least one emergency contact',
          },
        });
      }

      const existing = await db.householdEmergencyContact.findFirst({
        where: { id: contactId, household_id: householdId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          error: {
            code: 'EMERGENCY_CONTACT_NOT_FOUND',
            message: `Emergency contact with id "${contactId}" not found`,
          },
        });
      }

      await db.householdEmergencyContact.delete({ where: { id: contactId } });

      await this.checkNeedsCompletion(tenantId, householdId, db);
    });
  }

  // ─── Parent Links ─────────────────────────────────────────────────────────

  async linkParent(tenantId: string, householdId: string, parentId: string, roleLabel?: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const household = await db.household.findFirst({
        where: { id: householdId, tenant_id: tenantId },
      });

      if (!household) {
        throw new NotFoundException({
          error: {
            code: 'HOUSEHOLD_NOT_FOUND',
            message: `Household with id "${householdId}" not found`,
          },
        });
      }

      const parent = await db.parent.findFirst({
        where: { id: parentId, tenant_id: tenantId },
      });

      if (!parent) {
        throw new NotFoundException({
          error: {
            code: 'PARENT_NOT_FOUND',
            message: `Parent with id "${parentId}" not found`,
          },
        });
      }

      let householdParent;
      try {
        householdParent = await db.householdParent.create({
          data: {
            tenant_id: tenantId,
            household_id: householdId,
            parent_id: parentId,
            role_label: roleLabel ?? null,
          },
        });
      } catch (err: unknown) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          // Already linked — return existing record silently
          return db.householdParent.findUnique({
            where: {
              household_id_parent_id: {
                household_id: householdId,
                parent_id: parentId,
              },
            },
          });
        }
        throw err;
      }

      // ── Auto-link parent to all students already in this household ────
      const studentsInHousehold = await db.student.findMany({
        where: { household_id: householdId, tenant_id: tenantId },
        select: { id: true },
      });

      if (studentsInHousehold.length > 0) {
        await db.studentParent.createMany({
          data: studentsInHousehold.map((s) => ({
            tenant_id: tenantId,
            student_id: s.id,
            parent_id: parentId,
            relationship_label: roleLabel ?? null,
          })),
          skipDuplicates: true,
        });
      }

      return householdParent;
    });
  }

  async unlinkParent(tenantId: string, householdId: string, parentId: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const household = await db.household.findFirst({
        where: { id: householdId, tenant_id: tenantId },
      });

      if (!household) {
        throw new NotFoundException({
          error: {
            code: 'HOUSEHOLD_NOT_FOUND',
            message: `Household with id "${householdId}" not found`,
          },
        });
      }

      // Block if this parent is the billing parent
      if (household.primary_billing_parent_id === parentId) {
        throw new BadRequestException({
          error: {
            code: 'IS_BILLING_PARENT',
            message: 'Cannot unlink the billing parent. Assign a different billing parent first.',
          },
        });
      }

      const link = await db.householdParent.findUnique({
        where: {
          household_id_parent_id: {
            household_id: householdId,
            parent_id: parentId,
          },
        },
      });

      if (!link) {
        throw new NotFoundException({
          error: {
            code: 'PARENT_NOT_IN_HOUSEHOLD',
            message: 'Parent is not linked to this household',
          },
        });
      }

      await db.householdParent.delete({
        where: {
          household_id_parent_id: {
            household_id: householdId,
            parent_id: parentId,
          },
        },
      });
    });
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
}
