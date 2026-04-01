import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import type { ConsentCaptureDto, ReviewApplicationDto } from '@school/shared';
import { CONSENT_TYPES, consentCaptureSchema, mapConsentCaptureToTypes } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { ApprovalRequestsService } from '../approvals/approval-requests.service';
import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexService } from '../search/search-index.service';

const CONSENT_CAPTURE_PAYLOAD_KEY = '__consents';

// ─── Valid status transitions ─────────────────────────────────────────────────

const VALID_REVIEW_TRANSITIONS: Record<string, string[]> = {
  submitted: ['under_review', 'rejected'],
  under_review: ['pending_acceptance_approval', 'rejected'],
  pending_acceptance_approval: ['rejected'],
};

const WITHDRAWABLE_STATUSES = ['draft', 'submitted', 'under_review', 'pending_acceptance_approval'];

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ApplicationStateMachineService {
  private readonly logger = new Logger(ApplicationStateMachineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalRequestsService: ApprovalRequestsService,
    private readonly searchIndexService: SearchIndexService,
  ) {}

  // ─── Submit ───────────────────────────────────────────────────────────────

  async submit(tenantId: string, applicationId: string, userId: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

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

      if (application.status !== 'draft') {
        throw new BadRequestException({
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message: `Cannot submit an application with status "${application.status}". Only draft applications can be submitted.`,
          },
        });
      }

      // Ownership guard: verify the calling user owns this application
      // (either they created it or they are a parent linked to it)
      const parent = await db.parent.findFirst({
        where: {
          tenant_id: tenantId,
          user_id: userId,
        },
      });

      const parentId = parent?.id ?? null;

      if (application.submitted_by_parent_id && application.submitted_by_parent_id !== parentId) {
        throw new ForbiddenException({
          error: {
            code: 'NOT_APPLICATION_OWNER',
            message: 'You do not have permission to submit this application',
          },
        });
      }

      // Check for potential duplicates (same name + DOB within this tenant)
      if (application.date_of_birth) {
        const duplicates = await db.application.findMany({
          where: {
            tenant_id: tenantId,
            id: { not: applicationId },
            student_first_name: {
              equals: application.student_first_name,
              mode: 'insensitive',
            },
            student_last_name: {
              equals: application.student_last_name,
              mode: 'insensitive',
            },
            date_of_birth: application.date_of_birth,
            status: {
              notIn: ['withdrawn', 'rejected'],
            },
          },
        });

        if (duplicates.length > 0) {
          // Flag as potential duplicate but still allow submission
          await db.applicationNote.create({
            data: {
              tenant_id: tenantId,
              application_id: applicationId,
              author_user_id: userId,
              note: `Potential duplicate detected: ${duplicates.length} existing application(s) with same name and date of birth (${duplicates.map((d) => d.application_number).join(', ')}).`,
              is_internal: true,
            },
          });
        }
      }

      const updated = await db.application.update({
        where: { id: applicationId },
        data: {
          status: 'submitted',
          submitted_at: new Date(),
          submitted_by_parent_id: parentId,
        },
      });

      const payload = application.payload_json as Record<string, unknown>;
      const parsedConsents = consentCaptureSchema.safeParse(payload[CONSENT_CAPTURE_PAYLOAD_KEY]);

      if (parsedConsents.success) {
        const capture = parsedConsents.data as ConsentCaptureDto;
        const applicantConsentTypes = mapConsentCaptureToTypes(capture).filter(
          (consentType) => consentType !== CONSENT_TYPES.WHATSAPP_CHANNEL,
        );

        if (applicantConsentTypes.length > 0) {
          await db.consentRecord.createMany({
            data: applicantConsentTypes.map((consentType) => ({
              tenant_id: tenantId,
              subject_type: 'applicant',
              subject_id: application.id,
              consent_type: consentType,
              status: 'granted',
              granted_by_user_id: userId,
              evidence_type: 'registration_form',
              privacy_notice_version_id: null,
              notes: null,
            })),
          });
        }

        if (capture.whatsapp_channel && parentId) {
          const existingWhatsAppConsent = await db.consentRecord.findFirst({
            where: {
              tenant_id: tenantId,
              subject_type: 'parent',
              subject_id: parentId,
              consent_type: CONSENT_TYPES.WHATSAPP_CHANNEL,
              status: 'granted',
            },
            select: { id: true },
          });

          if (!existingWhatsAppConsent) {
            await db.consentRecord.create({
              data: {
                tenant_id: tenantId,
                subject_type: 'parent',
                subject_id: parentId,
                consent_type: CONSENT_TYPES.WHATSAPP_CHANNEL,
                status: 'granted',
                granted_by_user_id: userId,
                evidence_type: 'registration_form',
                privacy_notice_version_id: null,
                notes: null,
              },
            });
          }
        }
      }

      return updated;
    })) as {
      id: string;
      application_number: string;
      student_first_name: string;
      student_last_name: string;
      status: string;
    };

    // Enqueue search index after transaction
    try {
      await this.searchIndexService.indexEntity('applications', {
        id: result.id,
        tenant_id: tenantId,
        application_number: result.application_number,
        student_first_name: result.student_first_name,
        student_last_name: result.student_last_name,
        status: result.status,
      });
    } catch (indexError) {
      this.logger.warn(
        `Search indexing failed for application: ${indexError instanceof Error ? indexError.message : String(indexError)}`,
      );
    }

    return result;
  }

  // ─── Review ───────────────────────────────────────────────────────────────

  async review(tenantId: string, id: string, dto: ReviewApplicationDto, userId: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const application = await db.application.findFirst({
        where: { id, tenant_id: tenantId },
      });

      if (!application) {
        throw new NotFoundException({
          error: {
            code: 'APPLICATION_NOT_FOUND',
            message: `Application with id "${id}" not found`,
          },
        });
      }

      // Optimistic concurrency check
      if (application.updated_at.toISOString() !== dto.expected_updated_at) {
        throw new BadRequestException({
          error: {
            code: 'CONCURRENT_MODIFICATION',
            message:
              'The application has been modified by another user. Please reload and try again.',
          },
        });
      }

      // Validate status transitions
      const allowedTargets = VALID_REVIEW_TRANSITIONS[application.status];
      if (!allowedTargets || !allowedTargets.includes(dto.status)) {
        throw new BadRequestException({
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message: `Cannot transition from "${application.status}" to "${dto.status}"`,
          },
        });
      }

      // Rejection requires a mandatory note
      if (dto.status === 'rejected') {
        if (!dto.rejection_reason?.trim()) {
          throw new BadRequestException({
            error: {
              code: 'REJECTION_REASON_REQUIRED',
              message: 'A rejection reason is required when rejecting an application',
            },
          });
        }

        // Store rejection reason on the application and as an internal note
        await db.application.update({
          where: { id },
          data: {
            rejection_reason: dto.rejection_reason,
            status: 'rejected',
            reviewed_at: new Date(),
            reviewed_by_user_id: userId,
          },
        });

        await db.applicationNote.create({
          data: {
            tenant_id: tenantId,
            application_id: id,
            author_user_id: userId,
            note: `Application rejected. Reason: ${dto.rejection_reason}`,
            is_internal: true,
          },
        });

        return db.application.findFirst({
          where: { id, tenant_id: tenantId },
        });
      }

      // For acceptance flow, check if approval is required
      if (dto.status === 'pending_acceptance_approval') {
        // Read tenant settings to check approval requirement
        const tenantSettings = await db.tenantSetting.findFirst({
          where: { tenant_id: tenantId },
        });

        const settings = (tenantSettings?.settings ?? {}) as Record<
          string,
          Record<string, unknown>
        >;
        const requireApproval = settings.admissions?.requireApprovalForAcceptance !== false;

        if (requireApproval) {
          // Check with the approval system
          // We pass hasDirectAuthority = false; school_owner bypasses are handled
          // by the approval workflow check itself
          const approvalResult = await this.approvalRequestsService.checkAndCreateIfNeeded(
            tenantId,
            'application_accept',
            'application',
            id,
            userId,
            false, // hasDirectAuthority
          );

          if (!approvalResult.approved) {
            // Update status to pending_acceptance_approval
            const updated = await db.application.update({
              where: { id },
              data: {
                status: 'pending_acceptance_approval',
                reviewed_at: new Date(),
                reviewed_by_user_id: userId,
              },
            });

            return {
              ...updated,
              approval_request_id: approvalResult.request_id,
              approval_required: true,
            };
          }
        }

        // If no approval needed or auto-approved, accept directly
        const updated = await db.application.update({
          where: { id },
          data: {
            status: 'accepted',
            reviewed_at: new Date(),
            reviewed_by_user_id: userId,
          },
        });

        return updated;
      }

      // Standard status update (under_review, rejected)
      const updated = await db.application.update({
        where: { id },
        data: {
          status: dto.status,
          reviewed_at: new Date(),
          reviewed_by_user_id: userId,
        },
      });

      return updated;
    });
  }

  // ─── Withdraw ─────────────────────────────────────────────────────────────

  async withdraw(tenantId: string, id: string, userId: string, isParent: boolean) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const application = await db.application.findFirst({
        where: { id, tenant_id: tenantId },
      });

      if (!application) {
        throw new NotFoundException({
          error: {
            code: 'APPLICATION_NOT_FOUND',
            message: `Application with id "${id}" not found`,
          },
        });
      }

      // Parents can only withdraw their own applications
      if (isParent) {
        const parent = await db.parent.findFirst({
          where: { tenant_id: tenantId, user_id: userId },
        });

        if (!parent || application.submitted_by_parent_id !== parent.id) {
          throw new BadRequestException({
            error: {
              code: 'NOT_OWNER',
              message: 'You can only withdraw your own applications',
            },
          });
        }
      }

      // Can only withdraw from certain statuses
      if (!WITHDRAWABLE_STATUSES.includes(application.status)) {
        throw new BadRequestException({
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message: `Cannot withdraw an application with status "${application.status}"`,
          },
        });
      }

      return db.application.update({
        where: { id },
        data: {
          status: 'withdrawn',
          reviewed_at: new Date(),
          reviewed_by_user_id: userId,
        },
      });
    });
  }
}
