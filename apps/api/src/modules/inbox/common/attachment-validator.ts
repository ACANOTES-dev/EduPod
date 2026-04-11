import { BadRequestException, Injectable } from '@nestjs/common';

import type { AttachmentInput } from '@school/shared/inbox';

/**
 * AttachmentValidator — validates that every attachment on an inbox
 * message is an S3 object owned by the caller's tenant and within the
 * v1 size / mime limits (enforced at the Zod layer) before the
 * `message_attachments` rows are written.
 *
 * Tenant ownership is enforced by the S3 key prefix convention set by
 * `S3Service.upload`: every uploaded file lives under `{tenantId}/...`,
 * so a storage_key that does not start with the caller's tenant_id
 * either came from a different tenant (reject) or from a forged client
 * payload (reject). This is the v1 version of the dedicated
 * `StorageFacade.assertOwnedByTenant` that the impl spec gestures at —
 * cheap, deterministic, no S3 round-trip.
 *
 * Follow-up (Wave 3+): if a proper `storage_objects` table lands and
 * the pre-upload endpoint starts stamping ownership metadata, swap this
 * prefix check for a DB lookup. Keeping the validator in its own service
 * means that swap is a single edit.
 */
@Injectable()
export class AttachmentValidator {
  /**
   * Validate an array of attachment inputs. Throws BadRequestException
   * with a stable `ATTACHMENT_NOT_OWNED_BY_TENANT` code on the first
   * offending key — callers should upload valid files first.
   */
  validateBatch(tenantId: string, attachments: AttachmentInput[] | undefined): void {
    if (!attachments || attachments.length === 0) return;

    const prefix = `${tenantId}/`;
    for (const att of attachments) {
      if (!att.storage_key.startsWith(prefix)) {
        throw new BadRequestException({
          code: 'ATTACHMENT_NOT_OWNED_BY_TENANT',
          message: `Attachment storage_key "${att.storage_key}" does not belong to this tenant`,
        });
      }
    }
  }
}
