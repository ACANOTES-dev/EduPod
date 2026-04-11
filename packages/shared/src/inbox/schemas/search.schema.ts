import { z } from 'zod';

/**
 * Query schema for `GET /v1/inbox/search` (user-scoped full-text search).
 *
 * `pageSize` is capped at 50 here rather than the shared-default 100
 * because `ts_headline` re-parses every matching row to build the
 * snippet, which is expensive. See implementation 09.
 *
 * `q` has a min length of 2 — shorter queries are rejected with
 * `SEARCH_QUERY_TOO_SHORT`. The max of 200 characters is the service
 * contract with the frontend (`SEARCH_QUERY_TOO_LONG` otherwise).
 */
export const inboxSearchQuerySchema = z.object({
  q: z.string().min(2, 'SEARCH_QUERY_TOO_SHORT').max(200, 'SEARCH_QUERY_TOO_LONG'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type InboxSearchQueryDto = z.infer<typeof inboxSearchQuerySchema>;
