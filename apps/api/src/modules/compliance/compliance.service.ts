import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  isValidComplianceTransition,
  type ClassifyComplianceRequestDto,
  type ComplianceDecisionDto,
  type ComplianceFilterDto,
  type ComplianceRequestStatus,
  type CreateComplianceRequestDto,
  type ExtendComplianceRequestDto,
} from '@school/shared';
import type { GdprEntityType, GdprOutboundData } from '@school/shared/gdpr';

import { AgeGateService } from '../gdpr/age-gate.service';
import { GdprTokenService } from '../gdpr/gdpr-token.service';
import { PastoralDsarService } from '../pastoral/services/pastoral-dsar.service';
import { PrismaService } from '../prisma/prisma.service';

import { AccessExportService } from './access-export.service';
import { AnonymisationService } from './anonymisation.service';
import { DsarTraversalService } from './dsar-traversal.service';

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anonymisationService: AnonymisationService,
    private readonly accessExportService: AccessExportService,
    private readonly pastoralDsarService: PastoralDsarService,
    private readonly dsarTraversalService: DsarTraversalService,
    private readonly ageGateService: AgeGateService,
    private readonly gdprTokenService: GdprTokenService,
  ) {}

  /**
   * Create a new compliance request after validating the subject exists
   * and no duplicate active request exists.
   */
  async create(tenantId: string, userId: string, dto: CreateComplianceRequestDto) {
    // Validate subject exists in the tenant
    await this.validateSubjectExists(tenantId, dto.subject_type, dto.subject_id);

    // Check for duplicate active request (same subject, not completed/rejected)
    const existingActive = await this.prisma.complianceRequest.findFirst({
      where: {
        tenant_id: tenantId,
        subject_type: dto.subject_type,
        subject_id: dto.subject_id,
        status: { notIn: ['completed', 'rejected'] },
      },
    });

    if (existingActive) {
      throw new ConflictException({
        code: 'DUPLICATE_REQUEST',
        message: `An active compliance request already exists for this subject (id: ${existingActive.id})`,
      });
    }

    // Check age-gate for student subjects (17+ years old per DPC guidance)
    let ageGatedReview = false;
    if (dto.subject_type === 'student') {
      ageGatedReview = await this.ageGateService.checkStudentAgeGated(tenantId, dto.subject_id);
    }

    const request = await this.prisma.complianceRequest.create({
      data: {
        tenant_id: tenantId,
        request_type: dto.request_type,
        subject_type: dto.subject_type,
        subject_id: dto.subject_id,
        requested_by_user_id: userId,
        status: 'submitted',
        deadline_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        age_gated_review: ageGatedReview,
      },
      include: {
        requested_by: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
      },
    });

    return request;
  }

  /**
   * List compliance requests with pagination and optional status filter.
   */
  async list(tenantId: string, filters: ComplianceFilterDto) {
    const { page, pageSize, status } = filters;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (status) {
      where.status = status;
    }

    const [data, total] = await Promise.all([
      this.prisma.complianceRequest.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          requested_by: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.complianceRequest.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  /**
   * Grant a deadline extension (Article 12(3) — up to 2 additional months).
   */
  async extend(tenantId: string, requestId: string, dto: ExtendComplianceRequestDto) {
    const request = await this.findOrThrow(tenantId, requestId);

    if (request.status === 'completed' || request.status === 'rejected') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: 'Cannot extend a completed or rejected request',
      });
    }
    if (request.extension_granted) {
      throw new ConflictException({
        code: 'EXTENSION_ALREADY_GRANTED',
        message: 'An extension has already been granted for this request',
      });
    }

    const baseDeadline =
      request.deadline_at ?? new Date(request.created_at.getTime() + 30 * 24 * 60 * 60 * 1000);
    const extensionDeadline = new Date(baseDeadline.getTime() + 60 * 24 * 60 * 60 * 1000);

    return this.prisma.complianceRequest.update({
      where: { id: requestId },
      data: {
        extension_granted: true,
        extension_reason: dto.extension_reason,
        extension_deadline_at: extensionDeadline,
        deadline_exceeded: false,
      },
      include: {
        requested_by: {
          select: { id: true, first_name: true, last_name: true, email: true },
        },
      },
    });
  }

  /**
   * List compliance requests that are past their deadline.
   */
  async listOverdue(tenantId: string, filters: { page: number; pageSize: number }) {
    const now = new Date();
    const notInStatuses: ('completed' | 'rejected')[] = ['completed', 'rejected'];
    const where = {
      tenant_id: tenantId,
      status: { notIn: notInStatuses },
      OR: [
        { extension_granted: true, extension_deadline_at: { lt: now } },
        { extension_granted: false, deadline_at: { lt: now } },
      ],
    };

    const skip = (filters.page - 1) * filters.pageSize;
    const [data, total] = await Promise.all([
      this.prisma.complianceRequest.findMany({
        where,
        skip,
        take: filters.pageSize,
        orderBy: { deadline_at: 'asc' },
        include: {
          requested_by: {
            select: { id: true, first_name: true, last_name: true, email: true },
          },
        },
      }),
      this.prisma.complianceRequest.count({ where }),
    ]);

    return { data, meta: { page: filters.page, pageSize: filters.pageSize, total } };
  }

  /**
   * Get a single compliance request with full details.
   */
  async get(tenantId: string, requestId: string) {
    const request = await this.prisma.complianceRequest.findFirst({
      where: {
        id: requestId,
        tenant_id: tenantId,
      },
      include: {
        requested_by: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException({
        code: 'COMPLIANCE_REQUEST_NOT_FOUND',
        message: `Compliance request with id "${requestId}" not found`,
      });
    }

    return request;
  }

  /**
   * Classify a submitted compliance request.
   * State transition: submitted -> classified
   */
  async classify(tenantId: string, requestId: string, dto: ClassifyComplianceRequestDto) {
    const request = await this.findOrThrow(tenantId, requestId);

    if (!isValidComplianceTransition(request.status as ComplianceRequestStatus, 'classified')) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition from "${request.status}" to "classified"`,
      });
    }

    return this.prisma.complianceRequest.update({
      where: { id: requestId },
      data: {
        status: 'classified',
        classification: dto.classification,
        decision_notes: dto.decision_notes ?? null,
      },
      include: {
        requested_by: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Approve a classified compliance request.
   * State transition: classified -> approved
   */
  async approve(tenantId: string, requestId: string, dto: ComplianceDecisionDto) {
    const request = await this.findOrThrow(tenantId, requestId);

    if (!isValidComplianceTransition(request.status as ComplianceRequestStatus, 'approved')) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition from "${request.status}" to "approved"`,
      });
    }

    return this.prisma.complianceRequest.update({
      where: { id: requestId },
      data: {
        status: 'approved',
        decision_notes: dto.decision_notes ?? request.decision_notes,
      },
      include: {
        requested_by: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Reject a compliance request.
   * State transition: classified -> rejected
   */
  async reject(tenantId: string, requestId: string, dto: ComplianceDecisionDto) {
    const request = await this.findOrThrow(tenantId, requestId);

    if (!isValidComplianceTransition(request.status as ComplianceRequestStatus, 'rejected')) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition from "${request.status}" to "rejected"`,
      });
    }

    return this.prisma.complianceRequest.update({
      where: { id: requestId },
      data: {
        status: 'rejected',
        decision_notes: dto.decision_notes ?? request.decision_notes,
      },
      include: {
        requested_by: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Execute an approved compliance request.
   * State transition: approved -> completed
   *
   * Based on request_type:
   *   - access_export: generates an export via AccessExportService
   *   - erasure/rectification with anonymise/erase classification: runs AnonymisationService
   */
  async execute(tenantId: string, requestId: string, format: 'json' | 'csv' = 'json') {
    const request = await this.findOrThrow(tenantId, requestId);

    if (!isValidComplianceTransition(request.status as ComplianceRequestStatus, 'completed')) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition from "${request.status}" to "completed"`,
      });
    }

    // Age-gate check: must be confirmed before execution
    if (request.age_gated_review && !request.age_gated_confirmed_at) {
      throw new BadRequestException({
        code: 'AGE_GATE_NOT_CONFIRMED',
        message:
          "This request requires age-gated review confirmation before execution. The student is 17+ and per DPC guidance, school must confirm processing is in the student's best interest.",
      });
    }

    let exportFileKey: string | null = null;
    let pastoralReviewedRecords: unknown[] = [];

    // Pastoral DSAR review gate for student access exports and portability
    if (
      (request.request_type === 'access_export' || request.request_type === 'portability') &&
      request.subject_type === 'student'
    ) {
      await this.pastoralDsarService.routeForReview(
        tenantId,
        requestId,
        request.subject_id,
        request.requested_by_user_id,
      );

      const allReviewsComplete = await this.pastoralDsarService.allReviewsComplete(
        tenantId,
        requestId,
      );

      if (!allReviewsComplete) {
        return this.loadRequestWithRequester(tenantId, requestId);
      }

      pastoralReviewedRecords = await this.pastoralDsarService.getReviewedRecords(
        tenantId,
        requestId,
      );
    }

    if (request.request_type === 'access_export' || request.request_type === 'portability') {
      // Collect all subject data via DsarTraversalService
      const dataPackage = await this.dsarTraversalService.collectAllData(
        tenantId,
        request.subject_type,
        request.subject_id,
      );

      // Build extra sections (pastoral reviewed records for students)
      const extraSections: Record<string, unknown> =
        pastoralReviewedRecords.length > 0
          ? { pastoral_dsar_records: pastoralReviewedRecords }
          : {};

      const result = await this.accessExportService.exportDataPackage(
        tenantId,
        requestId,
        dataPackage,
        extraSections,
        format,
      );
      await this.gdprTokenService.processOutbound(
        tenantId,
        this.getAccessExportType(request.request_type),
        this.buildGdprAuditData(request.subject_type, request.subject_id),
        request.requested_by_user_id,
      );
      exportFileKey = result.s3Key;
    } else if (
      (request.request_type === 'erasure' || request.request_type === 'rectification') &&
      (request.classification === 'anonymise' || request.classification === 'erase')
    ) {
      await this.anonymisationService.anonymiseSubject(
        tenantId,
        request.subject_type,
        request.subject_id,
      );

      // Delete consent records for the subject
      await this.prisma.consentRecord.deleteMany({
        where: {
          tenant_id: tenantId,
          subject_type: request.subject_type,
          subject_id: request.subject_id,
        },
      });

      // Delete tokenisation mappings for the subject
      await this.prisma.gdprAnonymisationToken.deleteMany({
        where: {
          tenant_id: tenantId,
          entity_type: request.subject_type,
          entity_id: request.subject_id,
        },
      });
    }

    return this.prisma.complianceRequest.update({
      where: { id: requestId },
      data: {
        status: 'completed',
        export_file_key: exportFileKey,
      },
      include: {
        requested_by: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Confirm age-gated review for a compliance request involving a 17+ student.
   * Per DPC guidance, the school must confirm that processing is in the student's best interest.
   */
  async confirmAgeGate(tenantId: string, requestId: string, userId: string, notes?: string) {
    const request = await this.findOrThrow(tenantId, requestId);

    if (!request.age_gated_review) {
      throw new BadRequestException({
        code: 'NOT_AGE_GATED',
        message: 'This request is not flagged for age-gated review',
      });
    }

    if (request.age_gated_confirmed_at) {
      throw new ConflictException({
        code: 'ALREADY_CONFIRMED',
        message: 'Age-gated review has already been confirmed for this request',
      });
    }

    return this.prisma.complianceRequest.update({
      where: { id: requestId },
      data: {
        age_gated_confirmed_by: userId,
        age_gated_confirmed_at: new Date(),
        decision_notes: notes
          ? `${request.decision_notes ? request.decision_notes + '\n' : ''}[Age-gate confirmation] ${notes}`
          : request.decision_notes,
      },
      include: {
        requested_by: {
          select: { id: true, first_name: true, last_name: true, email: true },
        },
      },
    });
  }

  /**
   * Get a presigned S3 URL for a completed access_export request.
   */
  async getExportUrl(tenantId: string, requestId: string) {
    const request = await this.findOrThrow(tenantId, requestId);

    if (request.request_type !== 'access_export' && request.request_type !== 'portability') {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Export is only available for access_export or portability requests',
      });
    }

    if (request.status !== 'completed') {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Export is only available for completed requests',
      });
    }

    if (!request.export_file_key) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'No export file found for this request',
      });
    }

    return { export_file_key: request.export_file_key };
  }

  /**
   * Find a compliance request or throw NotFoundException.
   */
  private async findOrThrow(tenantId: string, requestId: string) {
    const request = await this.prisma.complianceRequest.findFirst({
      where: {
        id: requestId,
        tenant_id: tenantId,
      },
    });

    if (!request) {
      throw new NotFoundException({
        code: 'COMPLIANCE_REQUEST_NOT_FOUND',
        message: `Compliance request with id "${requestId}" not found`,
      });
    }

    return request;
  }

  private async loadRequestWithRequester(tenantId: string, requestId: string) {
    const request = await this.prisma.complianceRequest.findFirst({
      where: {
        id: requestId,
        tenant_id: tenantId,
      },
      include: {
        requested_by: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException({
        code: 'COMPLIANCE_REQUEST_NOT_FOUND',
        message: `Compliance request with id "${requestId}" not found`,
      });
    }

    return request;
  }

  private getAccessExportType(requestType: string): string {
    return requestType === 'portability' ? 'dsar_portability' : 'dsar_access_export';
  }

  private buildGdprAuditData(subjectType: string, subjectId: string): GdprOutboundData {
    const gdprEntityTypes = new Set<GdprEntityType>(['student', 'parent', 'staff', 'household']);

    if (gdprEntityTypes.has(subjectType as GdprEntityType)) {
      return {
        entities: [
          {
            type: subjectType as GdprEntityType,
            id: subjectId,
            fields: {},
          },
        ],
        entityCount: 1,
      };
    }

    return {
      entities: [],
      entityCount: 1,
    };
  }

  /**
   * Validate that the subject entity exists in the tenant.
   */
  private async validateSubjectExists(
    tenantId: string,
    subjectType: string,
    subjectId: string,
  ): Promise<void> {
    let exists = false;

    switch (subjectType) {
      case 'parent': {
        const parent = await this.prisma.parent.findFirst({
          where: { id: subjectId, tenant_id: tenantId },
          select: { id: true },
        });
        exists = !!parent;
        break;
      }
      case 'student': {
        const student = await this.prisma.student.findFirst({
          where: { id: subjectId, tenant_id: tenantId },
          select: { id: true },
        });
        exists = !!student;
        break;
      }
      case 'household': {
        const household = await this.prisma.household.findFirst({
          where: { id: subjectId, tenant_id: tenantId },
          select: { id: true },
        });
        exists = !!household;
        break;
      }
      case 'staff': {
        const staff = await this.prisma.staffProfile.findFirst({
          where: { id: subjectId, tenant_id: tenantId },
          select: { id: true },
        });
        exists = !!staff;
        break;
      }
      case 'applicant': {
        const applicant = await this.prisma.application.findFirst({
          where: { id: subjectId, tenant_id: tenantId },
          select: { id: true },
        });
        exists = !!applicant;
        break;
      }
      case 'user': {
        const user = await this.prisma.user.findFirst({
          where: { id: subjectId },
          select: { id: true },
        });
        exists = !!user;
        break;
      }
    }

    if (!exists) {
      throw new NotFoundException({
        code: 'SUBJECT_NOT_FOUND',
        message: `Subject of type "${subjectType}" with id "${subjectId}" not found`,
      });
    }
  }
}
