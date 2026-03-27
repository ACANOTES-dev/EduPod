import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface ModerationScanPayload extends TenantJobPayload {
  survey_id: string;
  response_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const MODERATION_SCAN_JOB = 'wellbeing:moderation-scan';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.WELLBEING)
export class ModerationScanProcessor extends WorkerHost {
  private readonly logger = new Logger(ModerationScanProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<ModerationScanPayload>): Promise<void> {
    if (job.name !== MODERATION_SCAN_JOB) return;

    const { tenant_id } = job.data;
    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${MODERATION_SCAN_JOB} — response ${job.data.response_id}, survey ${job.data.survey_id}`,
    );

    const scanJob = new ModerationScanJob(this.prisma);
    await scanJob.execute(job.data);
  }
}

// ─── Matching helpers ────────────────────────────────────────────────────────

/**
 * Escapes special regex characters so literal strings can be used in a RegExp.
 * Handles apostrophes and other special chars common in Irish names.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build word-boundary-aware regex patterns from a list of candidate strings.
 *
 * Short strings (<=2 chars) require exact word boundaries (\b) to avoid
 * false positives. All matching is case-insensitive.
 *
 * Irish name patterns (O'Brien, Mac Giolla, Ni Bhriain) are handled naturally
 * because the apostrophes and spaces are preserved in the escaped pattern and
 * \b treats apostrophes as word boundaries.
 */
function buildMatchPatterns(values: string[]): RegExp[] {
  const patterns: RegExp[] = [];

  for (const val of values) {
    const trimmed = val.trim();
    if (!trimmed) continue;

    const escaped = escapeRegex(trimmed);

    // For short strings (1-2 chars like room codes "A", "B1"), require strict
    // word boundaries to avoid matching inside longer words.
    // For longer strings, use a looser boundary that allows matching within
    // natural text while still respecting word edges.
    if (trimmed.length <= 2) {
      patterns.push(new RegExp(`\\b${escaped}\\b`, 'i'));
    } else {
      // Use word boundary where possible, but for names starting/ending with
      // apostrophes (like O'Brien), \b works correctly since ' is non-word.
      patterns.push(new RegExp(`\\b${escaped}\\b`, 'i'));
    }
  }

  return patterns;
}

/**
 * Check whether any pattern matches the given text.
 */
function hasMatch(text: string, patterns: RegExp[]): boolean {
  for (const pattern of patterns) {
    if (pattern.test(text)) return true;
  }
  return false;
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

/**
 * Scans a freeform survey response for identifying information (staff names,
 * room names, subject names/codes). If a match is found, the response is
 * flagged for moderator review.
 *
 * NOTE: survey_responses has NO tenant_id and NO RLS. We access it via the
 * base prisma client (this.prisma). Tenant-scoped reference data (staff,
 * rooms, subjects) is accessed via the RLS-scoped transaction client (tx).
 */
class ModerationScanJob extends TenantAwareJob<ModerationScanPayload> {
  private readonly logger = new Logger(ModerationScanJob.name);

  protected async processJob(
    data: ModerationScanPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { response_id } = data;

    // 1. Load the response (no RLS — use base prisma client)
    const response = await this.prisma.surveyResponse.findUnique({
      where: { id: response_id },
    });

    if (!response) {
      this.logger.warn(
        `Response ${response_id} not found — skipping`,
      );
      return;
    }

    // 2. Skip if already processed (not pending)
    if (response.moderation_status !== 'pending') {
      this.logger.log(
        `Response ${response_id} moderation_status is "${response.moderation_status}" — skipping`,
      );
      return;
    }

    // 3. Verify this is a freeform question
    const question = await tx.surveyQuestion.findUnique({
      where: { id: response.question_id },
      select: { question_type: true },
    });

    if (!question || question.question_type !== 'freeform') {
      this.logger.log(
        `Response ${response_id} is not a freeform question (type: ${question?.question_type ?? 'unknown'}) — skipping`,
      );
      return;
    }

    // 4. Get the answer text to scan
    const answerText = response.answer_text;
    if (!answerText || answerText.trim().length === 0) {
      this.logger.log(
        `Response ${response_id} has no answer_text — skipping`,
      );
      return;
    }

    // 5. Load matching data sources (tenant-scoped via tx with RLS)
    //    StaffProfile has no first_name/last_name — those live on User.
    //    Join through the user relation to get names.
    const [staffProfiles, rooms, subjects] = await Promise.all([
      tx.staffProfile.findMany({
        select: { user: { select: { first_name: true, last_name: true } } },
      }),
      tx.room.findMany({
        select: { name: true },
      }),
      tx.subject.findMany({
        select: { name: true, code: true },
      }),
    ]);

    // 6. Build match values
    const matchValues: string[] = [];

    // Staff: first name, last name, and "first last" combined
    for (const staff of staffProfiles) {
      const { first_name, last_name } = staff.user;
      if (first_name) matchValues.push(first_name);
      if (last_name) matchValues.push(last_name);
      if (first_name && last_name) {
        matchValues.push(`${first_name} ${last_name}`);
      }
    }

    // Rooms: name only (Room model has no code field)
    for (const room of rooms) {
      if (room.name) matchValues.push(room.name);
    }

    // Subjects: name and code (if code exists)
    for (const subject of subjects) {
      if (subject.name) matchValues.push(subject.name);
      if (subject.code) matchValues.push(subject.code);
    }

    // 7. Build regex patterns and scan
    const patterns = buildMatchPatterns(matchValues);
    const matched = hasMatch(answerText, patterns);

    // 8. Update moderation status if matched
    if (matched) {
      await this.prisma.surveyResponse.update({
        where: { id: response_id },
        data: { moderation_status: 'flagged' },
      });

      this.logger.log(
        `Response ${response_id} flagged — identifying information detected`,
      );
    } else {
      this.logger.log(
        `Response ${response_id} scan complete — no matches found, stays pending`,
      );
    }
  }
}

// Export for testing
export { ModerationScanJob, buildMatchPatterns, hasMatch, escapeRegex };
