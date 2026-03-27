import { createHash, randomUUID } from 'crypto';
import { extname } from 'path';

import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { $Enums } from '@prisma/client';
import type { RecordFollowUpDto } from '@school/shared';
import { Queue } from 'bullmq';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourHistoryService } from './behaviour-history.service';
import { BEHAVIOUR_ATTACHMENT_SCAN_JOB } from './safeguarding.constants';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.jpg', '.jpeg', '.png', '.gif',
  '.mp4', '.mov', '.mp3', '.wav',
  '.txt',
]);

// ─── Types ───────────────────────────────────────────────────────────────────

interface UploadFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

interface UploadAttachmentDto {
  classification: string;
  description?: string | null;
}

@Injectable()
export class BehaviourAttachmentService {
  private readonly logger = new Logger(BehaviourAttachmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly historyService: BehaviourHistoryService,
    @InjectQueue('behaviour') private readonly behaviourQueue: Queue,
  ) {}

  // ─── Upload Attachment ───────────────────────────────────────────────────

  async uploadAttachment(
    tenantId: string,
    userId: string,
    incidentId: string,
    file: UploadFile,
    dto: UploadAttachmentDto,
  ) {
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new PayloadTooLargeException({
        code: 'FILE_TOO_LARGE',
        message: `File exceeds maximum size of ${MAX_FILE_SIZE} bytes`,
      });
    }

    // Validate file extension
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new UnprocessableEntityException({
        code: 'INVALID_FILE_TYPE',
        message: `File type "${ext}" is not allowed`,
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;

        // Verify incident exists and is not withdrawn/closed
        const incident = await db.behaviourIncident.findFirst({
          where: { id: incidentId, tenant_id: tenantId },
          select: { id: true, status: true },
        });
        if (!incident) {
          throw new NotFoundException({
            code: 'INCIDENT_NOT_FOUND',
            message: 'Incident not found',
          });
        }
        if (incident.status === 'withdrawn' || incident.status === 'closed_after_appeal') {
          throw new ForbiddenException({
            code: 'INCIDENT_CLOSED',
            message: 'Cannot add attachments to a withdrawn or closed incident',
          });
        }

        // Compute SHA-256 hash
        const sha256Hash = createHash('sha256').update(file.buffer).digest('hex');

        // Generate S3 key
        const fileUuid = randomUUID();
        const fileKey = `${tenantId}/attachments/incident/${incidentId}/${fileUuid}${ext}`;

        // Create attachment record
        const attachment = await db.behaviourAttachment.create({
          data: {
            tenant_id: tenantId,
            entity_type: 'incident',
            entity_id: incidentId,
            uploaded_by_id: userId,
            file_name: file.originalname,
            file_key: fileKey,
            file_size_bytes: BigInt(file.size),
            mime_type: file.mimetype,
            sha256_hash: sha256Hash,
            classification: dto.classification as $Enums.AttachmentClassification,
            description: dto.description ?? null,
            visibility: 'staff_all' as $Enums.AttachmentVisibility,
            is_redactable: false,
            scan_status: 'pending_scan' as $Enums.ScanStatus,
          },
        });

        // Enqueue virus scan job
        try {
          await this.behaviourQueue.add(
            BEHAVIOUR_ATTACHMENT_SCAN_JOB,
            {
              tenant_id: tenantId,
              attachment_id: attachment.id,
              file_key: fileKey,
            },
          );
        } catch (err) {
          this.logger.warn(
            `Failed to enqueue attachment scan job for ${attachment.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        // Record history
        await this.historyService.recordHistory(
          db,
          tenantId,
          'incident',
          incidentId,
          userId,
          'attachment_added',
          null,
          {
            attachment_id: attachment.id,
            file_name: file.originalname,
            classification: dto.classification,
          },
        );

        // Fire-and-forget audit log
        void this.auditLogService.write(
          tenantId, userId, 'behaviour_attachment', attachment.id,
          'behaviour_attachment_uploaded',
          { incident_id: incidentId, file_name: file.originalname, classification: dto.classification },
          null,
        );

        return {
          data: {
            id: attachment.id,
            file_name: attachment.file_name,
            classification: attachment.classification,
            scan_status: attachment.scan_status,
            file_size_bytes: Number(attachment.file_size_bytes),
            created_at: attachment.created_at,
          },
        };
      },
      { timeout: 30000 },
    );
  }

  // ─── List Attachments ──────────────────────────────────────────────────

  async listAttachments(tenantId: string, incidentId: string) {
    // Verify incident exists
    const incident = await this.prisma.behaviourIncident.findFirst({
      where: { id: incidentId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!incident) {
      throw new NotFoundException({
        code: 'INCIDENT_NOT_FOUND',
        message: 'Incident not found',
      });
    }

    const attachments = await this.prisma.behaviourAttachment.findMany({
      where: {
        tenant_id: tenantId,
        entity_type: 'incident',
        entity_id: incidentId,
        retention_status: 'active' as $Enums.RetentionStatus,
      },
      orderBy: { created_at: 'desc' },
      include: {
        uploaded_by: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    return {
      data: attachments.map((a) => ({
        id: a.id,
        file_name: a.file_name,
        classification: a.classification,
        description: a.description,
        scan_status: a.scan_status,
        file_size_bytes: Number(a.file_size_bytes),
        mime_type: a.mime_type,
        uploaded_by: a.uploaded_by,
        created_at: a.created_at,
      })),
    };
  }

  // ─── Get / Download Single Attachment ──────────────────────────────────

  async getAttachment(tenantId: string, userId: string, incidentId: string, attachmentId: string) {
    // Verify incident exists
    const incident = await this.prisma.behaviourIncident.findFirst({
      where: { id: incidentId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!incident) {
      throw new NotFoundException({
        code: 'INCIDENT_NOT_FOUND',
        message: 'Incident not found',
      });
    }

    // Load attachment
    const attachment = await this.prisma.behaviourAttachment.findFirst({
      where: {
        id: attachmentId,
        tenant_id: tenantId,
      },
      include: {
        uploaded_by: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });
    if (!attachment) {
      throw new NotFoundException({
        code: 'ATTACHMENT_NOT_FOUND',
        message: 'Attachment not found',
      });
    }

    // Verify entity relationship
    if (attachment.entity_type !== 'incident' || attachment.entity_id !== incidentId) {
      throw new BadRequestException({
        code: 'ENTITY_MISMATCH',
        message: 'Attachment does not belong to this incident',
      });
    }

    // Check scan status
    if (attachment.scan_status === ('pending_scan' as $Enums.ScanStatus)) {
      throw new ForbiddenException({
        code: 'SCAN_PENDING',
        message: 'File not available -- awaiting security scan',
      });
    }
    if (attachment.scan_status === ('infected' as $Enums.ScanStatus)) {
      throw new ForbiddenException({
        code: 'FILE_INFECTED',
        message: 'File unavailable',
      });
    }
    if (attachment.scan_status === ('scan_failed' as $Enums.ScanStatus)) {
      throw new ForbiddenException({
        code: 'SCAN_FAILED',
        message: 'File not available -- scan failed',
      });
    }

    // Generate mock pre-signed URL
    const downloadUrl = `https://s3.example.com/presigned/${attachment.file_key}?expires=900`;

    // Audit log
    void this.auditLogService.write(
      tenantId, userId, 'behaviour_attachment', attachmentId,
      'behaviour_attachment_downloaded',
      {
        incident_id: incidentId,
        file_name: attachment.file_name,
      },
      null,
    );

    return {
      data: {
        id: attachment.id,
        file_name: attachment.file_name,
        classification: attachment.classification,
        description: attachment.description,
        scan_status: attachment.scan_status,
        file_size_bytes: Number(attachment.file_size_bytes),
        mime_type: attachment.mime_type,
        uploaded_by: attachment.uploaded_by,
        created_at: attachment.created_at,
        download_url: downloadUrl,
      },
    };
  }

  // ─── Record Follow-Up ─────────────────────────────────────────────────

  async recordFollowUp(
    tenantId: string,
    userId: string,
    incidentId: string,
    dto: RecordFollowUpDto,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;

        // Verify incident exists
        const incident = await db.behaviourIncident.findFirst({
          where: { id: incidentId, tenant_id: tenantId },
          include: { category: { select: { name: true } } },
        });
        if (!incident) {
          throw new NotFoundException({
            code: 'INCIDENT_NOT_FOUND',
            message: 'Incident not found',
          });
        }
        if (incident.status === 'withdrawn' || incident.status === 'closed_after_appeal') {
          throw new ForbiddenException({
            code: 'INCIDENT_CLOSED',
            message: 'Cannot record follow-up on a withdrawn or closed incident',
          });
        }

        // Record history entry
        const historyData = {
          action_taken: dto.action_taken,
          outcome: dto.outcome ?? null,
        };

        await this.historyService.recordHistory(
          db,
          tenantId,
          'incident',
          incidentId,
          userId,
          'follow_up_recorded',
          null,
          historyData,
        );

        // Optionally create a follow-up task
        let task: { id: string; title: string; due_date: Date | null; status: string } | null = null;
        if (dto.create_task && dto.task_title) {
          const created = await db.behaviourTask.create({
            data: {
              tenant_id: tenantId,
              task_type: 'follow_up',
              entity_type: 'incident',
              entity_id: incidentId,
              title: dto.task_title,
              assigned_to_id: dto.task_assigned_to_id ?? userId,
              created_by_id: userId,
              priority: 'medium',
              status: 'pending',
              due_date: dto.task_due_date
                ? new Date(dto.task_due_date)
                : new Date(Date.now() + 24 * 60 * 60 * 1000), // default: 24h from now
            },
          });
          task = {
            id: created.id,
            title: created.title,
            due_date: created.due_date,
            status: created.status,
          };
        }

        // Mark follow_up_required as false since a follow-up was recorded
        if (incident.follow_up_required) {
          await db.behaviourIncident.update({
            where: { id: incidentId },
            data: { follow_up_required: false },
          });
        }

        // Mark existing pending follow_up tasks as completed
        await db.behaviourTask.updateMany({
          where: {
            tenant_id: tenantId,
            entity_type: 'incident',
            entity_id: incidentId,
            task_type: 'follow_up',
            status: { in: ['pending', 'in_progress', 'overdue'] },
            // Exclude the task we just created
            ...(task ? { id: { not: task.id } } : {}),
          },
          data: { status: 'completed' },
        });

        // Audit log
        void this.auditLogService.write(
          tenantId, userId, 'behaviour_incident', incidentId,
          'follow_up_recorded',
          {
            action_taken: dto.action_taken,
            outcome: dto.outcome ?? null,
            task_created: !!task,
          },
          null,
        );

        return {
          data: {
            incident_id: incidentId,
            follow_up_recorded: true,
            action_taken: dto.action_taken,
            outcome: dto.outcome ?? null,
            task,
          },
        };
      },
      { timeout: 15000 },
    );
  }
}
