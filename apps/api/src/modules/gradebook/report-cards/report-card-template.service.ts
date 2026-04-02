import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { GdprOutboundData } from '@school/shared';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { AnthropicClientService } from '../../ai/anthropic-client.service';
import { AiAuditService } from '../../gdpr/ai-audit.service';
import { GdprTokenService } from '../../gdpr/gdpr-token.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TemplateSectionConfig {
  id: string;
  type: string;
  order: number;
  style_variant: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface CreateTemplateDto {
  name: string;
  locale: string;
  sections_json: TemplateSectionConfig[];
  branding_overrides_json?: Record<string, unknown> | null;
  is_default?: boolean;
}

export interface UpdateTemplateDto {
  name?: string;
  sections_json?: TemplateSectionConfig[];
  branding_overrides_json?: Record<string, unknown> | null;
  is_default?: boolean;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ReportCardTemplateService {
  private readonly logger = new Logger(ReportCardTemplateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gdprTokenService: GdprTokenService,
    private readonly aiAuditService: AiAuditService,
    private readonly anthropicClient: AnthropicClientService,
  ) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateTemplateDto) {
    // Check unique constraint
    const existing = await this.prisma.reportCardTemplate.findFirst({
      where: { tenant_id: tenantId, name: dto.name, locale: dto.locale },
    });
    if (existing) {
      throw new ConflictException({
        error: {
          code: 'TEMPLATE_NAME_TAKEN',
          message: `A template named "${dto.name}" already exists for locale "${dto.locale}"`,
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // If setting as default, clear existing default for this locale
      if (dto.is_default) {
        await db.reportCardTemplate.updateMany({
          where: { tenant_id: tenantId, locale: dto.locale, is_default: true },
          data: { is_default: false },
        });
      }

      return db.reportCardTemplate.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          locale: dto.locale,
          is_default: dto.is_default ?? false,
          sections_json: dto.sections_json as unknown as Prisma.InputJsonValue,
          branding_overrides_json: dto.branding_overrides_json
            ? (dto.branding_overrides_json as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          created_by_user_id: userId,
        },
      });
    });
  }

  // ─── List ─────────────────────────────────────────────────────────────────

  async findAll(tenantId: string, params: { page: number; pageSize: number; locale?: string }) {
    const { page, pageSize, locale } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ReportCardTemplateWhereInput = { tenant_id: tenantId };
    if (locale) {
      where.locale = locale;
    }

    const [data, total] = await Promise.all([
      this.prisma.reportCardTemplate.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
        select: {
          id: true,
          name: true,
          locale: true,
          is_default: true,
          sections_json: true,
          branding_overrides_json: true,
          created_at: true,
          updated_at: true,
          created_by: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.reportCardTemplate.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  // ─── Get One ──────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const template = await this.prisma.reportCardTemplate.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        created_by: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    if (!template) {
      throw new NotFoundException({
        error: {
          code: 'TEMPLATE_NOT_FOUND',
          message: `Report card template "${id}" not found`,
        },
      });
    }

    return template;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(tenantId: string, id: string, dto: UpdateTemplateDto) {
    const template = await this.prisma.reportCardTemplate.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, locale: true },
    });

    if (!template) {
      throw new NotFoundException({
        error: {
          code: 'TEMPLATE_NOT_FOUND',
          message: `Report card template "${id}" not found`,
        },
      });
    }

    // Check name uniqueness if being changed
    if (dto.name !== undefined) {
      const conflict = await this.prisma.reportCardTemplate.findFirst({
        where: {
          tenant_id: tenantId,
          locale: template.locale,
          name: dto.name,
          id: { not: id },
        },
      });
      if (conflict) {
        throw new ConflictException({
          error: {
            code: 'TEMPLATE_NAME_TAKEN',
            message: `A template named "${dto.name}" already exists for locale "${template.locale}"`,
          },
        });
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      if (dto.is_default) {
        await db.reportCardTemplate.updateMany({
          where: {
            tenant_id: tenantId,
            locale: template.locale,
            is_default: true,
            id: { not: id },
          },
          data: { is_default: false },
        });
      }

      const updateData: Prisma.ReportCardTemplateUpdateInput = {};
      if (dto.name !== undefined) updateData.name = dto.name;
      if (dto.is_default !== undefined) updateData.is_default = dto.is_default;
      if (dto.sections_json !== undefined) {
        updateData.sections_json = dto.sections_json as unknown as Prisma.InputJsonValue;
      }
      if (dto.branding_overrides_json !== undefined) {
        updateData.branding_overrides_json = dto.branding_overrides_json
          ? (dto.branding_overrides_json as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull;
      }

      return db.reportCardTemplate.update({ where: { id }, data: updateData });
    });
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async remove(tenantId: string, id: string) {
    const template = await this.prisma.reportCardTemplate.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!template) {
      throw new NotFoundException({
        error: {
          code: 'TEMPLATE_NOT_FOUND',
          message: `Report card template "${id}" not found`,
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.reportCardTemplate.delete({ where: { id } });
    });

    return { deleted: true };
  }

  // ─── Set Default ──────────────────────────────────────────────────────────

  async setDefault(tenantId: string, id: string, locale: string) {
    const template = await this.prisma.reportCardTemplate.findFirst({
      where: { id, tenant_id: tenantId, locale },
      select: { id: true },
    });

    if (!template) {
      throw new NotFoundException({
        error: {
          code: 'TEMPLATE_NOT_FOUND',
          message: `Report card template "${id}" not found for locale "${locale}"`,
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      await db.reportCardTemplate.updateMany({
        where: { tenant_id: tenantId, locale, is_default: true },
        data: { is_default: false },
      });

      return db.reportCardTemplate.update({
        where: { id },
        data: { is_default: true },
      });
    });
  }

  // ─── AI Template Conversion ───────────────────────────────────────────────

  async convertFromImage(tenantId: string, userId: string, imageBuffer: Buffer, mimeType: string) {
    if (!this.anthropicClient.isConfigured) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_SERVICE_UNAVAILABLE',
          message: 'AI template conversion is not configured. ANTHROPIC_API_KEY is not set.',
        },
      });
    }

    // Check rate limit: 10 conversions per tenant per month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const conversionCount = await this.prisma.reportCardTemplate.count({
      where: {
        tenant_id: tenantId,
        created_at: { gte: startOfMonth },
        // Templates created via AI conversion have a specific naming pattern
        name: { startsWith: 'AI Import' },
      },
    });

    if (conversionCount >= 10) {
      throw new ConflictException({
        error: {
          code: 'AI_CONVERSION_RATE_LIMIT',
          message: 'Maximum 10 AI template conversions per month. Limit reached.',
        },
      });
    }

    // GDPR audit log — no personal data sent to AI, gateway call is for audit trail only
    await this.gdprTokenService.processOutbound(
      tenantId,
      'ai_template_conversion',
      { entities: [], entityCount: 0 } as GdprOutboundData,
      userId,
    );

    const base64Image = imageBuffer.toString('base64');
    const mediaType = mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

    const sectionTypesDoc = `
Available section types:
- header: School logo, name, report card title
- student_info: Student name, ID, class, year group
- grades_table: Subject grades with assessment detail
- attendance_summary: Attendance statistics
- competency_summary: Standards/competency levels per subject
- conduct: Behavior and conduct rating
- extracurriculars: Extra-curricular activities
- custom_text: Free text section
- teacher_comment: Teacher narrative comment
- principal_comment: Principal/headmaster comment
- threshold_remarks: Grade labels (Distinction, Merit, Pass, etc.)
- comparative_indicators: Class rank/percentile indicators
- qr_code: QR code for authenticity verification
- signature_area: Parent/guardian signature area

Style variants for grades_table: "compact", "expanded", "bordered", "minimal"
Style variants for header: "centered", "left-aligned", "with-banner"
Style variants for student_info: "single-line", "grid", "card"
Style variants for all others: "default", "minimal", "bordered"
    `.trim();

    const prompt = `Analyze this report card image and convert it to a structured template definition.

${sectionTypesDoc}

Return ONLY a valid JSON array of sections in this format:
[
  {
    "id": "section_1",
    "type": "<section_type>",
    "order": 1,
    "style_variant": "<variant>",
    "enabled": true,
    "config": {}
  }
]

Map each visible part of the report card to the most appropriate section type.
Order sections top-to-bottom as they appear in the image.
Return ONLY the JSON array, no explanation.`;

    this.logger.log(`Converting report card template from image for tenant ${tenantId}`);

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
              text: prompt,
            },
          ],
        },
      ],
    });
    const elapsed = Date.now() - startTime;

    const textBlock = response.content.find((b) => b.type === 'text');
    const rawText = textBlock?.type === 'text' ? (textBlock.text?.trim() ?? '[]') : '[]';

    await this.aiAuditService.log({
      tenantId,
      aiService: 'ai_template_conversion',
      subjectType: null,
      subjectId: null,
      modelUsed: 'claude-sonnet-4-6-20250514',
      promptHash: AiAuditService.hashPrompt(prompt),
      promptSummary: AiAuditService.truncate(prompt, 500),
      responseSummary: AiAuditService.truncate(rawText, 500),
      inputDataCategories: ['report_card_template_image'],
      tokenised: true,
      processingTimeMs: elapsed,
    });

    let sectionsJson: TemplateSectionConfig[];
    try {
      sectionsJson = JSON.parse(rawText) as TemplateSectionConfig[];
    } catch {
      this.logger.error(`AI returned invalid JSON for template conversion: ${rawText}`);
      sectionsJson = this.buildDefaultSections();
    }

    // Save as a draft template
    const templateName = `AI Import ${now.toISOString().slice(0, 10)}`;
    const template = await this.create(tenantId, userId, {
      name: templateName,
      locale: 'en',
      sections_json: sectionsJson,
      is_default: false,
    });

    return { template, sections_json: sectionsJson };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private buildDefaultSections(): TemplateSectionConfig[] {
    return [
      {
        id: 'header',
        type: 'header',
        order: 1,
        style_variant: 'centered',
        enabled: true,
        config: {},
      },
      {
        id: 'student_info',
        type: 'student_info',
        order: 2,
        style_variant: 'grid',
        enabled: true,
        config: {},
      },
      {
        id: 'grades_table',
        type: 'grades_table',
        order: 3,
        style_variant: 'expanded',
        enabled: true,
        config: {},
      },
      {
        id: 'attendance_summary',
        type: 'attendance_summary',
        order: 4,
        style_variant: 'default',
        enabled: true,
        config: {},
      },
      {
        id: 'teacher_comment',
        type: 'teacher_comment',
        order: 5,
        style_variant: 'default',
        enabled: true,
        config: {},
      },
    ];
  }
}
