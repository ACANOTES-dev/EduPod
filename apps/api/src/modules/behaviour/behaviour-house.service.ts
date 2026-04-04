import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourPointsService } from './behaviour-points.service';

// ─── Interfaces ────────────────────────────────────────────────────────────

interface CreateHouseDto {
  name: string;
  name_ar?: string;
  color: string;
  icon?: string;
  display_order?: number;
}

interface UpdateHouseDto {
  name?: string;
  name_ar?: string;
  color?: string;
  icon?: string;
  display_order?: number;
  is_active?: boolean;
}

interface BulkAssignment {
  student_id: string;
  house_id: string;
}

export interface HouseMemberWithPoints {
  student_id: string;
  first_name: string;
  last_name: string;
  total_points: number;
}

// ─── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class BehaviourHouseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pointsService: BehaviourPointsService,
    private readonly academicReadFacade: AcademicReadFacade,
  ) {}

  // ─── List Houses ──────────────────────────────────────────────────────

  /**
   * List active houses with member count for the current academic year.
   */
  async listHouses(tenantId: string) {
    // Find current academic year
    const currentYear = await this.academicReadFacade.findCurrentYear(tenantId);

    const houses = await this.prisma.behaviourHouseTeam.findMany({
      where: { tenant_id: tenantId, is_active: true },
      orderBy: { display_order: 'asc' },
      select: {
        id: true,
        name: true,
        name_ar: true,
        color: true,
        icon: true,
        display_order: true,
        is_active: true,
        created_at: true,
      },
    });

    if (!currentYear) {
      return houses.map((house) => ({
        ...house,
        member_count: 0,
      }));
    }

    // Get member counts per house for the current academic year
    const memberCounts =
      await this.prisma.behaviourHouseMembership.groupBy({
        by: ['house_id'],
        where: {
          tenant_id: tenantId,
          academic_year_id: currentYear.id,
        },
        _count: { student_id: true },
      });

    const countMap = new Map(
      memberCounts.map((mc) => [mc.house_id, mc._count.student_id]),
    );

    return houses.map((house) => ({
      ...house,
      member_count: countMap.get(house.id) ?? 0,
    }));
  }

  // ─── Get House Detail ─────────────────────────────────────────────────

  /**
   * Get house info with members and their individual points.
   */
  async getHouseDetail(
    tenantId: string,
    houseId: string,
    academicYearId: string,
  ) {
    const house = await this.prisma.behaviourHouseTeam.findFirst({
      where: { id: houseId, tenant_id: tenantId },
    });

    if (!house) {
      throw new NotFoundException({
        code: 'HOUSE_NOT_FOUND',
        message: 'House team not found',
      });
    }

    // Get memberships for this house in the given academic year
    const memberships =
      await this.prisma.behaviourHouseMembership.findMany({
        where: {
          tenant_id: tenantId,
          house_id: houseId,
          academic_year_id: academicYearId,
        },
        include: {
          student: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
            },
          },
        },
      });

    // Fetch individual points for each member
    const membersWithPoints: HouseMemberWithPoints[] = [];

    for (const membership of memberships) {
      const pointsResult = await this.pointsService.getStudentPoints(
        tenantId,
        membership.student_id,
      );

      membersWithPoints.push({
        student_id: membership.student.id,
        first_name: membership.student.first_name,
        last_name: membership.student.last_name,
        total_points: pointsResult.total,
      });
    }

    // Sort members by points descending
    membersWithPoints.sort((a, b) => b.total_points - a.total_points);

    return {
      ...house,
      academic_year_id: academicYearId,
      members: membersWithPoints,
      total_points: membersWithPoints.reduce(
        (sum, m) => sum + m.total_points,
        0,
      ),
    };
  }

  // ─── Create House ─────────────────────────────────────────────────────

  /**
   * Create a new house team. Name must be unique within the tenant.
   */
  async createHouse(tenantId: string, dto: CreateHouseDto) {
    // Check unique name within tenant
    const existing = await this.prisma.behaviourHouseTeam.findFirst({
      where: {
        tenant_id: tenantId,
        name: dto.name,
      },
    });

    if (existing) {
      throw new ConflictException({
        code: 'HOUSE_NAME_DUPLICATE',
        message: `A house with the name "${dto.name}" already exists`,
      });
    }

    return this.prisma.behaviourHouseTeam.create({
      data: {
        tenant_id: tenantId,
        name: dto.name,
        name_ar: dto.name_ar ?? null,
        color: dto.color,
        icon: dto.icon ?? null,
        display_order: dto.display_order ?? 0,
      },
    });
  }

  // ─── Update House ─────────────────────────────────────────────────────

  /**
   * Update a house team. If name is changed, check uniqueness.
   */
  async updateHouse(tenantId: string, id: string, dto: UpdateHouseDto) {
    const existing = await this.prisma.behaviourHouseTeam.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'HOUSE_NOT_FOUND',
        message: 'House team not found',
      });
    }

    // Check unique name if it changed
    if (dto.name !== undefined && dto.name !== existing.name) {
      const duplicate = await this.prisma.behaviourHouseTeam.findFirst({
        where: {
          tenant_id: tenantId,
          name: dto.name,
          id: { not: id },
        },
      });

      if (duplicate) {
        throw new ConflictException({
          code: 'HOUSE_NAME_DUPLICATE',
          message: `A house with the name "${dto.name}" already exists`,
        });
      }
    }

    const updateData: Prisma.BehaviourHouseTeamUpdateInput = {};

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.name_ar !== undefined) updateData.name_ar = dto.name_ar;
    if (dto.color !== undefined) updateData.color = dto.color;
    if (dto.icon !== undefined) updateData.icon = dto.icon;
    if (dto.display_order !== undefined)
      updateData.display_order = dto.display_order;
    if (dto.is_active !== undefined) updateData.is_active = dto.is_active;

    return this.prisma.behaviourHouseTeam.update({
      where: { id },
      data: updateData,
    });
  }

  // ─── Bulk Assign ──────────────────────────────────────────────────────

  /**
   * Bulk assign students to houses for a given academic year.
   * Deletes existing memberships for the listed students in that year,
   * then inserts new ones. Invalidates house points cache for affected houses.
   */
  async bulkAssign(
    tenantId: string,
    academicYearId: string,
    assignments: BulkAssignment[],
  ) {
    if (assignments.length === 0) {
      return { assigned: 0 };
    }

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return rlsClient.$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;

        const studentIds = assignments.map((a) => a.student_id);

        // Collect house IDs that currently hold these students (for cache invalidation)
        const existingMemberships =
          await db.behaviourHouseMembership.findMany({
            where: {
              tenant_id: tenantId,
              student_id: { in: studentIds },
              academic_year_id: academicYearId,
            },
            select: { house_id: true },
          });

        const previousHouseIds = [
          ...new Set(existingMemberships.map((m) => m.house_id)),
        ];

        // Delete existing memberships for listed students in this year
        await db.behaviourHouseMembership.deleteMany({
          where: {
            tenant_id: tenantId,
            student_id: { in: studentIds },
            academic_year_id: academicYearId,
          },
        });

        // Insert new memberships
        for (const assignment of assignments) {
          await db.behaviourHouseMembership.create({
            data: {
              tenant_id: tenantId,
              student_id: assignment.student_id,
              house_id: assignment.house_id,
              academic_year_id: academicYearId,
            },
          });
        }

        // Collect all affected house IDs (previous + new)
        const newHouseIds = [
          ...new Set(assignments.map((a) => a.house_id)),
        ];
        const allAffectedHouseIds = [
          ...new Set([...previousHouseIds, ...newHouseIds]),
        ];

        // Invalidate house points cache for all affected houses
        for (const houseId of allAffectedHouseIds) {
          await this.pointsService.invalidateHousePointsCache(
            tenantId,
            houseId,
            academicYearId,
          );
        }

        return { assigned: assignments.length };
      },
      { timeout: 30000 },
    );
  }
}
