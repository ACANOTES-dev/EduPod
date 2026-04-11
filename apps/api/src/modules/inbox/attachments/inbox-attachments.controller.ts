import { randomUUID } from 'crypto';

import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  PayloadTooLargeException,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import type { JwtPayload } from '@school/shared';
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  type AttachmentInput,
} from '@school/shared/inbox';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { createFileInterceptor } from '../../../common/interceptors/file-upload.interceptor';
import { S3Service } from '../../s3/s3.service';

/**
 * POST /v1/inbox/attachments — upload a single file for use as an inbox
 * message attachment. The compose dialog calls this endpoint once per
 * file the user drops into the attachment zone. The response is the
 * canonical `AttachmentInput` shape (`storage_key, filename, mime_type,
 * size_bytes`) that the compose form then includes in its submit
 * payload to `POST /v1/inbox/conversations` or
 * `POST /v1/inbox/conversations/:id/messages`.
 *
 * The endpoint uploads to S3 under the caller's tenant prefix —
 * `AttachmentValidator` on the downstream send path enforces that the
 * returned `storage_key` starts with `{tenantId}/`, so a forged
 * client-provided key cannot bypass tenant isolation.
 *
 * Size and mime allowlist match impl 04's shared schema
 * (`MAX_ATTACHMENT_BYTES`, `ALLOWED_ATTACHMENT_MIME_TYPES`).
 */
@Controller('v1/inbox/attachments')
@UseGuards(AuthGuard, PermissionGuard)
export class InboxAttachmentsController {
  constructor(private readonly s3Service: S3Service) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequiresPermission('inbox.send')
  @UseInterceptors(
    createFileInterceptor({
      allowedMimes: ALLOWED_ATTACHMENT_MIME_TYPES as unknown as readonly string[],
      maxSizeMb: 25,
    }),
  )
  async upload(
    @CurrentTenant() tenant: { tenant_id: string } | null,
    @CurrentUser() _user: JwtPayload,
    @UploadedFile()
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined,
  ): Promise<AttachmentInput> {
    if (!tenant) {
      throw new BadRequestException({
        code: 'TENANT_CONTEXT_MISSING',
        message: 'No tenant context — this endpoint is tenant-scoped',
      });
    }
    if (!file) {
      throw new BadRequestException({
        code: 'ATTACHMENT_FILE_MISSING',
        message: 'No file uploaded. Expected multipart field "file".',
      });
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new PayloadTooLargeException({
        code: 'ATTACHMENT_TOO_LARGE',
        message: `Attachment exceeds ${MAX_ATTACHMENT_BYTES} bytes`,
      });
    }

    const safeName = sanitiseFilename(file.originalname);
    const relativeKey = `inbox/attachments/${randomUUID()}-${safeName}`;
    const storageKey = await this.s3Service.upload(
      tenant.tenant_id,
      relativeKey,
      file.buffer,
      file.mimetype,
    );

    return {
      storage_key: storageKey,
      filename: file.originalname,
      mime_type: file.mimetype as AttachmentInput['mime_type'],
      size_bytes: file.size,
    };
  }
}

function sanitiseFilename(name: string): string {
  const stripped = name.replace(/[^A-Za-z0-9._-]+/g, '-');
  return stripped.length > 120 ? stripped.slice(0, 120) : stripped || 'file';
}
