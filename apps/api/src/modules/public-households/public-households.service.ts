import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import type { PublicHouseholdLookupDto, PublicHouseholdLookupResult } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { PublicHouseholdsRateLimitService } from './public-households-rate-limit.service';

@Injectable()
export class PublicHouseholdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: PublicHouseholdsRateLimitService,
  ) {}

  /**
   * Look up a household by number + parent email. Both must match or the
   * response is a generic 404 — never leak which half failed.
   *
   * ADM-012 hardening: the failure path adds a constant ~80ms pad so the
   * wall-clock difference between the success branch (which runs an extra
   * `_count` aggregation) and the failure branch (which short-circuits on
   * `findFirst`) is no longer measurable enough to enumerate. Combined with
   * the per-IP rate limiter and the unified error message, this leaves no
   * practical signal for an attacker to distinguish the two failure modes.
   */
  async lookupByNumberAndEmail(
    tenantId: string,
    dto: PublicHouseholdLookupDto,
    clientIp: string,
  ): Promise<PublicHouseholdLookupResult> {
    const limit = await this.rateLimit.consume(tenantId, clientIp);
    if (!limit.allowed) {
      throw new ForbiddenException({
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many lookup attempts. Please try again later.',
      });
    }

    const startedAt = Date.now();
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = await (rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const household = await db.household.findFirst({
        where: {
          tenant_id: tenantId,
          household_number: dto.household_number,
          household_parents: {
            some: {
              parent: {
                email: { equals: dto.parent_email, mode: 'insensitive' },
              },
            },
          },
        },
        select: {
          id: true,
          household_number: true,
          household_name: true,
          _count: {
            select: { students: { where: { status: 'active' } } },
          },
        },
      });

      if (!household || !household.household_number) {
        return null;
      }

      return {
        household_id: household.id,
        household_number: household.household_number,
        household_name: household.household_name,
        active_student_count: household._count.students,
      } satisfies PublicHouseholdLookupResult;
    }) as Promise<PublicHouseholdLookupResult | null>);

    if (!result) {
      // Constant-time-ish pad so the timing of the success vs failure branch
      // does not reveal which half of the (number, email) tuple matched.
      const elapsed = Date.now() - startedAt;
      const targetMs = 80;
      if (elapsed < targetMs) {
        await new Promise((resolve) => setTimeout(resolve, targetMs - elapsed));
      }
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'No household matches the number and email you provided.',
      });
    }

    return result;
  }
}
