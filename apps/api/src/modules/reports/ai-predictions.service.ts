import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';

import { SYSTEM_USER_SENTINEL } from '@school/shared';
import type { GdprOutboundData } from '@school/shared/gdpr';
import {
  type AttendanceForecast,
  AttendanceForecastSchema,
  type CashFlowForecast,
  CashFlowForecastSchema,
  type StudentRiskPrediction,
  StudentRiskPredictionSchema,
} from '@school/shared/reports';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AnthropicClientService } from '../ai/anthropic-client.service';
import { SettingsService } from '../configuration/settings.service';
import { AiAuditService } from '../gdpr/ai-audit.service';
import { GdprTokenService } from '../gdpr/gdpr-token.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import {
  ATTENDANCE_FORECAST_PROMPT_VERSION,
  buildAttendanceForecastPrompt,
} from './ai-predictions/prompts/attendance-forecast.prompt';
import {
  buildCashFlowForecastPrompt,
  CASH_FLOW_FORECAST_PROMPT_VERSION,
} from './ai-predictions/prompts/cash-flow-forecast.prompt';
import {
  buildStudentRiskPrompt,
  STUDENT_RISK_PROMPT_VERSION,
} from './ai-predictions/prompts/student-risk.prompt';

// ─── Constants ────────────────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1000;

const PRESENT_STATUSES = ['present', 'late', 'left_early'] as const;

// ─── Legacy contract (kept for `POST /v1/reports/ai/predict`) ─────────────

export interface TrendPrediction {
  expected: number[];
  optimistic: number[];
  pessimistic: number[];
  confidence: 'high' | 'medium' | 'low';
  periods_ahead: number;
  narrative: string;
}

// ─── Bulk drill-down response ─────────────────────────────────────────────

export interface BulkStudentRiskEntry {
  student_id: string;
  student_number: string | null;
  full_name: string;
  prediction: StudentRiskPrediction | null;
  error: string | null;
}

export interface BulkStudentRiskResponse {
  data: BulkStudentRiskEntry[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    generated_at: string;
  };
}

// ─── Internal Anthropic response shape ────────────────────────────────────

interface AnthropicTextResponse {
  content: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface CashFlowGatheredData {
  historical: Array<{ date: string; receipts: number; disbursements: number }>;
  pending_invoices_amount: number;
  daysAhead: number;
}

interface AttendanceWeek {
  week_start: string;
  attendance_rate: number;
}

/**
 * AiPredictionsService — three flagship predictions plus the legacy trend
 * forecaster.
 *
 * **New (impl 12, Wave 3) — flag-gated at the controller via
 * `@RequiresAiFlag('reports_predictions')`:**
 *
 * - {@link predictStudentRisk} — 0-100 risk score + factors for one
 *   student. Cache key `ai_pred_student_risk:{tenant}:{student}:v{N}`,
 *   TTL 24h.
 * - {@link forecastAttendance} — N-week-ahead attendance forecast for a
 *   year group from the last 12 weeks of session data.
 * - {@link forecastCashFlow} — N-day-ahead expected receipts forecast
 *   from the last 90 days of payments + due-soon invoices.
 * - {@link bulkPredictStudentRisk} — paginated drill-down for the at-risk
 *   KPI; reuses per-student cache, no batch prompt.
 *
 * **Legacy:** {@link predictTrend} stays for the existing
 * `POST /v1/reports/ai/predict` endpoint. It uses the older
 * `SettingsService.ai.predictionsEnabled` toggle and the GDPR token
 * pipeline. New endpoints rely on `AiFlagGuard` instead.
 *
 * Each new method audits via {@link AiAuditService.log} (writes a row to
 * `ai_processing_logs`) including the prompt hash, response summary,
 * cache-hit boolean, processing time, and Anthropic cost estimate.
 *
 * On a Zod validation failure the call throws
 * `503 AI_PREDICTION_UNPARSEABLE` — never a synthesised "best-guess"
 * answer. On an Anthropic API failure (circuit-breaker open, network
 * error) the wrapper bubbles up as `503 AI_UNAVAILABLE`. This is
 * load-bearing for trust: a principal who acts on a fabricated risk
 * score loses confidence in the product permanently.
 */
@Injectable()
export class AiPredictionsService {
  private readonly logger = new Logger(AiPredictionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly anthropicClient: AnthropicClientService,
    private readonly aiAuditService: AiAuditService,
    private readonly settingsService: SettingsService,
    private readonly gdprTokenService: GdprTokenService,
  ) {}

  // ─── Student Risk ───────────────────────────────────────────────────────

  async predictStudentRisk(
    tenantId: string,
    userId: string,
    studentId: string,
    refresh = false,
  ): Promise<StudentRiskPrediction> {
    this.assertConfigured();

    const cacheKey = `ai_pred_student_risk:${tenantId}:${studentId}:v${STUDENT_RISK_PROMPT_VERSION}`;

    if (!refresh) {
      const cached = await this.readCache<StudentRiskPrediction>(
        cacheKey,
        StudentRiskPredictionSchema,
      );
      if (cached) {
        await this.audit(tenantId, 'reports_predictions', 'student', studentId, '', '', 0, true);
        return { ...cached, cache_hit: true };
      }
    }

    const data = await this.gatherStudentRiskData(tenantId, studentId);
    if (!data) {
      throw new ServiceUnavailableException({
        code: 'STUDENT_NOT_FOUND',
        message: `Student "${studentId}" not found or not visible in tenant scope`,
      });
    }

    const prompt = buildStudentRiskPrompt({
      student_code: data.student.student_number ?? data.student.id,
      student_name: data.student.name,
      year_group: data.student.year_group ?? 'Unassigned',
      recent_attendance_rate: data.attendance.rate_percent,
      behaviour_incidents_30d: data.behaviour.incident_count,
      recent_grades: data.grades,
      has_sen_profile: data.student.sen_flag,
      has_open_safeguarding: data.student.safeguarding_open,
      chronic_absenteeism: data.attendance.rate_percent < 85,
    });

    const promptInput = JSON.stringify(data);
    const start = Date.now();
    const raw = await this.callAnthropic(tenantId, prompt);
    const elapsed = Date.now() - start;

    const parsed = this.parseJsonResponse(raw);
    const validated = StudentRiskPredictionSchema.omit({
      generated_at: true,
      cache_hit: true,
    }).safeParse(parsed);

    if (!validated.success) {
      this.logger.warn(`[student-risk] schema validation failed: ${validated.error.message}`);
      await this.audit(
        tenantId,
        'reports_predictions',
        'student',
        studentId,
        promptInput,
        raw,
        elapsed,
        false,
      );
      throw new ServiceUnavailableException({
        code: 'AI_PREDICTION_UNPARSEABLE',
        message: 'AI prediction response could not be parsed; please retry shortly',
      });
    }

    const prediction: StudentRiskPrediction = {
      ...validated.data,
      generated_at: new Date().toISOString(),
      cache_hit: false,
    };

    await this.writeCache(cacheKey, prediction);
    await this.audit(
      tenantId,
      'reports_predictions',
      'student',
      studentId,
      promptInput,
      raw,
      elapsed,
      false,
    );

    return prediction;
  }

  // ─── Attendance Forecast ────────────────────────────────────────────────

  async forecastAttendance(
    tenantId: string,
    userId: string,
    yearGroupId: string,
    weeksAhead: number,
    refresh = false,
  ): Promise<AttendanceForecast> {
    this.assertConfigured();

    const safeWeeks = Math.min(Math.max(Math.floor(weeksAhead), 1), 52);
    const cacheKey = `ai_pred_attendance:${tenantId}:${yearGroupId}:${safeWeeks}:v${ATTENDANCE_FORECAST_PROMPT_VERSION}`;

    if (!refresh) {
      const cached = await this.readCache<AttendanceForecast>(cacheKey, AttendanceForecastSchema);
      if (cached) {
        await this.audit(
          tenantId,
          'reports_predictions',
          'year_group',
          yearGroupId,
          '',
          '',
          0,
          true,
        );
        return { ...cached, cache_hit: true };
      }
    }

    const yearGroup = await this.loadYearGroup(tenantId, yearGroupId);
    if (!yearGroup) {
      throw new ServiceUnavailableException({
        code: 'YEAR_GROUP_NOT_FOUND',
        message: `Year group "${yearGroupId}" not found in tenant scope`,
      });
    }

    const history = await this.gatherAttendanceHistory(tenantId, yearGroupId);
    if (history.length === 0) {
      throw new ServiceUnavailableException({
        code: 'INSUFFICIENT_ATTENDANCE_DATA',
        message: 'Not enough historical attendance to produce a forecast',
      });
    }

    const prompt = buildAttendanceForecastPrompt(history, yearGroup.name, safeWeeks);
    const promptInput = JSON.stringify({ history, weeksAhead: safeWeeks });
    const start = Date.now();
    const raw = await this.callAnthropic(tenantId, prompt);
    const elapsed = Date.now() - start;

    const parsed = this.parseJsonResponse(raw);
    const validated = AttendanceForecastSchema.omit({
      generated_at: true,
      cache_hit: true,
    }).safeParse(parsed);

    if (!validated.success) {
      this.logger.warn(
        `[attendance-forecast] schema validation failed: ${validated.error.message}`,
      );
      await this.audit(
        tenantId,
        'reports_predictions',
        'year_group',
        yearGroupId,
        promptInput,
        raw,
        elapsed,
        false,
      );
      throw new ServiceUnavailableException({
        code: 'AI_PREDICTION_UNPARSEABLE',
        message: 'AI forecast response could not be parsed; please retry shortly',
      });
    }

    const forecast: AttendanceForecast = {
      ...validated.data,
      generated_at: new Date().toISOString(),
      cache_hit: false,
    };

    await this.writeCache(cacheKey, forecast);
    await this.audit(
      tenantId,
      'reports_predictions',
      'year_group',
      yearGroupId,
      promptInput,
      raw,
      elapsed,
      false,
    );

    return forecast;
  }

  // ─── Cash-flow Forecast ─────────────────────────────────────────────────

  async forecastCashFlow(
    tenantId: string,
    userId: string,
    daysAhead: number,
    refresh = false,
  ): Promise<CashFlowForecast> {
    this.assertConfigured();

    const safeDays = Math.min(Math.max(Math.floor(daysAhead), 1), 365);
    const cacheKey = `ai_pred_cashflow:${tenantId}:${safeDays}:v${CASH_FLOW_FORECAST_PROMPT_VERSION}`;

    if (!refresh) {
      const cached = await this.readCache<CashFlowForecast>(cacheKey, CashFlowForecastSchema);
      if (cached) {
        await this.audit(tenantId, 'reports_predictions', 'cashflow', null, '', '', 0, true);
        return { ...cached, cache_hit: true };
      }
    }

    const cashData = await this.gatherCashFlowData(tenantId, safeDays);
    if (cashData.historical.length === 0) {
      throw new ServiceUnavailableException({
        code: 'INSUFFICIENT_FINANCE_DATA',
        message: 'Not enough recent payment activity to produce a cash-flow forecast',
      });
    }

    const prompt = buildCashFlowForecastPrompt(cashData);
    const promptInput = JSON.stringify(cashData);
    const start = Date.now();
    const raw = await this.callAnthropic(tenantId, prompt);
    const elapsed = Date.now() - start;

    const parsed = this.parseJsonResponse(raw);
    const validated = CashFlowForecastSchema.omit({
      generated_at: true,
      cache_hit: true,
    }).safeParse(parsed);

    if (!validated.success) {
      this.logger.warn(`[cash-flow-forecast] schema validation failed: ${validated.error.message}`);
      await this.audit(
        tenantId,
        'reports_predictions',
        'cashflow',
        null,
        promptInput,
        raw,
        elapsed,
        false,
      );
      throw new ServiceUnavailableException({
        code: 'AI_PREDICTION_UNPARSEABLE',
        message: 'AI cash-flow response could not be parsed; please retry shortly',
      });
    }

    const forecast: CashFlowForecast = {
      ...validated.data,
      generated_at: new Date().toISOString(),
      cache_hit: false,
    };

    await this.writeCache(cacheKey, forecast);
    await this.audit(
      tenantId,
      'reports_predictions',
      'cashflow',
      null,
      promptInput,
      raw,
      elapsed,
      false,
    );

    return forecast;
  }

  // ─── Bulk drill-down for the at-risk KPI ───────────────────────────────

  async bulkPredictStudentRisk(
    tenantId: string,
    userId: string,
    yearGroupId: string,
    page: number,
    pageSize: number,
    refresh = false,
  ): Promise<BulkStudentRiskResponse> {
    this.assertConfigured();

    const safePage = Math.max(Math.floor(page), 1);
    const safeSize = Math.min(Math.max(Math.floor(pageSize), 1), 50);

    // List active students in the year group (RLS-scoped). No raw SQL.
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const { students, total } = await rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;
      const [rows, count] = await Promise.all([
        tx.student.findMany({
          where: { tenant_id: tenantId, year_group_id: yearGroupId, status: 'active' },
          orderBy: [{ last_name: 'asc' }, { first_name: 'asc' }],
          skip: (safePage - 1) * safeSize,
          take: safeSize,
          select: { id: true, student_number: true, first_name: true, last_name: true },
        }),
        tx.student.count({
          where: { tenant_id: tenantId, year_group_id: yearGroupId, status: 'active' },
        }),
      ]);
      return { students: rows, total: count };
    });

    const data: BulkStudentRiskEntry[] = [];
    for (const student of students) {
      try {
        const prediction = await this.predictStudentRisk(tenantId, userId, student.id, refresh);
        data.push({
          student_id: student.id,
          student_number: student.student_number,
          full_name: `${student.first_name} ${student.last_name}`.trim(),
          prediction,
          error: null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown prediction error';
        this.logger.warn(`[bulk-risk] student ${student.id} failed: ${message}`);
        data.push({
          student_id: student.id,
          student_number: student.student_number,
          full_name: `${student.first_name} ${student.last_name}`.trim(),
          prediction: null,
          error: message,
        });
      }
    }

    return {
      data,
      meta: {
        page: safePage,
        pageSize: safeSize,
        total,
        generated_at: new Date().toISOString(),
      },
    };
  }

  // ─── Legacy method: keeps `POST /v1/reports/ai/predict` working ─────────

  async predictTrend(
    tenantId: string,
    historicalData: Record<string, unknown>[],
    reportType: string,
    periodsAhead = 3,
    userId?: string,
  ): Promise<TrendPrediction> {
    if (!this.anthropicClient.isConfigured) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_SERVICE_UNAVAILABLE',
          message: 'AI predictions are not configured. ANTHROPIC_API_KEY is not set.',
        },
      });
    }

    const settings = await this.settingsService.getSettings(tenantId);
    if (!settings.ai.predictionsEnabled) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_FEATURE_DISABLED',
          message: 'This feature requires opt-in. Enable it in Settings > AI Features.',
        },
      });
    }

    await this.gdprTokenService.processOutbound(
      tenantId,
      'ai_predictions',
      { entities: [], entityCount: 0 } as GdprOutboundData,
      userId ?? SYSTEM_USER_SENTINEL,
    );

    const dataStr = JSON.stringify(historicalData, null, 2);

    const prompt = `You are a school analytics AI. Analyze the following historical ${reportType} trend data and predict the next ${periodsAhead} periods.

Historical data (ordered chronologically):
${dataStr}

Respond with ONLY valid JSON in this exact format (no explanation, no markdown):
{
  "expected": [<${periodsAhead} numbers>],
  "optimistic": [<${periodsAhead} numbers, 10-15% better than expected>],
  "pessimistic": [<${periodsAhead} numbers, 10-15% worse than expected>],
  "confidence": "<high|medium|low>",
  "narrative": "<2-3 sentence explanation of the prediction>"
}`;

    const startTime = Date.now();
    const response = await this.anthropicClient.createMessage(
      {
        model: MODEL,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      },
      { tenantId },
    );
    const elapsed = Date.now() - startTime;

    const content = response.content.find((c) => c.type === 'text');
    const rawText = content?.type === 'text' ? content.text : '{}';

    try {
      const parsed = JSON.parse(rawText) as {
        expected?: number[];
        optimistic?: number[];
        pessimistic?: number[];
        confidence?: string;
        narrative?: string;
      };

      const confidenceValue = this.normaliseConfidence(parsed.confidence);
      const confidenceScore =
        confidenceValue === 'high' ? 0.9 : confidenceValue === 'medium' ? 0.6 : 0.3;

      await this.aiAuditService.log({
        tenantId,
        aiService: 'ai_predictions',
        subjectType: null,
        subjectId: null,
        modelUsed: MODEL,
        promptHash: AiAuditService.hashPrompt(prompt),
        promptSummary: AiAuditService.truncate(prompt, 500),
        responseSummary: AiAuditService.truncate(rawText, 500),
        inputDataCategories: ['historical_trends'],
        tokenised: true,
        confidenceScore,
        processingTimeMs: elapsed,
      });

      return {
        expected: Array.isArray(parsed.expected) ? parsed.expected : [],
        optimistic: Array.isArray(parsed.optimistic) ? parsed.optimistic : [],
        pessimistic: Array.isArray(parsed.pessimistic) ? parsed.pessimistic : [],
        confidence: confidenceValue,
        periods_ahead: periodsAhead,
        narrative: parsed.narrative ?? 'No prediction narrative available.',
      };
    } catch {
      this.logger.warn('Failed to parse AI prediction response', { raw: rawText });

      await this.aiAuditService.log({
        tenantId,
        aiService: 'ai_predictions',
        subjectType: null,
        subjectId: null,
        modelUsed: MODEL,
        promptHash: AiAuditService.hashPrompt(prompt),
        promptSummary: AiAuditService.truncate(prompt, 500),
        responseSummary: AiAuditService.truncate(rawText, 500),
        inputDataCategories: ['historical_trends'],
        tokenised: true,
        confidenceScore: 0.3,
        processingTimeMs: elapsed,
      });

      return {
        expected: [],
        optimistic: [],
        pessimistic: [],
        confidence: 'low',
        periods_ahead: periodsAhead,
        narrative: 'Unable to generate prediction at this time.',
      };
    }
  }

  // ─── Internal helpers ───────────────────────────────────────────────────

  private assertConfigured(): void {
    if (!this.anthropicClient.isConfigured) {
      throw new ServiceUnavailableException({
        code: 'AI_UNAVAILABLE',
        message: 'AI predictions are temporarily unavailable. Please try again shortly.',
      });
    }
  }

  private async callAnthropic(tenantId: string, prompt: string): Promise<string> {
    try {
      const response = (await this.anthropicClient.createMessage(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          messages: [{ role: 'user', content: prompt }],
        },
        { tenantId },
      )) as AnthropicTextResponse;

      const block = response.content.find((c) => c.type === 'text');
      return block?.text ?? '';
    } catch (err) {
      this.logger.warn(`[anthropic] call failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException({
        code: 'AI_UNAVAILABLE',
        message: 'AI predictions are temporarily unavailable. Please try again shortly.',
      });
    }
  }

  private parseJsonResponse(raw: string): unknown {
    if (!raw) return null;
    try {
      // Strip leading/trailing markdown fences if Claude included them.
      const trimmed = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      return JSON.parse(trimmed);
    } catch (err) {
      this.logger.warn(`[parse] non-JSON AI response: ${(err as Error).message}`);
      return null;
    }
  }

  private async readCache<T>(
    key: string,
    schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
  ): Promise<T | null> {
    try {
      const raw = await this.redis.getClient().get(key);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      const result = schema.safeParse(parsed);
      return result.success && result.data ? result.data : null;
    } catch (err) {
      this.logger.warn(`[cache] read failed for ${key}: ${(err as Error).message}`);
      return null;
    }
  }

  private async writeCache<T>(key: string, value: T): Promise<void> {
    try {
      await this.redis.getClient().setex(key, CACHE_TTL_SECONDS, JSON.stringify(value));
    } catch (err) {
      this.logger.warn(`[cache] write failed for ${key}: ${(err as Error).message}`);
    }
  }

  private async audit(
    tenantId: string,
    service: string,
    subjectType: string | null,
    subjectId: string | null,
    promptInput: string,
    rawResponse: string,
    elapsedMs: number,
    cacheHit: boolean,
  ): Promise<void> {
    await this.aiAuditService.log({
      tenantId,
      aiService: service,
      subjectType,
      subjectId,
      modelUsed: MODEL,
      promptHash: AiAuditService.hashPrompt(promptInput),
      promptSummary: cacheHit ? '(cache hit)' : AiAuditService.truncate(promptInput, 500),
      responseSummary: cacheHit ? '(cache hit)' : AiAuditService.truncate(rawResponse, 500),
      inputDataCategories: ['student_data', 'finance_data'],
      tokenised: true,
      confidenceScore: null,
      processingTimeMs: elapsedMs,
    });
  }

  private normaliseConfidence(value: string | undefined): 'high' | 'medium' | 'low' {
    if (value === 'high' || value === 'medium' || value === 'low') return value;
    return 'medium';
  }

  // ─── Data gathering (RLS-scoped, no raw SQL) ───────────────────────────

  private async loadYearGroup(
    tenantId: string,
    yearGroupId: string,
  ): Promise<{ id: string; name: string } | null> {
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;
      const row = await tx.yearGroup.findFirst({
        where: { tenant_id: tenantId, id: yearGroupId },
        select: { id: true, name: true },
      });
      return row;
    });
  }

  private async gatherStudentRiskData(
    tenantId: string,
    studentId: string,
  ): Promise<{
    student: {
      id: string;
      student_number: string | null;
      name: string;
      year_group: string | null;
      sen_flag: boolean;
      safeguarding_open: boolean;
    };
    attendance: { rate_percent: number; sessions_total: number };
    behaviour: {
      incident_count: number;
      severity_max: number | null;
      most_recent_incident_at: string | null;
    };
    grades: Array<{ subject: string; grade: string; score?: number }>;
  } | null> {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;

      const student = await tx.student.findFirst({
        where: { tenant_id: tenantId, id: studentId },
        select: {
          id: true,
          student_number: true,
          first_name: true,
          last_name: true,
          year_group: { select: { name: true } },
        },
      });
      if (!student) return null;

      const [senProfile, openSafeguarding, attendanceStats, behaviourCount, grades] =
        await Promise.all([
          tx.senProfile.findFirst({
            where: { tenant_id: tenantId, student_id: studentId, is_active: true },
            select: { id: true },
          }),
          tx.safeguardingConcern.count({
            where: {
              tenant_id: tenantId,
              student_id: studentId,
              status: { notIn: ['sg_resolved', 'sealed'] },
            },
          }),
          tx.attendanceRecord.groupBy({
            by: ['status'],
            where: {
              tenant_id: tenantId,
              student_id: studentId,
              session: { session_date: { gte: ninetyDaysAgo } },
            },
            _count: true,
          }),
          tx.behaviourIncidentParticipant.count({
            where: {
              tenant_id: tenantId,
              student_id: studentId,
              incident: { occurred_at: { gte: thirtyDaysAgo } },
            },
          }),
          tx.grade.findMany({
            where: {
              tenant_id: tenantId,
              student_id: studentId,
              entered_at: { not: null },
            },
            orderBy: { entered_at: 'desc' },
            take: 4,
            select: {
              raw_score: true,
              entered_at: true,
              assessment: {
                select: {
                  max_score: true,
                  subject: { select: { name: true } },
                },
              },
            },
          }),
        ]);

      const present = attendanceStats
        .filter((g) => (PRESENT_STATUSES as readonly string[]).includes(g.status))
        .reduce((sum, g) => sum + g._count, 0);
      const total = attendanceStats.reduce((sum, g) => sum + g._count, 0);
      const ratePercent = total > 0 ? Number(((present / total) * 100).toFixed(1)) : 100;

      const formattedGrades = grades.map((g) => {
        const max = g.assessment?.max_score ? Number(g.assessment.max_score) : null;
        const raw = g.raw_score ? Number(g.raw_score) : null;
        const pct = max && raw !== null && max > 0 ? Math.round((raw / max) * 100) : null;
        return {
          subject: g.assessment?.subject?.name ?? 'Unknown',
          grade: pct === null ? '—' : pct >= 50 ? 'P' : 'F',
          score: pct ?? undefined,
        };
      });

      return {
        student: {
          id: student.id,
          student_number: student.student_number,
          name: `${student.first_name} ${student.last_name}`.trim(),
          year_group: student.year_group?.name ?? null,
          sen_flag: senProfile !== null,
          safeguarding_open: openSafeguarding > 0,
        },
        attendance: { rate_percent: ratePercent, sessions_total: total },
        behaviour: {
          incident_count: behaviourCount,
          severity_max: null,
          most_recent_incident_at: null,
        },
        grades: formattedGrades,
      };
    });
  }

  private async gatherAttendanceHistory(
    tenantId: string,
    yearGroupId: string,
  ): Promise<AttendanceWeek[]> {
    const twelveWeeksAgo = new Date();
    twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 12 * 7);

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const records = await rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;
      return tx.attendanceRecord.findMany({
        where: {
          tenant_id: tenantId,
          student: { year_group_id: yearGroupId },
          session: { session_date: { gte: twelveWeeksAgo } },
        },
        select: {
          status: true,
          session: { select: { session_date: true } },
        },
      });
    });

    // Bucket by ISO week (YYYY-MM-DD of the Monday).
    const buckets = new Map<string, { present: number; total: number }>();
    for (const r of records) {
      const date = r.session.session_date;
      const monday = this.weekStart(date);
      const key = monday.toISOString().split('T')[0]!;
      const bucket = buckets.get(key) ?? { present: 0, total: 0 };
      bucket.total += 1;
      if ((PRESENT_STATUSES as readonly string[]).includes(r.status)) {
        bucket.present += 1;
      }
      buckets.set(key, bucket);
    }

    const weeks: AttendanceWeek[] = [];
    for (const [week_start, { present, total }] of buckets) {
      if (total === 0) continue;
      weeks.push({
        week_start,
        attendance_rate: Number(((present / total) * 100).toFixed(1)),
      });
    }
    weeks.sort((a, b) => a.week_start.localeCompare(b.week_start));
    return weeks;
  }

  private async gatherCashFlowData(
    tenantId: string,
    daysAhead: number,
  ): Promise<CashFlowGatheredData> {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const dueWindow = new Date();
    dueWindow.setDate(dueWindow.getDate() + daysAhead);

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const { payments, pending } = await rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;
      const [paymentRows, pendingRows] = await Promise.all([
        tx.payment.findMany({
          where: {
            tenant_id: tenantId,
            received_at: { gte: ninetyDaysAgo },
            status: 'posted',
          },
          select: { amount: true, received_at: true },
        }),
        tx.invoice.findMany({
          where: {
            tenant_id: tenantId,
            status: { in: ['issued', 'partially_paid', 'overdue'] },
            due_date: { lte: dueWindow },
            balance_amount: { gt: 0 },
          },
          select: { balance_amount: true },
        }),
      ]);
      return { payments: paymentRows, pending: pendingRows };
    });

    // Bucket payments by day, expressed as receipts.
    const dayBuckets = new Map<string, { receipts: number; disbursements: number }>();
    for (const p of payments) {
      const day = p.received_at.toISOString().split('T')[0]!;
      const bucket = dayBuckets.get(day) ?? { receipts: 0, disbursements: 0 };
      bucket.receipts += this.toNumber(p.amount);
      dayBuckets.set(day, bucket);
    }

    const historical = Array.from(dayBuckets.entries())
      .map(([date, v]) => ({
        date,
        receipts: Number(v.receipts.toFixed(2)),
        disbursements: Number(v.disbursements.toFixed(2)),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const pendingTotal = pending.reduce((sum, inv) => sum + this.toNumber(inv.balance_amount), 0);

    return {
      historical,
      pending_invoices_amount: Number(pendingTotal.toFixed(2)),
      daysAhead,
    };
  }

  private toNumber(value: Prisma.Decimal | number | null): number {
    if (value === null) return 0;
    if (typeof value === 'number') return value;
    return Number(value.toString());
  }

  private weekStart(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = (day + 6) % 7; // Monday-based week
    d.setDate(d.getDate() - diff);
    return d;
  }
}
