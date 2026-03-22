import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateHouseholdDto,
  EmergencyContactDto,
  MergeHouseholdDto,
  SplitHouseholdDto,
  UpdateHouseholdDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SequenceService } from '../tenants/sequence.service';

// ─── Query filter type ────────────────────────────────────────────────────────

interface HouseholdQueryParams {
  page: number;
  pageSize: number;
  status?: string;
  search?: string;
}

// ─── Prisma result shapes ─────────────────────────────────────────────────────

export interface HouseholdListItem {
  id: string;
  tenant_id: string;
  household_name: string;
  household_number: string | null;
  primary_billing_parent_id: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  country: string | null;
  postal_code: string | null;
  needs_completion: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
  _count: { students: number };
}

export interface EmergencyContactRecord {
  id: string;
  tenant_id: string;
  household_id: string;
  contact_name: string;
  phone: string;
  relationship_label: string;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface ParentSummary {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  preferred_contact_channels: Prisma.JsonValue;
  is_primary_contact: boolean;
  is_billing_contact: boolean;
}

export interface HouseholdParentRecord {
  household_id: string;
  parent_id: string;
  role_label: string | null;
  tenant_id: string;
  updated_at: Date;
  parent: ParentSummary;
}

export interface HouseholdDetail {
  id: string;
  tenant_id: string;
  household_name: string;
  household_number: string | null;
  primary_billing_parent_id: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  country: string | null;
  postal_code: string | null;
  needs_completion: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
  billing_parent: ParentSummary | null;
  emergency_contacts: EmergencyContactRecord[];
  household_parents: HouseholdParentRecord[];
  students: { id: string; first_name: string; last_name: string; status: string }[];
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class HouseholdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly sequenceService: SequenceService,
  ) {}

  // ─── Create ──────────────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateHouseholdDto) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Auto-generate randomised household reference (doubles as parent initial password)
      const householdNumber = await this.sequenceService.generateHouseholdReference(tenantId, tx);

      const household = await db.household.create({
        data: {
          tenant_id: tenantId,
          household_name: dto.household_name,
          household_number: householdNumber,
          address_line_1: dto.address_line1 ?? null,
          address_line_2: dto.address_line2 ?? null,
          city: dto.city ?? null,
          country: dto.country ?? null,
          postal_code: dto.postal_code ?? null,
          status: 'active',
          needs_completion: true, // will be recalculated after contacts created
        },
      });

      // Create emergency contacts
      for (const contact of dto.emergency_contacts) {
        await db.householdEmergencyContact.create({
          data: {
            tenant_id: tenantId,
            household_id: household.id,
            contact_name: contact.contact_name,
            phone: contact.phone,
            relationship_label: contact.relationship_label ?? '',
            display_order: contact.display_order,
          },
        });
      }

      // Recalculate needs_completion — contacts exist, but no billing parent yet
      const hasContacts = dto.emergency_contacts.length >= 1;
      const needsCompletion = !(hasContacts && household.primary_billing_parent_id !== null);

      const updated = await db.household.update({
        where: { id: household.id },
        data: { needs_completion: needsCompletion },
        include: {
          emergency_contacts: true,
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
        },
      });

      return updated;
    });
  }

  // ─── Find All ─────────────────────────────────────────────────────────────

  async findAll(tenantId: string, query: HouseholdQueryParams) {
    const { page, pageSize, status, search } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.HouseholdWhereInput = { tenant_id: tenantId };

    if (status) {
      where.status = status as 'active' | 'inactive' | 'archived';
    }

    if (search) {
      where.household_name = { contains: search, mode: 'insensitive' };
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return Promise.all([
        db.household.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { created_at: 'desc' },
          include: {
            _count: { select: { students: true, emergency_contacts: true } },
            billing_parent: {
              select: { id: true, first_name: true, last_name: true },
            },
          },
        }),
        db.household.count({ where }),
      ]);
    })) as [
      (HouseholdListItem & {
        _count: { students: number; emergency_contacts: number };
        billing_parent: { id: string; first_name: string; last_name: string } | null;
      })[],
      number,
    ];

    const [raw, total] = result;

    const data = raw.map((hh) => {
      const completion_issues: string[] = [];
      if (hh.needs_completion) {
        if (hh._count.emergency_contacts < 1) completion_issues.push('missing_emergency_contact');
        if (hh.primary_billing_parent_id === null) completion_issues.push('missing_billing_parent');
      }
      return {
        id: hh.id,
        household_name: hh.household_name,
        household_number: hh.household_number ?? null,
        status: hh.status,
        needs_completion: hh.needs_completion,
        completion_issues,
        student_count: hh._count.students,
        primary_billing_parent: hh.billing_parent,
      };
    });

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  // ─── Find One ─────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
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
              email: true,
              phone: true,
              preferred_contact_channels: true,
              is_primary_contact: true,
              is_billing_contact: true,
            },
          },
          emergency_contacts: {
            orderBy: { display_order: 'asc' },
          },
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
            select: {
              id: true,
              first_name: true,
              last_name: true,
              status: true,
            },
          },
        },
      });
    })) as HouseholdDetail | null;

    if (!household) {
      throw new NotFoundException({
        error: {
          code: 'HOUSEHOLD_NOT_FOUND',
          message: `Household with id "${id}" not found`,
        },
      });
    }

    const completion_issues: string[] = [];
    if (household.needs_completion) {
      if (household.emergency_contacts.length < 1) completion_issues.push('missing_emergency_contact');
      if (household.primary_billing_parent_id === null) completion_issues.push('missing_billing_parent');
    }

    return { ...household, completion_issues };
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(tenantId: string, id: string, dto: UpdateHouseholdDto) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const household = (await prismaWithRls.$transaction(async (tx) => {
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

      return db.household.update({
        where: { id },
        data: {
          ...(dto.household_name !== undefined && { household_name: dto.household_name }),
          ...(dto.address_line1 !== undefined && { address_line_1: dto.address_line1 }),
          ...(dto.address_line2 !== undefined && { address_line_2: dto.address_line2 }),
          ...(dto.city !== undefined && { city: dto.city }),
          ...(dto.country !== undefined && { country: dto.country }),
          ...(dto.postal_code !== undefined && { postal_code: dto.postal_code }),
        },
      });
    })) as HouseholdDetail;

    // Invalidate preview cache
    await this.invalidatePreviewCache(id);

    return household;
  }

  // ─── Update Status ────────────────────────────────────────────────────────

  async updateStatus(tenantId: string, id: string, status: string) {
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

      return db.household.update({
        where: { id },
        data: { status: status as 'active' | 'inactive' | 'archived' },
      });
    });
  }

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

  async addEmergencyContact(
    tenantId: string,
    householdId: string,
    dto: EmergencyContactDto,
  ) {
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

      const count = (household as unknown as { _count: { emergency_contacts: number } })
        ._count.emergency_contacts;

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

  async removeEmergencyContact(
    tenantId: string,
    householdId: string,
    contactId: string,
  ) {
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

      const count = (household as unknown as { _count: { emergency_contacts: number } })
        ._count.emergency_contacts;

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

  async linkParent(
    tenantId: string,
    householdId: string,
    parentId: string,
    roleLabel?: string,
  ) {
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

      try {
        return await db.householdParent.create({
          data: {
            tenant_id: tenantId,
            household_id: householdId,
            parent_id: parentId,
            role_label: roleLabel ?? null,
          },
        });
      } catch (err: unknown) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
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
            message:
              'Cannot unlink the billing parent. Assign a different billing parent first.',
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
      await rawTx.$queryRaw(Prisma.sql`SELECT id FROM households WHERE id = ${h1Id}::uuid FOR UPDATE`);
      await rawTx.$queryRaw(Prisma.sql`SELECT id FROM households WHERE id = ${h2Id}::uuid FOR UPDATE`);

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
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
          ) {
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

    const billingParentName = household.billing_parent
      ? `${household.billing_parent.first_name} ${household.billing_parent.last_name}`
      : 'No billing parent';

    const result = {
      id: household.id,
      entity_type: 'household',
      primary_label: household.household_name,
      secondary_label: billingParentName,
      status: household.status,
      facts: [
        { label: 'Students', value: String(household._count.students) },
        { label: 'Parents', value: String(household._count.household_parents) },
        {
          label: 'Emergency contacts',
          value: `${household._count.emergency_contacts}/3`,
        },
      ],
    };

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
