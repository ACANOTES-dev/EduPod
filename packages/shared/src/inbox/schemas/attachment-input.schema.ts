import { z } from 'zod';

/**
 * AttachmentInput — the on-wire shape the compose / reply endpoints
 * receive for each file attached to a message. Files must already be
 * uploaded to S3 via the existing upload path; the caller passes back
 * the resulting `storage_key`, and the inbox service validates + stores
 * metadata rows in `message_attachments` inside the same transaction
 * as the message itself.
 *
 * Limits are deliberately conservative for v1 — see
 * `new-inbox/implementations/04-conversations-messages-service.md` §10.
 */

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

/**
 * Allowed mime types. Every supported file category in v1 is spelled
 * out; anything not on this list is rejected at the Zod layer.
 */
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  // PDF
  'application/pdf',
  // Office documents
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Plain text
  'text/plain',
] as const;

export type AllowedAttachmentMimeType = (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number];

export const attachmentInputSchema = z.object({
  storage_key: z.string().min(1, 'storage_key is required').max(1024, 'storage_key too long'),
  filename: z.string().min(1, 'filename is required').max(512, 'filename too long'),
  mime_type: z.enum(ALLOWED_ATTACHMENT_MIME_TYPES, {
    errorMap: () => ({ message: 'Attachment mime_type is not in the allowed list' }),
  }),
  size_bytes: z
    .number()
    .int('size_bytes must be an integer')
    .min(0, 'size_bytes must be non-negative')
    .max(MAX_ATTACHMENT_BYTES, 'attachment exceeds 25 MB'),
});

export type AttachmentInput = z.infer<typeof attachmentInputSchema>;
