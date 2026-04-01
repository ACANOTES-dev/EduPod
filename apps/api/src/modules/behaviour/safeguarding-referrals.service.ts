import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import type { GardaReferralDto, TuslaReferralDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SafeguardingReferralsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Referrals ──────────────────────────────────────────────────────────

  async recordTuslaReferral(
    tenantId: string,
    userId: string,
    concernId: string,
    dto: TuslaReferralDto,
  ) {
    return this.recordReferral(tenantId, userId, concernId, 'tusla', dto);
  }

  async recordGardaReferral(
    tenantId: string,
    userId: string,
    concernId: string,
    dto: GardaReferralDto,
  ) {
    return this.recordReferral(tenantId, userId, concernId, 'garda', dto);
  }

  private async recordReferral(
    tenantId: string,
    userId: string,
    concernId: string,
    type: 'tusla' | 'garda',
    dto: { reference_number: string; referred_at: string },
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const concern = await db.safeguardingConcern.findFirst({
        where: { id: concernId, tenant_id: tenantId },
      });
      if (!concern) {
        throw new NotFoundException({
          code: 'CONCERN_NOT_FOUND',
          message: 'Safeguarding concern not found',
        });
      }
      if (concern.status === ('sealed' as $Enums.SafeguardingStatus)) {
        throw new ForbiddenException({
          code: 'CONCERN_SEALED',
          message: 'Concern is sealed and cannot be modified',
        });
      }

      const updateData: Prisma.SafeguardingConcernUpdateInput =
        type === 'tusla'
          ? {
              is_tusla_referral: true,
              tusla_reference_number: dto.reference_number,
              tusla_referred_at: new Date(dto.referred_at),
            }
          : {
              is_garda_referral: true,
              garda_reference_number: dto.reference_number,
              garda_referred_at: new Date(dto.referred_at),
            };

      await db.safeguardingConcern.update({
        where: { id: concernId },
        data: updateData,
      });

      const actionType = type === 'tusla' ? 'tusla_referred' : 'garda_referred';
      await db.safeguardingAction.create({
        data: {
          tenant_id: tenantId,
          concern_id: concernId,
          action_by_id: userId,
          action_type: actionType as $Enums.SafeguardingActionType,
          description: `${type === 'tusla' ? 'Tusla' : 'Garda'} referral recorded: ${dto.reference_number}`,
          metadata: {
            reference_number: dto.reference_number,
            referred_at: dto.referred_at,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return { data: { success: true } };
    }) as Promise<{ data: { success: boolean } }>;
  }
}
