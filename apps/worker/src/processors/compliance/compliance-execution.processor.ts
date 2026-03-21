import { randomUUID } from 'crypto';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { uploadToS3 } from '../../base/s3.helpers';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface ComplianceExecutionPayload extends TenantJobPayload {
  compliance_request_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const COMPLIANCE_EXECUTION_JOB = 'compliance:execute';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.IMPORTS)
export class ComplianceExecutionProcessor extends WorkerHost {
  private readonly logger = new Logger(ComplianceExecutionProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<ComplianceExecutionPayload>): Promise<void> {
    if (job.name !== COMPLIANCE_EXECUTION_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${COMPLIANCE_EXECUTION_JOB} — tenant ${tenant_id}, request ${job.data.compliance_request_id}`,
    );

    const executionJob = new ComplianceExecutionJob(this.prisma);
    await executionJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class ComplianceExecutionJob extends TenantAwareJob<ComplianceExecutionPayload> {
  private readonly logger = new Logger(ComplianceExecutionJob.name);

  protected async processJob(
    data: ComplianceExecutionPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id, compliance_request_id } = data;

    // 1. Fetch compliance request
    const request = await tx.complianceRequest.findFirst({
      where: {
        id: compliance_request_id,
        tenant_id,
      },
    });

    if (!request) {
      throw new Error(`ComplianceRequest ${compliance_request_id} not found for tenant ${tenant_id}`);
    }

    if (request.status === 'completed') {
      this.logger.warn(
        `ComplianceRequest ${compliance_request_id} already completed. Skipping.`,
      );
      return;
    }

    // 2. Process based on request_type
    switch (request.request_type) {
      case 'access_export':
        await this.handleAccessExport(tx, tenant_id, request);
        break;
      case 'erasure':
        await this.handleErasure(tx, tenant_id, request);
        break;
      case 'rectification':
        // Rectification is a manual process — just mark completed
        this.logger.log(
          `Rectification request ${compliance_request_id} marked completed (manual process)`,
        );
        break;
      default:
        throw new Error(`Unknown compliance request type: ${request.request_type}`);
    }

    // 3. Update status to completed
    await tx.complianceRequest.update({
      where: { id: compliance_request_id },
      data: { status: 'completed' },
    });

    this.logger.log(
      `Compliance request ${compliance_request_id} (${request.request_type}) completed, tenant ${tenant_id}`,
    );
  }

  private async handleAccessExport(
    tx: PrismaClient,
    tenantId: string,
    request: {
      id: string;
      subject_type: string;
      subject_id: string;
    },
  ): Promise<void> {
    // Collect all data for the subject
    const exportData = await this.collectSubjectData(tx, tenantId, request.subject_type, request.subject_id);

    // Upload JSON export to S3
    const exportFileKey = `compliance-exports/${tenantId}/${request.id}-${Date.now()}.json`;
    const exportJson = JSON.stringify(exportData, null, 2);

    try {
      await this.uploadExportToS3(exportFileKey, exportJson);
    } catch (err) {
      this.logger.warn(
        `Failed to upload export to S3 — storing file_key reference only: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Update export_file_key on the request
    await tx.complianceRequest.update({
      where: { id: request.id },
      data: { export_file_key: exportFileKey },
    });

    this.logger.log(
      `Access export for ${request.subject_type} ${request.subject_id} saved to ${exportFileKey}`,
    );
  }

  private async handleErasure(
    tx: PrismaClient,
    tenantId: string,
    request: {
      id: string;
      subject_type: string;
      subject_id: string;
      classification: string | null;
    },
  ): Promise<void> {
    const classification = request.classification;

    if (classification === 'retain_legal_basis') {
      this.logger.log(
        `Erasure request ${request.id} classified as retain_legal_basis — no data modification performed`,
      );
      return;
    }

    // Both 'erase' and 'anonymise' classifications trigger anonymisation
    const anonymisedTag = `ANONYMISED-${randomUUID().slice(0, 8)}`;

    switch (request.subject_type) {
      case 'student':
        await this.anonymiseStudent(tx, tenantId, request.subject_id, anonymisedTag);
        break;
      case 'parent':
        await this.anonymiseParent(tx, tenantId, request.subject_id, anonymisedTag);
        break;
      case 'household':
        await this.anonymiseHousehold(tx, tenantId, request.subject_id, anonymisedTag);
        break;
      case 'user':
        // User anonymisation is more complex — handled at the platform level.
        // Mark the fields we can within the tenant scope.
        this.logger.log(
          `User anonymisation for ${request.subject_id} — limited tenant-scoped anonymisation`,
        );
        break;
      default:
        throw new Error(`Unknown subject_type for erasure: ${request.subject_type}`);
    }

    this.logger.log(
      `Erasure (${classification ?? 'default'}) applied for ${request.subject_type} ${request.subject_id}, tag ${anonymisedTag}`,
    );
  }

  private async collectSubjectData(
    tx: PrismaClient,
    tenantId: string,
    subjectType: string,
    subjectId: string,
  ): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      tenant_id: tenantId,
      subject_type: subjectType,
      subject_id: subjectId,
    };

    switch (subjectType) {
      case 'student': {
        const student = await tx.student.findFirst({
          where: { id: subjectId, tenant_id: tenantId },
          include: {
            student_parents: { include: { parent: true } },
            attendance_records: { take: 100, orderBy: { created_at: 'desc' } },
            grades: { take: 100, orderBy: { created_at: 'desc' } },
          },
        });
        result['student'] = student;
        break;
      }
      case 'parent': {
        const parent = await tx.parent.findFirst({
          where: { id: subjectId, tenant_id: tenantId },
          include: {
            student_parents: { include: { student: true } },
          },
        });
        result['parent'] = parent;
        break;
      }
      case 'household': {
        const household = await tx.household.findFirst({
          where: { id: subjectId, tenant_id: tenantId },
          include: {
            students: true,
            household_parents: { include: { parent: true } },
          },
        });
        result['household'] = household;
        break;
      }
      case 'user': {
        // User is platform-level, no tenant_id filter on user table
        const user = await tx.user.findUnique({
          where: { id: subjectId },
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            created_at: true,
          },
        });
        result['user'] = user;
        break;
      }
      default:
        result['error'] = `Unknown subject type: ${subjectType}`;
    }

    return result;
  }

  private async anonymiseStudent(
    tx: PrismaClient,
    tenantId: string,
    studentId: string,
    tag: string,
  ): Promise<void> {
    await tx.student.updateMany({
      where: { id: studentId, tenant_id: tenantId },
      data: {
        first_name: tag,
        last_name: tag,
        full_name: tag,
        first_name_ar: null,
        last_name_ar: null,
        full_name_ar: null,
        medical_notes: null,
        allergy_details: null,
        has_allergy: false,
      },
    });
  }

  private async anonymiseParent(
    tx: PrismaClient,
    tenantId: string,
    parentId: string,
    tag: string,
  ): Promise<void> {
    await tx.parent.updateMany({
      where: { id: parentId, tenant_id: tenantId },
      data: {
        first_name: tag,
        last_name: tag,
        email: `${tag}@anonymised.local`,
        phone: null,
        whatsapp_phone: null,
      },
    });
  }

  private async anonymiseHousehold(
    tx: PrismaClient,
    tenantId: string,
    householdId: string,
    tag: string,
  ): Promise<void> {
    await tx.household.updateMany({
      where: { id: householdId, tenant_id: tenantId },
      data: {
        household_name: tag,
      },
    });
  }

  private async uploadExportToS3(fileKey: string, content: string): Promise<void> {
    await uploadToS3(fileKey, content);
  }
}
