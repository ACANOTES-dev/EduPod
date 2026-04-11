import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { SYSTEM_USER_SENTINEL } from '../../base/tenant-aware-job';

// ─── Job names ──────────────────────────────────────────────────────────────

export const SAFEGUARDING_SCAN_MESSAGE_JOB = 'safeguarding:scan-message';
export const SAFEGUARDING_NOTIFY_REVIEWERS_JOB = 'safeguarding:notify-reviewers';

// ─── Payload ────────────────────────────────────────────────────────────────

export interface SafeguardingScanMessagePayload {
  tenant_id: string;
  conversation_id: string;
  message_id: string;
}

// ─── Severity type (kept inline so the worker doesn't reach into shared) ───

type MessageFlagSeverity = 'low' | 'medium' | 'high';

interface KeywordRow {
  keyword: string;
  severity: MessageFlagSeverity;
  category: string;
}

interface KeywordMatch {
  keyword: string;
  severity: MessageFlagSeverity;
}

/**
 * Escape regex metacharacters in user-supplied keywords. Keywords may contain
 * arbitrary text (`c++`, `a.b`, `(help)`) and must never be compiled as
 * regex literals without escaping.
 */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highestOf(matches: KeywordMatch[]): MessageFlagSeverity | null {
  if (matches.length === 0) return null;
  if (matches.some((m) => m.severity === 'high')) return 'high';
  if (matches.some((m) => m.severity === 'medium')) return 'medium';
  return 'low';
}

// ─── Processor ──────────────────────────────────────────────────────────────

/**
 * Runs a newly-persisted (or edited) inbox message through the tenant's
 * safeguarding keyword list. On any match, upserts a `MessageFlag` row
 * with the matched keywords and highest severity, then enqueues a
 * follow-up `safeguarding:notify-reviewers` job. On zero matches after a
 * rescan of a previously-flagged message, the flag row is deleted — the
 * current body no longer contains a safeguarding concern.
 *
 * Skip conditions:
 *   - Message not found (race with a delete).
 *   - Soft-deleted message (`deleted_at !== null`).
 *   - System-authored message (`sender_user_id === SYSTEM_USER_SENTINEL`)
 *     — freeze / unfreeze system messages are not user content.
 *
 * The scanner logic is inlined here (not a separate service) because the
 * worker cannot reach into the API's `SafeguardingModule` DI graph —
 * the worker and API are separate Nest applications. The keyword list is
 * fetched per scan with a 5-minute in-memory cache per tenant so a burst
 * of messages does not hammer the `safeguarding_keywords` table.
 */
@Processor(QUEUE_NAMES.SAFEGUARDING, {
  lockDuration: 30_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class SafeguardingScanMessageProcessor extends WorkerHost {
  private readonly logger = new Logger(SafeguardingScanMessageProcessor.name);

  private static readonly KEYWORD_CACHE_TTL_MS = 5 * 60 * 1000;
  private readonly keywordCache = new Map<string, { rows: KeywordRow[]; expiresAt: number }>();

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.SAFEGUARDING) private readonly safeguardingQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<SafeguardingScanMessagePayload>): Promise<void> {
    if (job.name !== SAFEGUARDING_SCAN_MESSAGE_JOB) return;

    const { tenant_id, message_id } = job.data;
    if (!tenant_id || !message_id) {
      throw new Error(
        `[${SAFEGUARDING_SCAN_MESSAGE_JOB}] rejected: missing tenant_id/message_id in payload`,
      );
    }

    // ─── 1. Load the message body under RLS ────────────────────────────
    const message = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant_id}::text, true)`;
      return tx.message.findFirst({
        where: { id: message_id, tenant_id },
        select: {
          id: true,
          body: true,
          sender_user_id: true,
          deleted_at: true,
        },
      });
    });

    if (!message) {
      this.logger.debug(
        `[${SAFEGUARDING_SCAN_MESSAGE_JOB}] message ${message_id} not found — skipping`,
      );
      return;
    }

    if (message.deleted_at) {
      this.logger.debug(
        `[${SAFEGUARDING_SCAN_MESSAGE_JOB}] message ${message_id} soft-deleted — skipping`,
      );
      return;
    }

    if (message.sender_user_id === SYSTEM_USER_SENTINEL) {
      this.logger.debug(
        `[${SAFEGUARDING_SCAN_MESSAGE_JOB}] message ${message_id} authored by SYSTEM_USER_SENTINEL — skipping`,
      );
      return;
    }

    // ─── 2. Run the scanner ─────────────────────────────────────────────
    const matches = await this.scan(tenant_id, message.body);
    const highestSeverity = highestOf(matches);

    // ─── 3. Upsert / delete the flag row ───────────────────────────────
    const newFlagId = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant_id}::text, true)`;

      const existing = await tx.messageFlag.findFirst({
        where: { tenant_id, message_id },
        select: { id: true },
      });

      if (matches.length === 0) {
        if (existing) {
          await tx.messageFlag.delete({ where: { id: existing.id } });
          this.logger.debug(
            `[${SAFEGUARDING_SCAN_MESSAGE_JOB}] rescan cleared flag ${existing.id} for message ${message_id}`,
          );
        }
        return null;
      }

      const matchedKeywords = Array.from(new Set(matches.map((m) => m.keyword)));
      const severity = highestSeverity ?? 'low';

      if (existing) {
        const updated = await tx.messageFlag.update({
          where: { id: existing.id },
          data: {
            matched_keywords: matchedKeywords,
            highest_severity: severity,
            review_state: 'pending',
            reviewed_by_user_id: null,
            reviewed_at: null,
            review_notes: null,
          },
          select: { id: true },
        });
        return updated.id;
      }

      const created = await tx.messageFlag.create({
        data: {
          tenant_id,
          message_id,
          matched_keywords: matchedKeywords,
          highest_severity: severity,
          review_state: 'pending',
        },
        select: { id: true },
      });
      return created.id;
    });

    if (!newFlagId) return;

    // ─── 4. Fan out the reviewer notification job ──────────────────────
    await this.safeguardingQueue.add(
      SAFEGUARDING_NOTIFY_REVIEWERS_JOB,
      { tenant_id, message_flag_id: newFlagId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    );

    this.logger.log(
      `[${SAFEGUARDING_SCAN_MESSAGE_JOB}] flagged message ${message_id} — ${matches.length} match(es), severity=${highestSeverity ?? 'low'}`,
    );
  }

  /**
   * Load active keywords for a tenant (5-min per-tenant cache) and run the
   * word-boundary regex loop against the lowercased body.
   */
  private async scan(tenantId: string, body: string): Promise<KeywordMatch[]> {
    if (!body || body.length === 0) return [];

    const keywords = await this.loadActiveKeywords(tenantId);
    if (keywords.length === 0) return [];

    const lowered = body.toLowerCase();
    const matches: KeywordMatch[] = [];

    for (const kw of keywords) {
      const needle = kw.keyword.toLowerCase();
      if (needle.length === 0) continue;

      // Word boundaries only apply on sides that end in a word character.
      // For keywords like `c++`, the trailing `+` is not a word char so
      // `\b` never matches — drop the boundary on that side.
      const leadingBoundary = /^\w/.test(needle) ? '\\b' : '';
      const trailingBoundary = /\w$/.test(needle) ? '\\b' : '';
      const pattern = new RegExp(
        `${leadingBoundary}${escapeRegex(needle)}${trailingBoundary}`,
        'g',
      );
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(lowered)) !== null) {
        matches.push({ keyword: kw.keyword, severity: kw.severity });
        if (m.index === pattern.lastIndex) pattern.lastIndex += 1;
      }
    }

    return matches;
  }

  private async loadActiveKeywords(tenantId: string): Promise<KeywordRow[]> {
    const now = Date.now();
    const cached = this.keywordCache.get(tenantId);
    if (cached && cached.expiresAt > now) return cached.rows;

    const rows = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}::text, true)`;
      return tx.safeguardingKeyword.findMany({
        where: { tenant_id: tenantId, active: true },
        select: { keyword: true, severity: true, category: true },
      });
    });

    const mapped: KeywordRow[] = rows.map((r) => ({
      keyword: r.keyword,
      severity: r.severity as MessageFlagSeverity,
      category: r.category,
    }));
    this.keywordCache.set(tenantId, {
      rows: mapped,
      expiresAt: now + SafeguardingScanMessageProcessor.KEYWORD_CACHE_TTL_MS,
    });
    return mapped;
  }

  /** Test helper — clear every cached tenant. Not used in production paths. */
  clearKeywordCacheForTest(): void {
    this.keywordCache.clear();
  }
}
