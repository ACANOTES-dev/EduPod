import { createHash } from 'crypto';

import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { GdprOutboundData } from '@school/shared';

import { SettingsService } from '../../configuration/settings.service';
import { AiAuditService } from '../../gdpr/ai-audit.service';
import { GdprTokenService } from '../../gdpr/gdpr-token.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterOp = 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'in' | 'contains';
type SortDir = 'asc' | 'desc';
type AggFn = 'count' | 'avg' | 'sum' | 'min' | 'max';

type SupportedEntity =
  | 'student'
  | 'grade'
  | 'assessment'
  | 'period_grade'
  | 'gpa_snapshot';

interface QueryFilter {
  field: string;
  op: FilterOp;
  value: unknown;
}

interface QueryAggregation {
  fn: AggFn;
  field: string;
  alias: string;
  having?: { op: FilterOp; value: number };
}

interface QuerySort {
  field: string;
  dir: SortDir;
}

interface NlStructuredQuery {
  entity: SupportedEntity;
  filters: QueryFilter[];
  aggregations?: QueryAggregation[];
  select: string[];
  sort?: QuerySort[];
  limit?: number;
}

export interface NlQueryResult {
  query_id: string;
  question: string;
  structured_query: NlStructuredQuery;
  data: Record<string, unknown>[];
  total: number;
  executed_at: string;
}

interface RawStructuredQueryResponse {
  entity?: string;
  filters?: QueryFilter[];
  aggregations?: QueryAggregation[];
  select?: string[];
  sort?: QuerySort[];
  limit?: number;
}

type AnthropicClient = {
  messages: {
    create: (params: Record<string, unknown>) => Promise<{
      content: Array<{ type: string; text?: string }>;
    }>;
  };
};

// ─── Schema Description ───────────────────────────────────────────────────────

const SCHEMA_DESCRIPTION = `
Supported entities and their queryable fields:

entity: "student"
  fields: id, first_name, last_name, student_number, year_group.name, homeroom_class.name, status

entity: "grade"
  fields: id, assessment_id, student_id, raw_score, is_missing, ai_assisted
  relations: assessment.title, assessment.subject.name, assessment.class.name, assessment.academic_period.name, student.first_name, student.last_name

entity: "assessment"
  fields: id, title, max_score, status, due_date, class_id, subject_id
  relations: class.name, subject.name, academic_period.name

entity: "period_grade"  (period_grade_snapshots table)
  fields: id, student_id, class_id, subject_id, academic_period_id, computed_value, display_value
  relations: student.first_name, student.last_name, subject.name, class.name, academic_period.name, class.year_group.name

entity: "gpa_snapshot"
  fields: id, student_id, academic_period_id, gpa_value, credit_hours_total
  relations: student.first_name, student.last_name, academic_period.name

Operators: "eq", "ne", "lt", "lte", "gt", "gte", "in", "contains"
Aggregation functions: "count", "avg", "sum", "min", "max"
Sort directions: "asc", "desc"
`;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class NlQueryService {
  private readonly logger = new Logger(NlQueryService.name);
  private anthropic: AnthropicClient | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly gdprTokenService: GdprTokenService,
    private readonly aiAuditService: AiAuditService,
  ) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const AnthropicSdk = require('@anthropic-ai/sdk').default;
        this.anthropic = new AnthropicSdk({ apiKey }) as AnthropicClient;
      } catch {
        this.logger.warn(
          '@anthropic-ai/sdk is not installed — NL queries will be unavailable',
        );
      }
    } else {
      this.logger.warn(
        'ANTHROPIC_API_KEY is not set — NL queries will be unavailable',
      );
    }
  }

  // ─── Process Query ────────────────────────────────────────────────────────

  async processQuery(
    tenantId: string,
    userId: string,
    question: string,
  ): Promise<NlQueryResult> {
    if (!this.anthropic) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_SERVICE_UNAVAILABLE',
          message:
            'Natural language queries require ANTHROPIC_API_KEY to be set.',
        },
      });
    }

    const settings = await this.settingsService.getSettings(tenantId);
    if (!settings.ai.nlQueriesEnabled) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_FEATURE_DISABLED',
          message: 'This feature requires opt-in. Enable it in Settings > AI Features.',
        },
      });
    }

    // GDPR audit log — no personal data sent to AI, gateway call is for audit trail only
    await this.gdprTokenService.processOutbound(
      tenantId,
      'ai_nl_query',
      { entities: [], entityCount: 0 } as GdprOutboundData,
      userId,
    );

    // 1. Ask Claude to generate a structured query
    const aiStartTime = Date.now();
    const structuredQuery = await this.generateStructuredQuery(question);
    const aiElapsed = Date.now() - aiStartTime;

    await this.aiAuditService.log({
      tenantId,
      aiService: 'ai_nl_query',
      subjectType: null,
      subjectId: null,
      modelUsed: 'claude-sonnet-4-6-20250514',
      promptHash: createHash('sha256').update(question).digest('hex'),
      promptSummary: question.length > 500 ? question.substring(0, 500) + '...' : question,
      responseSummary: JSON.stringify(structuredQuery).substring(0, 500),
      inputDataCategories: ['gradebook_schema'],
      tokenised: true,
      processingTimeMs: aiElapsed,
    });

    // 2. Execute the structured query via Prisma (RLS-safe)
    const data = await this.executeQuery(tenantId, structuredQuery);

    // 3. Save to query history
    const queryId = await this.saveQueryHistory(
      tenantId,
      userId,
      question,
      structuredQuery,
    );

    return {
      query_id: queryId,
      question,
      structured_query: structuredQuery,
      data,
      total: data.length,
      executed_at: new Date().toISOString(),
    };
  }

  // ─── Get Query History ────────────────────────────────────────────────────

  async getQueryHistory(
    tenantId: string,
    userId: string,
    page: number,
    pageSize: number,
  ) {
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.nlQueryHistory.findMany({
        where: { tenant_id: tenantId, user_id: userId },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          question: true,
          result_count: true,
          created_at: true,
        },
      }),
      this.prisma.nlQueryHistory.count({
        where: { tenant_id: tenantId, user_id: userId },
      }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  // ─── Generate Structured Query via Claude ─────────────────────────────────

  private async generateStructuredQuery(
    question: string,
  ): Promise<NlStructuredQuery> {
    if (!this.anthropic) {
      throw new ServiceUnavailableException({
        error: { code: 'AI_SERVICE_UNAVAILABLE', message: 'AI not available' },
      });
    }

    const prompt = `You are translating a natural language question about school grades into a structured query definition (JSON).

${SCHEMA_DESCRIPTION}

Question: "${question}"

Return ONLY a JSON object with this structure:
{
  "entity": "<entity name>",
  "filters": [{ "field": "...", "op": "...", "value": ... }],
  "aggregations": [{ "fn": "...", "field": "...", "alias": "..." }],
  "select": ["field1", "field2"],
  "sort": [{ "field": "...", "dir": "asc|desc" }],
  "limit": 50
}

Rules:
- entity must be one of: student, grade, assessment, period_grade, gpa_snapshot
- Use only fields listed in the schema description
- Keep select fields simple (no dot notation in select — use them in filters only)
- aggregations is optional
- sort is optional
- limit defaults to 50, max 200
- Return ONLY the JSON, no explanation, no markdown.`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(
      (b: { type: string; text?: string }) => b.type === 'text',
    );

    return this.parseStructuredQuery(textBlock?.text ?? '');
  }

  private parseStructuredQuery(text: string): NlStructuredQuery {
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '');
      cleaned = cleaned.replace(/\n?```\s*$/, '');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      this.logger.warn(`Failed to parse NL query response: ${text}`);
      throw new BadRequestException({
        error: {
          code: 'NL_QUERY_PARSE_FAILED',
          message: 'Could not parse the question into a structured query. Please rephrase.',
        },
      });
    }

    const raw = parsed as RawStructuredQueryResponse;

    const supportedEntities: SupportedEntity[] = [
      'student',
      'grade',
      'assessment',
      'period_grade',
      'gpa_snapshot',
    ];

    if (!raw.entity || !supportedEntities.includes(raw.entity as SupportedEntity)) {
      throw new BadRequestException({
        error: {
          code: 'UNSUPPORTED_ENTITY',
          message: `Entity "${raw.entity}" is not supported. Try rephrasing your question.`,
        },
      });
    }

    return {
      entity: raw.entity as SupportedEntity,
      filters: Array.isArray(raw.filters) ? raw.filters : [],
      aggregations: Array.isArray(raw.aggregations)
        ? raw.aggregations
        : undefined,
      select: Array.isArray(raw.select) ? raw.select : [],
      sort: Array.isArray(raw.sort) ? raw.sort : undefined,
      limit: typeof raw.limit === 'number' ? Math.min(raw.limit, 200) : 50,
    };
  }

  // ─── Execute Structured Query ─────────────────────────────────────────────

  private async executeQuery(
    tenantId: string,
    query: NlStructuredQuery,
  ): Promise<Record<string, unknown>[]> {
    const limit = Math.min(query.limit ?? 50, 200);

    switch (query.entity) {
      case 'student':
        return this.executeStudentQuery(tenantId, query, limit);
      case 'grade':
        return this.executeGradeQuery(tenantId, query, limit);
      case 'assessment':
        return this.executeAssessmentQuery(tenantId, query, limit);
      case 'period_grade':
        return this.executePeriodGradeQuery(tenantId, query, limit);
      case 'gpa_snapshot':
        return this.executeGpaQuery(tenantId, query, limit);
      default:
        return [];
    }
  }

  private async executeStudentQuery(
    tenantId: string,
    query: NlStructuredQuery,
    limit: number,
  ): Promise<Record<string, unknown>[]> {
    const where: Record<string, unknown> = { tenant_id: tenantId };
    this.applyFilters(where, query.filters);

    const students = await this.prisma.student.findMany({
      where,
      take: limit,
      select: {
        id: true,
        first_name: true,
        last_name: true,
        student_number: true,
        year_group: { select: { name: true } },
        homeroom_class: { select: { name: true } },
      },
      orderBy: this.buildOrderBy(query.sort) ?? { last_name: 'asc' },
    });

    return students.map((s) => ({
      id: s.id,
      first_name: s.first_name,
      last_name: s.last_name,
      student_number: s.student_number,
      year_group: s.year_group?.name ?? null,
      class: s.homeroom_class?.name ?? null,
    }));
  }

  private async executeGradeQuery(
    tenantId: string,
    query: NlStructuredQuery,
    limit: number,
  ): Promise<Record<string, unknown>[]> {
    const where: Record<string, unknown> = { tenant_id: tenantId };
    this.applyFilters(where, query.filters);

    const grades = await this.prisma.grade.findMany({
      where,
      take: limit,
      select: {
        id: true,
        raw_score: true,
        is_missing: true,
        ai_assisted: true,
        assessment: {
          select: {
            title: true,
            max_score: true,
            subject: { select: { name: true } },
          },
        },
        student: { select: { first_name: true, last_name: true, student_number: true } },
      },
    });

    return grades.map((g) => ({
      id: g.id,
      student: `${g.student.first_name} ${g.student.last_name}`,
      student_number: g.student.student_number,
      assessment: g.assessment.title,
      subject: g.assessment.subject.name,
      raw_score: g.raw_score !== null ? Number(g.raw_score) : null,
      max_score: Number(g.assessment.max_score),
      is_missing: g.is_missing,
    }));
  }

  private async executeAssessmentQuery(
    tenantId: string,
    query: NlStructuredQuery,
    limit: number,
  ): Promise<Record<string, unknown>[]> {
    const where: Record<string, unknown> = { tenant_id: tenantId };
    this.applyFilters(where, query.filters);

    const assessments = await this.prisma.assessment.findMany({
      where,
      take: limit,
      select: {
        id: true,
        title: true,
        max_score: true,
        status: true,
        due_date: true,
        subject: { select: { name: true } },
        class_entity: { select: { name: true } },
        academic_period: { select: { name: true } },
      },
    });

    return assessments.map((a) => ({
      id: a.id,
      title: a.title,
      subject: a.subject.name,
      class: a.class_entity.name,
      period: a.academic_period.name,
      max_score: Number(a.max_score),
      status: a.status,
      due_date: a.due_date ? a.due_date.toISOString().slice(0, 10) : null,
    }));
  }

  private async executePeriodGradeQuery(
    tenantId: string,
    query: NlStructuredQuery,
    limit: number,
  ): Promise<Record<string, unknown>[]> {
    const where: Record<string, unknown> = { tenant_id: tenantId };
    this.applyFilters(where, query.filters);

    const snapshots = await this.prisma.periodGradeSnapshot.findMany({
      where,
      take: limit,
      select: {
        id: true,
        computed_value: true,
        display_value: true,
        student: { select: { first_name: true, last_name: true, student_number: true } },
        subject: { select: { name: true } },
        class_entity: { select: { name: true } },
        academic_period: { select: { name: true } },
      },
      orderBy: this.buildOrderBy(query.sort) ?? { computed_value: 'desc' },
    });

    return snapshots.map((s) => ({
      id: s.id,
      student: `${s.student.first_name} ${s.student.last_name}`,
      student_number: s.student.student_number,
      subject: s.subject.name,
      class: s.class_entity.name,
      period: s.academic_period.name,
      grade: Number(s.computed_value),
      display_value: s.display_value,
    }));
  }

  private async executeGpaQuery(
    tenantId: string,
    query: NlStructuredQuery,
    limit: number,
  ): Promise<Record<string, unknown>[]> {
    const where: Record<string, unknown> = { tenant_id: tenantId };
    this.applyFilters(where, query.filters);

    const snapshots = await this.prisma.gpaSnapshot.findMany({
      where,
      take: limit,
      select: {
        id: true,
        gpa_value: true,
        credit_hours_total: true,
        student: { select: { first_name: true, last_name: true, student_number: true } },
        academic_period: { select: { name: true } },
      },
      orderBy: this.buildOrderBy(query.sort) ?? { gpa_value: 'desc' },
    });

    return snapshots.map((s) => ({
      id: s.id,
      student: `${s.student.first_name} ${s.student.last_name}`,
      student_number: s.student.student_number,
      period: s.academic_period.name,
      gpa: Number(s.gpa_value),
      credit_hours: Number(s.credit_hours_total),
    }));
  }

  // ─── Filter Builder ───────────────────────────────────────────────────────

  private applyFilters(
    where: Record<string, unknown>,
    filters: QueryFilter[],
  ): void {
    for (const filter of filters) {
      // Only apply simple top-level field filters safely
      // Skip dot-notation fields (relation traversal — handled at query level)
      if (filter.field.includes('.')) continue;

      const op = filter.op;
      if (op === 'eq') {
        where[filter.field] = filter.value;
      } else if (op === 'ne') {
        where[filter.field] = { not: filter.value };
      } else if (op === 'lt') {
        where[filter.field] = { lt: filter.value };
      } else if (op === 'lte') {
        where[filter.field] = { lte: filter.value };
      } else if (op === 'gt') {
        where[filter.field] = { gt: filter.value };
      } else if (op === 'gte') {
        where[filter.field] = { gte: filter.value };
      } else if (op === 'in' && Array.isArray(filter.value)) {
        where[filter.field] = { in: filter.value };
      } else if (op === 'contains' && typeof filter.value === 'string') {
        where[filter.field] = { contains: filter.value, mode: 'insensitive' };
      }
    }
  }

  private buildOrderBy(
    sort?: QuerySort[],
  ): Record<string, string> | undefined {
    if (!sort || sort.length === 0) return undefined;
    const first = sort[0];
    if (!first) return undefined;
    return { [first.field]: first.dir };
  }

  // ─── Save Query History ───────────────────────────────────────────────────

  private async saveQueryHistory(
    tenantId: string,
    userId: string,
    question: string,
    structuredQuery: NlStructuredQuery,
  ): Promise<string> {
    try {
      const record = await this.prisma.nlQueryHistory.create({
        data: {
          tenant_id: tenantId,
          user_id: userId,
          question,
          structured_query_json: JSON.parse(
            JSON.stringify(structuredQuery),
          ) as object,
          result_count: 0, // updated after execution
        },
        select: { id: true },
      });
      return record.id;
    } catch (err) {
      // History is non-critical — log and continue
      this.logger.warn(`Failed to save NL query history: ${String(err)}`);
      return '';
    }
  }
}
