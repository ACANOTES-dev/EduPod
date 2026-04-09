import { BadRequestException, Injectable, Logger, PayloadTooLargeException } from '@nestjs/common';
import { Prisma, ReportCardTenantSettings } from '@prisma/client';

import { reportCardTenantSettingsPayloadSchema } from '@school/shared';
import type { ReportCardTenantSettingsPayload } from '@school/shared';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../s3/s3.service';

import type { UpdateReportCardTenantSettingsDto } from './dto/tenant-settings.dto';

// ─── Constants ───────────────────────────────────────────────────────────────

const SIGNATURE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const SIGNATURE_ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;
type SignatureMime = (typeof SIGNATURE_ALLOWED_MIMES)[number];

// ─── PNG / JPEG / WEBP magic bytes ───────────────────────────────────────────
// Defence-in-depth: never trust the multer-reported mimetype alone.

const MAGIC_BYTE_MATCHERS: Record<SignatureMime, (buf: Buffer) => boolean> = {
  'image/png': (buf) =>
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a,
  'image/jpeg': (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  'image/webp': (buf) =>
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50,
};

const EXTENSION_FOR_MIME: Record<SignatureMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

// ─── Default payload ─────────────────────────────────────────────────────────
// Matches the seed defaults but is computed via the Zod schema so it survives
// schema additions without needing duplication.

function buildDefaultPayload(): ReportCardTenantSettingsPayload {
  return reportCardTenantSettingsPayloadSchema.parse({});
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReportCardTenantSettingsResult {
  id: string;
  tenant_id: string;
  settings: ReportCardTenantSettingsPayload;
  created_at: Date;
  updated_at: Date;
}

export interface UploadedSignatureFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ReportCardTenantSettingsService {
  private readonly logger = new Logger(ReportCardTenantSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  // ─── Read ────────────────────────────────────────────────────────────────

  /**
   * Returns the tenant's report-card settings row, lazily creating a default
   * row when none exists. Lazy bootstrap covers tenants created before impl
   * 01 seed coverage or in environments where the seed has not run.
   */
  async get(tenantId: string): Promise<ReportCardTenantSettingsResult> {
    const existing = await this.prisma.reportCardTenantSettings.findFirst({
      where: { tenant_id: tenantId },
    });
    if (existing) {
      return this.toResult(existing);
    }
    return this.createDefault(tenantId);
  }

  /**
   * Returns the parsed payload only. Used by impl 04 (generation) to read
   * tenant defaults without having to touch the row metadata. Always lazily
   * bootstraps.
   */
  async getPayload(tenantId: string): Promise<ReportCardTenantSettingsPayload> {
    const result = await this.get(tenantId);
    return result.settings;
  }

  // ─── Write — partial merge + full-payload re-validation ──────────────────

  async update(
    tenantId: string,
    _actorUserId: string,
    dto: UpdateReportCardTenantSettingsDto,
  ): Promise<ReportCardTenantSettingsResult> {
    const current = await this.get(tenantId);

    // Merge: only keys explicitly present in the DTO overwrite the current
    // payload. `undefined` means "don't touch"; `null` clears (when the
    // underlying field allows null).
    const merged: ReportCardTenantSettingsPayload = {
      ...current.settings,
      ...this.stripUndefined(dto),
    } as ReportCardTenantSettingsPayload;

    const validated = reportCardTenantSettingsPayloadSchema.parse(merged);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const updated = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.reportCardTenantSettings.update({
        where: { tenant_id: tenantId },
        data: { settings_json: validated as unknown as Prisma.InputJsonValue },
      });
    });

    return this.toResult(updated);
  }

  // ─── Signature upload ────────────────────────────────────────────────────

  async uploadPrincipalSignature(
    tenantId: string,
    actorUserId: string,
    file: UploadedSignatureFile,
    options: { principalName?: string | null } = {},
  ): Promise<ReportCardTenantSettingsResult> {
    // Multer already enforces size at the interceptor layer but we guard
    // here so direct service calls (tests, scripts) stay safe.
    if (file.buffer.length > SIGNATURE_MAX_BYTES) {
      throw new PayloadTooLargeException({
        code: 'FILE_TOO_LARGE',
        message: `Signature must be under ${SIGNATURE_MAX_BYTES / (1024 * 1024)} MB`,
      });
    }

    if (!SIGNATURE_ALLOWED_MIMES.includes(file.mimetype as SignatureMime)) {
      throw new BadRequestException({
        code: 'INVALID_FILE_TYPE',
        message: `Signature must be one of: ${SIGNATURE_ALLOWED_MIMES.join(', ')}`,
      });
    }

    const mime = file.mimetype as SignatureMime;
    if (!MAGIC_BYTE_MATCHERS[mime](file.buffer)) {
      throw new BadRequestException({
        code: 'INVALID_FILE_CONTENT',
        message: `Uploaded file does not match the declared "${mime}" format`,
      });
    }

    // The full payload schema enforces "signature key and principal_name are
    // both set or both null". The caller must therefore either have a name
    // already persisted or provide one with the upload.
    const current = await this.get(tenantId);
    const suppliedName =
      typeof options.principalName === 'string' ? options.principalName.trim() : undefined;
    const resolvedName =
      suppliedName && suppliedName.length > 0 ? suppliedName : current.settings.principal_name;

    if (!resolvedName || resolvedName.length === 0) {
      throw new BadRequestException({
        code: 'PRINCIPAL_NAME_REQUIRED',
        message: 'principal_name must be set before (or supplied with) the signature upload',
      });
    }

    const ext = EXTENSION_FOR_MIME[mime];
    // Storage key is deterministic so re-uploads overwrite the previous file
    // and no orphaned objects accumulate.
    const storageKey = `report-cards/principal-signature.${ext}`;
    const fullKey = await this.s3.upload(tenantId, storageKey, file.buffer, mime);

    // If an older signature exists under a different extension (e.g. the
    // tenant switched from PNG to JPEG), delete it so the bucket stays tidy.
    const previousKey = current.settings.principal_signature_storage_key;
    if (previousKey && previousKey !== fullKey) {
      try {
        await this.s3.delete(previousKey);
      } catch (err) {
        this.logger.error(
          `[uploadPrincipalSignature] failed to delete previous key "${previousKey}": ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return this.update(tenantId, actorUserId, {
      principal_signature_storage_key: fullKey,
      principal_name: resolvedName,
    });
  }

  async deletePrincipalSignature(
    tenantId: string,
    actorUserId: string,
  ): Promise<ReportCardTenantSettingsResult> {
    const current = await this.get(tenantId);
    const key = current.settings.principal_signature_storage_key;

    if (key) {
      try {
        await this.s3.delete(key);
      } catch (err) {
        this.logger.error(
          `[deletePrincipalSignature] failed to delete storage key "${key}": ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // Clear BOTH signature fields together — the Zod refine forbids a
    // half-configured signature (key without name or vice versa).
    return this.update(tenantId, actorUserId, {
      principal_signature_storage_key: null,
      principal_name: null,
    });
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private async createDefault(tenantId: string): Promise<ReportCardTenantSettingsResult> {
    const payload = buildDefaultPayload();

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const created = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.reportCardTenantSettings.upsert({
        where: { tenant_id: tenantId },
        update: {},
        create: {
          tenant_id: tenantId,
          settings_json: payload as unknown as Prisma.InputJsonValue,
        },
      });
    });

    return this.toResult(created);
  }

  private toResult(row: ReportCardTenantSettings): ReportCardTenantSettingsResult {
    // Historical rows may have drifted from the current schema; re-parse so
    // the API only ever returns payloads that the Zod schema considers valid.
    const payload = reportCardTenantSettingsPayloadSchema.parse(row.settings_json);
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      settings: payload,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private stripUndefined(
    dto: UpdateReportCardTenantSettingsDto,
  ): Partial<ReportCardTenantSettingsPayload> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        out[key] = value;
      }
    }
    return out as Partial<ReportCardTenantSettingsPayload>;
  }
}
