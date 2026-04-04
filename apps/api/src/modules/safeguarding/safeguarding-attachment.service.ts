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
import { $Enums, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BehaviourReadFacade } from '../behaviour/behaviour-read.facade';
import { PrismaService } from '../prisma/prisma.service';

import { BEHAVIOUR_ATTACHMENT_SCAN_JOB } from './safeguarding.constants';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.mp4',
  '.mov',
  '.mp3',
  '.wav',
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
  is_redactable?: boolean;
}

interface PermissionCheckResult {
  allowed: boolean;
  context: string;
  grantId?: string;
}

@Injectable()
export class SafeguardingAttachmentService {
  private readonly logger = new Logger(SafeguardingAttachmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly behaviourReadFacade: BehaviourReadFacade,
    // TODO(M-17): Migrate to BehaviourSideEffectsService
    @InjectQueue('behaviour') private readonly behaviourQueue: Queue,
  ) {}

  // ─── Upload Attachment ───────────────────────────────────────────────────

  async uploadAttachment(
    tenantId: string,
    userId: string,
    concernId: string,
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

        // Verify concern exists and is not sealed
        const concern = await db.safeguardingConcern.findFirst({
          where: { id: concernId, tenant_id: tenantId },
          select: { id: true, status: true },
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

        // Compute SHA-256 hash
        const sha256Hash = createHash('sha256').update(file.buffer).digest('hex');

        // Generate S3 key (S3 upload would happen in a real deployment)
        const fileUuid = randomUUID();
        const fileKey = `${tenantId}/attachments/safeguarding_concern/${concernId}/${fileUuid}${ext}`;

        // Create attachment record
        const attachment = await db.behaviourAttachment.create({
          data: {
            tenant_id: tenantId,
            entity_type: 'safeguarding_concern',
            entity_id: concernId,
            uploaded_by_id: userId,
            file_name: file.originalname,
            file_key: fileKey,
            file_size_bytes: BigInt(file.size),
            mime_type: file.mimetype,
            sha256_hash: sha256Hash,
            classification: dto.classification as $Enums.AttachmentClassification,
            description: dto.description ?? null,
            visibility: 'safeguarding_only' as $Enums.AttachmentVisibility,
            is_redactable: dto.is_redactable ?? false,
            scan_status: 'pending_scan' as $Enums.ScanStatus,
          },
        });

        // Enqueue virus scan job
        try {
          await this.behaviourQueue.add(BEHAVIOUR_ATTACHMENT_SCAN_JOB, {
            tenant_id: tenantId,
            attachment_id: attachment.id,
            file_key: fileKey,
          });
        } catch (err) {
          this.logger.warn(
            `Failed to enqueue attachment scan job for ${attachment.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        // Record safeguarding action
        await db.safeguardingAction.create({
          data: {
            tenant_id: tenantId,
            concern_id: concernId,
            action_by_id: userId,
            action_type: 'document_uploaded' as $Enums.SafeguardingActionType,
            description: `File uploaded: ${file.originalname}`,
            metadata: {
              attachment_id: attachment.id,
              file_name: file.originalname,
              classification: dto.classification,
            } as unknown as Prisma.InputJsonValue,
          },
        });

        // Fire-and-forget audit log
        void this.auditLogService.write(
          tenantId,
          userId,
          'behaviour_attachment',
          attachment.id,
          'safeguarding_attachment_uploaded',
          {
            concern_id: concernId,
            file_name: file.originalname,
            classification: dto.classification,
          },
          null,
        );

        return { data: { attachment_id: attachment.id, status: 'pending' } };
      },
      { timeout: 30000 },
    );
  }

  // ─── Generate Download URL ───────────────────────────────────────────────

  async generateDownloadUrl(
    tenantId: string,
    userId: string,
    membershipId: string,
    concernId: string,
    attachmentId: string,
    checkPermission: (
      userId: string,
      tenantId: string,
      membershipId: string,
      concernId?: string,
    ) => Promise<PermissionCheckResult>,
  ) {
    // Verify access permission
    const access = await checkPermission(userId, tenantId, membershipId, concernId);
    if (!access.allowed) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'You do not have permission to access this attachment',
      });
    }

    // Load attachment
    const attachment = await this.behaviourReadFacade.findAttachmentById(tenantId, attachmentId);
    if (!attachment) {
      throw new NotFoundException({
        code: 'ATTACHMENT_NOT_FOUND',
        message: 'Attachment not found',
      });
    }

    // Verify entity relationship
    if (attachment.entity_type !== 'safeguarding_concern' || attachment.entity_id !== concernId) {
      throw new BadRequestException({
        code: 'ENTITY_MISMATCH',
        message: 'Attachment does not belong to this concern',
      });
    }

    // Check scan status
    if (attachment.scan_status === ('pending_scan' as $Enums.ScanStatus)) {
      throw new ForbiddenException({
        code: 'SCAN_PENDING',
        message: 'File not available — awaiting security scan',
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
        message: 'File not available — scan failed',
      });
    }

    // Generate mock pre-signed URL
    const downloadUrl = `https://s3.example.com/presigned/${attachment.file_key}?expires=900`;

    // Audit log
    void this.auditLogService.write(
      tenantId,
      userId,
      'behaviour_attachment',
      attachmentId,
      'safeguarding_attachment_downloaded',
      {
        concern_id: concernId,
        file_name: attachment.file_name,
        context: access.context,
        break_glass_grant_id: access.grantId ?? null,
      },
      null,
    );

    // Record safeguarding action
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    await rlsClient.$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;
        await db.safeguardingAction.create({
          data: {
            tenant_id: tenantId,
            concern_id: concernId,
            action_by_id: userId,
            action_type: 'document_downloaded' as $Enums.SafeguardingActionType,
            description: `File downloaded: ${attachment.file_name}`,
            metadata: {
              attachment_id: attachmentId,
              file_name: attachment.file_name,
              context: access.context,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      },
      { timeout: 10000 },
    );

    return { data: { download_url: downloadUrl } };
  }

  // ─── List Attachments ────────────────────────────────────────────────────

  async listAttachments(tenantId: string, concernId: string) {
    const attachments = await this.behaviourReadFacade.findAttachmentsByEntity(
      tenantId,
      'safeguarding_concern',
      concernId,
    );

    return {
      data: attachments.map((a) => ({
        id: a.id,
        file_name: a.file_name,
        classification: a.classification,
        scan_status: a.scan_status,
        file_size_bytes: Number(a.file_size_bytes),
        uploaded_by: a.uploaded_by,
        created_at: a.created_at,
      })),
    };
  }
}
