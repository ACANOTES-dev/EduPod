# Implementation 09 — Full-Text Search

> **Wave:** 3 (parallel with 06, 07, 08)
> **Depends on:** 01, 04
> **Deploys:** API restart only

---

## Goal

Build the **inbox full-text search** that lets users find messages by keyword across their participating threads, plus a **tenant-wide oversight search** for admin tier. Backed by the `messages.body_search` tsvector column added in impl 01.

## What to build

### 1. The search service

`apps/api/src/modules/inbox/search/inbox-search.service.ts`

Public surface:

```ts
async search(input: {
  tenantId: string;
  userId: string;
  query: string;
  scope: 'user' | 'tenant';            // tenant scope only allowed via oversight controller
  pagination: { page: number; pageSize: number };
}): Promise<Paginated<InboxSearchHit>>;

type InboxSearchHit = {
  message_id: string;
  conversation_id: string;
  conversation_subject: string | null;
  conversation_kind: ConversationKind;
  sender_user_id: string;
  sender_display_name: string;
  body_snippet: string;                  // ts_headline output with highlighted matches
  created_at: Date;
  rank: number;
};
```

### 2. Algorithm

```
1. Parse the user's query into a tsquery.
   - Use plainto_tsquery('simple', $query) for safety (handles user-provided text)
   - Reject queries shorter than 2 characters → SEARCH_QUERY_TOO_SHORT
   - Reject queries longer than 200 characters → SEARCH_QUERY_TOO_LONG

2. Run the SQL search inside an interactive RLS transaction:

   USER SCOPE:
   SELECT
     m.id AS message_id,
     m.conversation_id,
     c.subject AS conversation_subject,
     c.kind AS conversation_kind,
     m.sender_user_id,
     u.display_name AS sender_display_name,
     ts_headline('simple', m.body, q.query, 'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=20, MinWords=5') AS body_snippet,
     m.created_at,
     ts_rank(m.body_search, q.query) AS rank
   FROM messages m
   JOIN conversations c ON c.id = m.conversation_id
   JOIN users u ON u.id = m.sender_user_id
   JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = $userId
   CROSS JOIN LATERAL plainto_tsquery('simple', $query) q(query)
   WHERE m.tenant_id = $tenantId
     AND m.body_search @@ q.query
     AND m.deleted_at IS NULL
   ORDER BY rank DESC, m.created_at DESC
   LIMIT $limit OFFSET $offset;

   TENANT SCOPE (oversight):
   Same query but WITHOUT the conversation_participants join.
   The controller layer enforces admin-tier-only via AdminTierOnlyGuard.

3. Return paginated hits.
```

### 3. The user-scope controller

`apps/api/src/modules/inbox/search/inbox-search.controller.ts`

```
GET /v1/inbox/search?q=...&page=1&pageSize=20
```

Behind `@RequiresPermission('inbox.read')`. Always uses `scope: 'user'`. Forwards `req.user.id` as the `userId`.

### 4. The tenant-scope (oversight) controller

This is **wired by impl 05's oversight controller**, not by this implementation. Impl 05 has a stub that returns `503 INBOX_SEARCH_NOT_READY` until this implementation deploys.

In this implementation, **once the search service exists**, update `apps/api/src/modules/inbox/oversight/inbox-oversight.controller.ts` to call `inboxSearchService.search({ ..., scope: 'tenant' })` instead of throwing the stub error. This is a tiny edit but it's the wave-3 contract — the stub becomes real here.

If for some reason impl 05 hasn't deployed yet (which shouldn't happen — it's wave 2), STOP and tell the user to run impl 05 first.

### 5. The tsquery sanitisation

`plainto_tsquery` is the safe entry point — it handles arbitrary user text and produces a valid tsquery. **Never** use `to_tsquery` directly with user input — that path requires syntactically valid Postgres tsquery format and will throw on stray punctuation.

If the user's input contains nothing tokenisable (e.g. only punctuation), `plainto_tsquery` returns an empty query and the WHERE clause matches nothing. Detect this case before running the SQL and short-circuit to an empty result with a helpful message: "No tokens to search for. Try at least one alphanumeric word."

### 6. Highlighting

`ts_headline` is the Postgres function that wraps matches in markers. The chosen options:

- `StartSel=<mark>, StopSel=</mark>` — HTML marks the frontend renders with a yellow highlight
- `MaxFragments=2` — show up to 2 disjoint snippets per message
- `MaxWords=20, MinWords=5` — keep snippets compact for the search-results page

The frontend (impl 10's search results page) sanitises the snippet through a small allowlist (only `<mark>` and `</mark>` survive) and renders.

### 7. Performance check

The `body_search` column has a GIN index added in impl 01. Verify the search runs against the index by running `EXPLAIN ANALYZE` on a representative query in dev:

```
EXPLAIN ANALYZE
SELECT id FROM messages
WHERE tenant_id = '...'
  AND body_search @@ plainto_tsquery('simple', 'meeting tomorrow');
```

The plan should show `Bitmap Index Scan on idx_messages_body_search`. If it shows a sequential scan, something is wrong — investigate before deploying.

### 8. Module wiring

`InboxModule` adds:

- `InboxSearchService`
- `InboxSearchController`

Exports `InboxSearchService` so the oversight controller can consume it.

## Tests

`inbox-search.service.spec.ts`:

- search returns hits matching the query
- search excludes hits from threads the user is not a participant in (user scope)
- tenant scope returns hits across all threads
- search excludes deleted messages
- short query → SEARCH_QUERY_TOO_SHORT
- long query → SEARCH_QUERY_TOO_LONG
- empty query → empty result with no SQL hit
- ranking respects ts_rank order
- pagination meta correct
- RLS leakage: cross-tenant query returns nothing

`inbox-search.controller.spec.ts`:

- Authenticated parent user → search returns only their threads
- Unauthenticated → 401

## Watch out for

- **Don't expose tenant scope from the user controller.** A bug here would let any user search the entire tenant. The user controller hardcodes `scope: 'user'` — there's no way to override it from the request. Test for this explicitly: send `?scope=tenant` as a parent and assert the response is still user-scoped.
- **`plainto_tsquery('simple', ...)`** with the `simple` config tokenises by whitespace and lowercases — no stemming, no stopwords. This is intentional for multilingual support. The tradeoff: searches for `meet` won't match `meeting`. Document in the search results UI ("Try exact words from the message").
- **Arabic content.** The `simple` config tokenises Arabic by whitespace which works tolerably for Arabic search. v2 can switch to a multilingual config or per-locale ts vectors.
- **`ts_headline` is expensive.** It re-parses the body for each row. Don't run search with `pageSize > 50`. Cap the `pageSize` Zod schema at 50.
- **The user-scope query joins conversation_participants twice in spirit** — once via the participant filter, once via the conversation table. Make sure the join order is right and the index `idx_participants_user_inbox` (impl 01) is used. Run EXPLAIN ANALYZE on the dev DB to confirm.
- **Don't return body_search in any API response.** It's a tsvector and irrelevant to clients.

## Deployment notes

- API restart only.
- After deploy:
  - `GET /v1/inbox/search?q=test` as a participant of a thread containing "test" → returns the hit with highlighted snippet.
  - `GET /v1/inbox/search?q=test` as a non-participant → returns empty.
  - `GET /v1/inbox/oversight/search?q=test` as Principal → returns hits across all threads (this verifies the impl 05 stub was unblocked).
  - `GET /v1/inbox/oversight/search?q=test` as a teacher → 403.
