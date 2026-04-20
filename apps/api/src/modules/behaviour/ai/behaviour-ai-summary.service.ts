import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

import type { AiStudentSummaryHighlight, AiStudentSummaryResult } from '@school/shared/behaviour';

import { AnthropicClientService } from '../../ai/anthropic-client.service';
import { AiAuditService } from '../../gdpr/ai-audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentReadFacade } from '../../students/student-read.facade';

const AI_SUMMARY_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const AI_SUMMARY_SYSTEM_PROMPT = `You are a school behaviour analytics assistant. Write a brief narrative
summary (2–4 sentences) of a student's recent behaviour signal plus 3–6 highlights.

Rules:
- Never diagnose or speculate about home life, SEND, or medical conditions.
- Refer to the student as "the student" (no names).
- Use concrete numbers from the supplied data where possible.
- All insights are for professional discussion only.

Respond with JSON matching EXACTLY:
{
  "summary_paragraph": string,
  "highlights": [
    {
      "kind": "trend" | "incident" | "intervention" | "recognition",
      "title": string,
      "detail": string
    }
  ]
}`;

interface CachedSummary {
  result: AiStudentSummaryResult;
  expiresAtMs: number;
}

interface SummaryLlmResponse {
  summary_paragraph: string;
  highlights: AiStudentSummaryHighlight[];
}

@Injectable()
export class BehaviourAiSummaryService {
  private readonly logger = new Logger(BehaviourAiSummaryService.name);
  private readonly cache = new Map<string, CachedSummary>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: AnthropicClientService,
    private readonly aiAudit: AiAuditService,
    private readonly studentReadFacade: StudentReadFacade,
  ) {}

  async getSummary(
    tenantId: string,
    studentId: string,
    from?: string,
    to?: string,
    now: number = Date.now(),
  ): Promise<AiStudentSummaryResult> {
    const exists = await this.studentReadFacade.exists(tenantId, studentId);
    if (!exists) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: 'Student not found',
      });
    }

    const period = resolvePeriod(from, to, now);
    const cacheKey = this.makeCacheKey(tenantId, studentId, period.from, period.to);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAtMs > now) {
      return { ...cached.result, cached: true };
    }

    if (!this.anthropic.isConfigured) {
      throw new ServiceUnavailableException({
        code: 'AI_SERVICE_UNAVAILABLE',
        message: 'AI provider not configured. ANTHROPIC_API_KEY is not set.',
      });
    }

    const dataContext = await this.buildDataContext(tenantId, studentId, period);

    const userMessage = [
      `Summarise the student's behaviour for the period ${period.from} → ${period.to}.`,
      'Data:',
      JSON.stringify(dataContext, null, 2),
    ].join('\n\n');

    const aiStartTime = Date.now();
    let parsed: SummaryLlmResponse;
    try {
      parsed = await this.callLlm(userMessage);
    } catch (err) {
      this.logger.warn(
        `[getSummary] LLM call failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        student_id: studentId,
        summary_paragraph: '',
        highlights: [],
        period,
        generated_at: new Date(now).toISOString(),
        cached: false,
      };
    }
    const aiElapsed = Date.now() - aiStartTime;

    await this.aiAudit.log({
      tenantId,
      aiService: 'ai_behaviour_student_summary',
      subjectType: 'student',
      subjectId: studentId,
      modelUsed: 'claude-sonnet-4-5-20250514',
      promptHash: AiAuditService.hashPrompt(userMessage),
      promptSummary: AiAuditService.truncate(userMessage, 500),
      responseSummary: AiAuditService.truncate(JSON.stringify(parsed), 500),
      inputDataCategories: ['behaviour_student_analytics'],
      tokenised: false,
      processingTimeMs: aiElapsed,
    });

    const result: AiStudentSummaryResult = {
      student_id: studentId,
      summary_paragraph: parsed.summary_paragraph,
      highlights: parsed.highlights,
      period,
      generated_at: new Date(now).toISOString(),
      cached: false,
    };

    this.cache.set(cacheKey, { result, expiresAtMs: now + CACHE_TTL_MS });
    return result;
  }

  invalidate(tenantId: string, studentId: string): void {
    const prefix = `${tenantId}:${studentId}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  private async buildDataContext(
    tenantId: string,
    studentId: string,
    period: { from: string; to: string },
  ): Promise<{
    period: { from: string; to: string };
    counts: { positive: number; negative: number; neutral: number };
    recent_categories: Array<{ name: string; polarity: string; count: number }>;
    active_interventions: number;
  }> {
    const fromDate = new Date(period.from);
    const toDate = new Date(period.to);
    const participantWhere = {
      tenant_id: tenantId,
      student_id: studentId,
      participant_type: 'student' as const,
      incident: {
        retention_status: 'active' as const,
        status: { not: 'withdrawn' as const },
        occurred_at: { gte: fromDate, lte: toDate },
      },
    };

    const [participants, activeInterventions] = await Promise.all([
      this.prisma.behaviourIncidentParticipant.findMany({
        where: participantWhere,
        select: {
          incident: {
            select: {
              polarity: true,
              category: { select: { name: true } },
            },
          },
        },
        take: 200,
      }),
      this.prisma.behaviourIntervention.count({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          status: { in: ['active_intervention', 'monitoring'] },
        },
      }),
    ]);

    const counts = { positive: 0, negative: 0, neutral: 0 };
    const categoryMap = new Map<string, { polarity: string; count: number }>();
    for (const row of participants) {
      const polarity = row.incident.polarity as 'positive' | 'negative' | 'neutral';
      counts[polarity] += 1;
      const name = row.incident.category?.name ?? 'Unknown';
      const existing = categoryMap.get(name);
      if (existing) {
        existing.count += 1;
      } else {
        categoryMap.set(name, { polarity, count: 1 });
      }
    }
    const recentCategories = Array.from(categoryMap.entries())
      .map(([name, info]) => ({ name, polarity: info.polarity, count: info.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return {
      period,
      counts,
      recent_categories: recentCategories,
      active_interventions: activeInterventions,
    };
  }

  private makeCacheKey(tenantId: string, studentId: string, from: string, to: string): string {
    return `${tenantId}:${studentId}:${from}:${to}`;
  }

  private async callLlm(userMessage: string): Promise<SummaryLlmResponse> {
    const response = await this.anthropic.createMessage(
      {
        model: 'claude-sonnet-4-5-20250514',
        max_tokens: 800,
        system: AI_SUMMARY_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      },
      { timeoutMs: AI_SUMMARY_TIMEOUT_MS },
    );
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from AI');
    }
    const trimmed = textBlock.text
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/\s*```$/i, '');
    const raw = JSON.parse(trimmed) as Record<string, unknown>;
    return {
      summary_paragraph: typeof raw.summary_paragraph === 'string' ? raw.summary_paragraph : '',
      highlights: normaliseHighlights(raw.highlights),
    };
  }
}

function resolvePeriod(
  from: string | undefined,
  to: string | undefined,
  now: number,
): { from: string; to: string } {
  const toDate = to ?? new Date(now).toISOString().slice(0, 10);
  const defaultFromMs = now - 90 * 24 * 60 * 60 * 1000;
  const fromDate = from ?? new Date(defaultFromMs).toISOString().slice(0, 10);
  return { from: fromDate, to: toDate };
}

function normaliseHighlights(v: unknown): AiStudentSummaryHighlight[] {
  if (!Array.isArray(v)) return [];
  const kinds: AiStudentSummaryHighlight['kind'][] = [
    'trend',
    'incident',
    'intervention',
    'recognition',
  ];
  return v.flatMap((item): AiStudentSummaryHighlight[] => {
    if (typeof item !== 'object' || item === null) return [];
    const obj = item as Record<string, unknown>;
    const kind = kinds.find((k) => k === obj.kind);
    if (!kind) return [];
    const title = typeof obj.title === 'string' ? obj.title : '';
    const detail = typeof obj.detail === 'string' ? obj.detail : '';
    if (!title && !detail) return [];
    return [{ kind, title, detail }];
  });
}
