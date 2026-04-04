import { Injectable, NotFoundException } from '@nestjs/common';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

interface AvailabilityEntry {
  weekday: number;
  available_from: string;
  available_to: string;
}

@Injectable()
export class StaffAvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
  ) {}

  async findAll(tenantId: string, academicYearId: string, staffProfileId?: string) {
    const data = await this.prisma.staffAvailability.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        ...(staffProfileId ? { staff_profile_id: staffProfileId } : {}),
      },
      orderBy: [{ staff_profile_id: 'asc' }, { weekday: 'asc' }],
      include: {
        staff_profile: {
          select: {
            id: true,
            user: { select: { first_name: true, last_name: true } },
          },
        },
      },
    });

    return data.map((entry) => this.formatAvailability(entry));
  }

  async replaceForStaff(
    tenantId: string,
    staffProfileId: string,
    academicYearId: string,
    entries: AvailabilityEntry[],
  ) {
    // Validate staff exists and belongs to tenant
    await this.staffProfileReadFacade.existsOrThrow(tenantId, staffProfileId);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const results = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Delete all existing availability for this staff+year
      await db.staffAvailability.deleteMany({
        where: {
          tenant_id: tenantId,
          staff_profile_id: staffProfileId,
          academic_year_id: academicYearId,
        },
      });

      // Insert new entries
      if (entries.length === 0) {
        return [];
      }

      const created = await Promise.all(
        entries.map((entry) =>
          db.staffAvailability.create({
            data: {
              tenant_id: tenantId,
              staff_profile_id: staffProfileId,
              academic_year_id: academicYearId,
              weekday: entry.weekday,
              available_from: this.timeToDate(entry.available_from),
              available_to: this.timeToDate(entry.available_to),
            },
          }),
        ),
      );

      return created;
    })) as Array<Record<string, unknown>>;

    return {
      data: results.map((r) => this.formatAvailability(r)),
      count: results.length,
    };
  }

  async delete(tenantId: string, id: string) {
    const existing = await this.prisma.staffAvailability.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'AVAILABILITY_NOT_FOUND',
        message: `Staff availability with id "${id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.staffAvailability.delete({ where: { id } });
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private timeToDate(timeStr: string): Date {
    return new Date(`1970-01-01T${timeStr}:00.000Z`);
  }

  private formatTime(date: Date): string {
    return date.toISOString().slice(11, 16);
  }

  private formatAvailability(entry: Record<string, unknown>): Record<string, unknown> {
    const result = { ...entry };
    if (result['available_from'] instanceof Date) {
      result['available_from'] = this.formatTime(result['available_from'] as Date);
    }
    if (result['available_to'] instanceof Date) {
      result['available_to'] = this.formatTime(result['available_to'] as Date);
    }
    return result;
  }
}
