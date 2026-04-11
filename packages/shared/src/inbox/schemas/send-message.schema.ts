import { z } from 'zod';

/**
 * Schema for sending a message into an existing conversation (reply path).
 * Creating a new conversation uses `create-conversation.schema.ts`.
 */
export const sendMessageSchema = z.object({
  body: z.string().min(1, 'Message cannot be empty').max(20_000),
  attachment_ids: z.array(z.string().uuid()).max(20).optional(),
  disable_fallback: z.boolean().optional(),
});

export type SendMessageDto = z.infer<typeof sendMessageSchema>;

export const editMessageSchema = z.object({
  body: z.string().min(1).max(20_000),
});

export type EditMessageDto = z.infer<typeof editMessageSchema>;
