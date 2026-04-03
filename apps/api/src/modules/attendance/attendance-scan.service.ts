import { randomUUID } from 'crypto';

import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import type { ScanResultEntry } from '@school/shared';
import type { GdprOutboundData } from '@school/shared/gdpr';

import { AnthropicClientService } from '../ai/anthropic-client.service';
import { SettingsService } from '../configuration/settings.service';
import { AiAuditService } from '../gdpr/ai-audit.service';
import { GdprTokenService } from '../gdpr/gdpr-token.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// ─── AI Status Mapping ─────────────────────────────────────────────────────

const AI_STATUS_MAP: Record<string, ScanResultEntry['status']> = {
  absent: 'absent_unexcused',
  absent_unexcused: 'absent_unexcused',
  absent_excused: 'absent_excused',
  excused: 'absent_excused',
  late: 'late',
  left_early: 'left_early',
  tardy: 'late',
};

/** Mime types accepted by the Claude Vision API */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

type AllowedMediaType = (typeof ALLOWED_MIME_TYPES)[number];

// ─── Raw AI entry shape ────────────────────────────────────────────────────

interface RawAiEntry {
  student_number?: string;
  status?: string;
  reason?: string;
  confidence?: string;
}

// ─── Stored scan result shape ──────────────────────────────────────────────

interface StoredScanResult {
  scan_id: string;
  tenant_id: string;
  user_id: string;
  session_date: string;
  entries: ScanResultEntry[];
}

const SCAN_PROMPT = `You are reading a handwritten school attendance/absence sheet. Extract each student entry as a JSON array.

Each entry must have:
- "student_number": the student number or ID written on the sheet (string)
- "status": one of "absent", "absent_excused", "excused", "late", "left_early" (string)
- "reason": optional reason if written (string or omit)
- "confidence": "high" if clearly legible, "low" if uncertain (string)

Return ONLY a JSON array. No explanation, no markdown fences.
Example: [{"student_number":"1234","status":"absent","confidence":"high"}]

If the image does not appear to be an attendance/absence sheet, return an empty array: []`;

@Injectable()
export class AttendanceScanService {
  private readonly logger = new Logger(AttendanceScanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly settingsService: SettingsService,
    private readonly gdprTokenService: GdprTokenService,
    private readonly aiAuditService: AiAuditService,
    private readonly anthropicClient: AnthropicClientService,
  ) {}

  // ─── Scan Image ──────────────────────────────────────────────────────────

  async scanImage(
    tenantId: string,
    userId: string,
    imageBuffer: Buffer,
    mimeType: string,
    sessionDate: string,
  ): Promise<{ scan_id: string; entries: ScanResultEntry[] }> {
    // 1. Verify Anthropic client is available
    if (!this.anthropicClient.isConfigured) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_SERVICE_UNAVAILABLE',
          message:
            'AI scan is not configured. The ANTHROPIC_API_KEY environment variable is not set.',
        },
      });
    }

    const settings = await this.settingsService.getSettings(tenantId);
    if (!settings.ai.attendanceScanEnabled) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_FEATURE_DISABLED',
          message: 'This feature requires opt-in. Enable it in Settings > AI Features.',
        },
      });
    }

    // 2. Rate limit: max 50 scans per tenant per day
    await this.enforceRateLimit(tenantId);

    // 3. Send image to Claude Vision API
    const base64Image = imageBuffer.toString('base64');
    const mediaType = mimeType as AllowedMediaType;

    // GDPR audit — log AI data processing (no personal data in prompt)
    await this.gdprTokenService.processOutbound(
      tenantId,
      'ai_attendance_scan',
      { entities: [], entityCount: 0 } as GdprOutboundData,
      userId,
    );

    this.logger.log(`Scanning attendance image for tenant ${tenantId}, date ${sessionDate}`);

    const startTime = Date.now();
    const response = await this.anthropicClient.createMessage({
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
                media_type: mediaType,
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: SCAN_PROMPT,
            },
          ],
        },
      ],
    });
    const elapsed = Date.now() - startTime;

    const textBlock = response.content.find((b) => b.type === 'text');
    const aiText = textBlock?.type === 'text' ? textBlock.text : '';

    await this.aiAuditService.log({
      tenantId,
      aiService: 'ai_attendance_scan',
      subjectType: null,
      subjectId: null,
      modelUsed: 'claude-sonnet-4-6-20250514',
      promptHash: AiAuditService.hashPrompt(SCAN_PROMPT),
      promptSummary: AiAuditService.truncate(SCAN_PROMPT, 500),
      responseSummary: AiAuditService.truncate(aiText, 500),
      inputDataCategories: ['attendance_sheet_image'],
      tokenised: true,
      processingTimeMs: elapsed,
    });

    // 4. Parse the AI response
    const entries = this.parseScanResponse(aiText);

    // 5. Resolve student names from the database
    const resolvedEntries = await this.resolveStudentNames(tenantId, entries);

    // 6. Store scan result in Redis with 30-minute TTL for confirmation
    const scanId = randomUUID();
    const storedResult: StoredScanResult = {
      scan_id: scanId,
      tenant_id: tenantId,
      user_id: userId,
      session_date: sessionDate,
      entries: resolvedEntries,
    };

    const client = this.redis.getClient();
    await client.set(
      `attendance:scan:${scanId}`,
      JSON.stringify(storedResult),
      'EX',
      1800, // 30 minutes
    );

    return { scan_id: scanId, entries: resolvedEntries };
  }

  // ─── Parse AI Response ───────────────────────────────────────────────────

  parseScanResponse(aiText: string): ScanResultEntry[] {
    // Strip markdown code fences if present
    let cleaned = aiText.trim();
    if (cleaned.startsWith('```')) {
      // Remove opening fence (possibly with language specifier)
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '');
      // Remove closing fence
      cleaned = cleaned.replace(/\n?```\s*$/, '');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      this.logger.warn(`Failed to parse AI response as JSON: ${aiText}`);
      return [];
    }

    if (!Array.isArray(parsed)) {
      this.logger.warn('AI response is not an array');
      return [];
    }

    const entries: ScanResultEntry[] = [];

    for (const item of parsed as RawAiEntry[]) {
      if (!item.student_number || !item.status) {
        continue;
      }

      const mappedStatus = AI_STATUS_MAP[item.status.toLowerCase()];
      if (!mappedStatus) {
        continue;
      }

      entries.push({
        student_number: String(item.student_number),
        status: mappedStatus,
        reason: item.reason ? String(item.reason) : undefined,
        confidence: item.confidence === 'low' ? 'low' : 'high',
      });
    }

    return entries;
  }

  // ─── Resolve Student Names ───────────────────────────────────────────────

  async resolveStudentNames(
    tenantId: string,
    entries: ScanResultEntry[],
  ): Promise<ScanResultEntry[]> {
    if (entries.length === 0) {
      return entries;
    }

    // Load all students for this tenant by student_number
    const studentNumbers = entries.map((e) => e.student_number);
    const students = await this.prisma.student.findMany({
      where: {
        tenant_id: tenantId,
        student_number: { in: studentNumbers },
      },
      select: {
        id: true,
        student_number: true,
        first_name: true,
        last_name: true,
      },
    });

    const studentByNumber = new Map<string, { id: string; name: string }>();
    for (const s of students) {
      if (s.student_number) {
        studentByNumber.set(s.student_number, {
          id: s.id,
          name: `${s.first_name} ${s.last_name}`,
        });
      }
    }

    return entries.map((entry) => {
      const student = studentByNumber.get(entry.student_number);
      if (student) {
        return {
          ...entry,
          resolved_student_id: student.id,
          resolved_student_name: student.name,
        };
      }
      return {
        ...entry,
        error: 'Student number not found',
      };
    });
  }

  // ─── Rate Limiting ───────────────────────────────────────────────────────

  private async enforceRateLimit(tenantId: string): Promise<void> {
    const client = this.redis.getClient();
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const key = `attendance:scan:${tenantId}:${today}`;

    const count = await client.incr(key);

    // Set expiry on first increment
    if (count === 1) {
      await client.expire(key, 86400); // 24 hours
    }

    if (count > 50) {
      throw new BadRequestException({
        error: {
          code: 'SCAN_RATE_LIMIT_EXCEEDED',
          message: 'Daily scan limit reached (50 scans per day). Please try again tomorrow.',
        },
      });
    }
  }

  // ─── Validate Upload File ────────────────────────────────────────────────

  static isAllowedMimeType(mimeType: string): boolean {
    return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
  }
}
