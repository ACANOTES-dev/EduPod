import { z } from 'zod';

import { INBOX_CHANNELS } from '../constants';

import { attachmentInputSchema, MAX_ATTACHMENTS_PER_MESSAGE } from './attachment-input.schema';

/**
 * Schema for sending a reply on an existing conversation.
 * New-conversation creation uses `create-conversation.schema.ts`.
 */
export const sendMessageSchema = z.object({
  body: z.string().min(1, 'Message cannot be empty').max(20_000),
  attachments: z.array(attachmentInputSchema).max(MAX_ATTACHMENTS_PER_MESSAGE).optional(),
  extra_channels: z.array(z.enum(INBOX_CHANNELS)).optional(),
  disable_fallback: z.boolean().optional(),
});

export type SendMessageDto = z.infer<typeof sendMessageSchema>;

/**
 * Schema for editing a sent message's body. Server additionally enforces
 * the 10-minute edit window and the staff-only rule.
 */
export const editMessageSchema = z.object({
  body: z.string().min(1).max(20_000),
});

export type EditMessageDto = z.infer<typeof editMessageSchema>;

/**
 * Schema for the `GET /v1/inbox/conversations` list query. Client drives
 * pagination and a small set of filters; the server clamps to sane
 * defaults.
 */
export const listInboxQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  archived: z
    .union([
      z.literal('true').transform(() => true),
      z.literal('false').transform(() => false),
      z.boolean(),
    ])
    .optional(),
  unread_only: z
    .union([
      z.literal('true').transform(() => true),
      z.literal('false').transform(() => false),
      z.boolean(),
    ])
    .optional(),
  kind: z.enum(['direct', 'group', 'broadcast']).optional(),
});

export type ListInboxQueryDto = z.infer<typeof listInboxQuerySchema>;

/**
 * Schema for the `GET /v1/inbox/conversations/:id` thread detail query
 * (message pagination).
 */
export const getThreadQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type GetThreadQueryDto = z.infer<typeof getThreadQuerySchema>;

/**
 * Schema for `PATCH /v1/inbox/conversations/:id/mute` and `/archive`.
 */
export const muteConversationSchema = z.object({
  muted: z.boolean(),
});
export type MuteConversationDto = z.infer<typeof muteConversationSchema>;

export const archiveConversationSchema = z.object({
  archived: z.boolean(),
});
export type ArchiveConversationDto = z.infer<typeof archiveConversationSchema>;
