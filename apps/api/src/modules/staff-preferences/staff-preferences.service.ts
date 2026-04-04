import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { SchedulingPreferenceType } from '@prisma/client';
import { Prisma } from '@prisma/client';

import type {
  CreateStaffPreferenceDto,
  PreferencePayloadDto,
  UpdateStaffPreferenceDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

@Injectable()
export class StaffPreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
  ) {}

  async findAll(tenantId: string, academicYearId: string, staffProfileId?: string) {
    const data = await this.prisma.staffSchedulingPreference.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        ...(staffProfileId ? { staff_profile_id: staffProfileId } : {}),
      },
      orderBy: [{ staff_profile_id: 'asc' }, { created_at: 'asc' }],
      include: {
        staff_profile: {
          select: {
            id: true,
            user: { select: { first_name: true, last_name: true } },
          },
        },
      },
    });

    return { data };
  }

  async findOwnPreferences(tenantId: string, userId: string, academicYearId: string) {
    // Resolve staff_profile_id from user's profile
    const staffProfile = await this.staffProfileReadFacade.findByUserId(tenantId, userId);

    if (!staffProfile) {
      throw new NotFoundException({
        code: 'STAFF_PROFILE_NOT_FOUND',
        message: 'No staff profile found for this user',
      });
    }

    const data = await this.prisma.staffSchedulingPreference.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        staff_profile_id: staffProfile.id,
      },
      orderBy: { created_at: 'asc' },
    });

    return { data };
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateStaffPreferenceDto,
    userPermissions: string[],
  ) {
    const canManageAll = userPermissions.includes('schedule.manage_preferences');
    const canManageOwn = userPermissions.includes('schedule.manage_own_preferences');

    if (!canManageAll && !canManageOwn) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message:
          'Missing required permission: schedule.manage_preferences or schedule.manage_own_preferences',
      });
    }

    // For self-service: verify staff_profile_id matches caller
    if (!canManageAll && canManageOwn) {
      await this.assertOwnProfile(tenantId, userId, dto.staff_profile_id);
    }

    // Derive preference_type from payload type
    const preferenceType = this.resolvePreferenceType(dto.preference_payload);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.staffSchedulingPreference.create({
        data: {
          tenant_id: tenantId,
          staff_profile_id: dto.staff_profile_id,
          academic_year_id: dto.academic_year_id,
          preference_type: preferenceType,
          preference_payload: dto.preference_payload as unknown as Prisma.InputJsonValue,
          priority: dto.priority ?? 'medium',
        },
      });
    });
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateStaffPreferenceDto,
    userPermissions: string[],
  ) {
    const existing = await this.assertExists(tenantId, id);

    const canManageAll = userPermissions.includes('schedule.manage_preferences');
    const canManageOwn = userPermissions.includes('schedule.manage_own_preferences');

    if (!canManageAll && !canManageOwn) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message:
          'Missing required permission: schedule.manage_preferences or schedule.manage_own_preferences',
      });
    }

    // For self-service: verify ownership
    if (!canManageAll && canManageOwn) {
      await this.assertOwnProfile(tenantId, userId, existing.staff_profile_id);
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const updateData: Prisma.StaffSchedulingPreferenceUpdateInput = {};

      if (dto.preference_payload !== undefined) {
        updateData.preference_type = this.resolvePreferenceType(dto.preference_payload);
        updateData.preference_payload = dto.preference_payload as unknown as Prisma.InputJsonValue;
      }
      if (dto.priority !== undefined) updateData.priority = dto.priority;

      return db.staffSchedulingPreference.update({
        where: { id },
        data: updateData,
      });
    });
  }

  async delete(tenantId: string, userId: string, id: string, userPermissions: string[]) {
    const existing = await this.assertExists(tenantId, id);

    const canManageAll = userPermissions.includes('schedule.manage_preferences');
    const canManageOwn = userPermissions.includes('schedule.manage_own_preferences');

    if (!canManageAll && !canManageOwn) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message:
          'Missing required permission: schedule.manage_preferences or schedule.manage_own_preferences',
      });
    }

    // For self-service: verify ownership
    if (!canManageAll && canManageOwn) {
      await this.assertOwnProfile(tenantId, userId, existing.staff_profile_id);
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.staffSchedulingPreference.delete({ where: { id } });
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private resolvePreferenceType(payload: PreferencePayloadDto): SchedulingPreferenceType {
    return payload.type as SchedulingPreferenceType;
  }

  private async assertExists(tenantId: string, id: string) {
    const pref = await this.prisma.staffSchedulingPreference.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, staff_profile_id: true },
    });

    if (!pref) {
      throw new NotFoundException({
        code: 'PREFERENCE_NOT_FOUND',
        message: `Staff scheduling preference with id "${id}" not found`,
      });
    }

    return pref;
  }

  private async assertOwnProfile(
    tenantId: string,
    userId: string,
    targetStaffProfileId: string,
  ): Promise<void> {
    const staffProfile = await this.staffProfileReadFacade.findByUserId(tenantId, userId);

    if (!staffProfile || staffProfile.id !== targetStaffProfileId) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'You can only manage your own scheduling preferences',
      });
    }
  }
}
