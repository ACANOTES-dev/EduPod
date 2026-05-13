import { randomUUID } from 'crypto';

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import type { AiParseResult } from '@school/shared/behaviour';

import { AnthropicClientService } from '../../ai/anthropic-client.service';
import { AiAuditService } from '../../gdpr/ai-audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentReadFacade } from '../../students/student-read.facade';

const AI_PARSE_TIMEOUT_MS = 15_000;
const MAX_NAME_CANDIDATES = 500;

/**
 * Instructional system prompt for the incident-description parser.
 * The model is asked to return strict JSON describing the suggested
 * incident fields. The provider-response id is folded into the audit
 * log so a human reviewer can trace the decision.
 */
const AI_PARSE_SYSTEM_PROMPT = `You are a school behaviour incident parser.
Given a free-text description of an incident written by a staff member,
extract the structured fields that help pre-fill an incident form.

You MUST respond with a single JSON object matching EXACTLY this schema
(no prose, no markdown code fence):
{
  "polarity": "positive" | "negative" | null,
  "severity": "minor" | "moderate" | "major" | null,
  "students": [{ "name": string, "confidence": number }],
  "when": string | null,   // ISO-8601 timestamp if explicit, else null
  "location": string | null,
  "category_hint": string | null, // short label, e.g. "Disruption", "Praise"
  "confidence": number     // 0..1 overall confidence
}

Rules:
- "students" = names or partial names that appear to reference people. Omit role titles.
- Never invent names not present in the description.
- If a detail is not clearly present, use null / empty array.
- Do not diagnose or speculate about motives.`;

interface ParseLlmResponse {
  polarity: 'positive' | 'negative' | null;
  severity: 'minor' | 'moderate' | 'major' | null;
  students: Array<{ name: string; confidence: number }>;
  when: string | null;
  location: string | null;
  category_hint: string | null;
  confidence: number;
}

@Injectable()
export class BehaviourAiParseService {
  private readonly logger = new Logger(BehaviourAiParseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: AnthropicClientService,
    private readonly aiAudit: AiAuditService,
    private readonly studentReadFacade: StudentReadFacade,
  ) {}

  async parse(tenantId: string, _userId: string, description: string): Promise<AiParseResult> {
    if (!this.anthropic.isConfigured) {
      throw new ServiceUnavailableException({
        code: 'AI_SERVICE_UNAVAILABLE',
        message: 'AI provider not configured. ANTHROPIC_API_KEY is not set.',
      });
    }

    const providerResponseId = randomUUID();
    const aiStartTime = Date.now();

    let parsed: ParseLlmResponse;
    try {
      parsed = await this.callParser(tenantId, description);
    } catch (err) {
      this.logger.warn(
        `[parse] LLM call failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return this.emptyResult(providerResponseId);
    }

    const aiElapsed = Date.now() - aiStartTime;

    const [category, students] = await Promise.all([
      this.resolveCategoryId(tenantId, parsed.category_hint, parsed.polarity),
      this.resolveStudents(tenantId, parsed.students ?? []),
    ]);

    await this.aiAudit.log({
      tenantId,
      aiService: 'ai_behaviour_parse',
      subjectType: null,
      subjectId: null,
      modelUsed: 'claude-sonnet-4-5-20250514',
      promptHash: AiAuditService.hashPrompt(description),
      promptSummary: AiAuditService.truncate(description, 500),
      responseSummary: AiAuditService.truncate(JSON.stringify(parsed), 500),
      inputDataCategories: ['behaviour_incident_description'],
      tokenised: false,
      processingTimeMs: aiElapsed,
    });

    return {
      suggested_category_id: category,
      suggested_polarity: parsed.polarity,
      suggested_severity: parsed.severity,
      suggested_students: students,
      suggested_when: parsed.when,
      suggested_location: parsed.location,
      confidence_score: clamp01(parsed.confidence),
      raw_provider_response_id: providerResponseId,
    };
  }

  private emptyResult(providerResponseId: string): AiParseResult {
    return {
      suggested_category_id: null,
      suggested_polarity: null,
      suggested_severity: null,
      suggested_students: [],
      suggested_when: null,
      suggested_location: null,
      confidence_score: 0,
      raw_provider_response_id: providerResponseId,
    };
  }

  private async callParser(tenantId: string, description: string): Promise<ParseLlmResponse> {
    const response = await this.anthropic.createMessage(
      {
        model: 'claude-sonnet-4-5-20250514',
        max_tokens: 512,
        system: AI_PARSE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: description }],
      },
      { tenantId, timeoutMs: AI_PARSE_TIMEOUT_MS },
    );
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from AI');
    }
    return this.safeParseJson(textBlock.text);
  }

  private safeParseJson(raw: string): ParseLlmResponse {
    const trimmed = raw
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/\s*```$/i, '');
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return {
      polarity: normalisePolarity(parsed.polarity),
      severity: normaliseSeverity(parsed.severity),
      students: normaliseStudents(parsed.students),
      when: typeof parsed.when === 'string' ? parsed.when : null,
      location: typeof parsed.location === 'string' ? parsed.location : null,
      category_hint: typeof parsed.category_hint === 'string' ? parsed.category_hint : null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    };
  }

  private async resolveCategoryId(
    tenantId: string,
    hint: string | null,
    polarity: 'positive' | 'negative' | null,
  ): Promise<string | null> {
    if (!hint) return null;
    const polarityFilter =
      polarity === 'positive' ? 'positive' : polarity === 'negative' ? 'negative' : undefined;
    const candidates = await this.prisma.behaviourCategory.findMany({
      where: {
        tenant_id: tenantId,
        is_active: true,
        ...(polarityFilter ? { polarity: polarityFilter } : {}),
      },
      select: { id: true, name: true },
      take: MAX_NAME_CANDIDATES,
    });
    const hintLower = hint.toLowerCase();
    const exact = candidates.find((c) => c.name.toLowerCase() === hintLower);
    if (exact) return exact.id;
    const contains = candidates.find(
      (c) => c.name.toLowerCase().includes(hintLower) || hintLower.includes(c.name.toLowerCase()),
    );
    return contains?.id ?? null;
  }

  private async resolveStudents(
    tenantId: string,
    parsed: Array<{ name: string; confidence: number }>,
  ): Promise<AiParseResult['suggested_students']> {
    if (parsed.length === 0) return [];
    const names = parsed.map((s) => s.name.trim()).filter((n) => n.length > 1);
    if (names.length === 0) return [];

    const rows = (await this.studentReadFacade.findManyGeneric(tenantId, {
      where: {
        status: 'active',
        OR: names.flatMap((n) => {
          const bits = n.split(/\s+/).filter((b) => b.length > 1);
          return bits.map((b) => ({
            OR: [
              { first_name: { contains: b, mode: 'insensitive' as const } },
              { last_name: { contains: b, mode: 'insensitive' as const } },
            ],
          }));
        }),
      },
      select: { id: true, first_name: true, middle_name: true, last_name: true },
      take: 20,
    })) as Array<{
      id: string;
      first_name: string;
      middle_name: string | null;
      last_name: string;
    }>;

    const matches = new Map<string, { id: string; full_name: string; confidence: number }>();
    for (const parsedStudent of parsed) {
      const needle = parsedStudent.name.toLowerCase();
      for (const row of rows) {
        const hay = `${row.first_name} ${row.middle_name ?? ''} ${row.last_name}`.toLowerCase();
        if (hay.includes(needle) || needle.split(/\s+/).every((b) => hay.includes(b))) {
          const confidence = clamp01(parsedStudent.confidence);
          const existing = matches.get(row.id);
          if (!existing || existing.confidence < confidence) {
            matches.set(row.id, {
              id: row.id,
              full_name: `${row.first_name} ${row.last_name}`,
              confidence,
            });
          }
        }
      }
    }
    return Array.from(matches.values());
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalisePolarity(v: unknown): 'positive' | 'negative' | null {
  return v === 'positive' || v === 'negative' ? v : null;
}

function normaliseSeverity(v: unknown): 'minor' | 'moderate' | 'major' | null {
  return v === 'minor' || v === 'moderate' || v === 'major' ? v : null;
}

function normaliseStudents(v: unknown): Array<{ name: string; confidence: number }> {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (s): s is { name: string; confidence: number } =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as { name?: unknown }).name === 'string' &&
        typeof (s as { confidence?: unknown }).confidence === 'number',
    )
    .map((s) => ({ name: s.name, confidence: s.confidence }));
}
