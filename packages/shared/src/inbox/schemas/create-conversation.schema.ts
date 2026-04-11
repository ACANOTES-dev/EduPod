import { z } from 'zod';

import { CONVERSATION_KINDS, INBOX_CHANNELS } from '../constants';

import { attachmentInputSchema, MAX_ATTACHMENTS_PER_MESSAGE } from './attachment-input.schema';
import { audienceDefinitionSchema } from './audience-definition.schema';

/**
 * Schema for creating a new conversation. Shape depends on `kind`:
 *   - direct     → exactly one `recipient_user_id`, no audience, no group
 *   - group      → 2–49 `participant_user_ids` (sender + recipients ≤ 50)
 *   - broadcast  → `audience` (handpicked or smart) + optional `saved_audience_id`
 *
 * Channels other than 'inbox' are additive — inbox is always on and the
 * server unconditionally includes it even if the caller omits it. The
 * server-side dispatcher enforces "inbox always present" as a hard
 * invariant (see `.claude/rules/` and `PLAN.md` §3).
 *
 * Attachments travel inline as `{ storage_key, filename, mime_type, size_bytes }`.
 * Files must already be uploaded to S3 under the tenant prefix — the
 * inbox service validates the storage_key ownership before creating
 * the `message_attachments` rows.
 */
export const createConversationSchema = z
  .object({
    kind: z.enum(CONVERSATION_KINDS),
    subject: z.string().max(255).nullable().optional(),
    body: z.string().min(1, 'Message body is required').max(20_000),
    allow_replies: z.boolean().optional(),
    extra_channels: z.array(z.enum(INBOX_CHANNELS)).optional(),
    disable_fallback: z.boolean().optional(),
    attachments: z.array(attachmentInputSchema).max(MAX_ATTACHMENTS_PER_MESSAGE).optional(),

    // direct
    recipient_user_id: z.string().uuid().optional(),

    // group
    participant_user_ids: z.array(z.string().uuid()).min(2).max(49).optional(),

    // broadcast
    audience: audienceDefinitionSchema.optional(),
    saved_audience_id: z.string().uuid().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.kind === 'direct') {
      if (!val.recipient_user_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['recipient_user_id'],
          message: 'direct conversations require recipient_user_id',
        });
      }
      if (val.participant_user_ids || val.audience || val.saved_audience_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['kind'],
          message: 'direct conversations only use recipient_user_id',
        });
      }
      if (val.subject) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['subject'],
          message: 'direct conversations do not have a subject',
        });
      }
    }
    if (val.kind === 'group') {
      if (!val.participant_user_ids || val.participant_user_ids.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['participant_user_ids'],
          message: 'group conversations require 2–49 participants',
        });
      }
      if (val.recipient_user_id || val.audience || val.saved_audience_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['kind'],
          message: 'group conversations only use participant_user_ids',
        });
      }
      if (!val.subject || val.subject.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['subject'],
          message: 'group conversations require a subject',
        });
      }
    }
    if (val.kind === 'broadcast') {
      if (!val.audience && !val.saved_audience_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['audience'],
          message: 'broadcasts require audience or saved_audience_id',
        });
      }
      if (val.recipient_user_id || val.participant_user_ids) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['kind'],
          message: 'broadcasts use audience, not recipient_user_id or participant_user_ids',
        });
      }
    }
  });

export type CreateConversationDto = z.infer<typeof createConversationSchema>;
