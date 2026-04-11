import { z } from 'zod';

/**
 * Query schema for `GET /v1/inbox/people-search` — the compose dialog's
 * people picker uses this endpoint to search for reachable users in the
 * tenant. Results are policy-filtered: the backend runs
 * `MessagingPolicyService.canStartConversation` in batch mode so a
 * teacher only sees parents they may message, and parents only see the
 * teachers of their own children. See implementation 11.
 */
export const inboxPeopleSearchQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type InboxPeopleSearchQueryDto = z.infer<typeof inboxPeopleSearchQuerySchema>;

export interface InboxPeopleSearchResult {
  user_id: string;
  display_name: string;
  email: string | null;
  role_label: string;
  messaging_role: string;
}
