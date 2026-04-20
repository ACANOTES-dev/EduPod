import { Injectable, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import type { RecognitionListQuery } from '@school/shared/behaviour';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourHistoryService } from './behaviour-history.service';

// ─── Interfaces ────────────────────────────────────────────────────────────

interface WallQuery {
  page: number;
  pageSize: number;
  academic_year_id?: string;
  year_group_id?: string;
  award_type_id?: string;
}

interface CreatePublicationApprovalDto {
  publication_type: string;
  entity_type: string;
  entity_id: string;
  student_id: string;
  requires_parent_consent: boolean;
  admin_approval_required: boolean;
}

// ─── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class BehaviourRecognitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly historyService: BehaviourHistoryService,
  ) {}

  // ─── Recognition List (top-level) ─────────────────────────────────────

  /**
   * Paginated recognition feed backed by positive behaviour incidents. The
   * shape matches the frontend's `RecognitionItem` so it plugs into the
   * Recognition Wall page without a transform. `status` semantics:
   *   - `published` — incidents no longer draft/withdrawn (visible to staff)
   *   - `pending`   — draft incidents still awaiting submission
   *   - `all`       — no status filter
   * The `award` field is always null here; manual awards are still served by
   * `GET /behaviour/recognition/awards` and the publication pipeline stays on
   * `/behaviour/recognition/wall`.
   */
  async listRecognition(tenantId: string, query: RecognitionListQuery) {
    const where: Prisma.BehaviourIncidentWhereInput = {
      tenant_id: tenantId,
      polarity: 'positive' as $Enums.BehaviourPolarity,
      retention_status: 'active' as $Enums.RetentionStatus,
    };
    if (query.academic_year_id) where.academic_year_id = query.academic_year_id;
    if (query.student_id) {
      where.participants = {
        some: {
          student_id: query.student_id,
          participant_type: 'student' as $Enums.ParticipantType,
        },
      };
    }
    if (query.status === 'published') {
      where.status = {
        notIn: ['draft', 'withdrawn'] as $Enums.IncidentStatus[],
      };
    } else if (query.status === 'pending') {
      where.status = 'draft' as $Enums.IncidentStatus;
    }

    const [incidents, total] = await Promise.all([
      this.prisma.behaviourIncident.findMany({
        where,
        orderBy: { occurred_at: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          category: { select: { name: true, color: true, icon: true } },
          reported_by: { select: { first_name: true, last_name: true } },
          participants: {
            where: {
              participant_type: 'student' as $Enums.ParticipantType,
              role: 'subject' as $Enums.ParticipantRole,
            },
            take: 1,
            include: {
              student: { select: { first_name: true, last_name: true } },
            },
          },
        },
      }),
      this.prisma.behaviourIncident.count({ where }),
    ]);

    const data = incidents.map((incident) => {
      const subject = incident.participants[0]?.student ?? null;
      return {
        id: incident.id,
        student: subject ? { first_name: subject.first_name, last_name: subject.last_name } : null,
        award: null,
        category: incident.category
          ? { name: incident.category.name, color: incident.category.color }
          : null,
        points: incident.severity,
        message: incident.description,
        status: incident.status,
        published_at: incident.occurred_at.toISOString(),
        created_at: incident.created_at.toISOString(),
        awarded_by_user: incident.reported_by
          ? {
              first_name: incident.reported_by.first_name,
              last_name: incident.reported_by.last_name,
            }
          : null,
      };
    });

    return {
      data,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // ─── Recognition Wall ─────────────────────────────────────────────────

  /**
   * Fetch published recognition wall items with optional filters.
   * Only returns items that are published and not unpublished.
   */
  async getWall(tenantId: string, query: WallQuery) {
    const where: Prisma.BehaviourPublicationApprovalWhereInput = {
      tenant_id: tenantId,
      published_at: { not: null },
      unpublished_at: null,
    };

    if (query.academic_year_id) {
      // Filter via the entity relation — awards have academic_year_id
      // For now we filter by student's year group as a proxy
    }

    if (query.year_group_id) {
      where.student = {
        year_group_id: query.year_group_id,
      };
    }

    if (query.award_type_id) {
      where.entity_type = 'award' as $Enums.PublicationEntityType;
      // Filter entity_id to awards of this type by joining through the entity
    }

    const [data, total] = await Promise.all([
      this.prisma.behaviourPublicationApproval.findMany({
        where,
        orderBy: { published_at: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          student: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              year_group_id: true,
              year_group: {
                select: { id: true, name: true },
              },
            },
          },
          admin_approved_by: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.behaviourPublicationApproval.count({ where }),
    ]);

    return {
      data,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // ─── Create Publication Approval ──────────────────────────────────────

  /**
   * Create a publication approval record within an existing transaction.
   * If both gates (parent consent + admin approval) pass immediately,
   * the record is published right away.
   */
  async createPublicationApproval(
    tx: PrismaService,
    tenantId: string,
    dto: CreatePublicationApprovalDto,
  ) {
    const parentConsentStatus: $Enums.ParentConsentStatus = dto.requires_parent_consent
      ? ('not_requested' as $Enums.ParentConsentStatus)
      : ('granted' as $Enums.ParentConsentStatus);

    const adminApproved = !dto.admin_approval_required;

    // Both gates pass immediately if no consent needed and no admin approval needed
    const bothGatesPass = parentConsentStatus === 'granted' && adminApproved;

    const record = await tx.behaviourPublicationApproval.create({
      data: {
        tenant_id: tenantId,
        publication_type: dto.publication_type as $Enums.PublicationType,
        entity_type: dto.entity_type as $Enums.PublicationEntityType,
        entity_id: dto.entity_id,
        student_id: dto.student_id,
        requires_parent_consent: dto.requires_parent_consent,
        parent_consent_status: parentConsentStatus,
        admin_approved: adminApproved,
        published_at: bothGatesPass ? new Date() : null,
      },
    });

    return record;
  }

  // ─── Approve Publication ──────────────────────────────────────────────

  /**
   * Admin approves a publication. If both gates (consent + admin) now pass,
   * the record is published.
   */
  async approvePublication(tenantId: string, publicationId: string, userId: string) {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const publication = await db.behaviourPublicationApproval.findFirst({
        where: { id: publicationId, tenant_id: tenantId },
      });

      if (!publication) {
        throw new NotFoundException({
          code: 'PUBLICATION_NOT_FOUND',
          message: 'Publication approval not found',
        });
      }

      const updateData: Prisma.BehaviourPublicationApprovalUpdateInput = {
        admin_approved: true,
        admin_approved_by: { connect: { id: userId } },
      };

      // Check if both gates now pass
      const consentGranted = publication.parent_consent_status === 'granted';
      if (consentGranted) {
        updateData.published_at = new Date();
      }

      const updated = await db.behaviourPublicationApproval.update({
        where: { id: publicationId },
        data: updateData,
      });

      await this.historyService.recordHistory(
        db,
        tenantId,
        'publication_approval',
        publicationId,
        userId,
        'admin_approved',
        { admin_approved: false },
        {
          admin_approved: true,
          published: consentGranted,
        },
      );

      return updated;
    });
  }

  // ─── Reject Publication ───────────────────────────────────────────────

  /**
   * Reject/unpublish a publication approval.
   */
  async rejectPublication(tenantId: string, publicationId: string, userId: string) {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const publication = await db.behaviourPublicationApproval.findFirst({
        where: { id: publicationId, tenant_id: tenantId },
      });

      if (!publication) {
        throw new NotFoundException({
          code: 'PUBLICATION_NOT_FOUND',
          message: 'Publication approval not found',
        });
      }

      const updated = await db.behaviourPublicationApproval.update({
        where: { id: publicationId },
        data: { unpublished_at: new Date() },
      });

      await this.historyService.recordHistory(
        db,
        tenantId,
        'publication_approval',
        publicationId,
        userId,
        'rejected',
        { unpublished_at: null },
        { unpublished_at: updated.unpublished_at },
      );

      return updated;
    });
  }

  // ─── Public Feed ──────────────────────────────────────────────────────

  /**
   * Public-facing feed of published recognition items.
   * No auth required. Hard-capped at 50 items max.
   */
  async getPublicFeed(tenantId: string, page: number, pageSize: number) {
    const effectivePageSize = Math.min(pageSize, 50);

    const where: Prisma.BehaviourPublicationApprovalWhereInput = {
      tenant_id: tenantId,
      published_at: { not: null },
      unpublished_at: null,
    };

    const [data, total] = await Promise.all([
      this.prisma.behaviourPublicationApproval.findMany({
        where,
        orderBy: { published_at: 'desc' },
        skip: (page - 1) * effectivePageSize,
        take: effectivePageSize,
        include: {
          student: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              year_group: {
                select: { id: true, name: true },
              },
            },
          },
        },
      }),
      this.prisma.behaviourPublicationApproval.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize: effectivePageSize, total },
    };
  }

  // ─── Publication Detail ───────────────────────────────────────────────

  /**
   * Get full publication approval record with related entities.
   */
  async getPublicationDetail(tenantId: string, id: string) {
    const publication = await this.prisma.behaviourPublicationApproval.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            year_group: {
              select: { id: true, name: true },
            },
          },
        },
        admin_approved_by: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    if (!publication) {
      throw new NotFoundException({
        code: 'PUBLICATION_NOT_FOUND',
        message: 'Publication approval not found',
      });
    }

    return publication;
  }
}
