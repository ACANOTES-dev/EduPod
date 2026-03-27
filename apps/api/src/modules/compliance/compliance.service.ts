import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ClassifyComplianceRequestDto,
  ComplianceDecisionDto,
  ComplianceFilterDto,
  CreateComplianceRequestDto,
} from '@school/shared';

import { PastoralDsarService } from '../pastoral/services/pastoral-dsar.service';
import { PrismaService } from '../prisma/prisma.service';

import { AccessExportService } from './access-export.service';
import { AnonymisationService } from './anonymisation.service';

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anonymisationService: AnonymisationService,
    private readonly accessExportService: AccessExportService,
    private readonly pastoralDsarService: PastoralDsarService,
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

    const request = await this.prisma.complianceRequest.create({
      data: {
        tenant_id: tenantId,
        request_type: dto.request_type,
        subject_type: dto.subject_type,
        subject_id: dto.subject_id,
        requested_by_user_id: userId,
        status: 'submitted',
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

    if (request.status !== 'submitted') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Cannot classify a request with status "${request.status}". Expected "submitted".`,
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

    if (request.status !== 'classified') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Cannot approve a request with status "${request.status}". Expected "classified".`,
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
   * State transition: submitted|classified -> rejected
   */
  async reject(tenantId: string, requestId: string, dto: ComplianceDecisionDto) {
    const request = await this.findOrThrow(tenantId, requestId);

    if (request.status !== 'submitted' && request.status !== 'classified') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Cannot reject a request with status "${request.status}". Expected "submitted" or "classified".`,
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
  async execute(tenantId: string, requestId: string) {
    const request = await this.findOrThrow(tenantId, requestId);

    if (request.status !== 'approved') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Cannot execute a request with status "${request.status}". Expected "approved".`,
      });
    }

    let exportFileKey: string | null = null;

    if (request.request_type === 'access_export') {
      const result = await this.accessExportService.exportSubjectData(
        tenantId,
        request.subject_type,
        request.subject_id,
        requestId,
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
    }

    // Route pastoral records for DSAR review if subject is a student
    if (request.request_type === 'access_export' && request.subject_type === 'student') {
      await this.pastoralDsarService.routeForReview(
        tenantId,
        requestId,
        request.subject_id,
        request.requested_by_user_id,
      );
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
   * Get a presigned S3 URL for a completed access_export request.
   */
  async getExportUrl(tenantId: string, requestId: string) {
    const request = await this.findOrThrow(tenantId, requestId);

    if (request.request_type !== 'access_export') {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Export is only available for access_export requests',
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
