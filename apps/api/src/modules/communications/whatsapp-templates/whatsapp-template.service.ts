import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma, WhatsAppTemplate } from '@prisma/client';
import twilio, { type Twilio } from 'twilio';

import type { SubmitWhatsAppTemplateDto } from '@school/shared';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { WhatsAppConfigService } from '../../configuration/whatsapp-config.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface ListWhatsAppTemplatesFilters {
  status?: 'pending' | 'submitted' | 'approved' | 'rejected' | 'paused';
  language_code?: string;
  template_key?: string;
}

/**
 * Owns the WhatsApp template lifecycle (`pending → submitted → approved |
 * rejected → paused`). Submission goes through Twilio's Content API; the
 * approval verdict comes back via `syncApprovalStatus` (manual or future
 * 15-min cron). Only `status='approved'` rows are returned by
 * `getApprovedByKey()` — paused / pending / submitted / rejected rows
 * are never dispatchable.
 */
@Injectable()
export class WhatsAppTemplateService {
  private readonly logger = new Logger(WhatsAppTemplateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappConfig: WhatsAppConfigService,
  ) {}

  // ─── Create (status='pending') ────────────────────────────────────────────

  async createTemplate(
    tenantId: string,
    userId: string,
    dto: SubmitWhatsAppTemplateDto,
  ): Promise<WhatsAppTemplate> {
    const existing = await this.prisma.whatsAppTemplate.findFirst({
      where: {
        tenant_id: tenantId,
        template_key: dto.template_key,
        language_code: dto.language_code,
      },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'TEMPLATE_ALREADY_EXISTS',
        message: `Template "${dto.template_key}" (${dto.language_code}) already exists for this tenant.`,
      });
    }

    this.assertVariablePlaceholdersValid(dto.body);

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
    return rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.whatsAppTemplate.create({
        data: {
          tenant_id: tenantId,
          template_key: dto.template_key,
          template_name: dto.template_name ?? dto.template_key,
          language_code: dto.language_code,
          category: dto.category,
          body: dto.body,
          status: 'pending',
        },
      });
    });
  }

  // ─── Submit to Twilio (status: pending → submitted) ───────────────────────

  async submitToTwilio(
    tenantId: string,
    templateId: string,
    _userId: string,
  ): Promise<WhatsAppTemplate> {
    const row = await this.prisma.whatsAppTemplate.findFirst({
      where: { id: templateId, tenant_id: tenantId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: `WhatsApp template "${templateId}" not found for this tenant.`,
      });
    }
    if (row.status !== 'pending') {
      throw new BadRequestException({
        code: 'TEMPLATE_INVALID_STATE_FOR_SUBMIT',
        message: `Template must be "pending" to submit (current: "${row.status}").`,
      });
    }

    const client = await this.getTwilioClient(tenantId);
    const variables = this.extractVariablePositions(row.body);
    const friendlyName = `${row.template_key}.${row.language_code}`;

    let contentSid: string;
    try {
      // Twilio's Node SDK uses camelCase property names; on the wire the
      // `types` entry resolves to `twilio/text`. The `as never` cast lets
      // us pass the partial shape — the SDK's runtime serialiser fills in
      // the rest.
      const created = await client.content.v1.contents.create({
        friendlyName,
        language: row.language_code,
        variables,
        types: { twilioText: { body: row.body } },
      } as never);
      contentSid = created.sid;

      // Submit for WhatsApp approval — Twilio's separate API surface.
      await client.content.v1
        .contents(contentSid)
        .approvalCreate.create({ name: friendlyName, category: row.category });
    } catch (err) {
      const e = err as Error & { code?: number };
      this.logger.error(
        `[submitToTwilio] tenant=${tenantId} template=${row.template_key}: ${e.message}`,
      );
      throw new BadRequestException({
        code: 'TWILIO_SUBMIT_FAILED',
        message: `Twilio rejected template submission: ${e.message}`,
        details: { twilio_error_code: e.code },
      });
    }

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.whatsAppTemplate.update({
        where: { id: row.id },
        data: {
          status: 'submitted',
          twilio_template_sid: contentSid,
          submitted_at: new Date(),
          last_synced_at: new Date(),
        },
      });
    });
  }

  // ─── Sync (submitted → approved | rejected) ───────────────────────────────

  async syncApprovalStatus(tenantId: string, templateId: string): Promise<WhatsAppTemplate> {
    const row = await this.prisma.whatsAppTemplate.findFirst({
      where: { id: templateId, tenant_id: tenantId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: `WhatsApp template "${templateId}" not found for this tenant.`,
      });
    }
    if (row.status !== 'submitted') {
      // Idempotency: caller can hit /sync on already-resolved rows. Return as-is.
      return row;
    }
    if (!row.twilio_template_sid) {
      throw new BadRequestException({
        code: 'TEMPLATE_MISSING_SID',
        message: 'Template was marked submitted without a Twilio SID — re-submit it.',
      });
    }

    const client = await this.getTwilioClient(tenantId);

    let approvalStatus: string;
    let approvalReason: string | null;
    try {
      const fetched = await client.content.v1.contents(row.twilio_template_sid).fetch();
      const approvals =
        (
          fetched as unknown as {
            approval_requests?: Array<{ status?: string; rejection_reason?: string }>;
          }
        ).approval_requests ?? [];
      const latest = approvals[approvals.length - 1];
      approvalStatus = latest?.status ?? 'pending';
      approvalReason = latest?.rejection_reason ?? null;
    } catch (err) {
      const e = err as Error & { statusCode?: number; code?: number };
      this.logger.error(
        `[syncApprovalStatus] tenant=${tenantId} template=${row.template_key}: ${e.message}`,
      );
      throw new BadRequestException({
        code: 'TWILIO_SYNC_FAILED',
        message: `Twilio sync failed: ${e.message}`,
        details: { twilio_error_code: e.code },
      });
    }

    const nextStatus = mapTwilioApprovalToLocalStatus(approvalStatus);

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.whatsAppTemplate.update({
        where: { id: row.id },
        data: {
          status: nextStatus,
          approval_message: approvalReason,
          approved_at: nextStatus === 'approved' ? new Date() : row.approved_at,
          last_synced_at: new Date(),
        },
      });
    });
  }

  // ─── List / get ────────────────────────────────────────────────────────────

  async listTemplates(
    tenantId: string,
    filters: ListWhatsAppTemplatesFilters = {},
    page = 1,
    pageSize = 20,
  ): Promise<{
    data: WhatsAppTemplate[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const where: Prisma.WhatsAppTemplateWhereInput = {
      tenant_id: tenantId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.language_code ? { language_code: filters.language_code } : {}),
      ...(filters.template_key ? { template_key: filters.template_key } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.whatsAppTemplate.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.whatsAppTemplate.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async getTemplate(tenantId: string, templateId: string): Promise<WhatsAppTemplate | null> {
    return this.prisma.whatsAppTemplate.findFirst({
      where: { id: templateId, tenant_id: tenantId },
    });
  }

  // ─── Hot-path read used by TwilioWhatsAppProvider.send() ──────────────────

  /**
   * Returns the approved row for `(tenant_id, template_key, language_code)`,
   * or null. Paused / pending / submitted / rejected rows return null —
   * only `status='approved'` is dispatchable.
   */
  async getApprovedByKey(
    tenantId: string,
    templateKey: string,
    languageCode: string,
  ): Promise<WhatsAppTemplate | null> {
    return this.prisma.whatsAppTemplate.findFirst({
      where: {
        tenant_id: tenantId,
        template_key: templateKey,
        language_code: languageCode,
        status: 'approved',
      },
    });
  }

  // ─── Pause / resume ────────────────────────────────────────────────────────

  async pauseTemplate(
    tenantId: string,
    templateId: string,
    _userId: string,
  ): Promise<WhatsAppTemplate> {
    const row = await this.prisma.whatsAppTemplate.findFirst({
      where: { id: templateId, tenant_id: tenantId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: `WhatsApp template "${templateId}" not found for this tenant.`,
      });
    }
    if (row.status !== 'approved') {
      throw new BadRequestException({
        code: 'TEMPLATE_INVALID_STATE_FOR_PAUSE',
        message: `Only approved templates can be paused (current: "${row.status}").`,
      });
    }
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.whatsAppTemplate.update({
        where: { id: row.id },
        data: { status: 'paused' },
      });
    });
  }

  async resumeTemplate(
    tenantId: string,
    templateId: string,
    _userId: string,
  ): Promise<WhatsAppTemplate> {
    const row = await this.prisma.whatsAppTemplate.findFirst({
      where: { id: templateId, tenant_id: tenantId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: `WhatsApp template "${templateId}" not found for this tenant.`,
      });
    }
    if (row.status !== 'paused') {
      throw new BadRequestException({
        code: 'TEMPLATE_INVALID_STATE_FOR_RESUME',
        message: `Only paused templates can be resumed (current: "${row.status}").`,
      });
    }
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.whatsAppTemplate.update({
        where: { id: row.id },
        data: { status: 'approved' },
      });
    });
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async deleteTemplate(tenantId: string, templateId: string, _userId: string): Promise<void> {
    const row = await this.prisma.whatsAppTemplate.findFirst({
      where: { id: templateId, tenant_id: tenantId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: `WhatsApp template "${templateId}" not found for this tenant.`,
      });
    }
    if (row.twilio_template_sid) {
      try {
        const client = await this.getTwilioClient(tenantId);
        await client.content.v1.contents(row.twilio_template_sid).remove();
      } catch (err) {
        // Tolerate Twilio 404 — purge locally regardless. Log and proceed.
        const e = err as Error & { statusCode?: number };
        if (e.statusCode !== 404) {
          this.logger.warn(
            `[deleteTemplate] Twilio remove failed for ${row.twilio_template_sid}: ${e.message}; continuing local delete`,
          );
        }
      }
    }
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      await txdb.whatsAppTemplate.delete({ where: { id: row.id } });
    });
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private async getTwilioClient(tenantId: string): Promise<Twilio> {
    const config = await this.whatsappConfig.getDecryptedConfig(tenantId);
    if (!config) {
      throw new BadRequestException({
        code: 'WHATSAPP_NOT_CONFIGURED',
        message: 'WhatsApp is not configured for this tenant.',
      });
    }
    return twilio(config.twilio_account_sid, config.twilio_auth_token);
  }

  /**
   * Twilio template bodies use `{{1}}`, `{{2}}`, ... positional placeholders.
   * Named placeholders (`{{name}}`) and gappy sequences are rejected at
   * create-time so the row submitted is the row Twilio will accept.
   */
  private assertVariablePlaceholdersValid(body: string): void {
    const matches = [...body.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1] ?? '');
    if (matches.length === 0) return;
    const numeric = matches.map((m) => Number.parseInt(m, 10));
    if (numeric.some((n) => !Number.isInteger(n) || n <= 0)) {
      throw new BadRequestException({
        code: 'TEMPLATE_INVALID_PLACEHOLDER',
        message:
          'WhatsApp template bodies use positional placeholders only. Use {{1}}, {{2}}, ... — named placeholders are not supported.',
      });
    }
    const sorted = [...new Set(numeric)].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== i + 1) {
        throw new BadRequestException({
          code: 'TEMPLATE_PLACEHOLDER_GAP',
          message: `Placeholder positions must be sequential starting at {{1}}. Got ${sorted.join(', ')}.`,
        });
      }
    }
  }

  /**
   * Convert `{{1}}`, `{{2}}` placeholder positions into Twilio's `variables`
   * map (`{ "1": "<sample>", "2": "<sample>" }`). Twilio uses sample values
   * as preview text during review.
   */
  private extractVariablePositions(body: string): Record<string, string> {
    const matches = [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1] ?? '');
    const out: Record<string, string> = {};
    for (const m of new Set(matches)) {
      out[m] = `sample_${m}`;
    }
    return out;
  }
}

// ─── Pure helpers (exported for spec coverage) ────────────────────────────────

export function mapTwilioApprovalToLocalStatus(
  twilioStatus: string,
): 'submitted' | 'approved' | 'rejected' {
  const lc = twilioStatus.toLowerCase();
  if (lc === 'approved') return 'approved';
  if (lc === 'rejected' || lc === 'failed') return 'rejected';
  return 'submitted';
}
