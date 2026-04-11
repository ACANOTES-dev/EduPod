import { z } from 'zod';

import { paginationQuerySchema } from '../../schemas/pagination.schema';
import { CONVERSATION_KINDS, MESSAGE_FLAG_REVIEW_STATES } from '../constants';

/**
 * Query schema for `GET /v1/inbox/oversight/conversations`.
 *
 * Extends the shared pagination schema with the oversight-specific
 * filters: conversation kind, date window, participant filter, flag
 * presence, and frozen state.
 */
export const listOversightConversationsQuerySchema = paginationQuerySchema.extend({
  kind: z.enum(CONVERSATION_KINDS).optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  participantUserId: z.string().uuid().optional(),
  hasFlags: z.coerce.boolean().optional(),
  frozen: z.coerce.boolean().optional(),
});

export type ListOversightConversationsQueryDto = z.infer<
  typeof listOversightConversationsQuerySchema
>;

/** Query schema for `GET /v1/inbox/oversight/search`. */
export const oversightSearchQuerySchema = paginationQuerySchema.extend({
  q: z.string().min(1).max(500),
});
export type OversightSearchQueryDto = z.infer<typeof oversightSearchQuerySchema>;

/** Query schema for `GET /v1/inbox/oversight/flags`. */
export const listOversightFlagsQuerySchema = paginationQuerySchema.extend({
  review_state: z.enum(MESSAGE_FLAG_REVIEW_STATES).optional(),
});
export type ListOversightFlagsQueryDto = z.infer<typeof listOversightFlagsQuerySchema>;

/** Body schema for `POST /v1/inbox/oversight/conversations/:id/freeze`. */
export const freezeConversationBodySchema = z.object({
  reason: z.string().min(1, 'Freeze reason is required').max(1024),
});
export type FreezeConversationDto = z.infer<typeof freezeConversationBodySchema>;

/**
 * Body schema for `POST /v1/inbox/oversight/flags/:id/dismiss` and
 * `POST /v1/inbox/oversight/flags/:id/escalate`. The notes field is
 * required — reviewers must justify their decision on every flag.
 */
export const flagReviewNotesBodySchema = z.object({
  notes: z.string().min(1, 'Review notes are required').max(4000),
});
export type FlagReviewNotesDto = z.infer<typeof flagReviewNotesBodySchema>;

/** Query schema for `GET /v1/inbox/oversight/audit-log`. */
export const listOversightAuditLogQuerySchema = paginationQuerySchema;
export type ListOversightAuditLogQueryDto = z.infer<typeof listOversightAuditLogQuerySchema>;
