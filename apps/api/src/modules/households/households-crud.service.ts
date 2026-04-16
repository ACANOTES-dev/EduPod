import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { CreateHouseholdDto, UpdateHouseholdDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { HouseholdNumberService } from './household-number.service';
import { buildCompletionIssues } from './households.helpers';
import type { HouseholdDetail, HouseholdListItem } from './households.service';

// ─── Query filter type ────────────────────────────────────────────────────────

interface HouseholdQueryParams {
  page: number;
  pageSize: number;
  status?: string;
  search?: string;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class HouseholdsCrudService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly householdNumberService: HouseholdNumberService,
  ) {}

  // ─── Preview ─────────────────────────────────────────────────────────────

  async previewNextNumber(tenantId: string): Promise<{ household_number: string }> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const householdNumber = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return this.householdNumberService.previewForTenant(db, tenantId);
    });

    return { household_number: householdNumber };
  }

  // ─── Create ──────────────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateHouseholdDto) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Auto-generate random 6-char household number (AAA999 format)
      const householdNumber = await this.householdNumberService.generateUniqueForTenant(
        db,
        tenantId,
      );

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
              select: { id: true, first_name: true, last_name: true, phone: true },
            },
          },
        }),
        db.household.count({ where }),
      ]);
    })) as [
      (HouseholdListItem & {
        _count: { students: number; emergency_contacts: number };
        billing_parent: {
          id: string;
          first_name: string;
          last_name: string;
          phone: string | null;
        } | null;
      })[],
      number,
    ];

    const [raw, total] = result;

    const data = raw.map((hh) => {
      const completion_issues = buildCompletionIssues(
        hh.needs_completion,
        hh._count.emergency_contacts,
        hh.primary_billing_parent_id,
      );
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

    const completion_issues = buildCompletionIssues(
      household.needs_completion,
      household.emergency_contacts.length,
      household.primary_billing_parent_id,
    );

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

  // ─── Status transition map ────────────────────────────────────────────────
  private static readonly VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
    active: ['inactive', 'archived'],
    inactive: ['active', 'archived'],
    archived: [], // archived is terminal — prevents merge-source revival
  };

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

      const allowed = HouseholdsCrudService.VALID_STATUS_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(status)) {
        throw new BadRequestException({
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message: `Cannot transition household from "${existing.status}" to "${status}"`,
          },
        });
      }

      return db.household.update({
        where: { id },
        data: { status: status as 'active' | 'inactive' | 'archived' },
      });
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async invalidatePreviewCache(householdId: string): Promise<void> {
    const client = this.redis.getClient();
    await client.del(`preview:household:${householdId}`);
  }
}
