import crypto from 'crypto';

import { Injectable, NotFoundException } from '@nestjs/common';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ReportCardVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Generate Token ───────────────────────────────────────────────────────

  async generateToken(tenantId: string, reportCardId: string) {
    const reportCard = await this.prisma.reportCard.findFirst({
      where: { id: reportCardId, tenant_id: tenantId },
      select: { id: true, status: true },
    });

    if (!reportCard) {
      throw new NotFoundException({
        error: {
          code: 'REPORT_CARD_NOT_FOUND',
          message: `Report card "${reportCardId}" not found`,
        },
      });
    }

    // Return existing token if one exists
    const existing = await this.prisma.reportCardVerificationToken.findFirst({
      where: { tenant_id: tenantId, report_card_id: reportCardId },
    });
    if (existing) {
      return { token: existing.token };
    }

    // Generate new 64-char hex token
    const token = crypto.randomBytes(32).toString('hex');

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.reportCardVerificationToken.create({
        data: {
          tenant_id: tenantId,
          report_card_id: reportCardId,
          token,
        },
      });
    });

    return { token };
  }

  // ─── Verify Token (Public) ────────────────────────────────────────────────

  /**
   * Public endpoint — no auth required.
   * Returns verification info without exposing grades.
   */
  async verify(token: string) {
    const verificationToken = await this.prisma.reportCardVerificationToken.findUnique({
      where: { token },
      include: {
        report_card: {
          select: {
            id: true,
            status: true,
            published_at: true,
            student: {
              select: {
                first_name: true,
                last_name: true,
              },
            },
            academic_period: {
              select: { name: true },
            },
          },
        },
        tenant: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!verificationToken) {
      throw new NotFoundException({
        error: {
          code: 'TOKEN_NOT_FOUND',
          message: 'Verification token not found. This report card may not be authentic.',
        },
      });
    }

    // Check token expiry (RC-C002)
    if (verificationToken.expires_at && new Date() > verificationToken.expires_at) {
      throw new NotFoundException({
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'This verification token has expired.',
        },
      });
    }

    const { report_card, tenant } = verificationToken;

    if (report_card.status !== 'published') {
      throw new NotFoundException({
        error: {
          code: 'REPORT_CARD_NOT_PUBLISHED',
          message: 'This report card has not been published.',
        },
      });
    }

    return {
      valid: true,
      school_name: tenant.name,
      student_name: `${report_card.student.first_name} ${report_card.student.last_name}`,
      // Full-year report cards have a null academic_period relation — render
      // the public verification card with "Full Year" in that slot.
      period_name: report_card.academic_period?.name ?? 'Full Year',
      published_at: report_card.published_at?.toISOString() ?? null,
    };
  }
}
