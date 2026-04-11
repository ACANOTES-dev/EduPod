import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

import type { ConversationKind } from '@school/shared/inbox';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * InboxSearchService — full-text search over `messages.body`, backed by
 * the `body_search` tsvector column and its GIN index
 * (`idx_messages_body_search`) from implementation 01.
 *
 * Two scopes are supported:
 *
 *   - `user`   → restricted to threads the caller participates in. Used
 *                by the regular `/v1/inbox/search` endpoint.
 *   - `tenant` → spans every thread in the tenant. Only reachable via
 *                the oversight controller (impl 05), which layers an
 *                `AdminTierOnlyGuard` on top of `inbox.oversight.read`.
 *
 * `plainto_tsquery('simple', ...)` is the sanitisation entry point — it
 * handles arbitrary user text and never throws on punctuation. The
 * `simple` dictionary tokenises by whitespace without stemming or
 * stopword removal, which is the right tradeoff for multilingual
 * content (Arabic, English).
 *
 * The query is executed with `$queryRaw` inside an interactive RLS
 * transaction. The raw escape is required because Prisma's type-safe
 * query builder cannot express `tsvector @@ tsquery` or `ts_headline`.
 * The `body_search` column has no corresponding Prisma field — that's
 * intentional (§8 of impl 01: `Unsupported("tsvector")`).
 */

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export interface InboxSearchHit {
  message_id: string;
  conversation_id: string;
  conversation_subject: string | null;
  conversation_kind: ConversationKind;
  sender_user_id: string;
  sender_display_name: string;
  body_snippet: string;
  created_at: Date;
  rank: number;
}

export type InboxSearchScope = 'user' | 'tenant';

interface SearchInput {
  tenantId: string;
  userId: string;
  query: string;
  scope: InboxSearchScope;
  pagination: { page: number; pageSize: number };
}

// `ts_headline` options — yellow-highlighted <mark> spans, two fragments
// max, compact 5–20 words so the search-results UI stays readable. The
// frontend sanitises the snippet through a <mark>-only allowlist.
const TS_HEADLINE_OPTIONS =
  'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=20, MinWords=5';

type SearchHitRow = {
  message_id: string;
  conversation_id: string;
  conversation_subject: string | null;
  conversation_kind: ConversationKind;
  sender_user_id: string;
  sender_first_name: string;
  sender_last_name: string;
  sender_email: string;
  body_snippet: string;
  created_at: Date;
  rank: number;
};

@Injectable()
export class InboxSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(input: SearchInput): Promise<Paginated<InboxSearchHit>> {
    const { tenantId, userId, query, scope, pagination } = input;
    const { page, pageSize } = pagination;

    if (page < 1 || pageSize < 1) {
      throw new BadRequestException({
        code: 'INVALID_PAGINATION',
        message: 'page and pageSize must be >= 1',
      });
    }
    if (pageSize > 50) {
      throw new BadRequestException({
        code: 'SEARCH_PAGE_SIZE_TOO_LARGE',
        message: 'pageSize may not exceed 50 for search',
      });
    }

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      throw new BadRequestException({
        code: 'SEARCH_QUERY_TOO_SHORT',
        message: 'Search query must be at least 2 characters long',
      });
    }
    if (trimmed.length > 200) {
      throw new BadRequestException({
        code: 'SEARCH_QUERY_TOO_LONG',
        message: 'Search query may not exceed 200 characters',
      });
    }

    // Empty-token short-circuit. `plainto_tsquery` returns an empty
    // tsquery when the input has no alphanumeric tokens (e.g. all
    // punctuation). We detect that before hitting the DB so callers
    // get a clean empty page with zero cost.
    if (!hasSearchableToken(trimmed)) {
      return { data: [], meta: { page, pageSize, total: 0 } };
    }

    const skip = (page - 1) * pageSize;
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });

    return rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;
      const raw = tx as unknown as {
        $queryRaw: <T>(sql: Prisma.Sql) => Promise<T>;
      };

      // Participant gate — eliminates cross-thread leakage at the SQL
      // level. Without this join, a curious parent could search their
      // own tenant's entire message corpus. The oversight path removes
      // the filter by passing `scope: 'tenant'`.
      const participantFilter =
        scope === 'user'
          ? Prisma.sql`AND EXISTS (
              SELECT 1 FROM conversation_participants cp
              WHERE cp.conversation_id = m.conversation_id
                AND cp.user_id = ${userId}::uuid
            )`
          : Prisma.empty;

      // eslint-disable-next-line school/no-raw-sql-outside-rls -- tsvector search within RLS transaction
      const rows = await raw.$queryRaw<SearchHitRow[]>(
        Prisma.sql`
          SELECT
            m.id AS message_id,
            m.conversation_id,
            c.subject AS conversation_subject,
            c.kind::text AS conversation_kind,
            m.sender_user_id,
            u.first_name AS sender_first_name,
            u.last_name AS sender_last_name,
            u.email AS sender_email,
            ts_headline('simple', m.body, q.query, ${TS_HEADLINE_OPTIONS}) AS body_snippet,
            m.created_at,
            ts_rank(m.body_search, q.query) AS rank
          FROM messages m
          JOIN conversations c ON c.id = m.conversation_id
          JOIN users u ON u.id = m.sender_user_id
          CROSS JOIN LATERAL plainto_tsquery('simple', ${trimmed}) q(query)
          WHERE m.tenant_id = ${tenantId}::uuid
            AND m.body_search @@ q.query
            AND m.deleted_at IS NULL
            ${participantFilter}
          ORDER BY rank DESC, m.created_at DESC
          LIMIT ${pageSize} OFFSET ${skip}
        `,
      );

      // eslint-disable-next-line school/no-raw-sql-outside-rls -- tsvector count within RLS transaction
      const totalRows = await raw.$queryRaw<Array<{ count: bigint }>>(
        Prisma.sql`
          SELECT COUNT(*)::bigint AS count
          FROM messages m
          CROSS JOIN LATERAL plainto_tsquery('simple', ${trimmed}) q(query)
          WHERE m.tenant_id = ${tenantId}::uuid
            AND m.body_search @@ q.query
            AND m.deleted_at IS NULL
            ${participantFilter}
        `,
      );

      const total = Number(totalRows[0]?.count ?? 0n);

      const data: InboxSearchHit[] = rows.map((row) => ({
        message_id: row.message_id,
        conversation_id: row.conversation_id,
        conversation_subject: row.conversation_subject,
        conversation_kind: row.conversation_kind,
        sender_user_id: row.sender_user_id,
        sender_display_name: formatSenderName(row),
        body_snippet: row.body_snippet,
        created_at: row.created_at,
        // Postgres returns `real` as `number` through the driver. Coerce
        // defensively in case the row shape drifts.
        rank: Number(row.rank),
      }));

      return { data, meta: { page, pageSize, total } };
    });
  }
}

function formatSenderName(row: {
  sender_first_name: string;
  sender_last_name: string;
  sender_email: string;
}): string {
  const composed = `${row.sender_first_name} ${row.sender_last_name}`.trim();
  return composed.length > 0 ? composed : row.sender_email;
}

/**
 * Cheap pre-flight check: does the trimmed query contain at least one
 * alphanumeric (including Unicode letters) character? If not,
 * `plainto_tsquery` will produce an empty query and every match will
 * fail — we short-circuit to return an empty result without a DB hit.
 */
function hasSearchableToken(value: string): boolean {
  for (const ch of value) {
    if (/\p{L}|\p{N}/u.test(ch)) return true;
  }
  return false;
}
