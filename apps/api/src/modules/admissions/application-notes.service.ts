import { Injectable, NotFoundException } from '@nestjs/common';

import type { CreateApplicationNoteDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApplicationNotesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create ──────────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    applicationId: string,
    userId: string,
    dto: CreateApplicationNoteDto,
  ) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Verify application exists
      const application = await db.application.findFirst({
        where: { id: applicationId, tenant_id: tenantId },
      });

      if (!application) {
        throw new NotFoundException({
          error: {
            code: 'APPLICATION_NOT_FOUND',
            message: `Application with id "${applicationId}" not found`,
          },
        });
      }

      return db.applicationNote.create({
        data: {
          tenant_id: tenantId,
          application_id: applicationId,
          author_user_id: userId,
          note: dto.note,
          is_internal: dto.is_internal,
        },
        include: {
          author: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
            },
          },
        },
      });
    });
  }

  // ─── Find By Application ──────────────────────────────────────────────────

  async findByApplication(tenantId: string, applicationId: string, includeInternal: boolean) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Verify application exists
      const application = await db.application.findFirst({
        where: { id: applicationId, tenant_id: tenantId },
      });

      if (!application) {
        throw new NotFoundException({
          error: {
            code: 'APPLICATION_NOT_FOUND',
            message: `Application with id "${applicationId}" not found`,
          },
        });
      }

      const where: Record<string, unknown> = {
        application_id: applicationId,
        tenant_id: tenantId,
      };

      // If not including internal notes (parent view), filter them out
      if (!includeInternal) {
        where.is_internal = false;
      }

      return db.applicationNote.findMany({
        where,
        orderBy: { created_at: 'desc' },
        include: {
          author: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
            },
          },
        },
      });
    });
  }

  // ─── Most recent payment-link regenerate (ADM-031 cooldown source) ─────

  /**
   * Returns the most recent `Regenerated payment link` audit note for the
   * given application, or null if no such note exists. Used by the
   * regenerate endpoint to enforce a 60-second cooldown.
   */
  async findMostRecentRegenerate(
    tenantId: string,
    applicationId: string,
  ): Promise<{ created_at: Date } | null> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.applicationNote.findFirst({
        where: {
          tenant_id: tenantId,
          application_id: applicationId,
          note: { startsWith: 'Regenerated payment link' },
        },
        orderBy: { created_at: 'desc' },
        select: { created_at: true },
      });
    });
  }
}
