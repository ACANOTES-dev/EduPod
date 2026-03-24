import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// ─── Types ────────────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

type AllowedMediaType = (typeof ALLOWED_MIME_TYPES)[number];

type AiGradingConfidence = 'high' | 'medium' | 'low';

export interface AiGradingSuggestion {
  student_id: string | null;
  suggested_score: number | null;
  confidence: AiGradingConfidence;
  reasoning: string;
  criterion_scores?: { criterion_id: string; points: number; reasoning: string }[];
}

interface BatchGradingImage {
  student_id?: string;
  image_buffer: Buffer;
  mime_type: string;
}

interface RawAiGradingResponse {
  suggested_score?: number;
  confidence?: string;
  reasoning?: string;
  criterion_scores?: { criterion_id: string; points: number; reasoning: string }[];
}

type AnthropicClient = {
  messages: {
    create: (params: Record<string, unknown>) => Promise<{
      content: Array<{ type: string; text?: string }>;
    }>;
  };
};

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AiGradingService {
  private readonly logger = new Logger(AiGradingService.name);
  private anthropic: AnthropicClient | null = null;
  private readonly DAILY_LIMIT_DEFAULT = 200;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const AnthropicSdk = require('@anthropic-ai/sdk').default;
        this.anthropic = new AnthropicSdk({ apiKey }) as AnthropicClient;
      } catch {
        this.logger.warn(
          '@anthropic-ai/sdk is not installed — AI grading will be unavailable',
        );
      }
    } else {
      this.logger.warn(
        'ANTHROPIC_API_KEY is not set — AI grading will be unavailable',
      );
    }
  }

  // ─── Inline Grade ─────────────────────────────────────────────────────────

  /**
   * Grade a single student's work using AI.
   * Returns a suggestion — never auto-saves.
   */
  async gradeInline(
    tenantId: string,
    assessmentId: string,
    studentId: string,
    imageBuffer: Buffer,
    mimeType: string,
  ): Promise<AiGradingSuggestion> {
    if (!this.anthropic) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_SERVICE_UNAVAILABLE',
          message:
            'AI grading is not configured. ANTHROPIC_API_KEY is not set.',
        },
      });
    }

    if (!ALLOWED_MIME_TYPES.includes(mimeType as AllowedMediaType)) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_MIME_TYPE',
          message: `File type "${mimeType}" is not supported. Use JPEG, PNG, GIF, or WebP.`,
        },
      });
    }

    await this.enforceRateLimit(tenantId);

    const context = await this.loadGradingContext(tenantId, assessmentId);

    if (!context) {
      throw new NotFoundException({
        error: {
          code: 'ASSESSMENT_NOT_FOUND',
          message: `Assessment "${assessmentId}" not found`,
        },
      });
    }

    const prompt = this.buildGradingPrompt(context);
    const base64Image = imageBuffer.toString('base64');

    this.logger.log(
      `AI grading assessment ${assessmentId} for student ${studentId}, tenant ${tenantId}`,
    );

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType as AllowedMediaType,
                data: base64Image,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    const textBlock = response.content.find(
      (b: { type: string; text?: string }) => b.type === 'text',
    );
    const parsed = this.parseGradingResponse(textBlock?.text ?? '', context.maxScore);

    return { ...parsed, student_id: studentId };
  }

  // ─── Batch Grade ──────────────────────────────────────────────────────────

  /**
   * Grade multiple students' work using AI.
   * Returns suggestions — never auto-saves.
   */
  async gradeBatch(
    tenantId: string,
    assessmentId: string,
    images: BatchGradingImage[],
  ): Promise<AiGradingSuggestion[]> {
    if (!this.anthropic) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_SERVICE_UNAVAILABLE',
          message:
            'AI grading is not configured. ANTHROPIC_API_KEY is not set.',
        },
      });
    }

    const context = await this.loadGradingContext(tenantId, assessmentId);

    if (!context) {
      throw new NotFoundException({
        error: {
          code: 'ASSESSMENT_NOT_FOUND',
          message: `Assessment "${assessmentId}" not found`,
        },
      });
    }

    const results: AiGradingSuggestion[] = [];

    for (const img of images) {
      if (!ALLOWED_MIME_TYPES.includes(img.mime_type as AllowedMediaType)) {
        results.push({
          student_id: img.student_id ?? null,
          suggested_score: null,
          confidence: 'low',
          reasoning: `Unsupported file type: ${img.mime_type}`,
        });
        continue;
      }

      try {
        await this.enforceRateLimit(tenantId);

        const prompt = this.buildGradingPrompt(context);
        const base64Image = img.image_buffer.toString('base64');

        const response = await this.anthropic.messages.create({
          model: 'claude-sonnet-4-6-20250514',
          max_tokens: 2048,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: img.mime_type as AllowedMediaType,
                    data: base64Image,
                  },
                },
                { type: 'text', text: prompt },
              ],
            },
          ],
        });

        const textBlock = response.content.find(
          (b: { type: string; text?: string }) => b.type === 'text',
        );
        const parsed = this.parseGradingResponse(
          textBlock?.text ?? '',
          context.maxScore,
        );
        results.push({ ...parsed, student_id: img.student_id ?? null });
      } catch (err) {
        this.logger.warn(
          `AI grading failed for student ${img.student_id ?? 'unknown'}: ${String(err)}`,
        );
        results.push({
          student_id: img.student_id ?? null,
          suggested_score: null,
          confidence: 'low',
          reasoning: 'AI grading failed for this submission.',
        });
      }
    }

    return results;
  }

  // ─── Load Context ─────────────────────────────────────────────────────────

  private async loadGradingContext(tenantId: string, assessmentId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, tenant_id: tenantId },
      include: {
        class_entity: {
          select: { id: true, name: true },
        },
        subject: { select: { id: true, name: true } },
        rubric_template: {
          select: {
            id: true,
            criteria_json: true,
          },
        },
        ai_references: {
          where: { status: 'active' },
          select: { id: true, file_url: true, file_type: true },
        },
      },
    });

    if (!assessment) return null;

    // Load AI grading instruction for this class+subject
    const instruction = await this.prisma.aiGradingInstruction.findFirst({
      where: {
        tenant_id: tenantId,
        class_id: assessment.class_id,
        subject_id: assessment.subject_id,
        status: 'active',
      },
      select: { instruction_text: true },
    });

    return {
      assessmentId,
      title: assessment.title,
      maxScore: Number(assessment.max_score),
      subjectName: assessment.subject.name,
      className: assessment.class_entity.name,
      instructionText: instruction?.instruction_text ?? null,
      rubricCriteria: assessment.rubric_template?.criteria_json ?? null,
      references: assessment.ai_references,
    };
  }

  // ─── Build Prompt ─────────────────────────────────────────────────────────

  private buildGradingPrompt(context: NonNullable<Awaited<ReturnType<typeof this.loadGradingContext>>>): string {
    const parts: string[] = [
      `You are grading a student exam/assignment for the following:`,
      `Subject: ${context.subjectName}`,
      `Class: ${context.className}`,
      `Assessment: ${context.title}`,
      `Maximum Score: ${context.maxScore}`,
    ];

    if (context.instructionText) {
      parts.push(`\nGrading Instructions:\n${context.instructionText}`);
    }

    if (context.rubricCriteria) {
      parts.push(
        `\nRubric Criteria (JSON):\n${JSON.stringify(context.rubricCriteria, null, 2)}`,
      );
    }

    parts.push(`
Analyze the student's work shown in the image and respond with ONLY a JSON object:
{
  "suggested_score": <number between 0 and ${context.maxScore}>,
  "confidence": <"high" | "medium" | "low">,
  "reasoning": "<brief explanation of the score>",
  "criterion_scores": [{ "criterion_id": "...", "points": <number>, "reasoning": "..." }]
}

- "suggested_score" must be a number between 0 and ${context.maxScore}.
- "confidence": high = clearly legible and straightforward; medium = some uncertainty; low = hard to read or very subjective.
- "criterion_scores" should only be included if rubric criteria were provided.
- Return ONLY the JSON object, no markdown fences, no other text.`);

    return parts.join('\n');
  }

  // ─── Parse AI Response ────────────────────────────────────────────────────

  private parseGradingResponse(
    text: string,
    maxScore: number,
  ): Omit<AiGradingSuggestion, 'student_id'> {
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '');
      cleaned = cleaned.replace(/\n?```\s*$/, '');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      this.logger.warn(`Failed to parse AI grading response: ${text}`);
      return {
        suggested_score: null,
        confidence: 'low',
        reasoning: 'AI response could not be parsed.',
      };
    }

    const raw = parsed as RawAiGradingResponse;

    const score =
      typeof raw.suggested_score === 'number' &&
      raw.suggested_score >= 0 &&
      raw.suggested_score <= maxScore
        ? raw.suggested_score
        : null;

    const confidence: AiGradingConfidence =
      raw.confidence === 'high' || raw.confidence === 'medium'
        ? raw.confidence
        : 'low';

    return {
      suggested_score: score,
      confidence,
      reasoning: raw.reasoning ?? '',
      criterion_scores: Array.isArray(raw.criterion_scores)
        ? raw.criterion_scores
        : undefined,
    };
  }

  // ─── Rate Limiting ────────────────────────────────────────────────────────

  private async enforceRateLimit(tenantId: string): Promise<void> {
    const client = this.redis.getClient();
    const today = new Date().toISOString().slice(0, 10);
    const key = `gradebook:ai_grading:${tenantId}:${today}`;

    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, 86400);
    }

    if (count > this.DAILY_LIMIT_DEFAULT) {
      throw new BadRequestException({
        error: {
          code: 'AI_GRADING_RATE_LIMIT_EXCEEDED',
          message: `Daily AI grading limit reached (${this.DAILY_LIMIT_DEFAULT} per day). Please try again tomorrow.`,
        },
      });
    }
  }

  // ─── Static Helpers ───────────────────────────────────────────────────────

  static isAllowedMimeType(mimeType: string): boolean {
    return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
  }
}
