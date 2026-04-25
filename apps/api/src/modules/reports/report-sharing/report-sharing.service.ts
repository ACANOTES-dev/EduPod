import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import type { AttachmentInput, AudienceDefinition } from '@school/shared/inbox';
import {
  REPORT_SHARE_ERROR_CODES,
  type ReportShareArtifactFormat,
  type ReportShareAudience,
  type ReportShareFormat,
  type ReportShareHistoryEntry,
  type ReportShareHistoryResponse,
  type SharedSnapshotArtifact,
  type SharedSnapshotView,
  type ShareReportResponse,
} from '@school/shared/reports';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { AuthReadFacade } from '../../auth/auth-read.facade';
// eslint-disable-next-line school/no-cross-module-internal-import -- ConversationsService is the entry point for the inbox-broadcast pipeline, exported by InboxModule and injected here through standard NestJS DI; reports → inbox has no circular dependency, so direct constructor injection is the correct pattern (cf. homework / safeguarding modules which import InboxModule the same way).
import { ConversationsService } from '../../inbox/conversations/conversations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomReportBuilderService, type SavedReportRow } from '../custom-report-builder.service';
import {
  type ExportColumn,
  type ExportColumnType,
  type ExportInput,
  ReportExportService,
  SYNCHRONOUS_EXPORT_ROW_LIMIT,
  safeExportFilename,
} from '../exports/report-export.service';
import { QueryEngineService } from '../query-engine/query-engine.service';

import { SnapshotStorageService } from './snapshot-storage.service';

/**
 * Permission required to call the share endpoint. Seeded by impl 01 onto
 * the admin-tier system roles (owner / principal / VP / admin /
 * accounting). Recipients only need `reports.view` to read a snapshot.
 */
const SHARE_PERMISSION = 'reports.share';
const BUILDER_PERMISSION = 'reports.builder';

/**
 * Hard cap on the number of rows we render synchronously inside the
 * share request. Mirrors `SYNCHRONOUS_EXPORT_ROW_LIMIT` from impl 04;
 * larger result sets are a deferred follow-up — they delegate to the
 * `reports:export-batch` worker job (impl 13 spec §8). Until that path
 * lands we surface a 400 with a clear hint.
 */
const SYNC_SHARE_ROW_CAP = SYNCHRONOUS_EXPORT_ROW_LIMIT;

const FORMAT_MIME_TYPES: Record<ReportShareArtifactFormat, AttachmentInput['mime_type']> = {
  pdf: 'application/pdf',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export interface ShareReportRequest {
  tenantId: string;
  sharerUserId: string;
  permissions: string[];
  savedReportId: string;
  format: ReportShareFormat;
  audience: ReportShareAudience;
  messageBody?: string;
}

export interface GetSharedSnapshotRequest {
  tenantId: string;
  userId: string;
  permissions: string[];
  shareId: string;
}

export interface ListSharesRequest {
  tenantId: string;
  savedReportId: string;
  page: number;
  pageSize: number;
}

interface ArtifactRecord {
  format: ReportShareArtifactFormat;
  storageKey: string;
  filename: string;
  bytes: number;
}

/**
 * ReportSharingService — orchestrates the "share a saved report into the
 * inbox" pipeline (PLAN.md §7).
 *
 * The flow is:
 *
 *   1. **Authorise** — the sharer must hold `reports.share` and either
 *      own the saved report OR the report must be `is_shared = true`.
 *   2. **Load** — `CustomReportBuilderService.getSavedReport`.
 *   3. **Execute** — `QueryEngineService.execute` (page 1, full row cap).
 *      Larger queries are rejected pending the batch path (follow-up).
 *   4. **Export** — one buffer per requested format via
 *      `ReportExportService.exportByFormat`.
 *   5. **Upload** — `SnapshotStorageService.upload` returns the full S3
 *      key for each artifact.
 *   6. **Inbox broadcast** — `ConversationsService.createBroadcast`,
 *      attaching every artifact. The audience definition is built from
 *      the simpler `{ user_ids, role_keys }` shape persisted on the
 *      audit row, fanning out to `handpicked` + `staff_role` providers.
 *   7. **Audit** — write a `report_share_log` row inside the same RLS
 *      transaction. The row's id becomes the share's stable URL token.
 *
 * Snapshot reads (`getSharedSnapshot`) re-presign every artifact on each
 * call (15-minute TTL) so the frontend always gets fresh URLs without
 * leaking long-lived links into emails or browser histories.
 */
@Injectable()
export class ReportSharingService {
  private readonly logger = new Logger(ReportSharingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly builder: CustomReportBuilderService,
    // The query-engine ref is retained on the constructor so its provider
    // graph is wired into the module — `builder.executeReport` delegates
    // to it under the hood. Listed unused so the linter doesn't flag it
    // when the engine isn't called directly here.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private readonly queryEngine: QueryEngineService,
    private readonly exporter: ReportExportService,
    private readonly snapshotStorage: SnapshotStorageService,
    private readonly conversations: ConversationsService,
    private readonly authReadFacade: AuthReadFacade,
  ) {}

  // ─── share ───────────────────────────────────────────────────────────────

  async share(request: ShareReportRequest): Promise<ShareReportResponse> {
    if (!request.permissions.includes(SHARE_PERMISSION)) {
      throw new ForbiddenException({
        code: REPORT_SHARE_ERROR_CODES.SHARE_PERMISSION_DENIED,
        message: 'Sharing a report requires the reports.share permission',
      });
    }

    const report = await this.builder.getSavedReport(request.tenantId, request.savedReportId);

    if (report.created_by_user_id !== request.sharerUserId && !report.is_shared) {
      throw new ForbiddenException({
        code: REPORT_SHARE_ERROR_CODES.SHARE_NOT_OWNER,
        message: 'You can only share reports you own or that have been marked shared',
      });
    }

    const queryResult = await this.builder.executeReport(
      request.tenantId,
      request.sharerUserId,
      request.permissions,
      request.savedReportId,
      1,
      SYNC_SHARE_ROW_CAP,
    );

    if (queryResult.meta.row_count > SYNC_SHARE_ROW_CAP) {
      throw new HttpException(
        {
          code: REPORT_SHARE_ERROR_CODES.SHARE_TOO_LARGE,
          message: `Share would include ${queryResult.meta.row_count} rows (cap is ${SYNC_SHARE_ROW_CAP}). Narrow your filters or schedule the report.`,
          row_count: queryResult.meta.row_count,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const branding = await this.exporter.getTenantBranding(request.tenantId);
    const requestedFormats = expandFormat(request.format);

    // Fetch sharer's display name once — used for both the default
    // message body and the export `generated_by` metadata.
    const sharerName = await this.resolveUserDisplayName(
      request.tenantId,
      request.sharerUserId,
    );

    const filtersSummary = describeFilters(report);
    const exportInput: ExportInput = {
      tenantId: request.tenantId,
      report: {
        name: report.name,
        filters_summary: filtersSummary,
        generated_by: sharerName,
        generated_at: new Date(),
      },
      data: {
        columns: queryResult.columns.map((col) => mapToExportColumn(col)),
        rows: queryResult.rows,
      },
      branding,
    };

    // Generate every requested artifact in parallel.
    const buffers = await Promise.all(
      requestedFormats.map(async (format) => ({
        format,
        buffer: await this.exporter.exportByFormat(format, exportInput),
      })),
    );

    // Pre-allocate a share id so the storage prefix is stable; the same
    // id is later persisted via `tx.reportShareLog.create({ data: { id }})`.
    const shareId = crypto.randomUUID();

    const artifacts: ArtifactRecord[] = await Promise.all(
      buffers.map(async ({ format, buffer }) => {
        const filename = safeExportFilename(report.name, format);
        const storageKey = await this.snapshotStorage.upload({
          tenantId: request.tenantId,
          shareId,
          format,
          filename,
          buffer,
        });
        return { format, storageKey, filename, bytes: buffer.length };
      }),
    );

    const messageBody = (request.messageBody?.trim() ?? '') || buildDefaultMessageBody({
      sharerName,
      reportName: report.name,
      shareId,
    });

    const audienceDefinition = audienceFromShareInput(request.audience);

    const broadcast = await this.conversations.createBroadcast({
      tenantId: request.tenantId,
      senderUserId: request.sharerUserId,
      audienceDefinition,
      subject: `Shared report: ${report.name}`,
      body: messageBody,
      attachments: artifacts.map<AttachmentInput>((a) => ({
        storage_key: a.storageKey,
        filename: a.filename,
        mime_type: FORMAT_MIME_TYPES[a.format],
        size_bytes: a.bytes,
      })),
      allowReplies: false,
      extraChannels: [],
      disableFallback: false,
    });

    // Audit the share inside an RLS transaction. The pre-allocated id
    // becomes the canonical URL token for the snapshot view.
    const rls = createRlsClient(this.prisma, {
      tenant_id: request.tenantId,
      user_id: request.sharerUserId,
    });

    const logRow = await rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;
      return tx.reportShareLog.create({
        data: {
          id: shareId,
          tenant_id: request.tenantId,
          saved_report_id: request.savedReportId,
          shared_by: request.sharerUserId,
          format: request.format,
          conversation_id: broadcast.conversation_id,
          recipients_json: {
            user_ids: request.audience.user_ids,
            role_keys: request.audience.role_keys,
            artifact_keys: artifacts.reduce<Record<string, string>>((acc, a) => {
              acc[a.format] = a.storageKey;
              return acc;
            }, {}),
          },
          message_body: request.messageBody?.trim() || null,
        },
        select: { id: true },
      });
    });

    const artifactKeys: Record<ReportShareArtifactFormat, string> = artifacts.reduce(
      (acc, a) => {
        acc[a.format] = a.storageKey;
        return acc;
      },
      {} as Record<ReportShareArtifactFormat, string>,
    );

    return {
      share_id: logRow.id,
      conversation_id: broadcast.conversation_id,
      artifact_keys: artifactKeys,
      recipients_count: broadcast.resolved_recipient_count,
    };
  }

  // ─── getSharedSnapshot ───────────────────────────────────────────────────

  async getSharedSnapshot(request: GetSharedSnapshotRequest): Promise<SharedSnapshotView> {
    const rls = createRlsClient(this.prisma, {
      tenant_id: request.tenantId,
      user_id: request.userId,
    });

    return rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;

      const share = await tx.reportShareLog.findFirst({
        where: { id: request.shareId, tenant_id: request.tenantId },
        include: {
          saved_report: { select: { id: true, name: true, is_shared: true } },
          sharer: { select: { id: true, first_name: true, last_name: true } },
        },
      });

      if (!share) {
        throw new NotFoundException({
          code: REPORT_SHARE_ERROR_CODES.SHARE_NOT_FOUND,
          message: `Share with id "${request.shareId}" not found`,
        });
      }

      // Authorise: the user must be the sharer OR a participant in the
      // broadcast conversation. The sharer always has implicit access
      // (otherwise they wouldn't be able to re-download from the share
      // history page).
      const isSharer = share.shared_by === request.userId;
      let isParticipant = false;
      if (!isSharer && share.conversation_id) {
        const participant = await tx.conversationParticipant.findFirst({
          where: {
            tenant_id: request.tenantId,
            conversation_id: share.conversation_id,
            user_id: request.userId,
          },
          select: { id: true },
        });
        isParticipant = participant !== null;
      }

      if (!isSharer && !isParticipant) {
        throw new ForbiddenException({
          code: REPORT_SHARE_ERROR_CODES.SHARE_VIEW_FORBIDDEN,
          message: 'You do not have access to this share',
        });
      }

      const recipients = parseRecipientsJson(share.recipients_json);
      const artifactKeys = recipients.artifact_keys ?? {};

      const artifacts: SharedSnapshotArtifact[] = await Promise.all(
        (Object.keys(artifactKeys) as ReportShareArtifactFormat[]).map(async (format) => {
          const storageKey = artifactKeys[format];
          if (!storageKey) {
            // Defensive — shouldn't happen because Object.keys filters
            // out missing keys. Kept to satisfy noUncheckedIndexedAccess.
            return null;
          }
          const filename = safeExportFilename(share.saved_report.name, format);
          const downloadUrl = await this.snapshotStorage.getDownloadUrl(storageKey, filename);
          return { format, download_url: downloadUrl, filename };
        }),
      ).then((arr) => arr.filter((a): a is SharedSnapshotArtifact => a !== null));

      return {
        share_id: share.id,
        saved_report_id: share.saved_report.id,
        saved_report_name: share.saved_report.name,
        saved_report_description: null,
        shared_by_name: `${share.sharer.first_name} ${share.sharer.last_name}`.trim(),
        shared_at: share.shared_at.toISOString(),
        format: share.format,
        filters_summary: describeFiltersFromName(share.saved_report.name),
        message_body: share.message_body,
        artifacts,
        can_open_in_builder:
          request.permissions.includes(BUILDER_PERMISSION) && share.saved_report.is_shared,
      };
    }) as Promise<SharedSnapshotView>;
  }

  // ─── listSharesByReport ──────────────────────────────────────────────────

  async listSharesByReport(request: ListSharesRequest): Promise<ReportShareHistoryResponse> {
    const rls = createRlsClient(this.prisma, { tenant_id: request.tenantId });
    const skip = (request.page - 1) * request.pageSize;

    return rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;

      const [rows, total] = await Promise.all([
        tx.reportShareLog.findMany({
          where: {
            tenant_id: request.tenantId,
            saved_report_id: request.savedReportId,
          },
          orderBy: { shared_at: 'desc' },
          skip,
          take: request.pageSize,
          select: {
            id: true,
            shared_at: true,
            shared_by: true,
            format: true,
            conversation_id: true,
            recipients_json: true,
            message_body: true,
          },
        }),
        tx.reportShareLog.count({
          where: {
            tenant_id: request.tenantId,
            saved_report_id: request.savedReportId,
          },
        }),
      ]);

      // Resolve sharer names in one round-trip rather than N+1. The user
      // table is platform-level (no RLS), so the read facade — which uses
      // `prisma.user.findMany` under the hood — is safe to call here.
      const sharerIds = Array.from(new Set(rows.map((r) => r.shared_by)));
      const users = await this.authReadFacade.findUsersByIds(request.tenantId, sharerIds);
      const nameById = new Map(
        users.map((u) => [u.id, `${u.first_name} ${u.last_name}`.trim()] as const),
      );

      const data: ReportShareHistoryEntry[] = rows.map((r) => {
        const recipients = parseRecipientsJson(r.recipients_json);
        return {
          id: r.id,
          shared_at: r.shared_at.toISOString(),
          shared_by: r.shared_by,
          shared_by_name: nameById.get(r.shared_by) ?? 'Unknown',
          format: r.format,
          recipients_count:
            recipients.user_ids.length + recipients.role_keys.length,
          conversation_id: r.conversation_id,
          message_body: r.message_body,
        };
      });

      return {
        data,
        meta: { page: request.page, pageSize: request.pageSize, total },
      };
    }) as Promise<ReportShareHistoryResponse>;
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  private async resolveUserDisplayName(tenantId: string, userId: string): Promise<string> {
    const user = await this.authReadFacade.findUserSummary(tenantId, userId);
    if (!user) return 'Unknown user';
    return `${user.first_name} ${user.last_name}`.trim() || 'Unknown user';
  }
}

// ─── Pure helpers (exported for unit tests) ────────────────────────────────

/**
 * Translate the simple `{ user_ids, role_keys }` audience shape persisted
 * on share requests into the inbox's discriminated-union
 * `AudienceDefinition`. When both lists are non-empty the result is an
 * `or` node combining `handpicked` (user ids) and `staff_role` (roles).
 */
export function audienceFromShareInput(audience: ReportShareAudience): AudienceDefinition {
  const operands: AudienceDefinition[] = [];

  if (audience.user_ids.length > 0) {
    operands.push({ provider: 'handpicked', params: { user_ids: audience.user_ids } });
  }
  if (audience.role_keys.length > 0) {
    operands.push({ provider: 'staff_role', params: { roles: audience.role_keys } });
  }

  if (operands.length === 0) {
    // The Zod schema upstream guarantees at least one entry across the
    // two lists, but we handle the degenerate case defensively rather
    // than throw in the persistence layer.
    return { provider: 'handpicked', params: { user_ids: [] } };
  }
  if (operands.length === 1) {
    const onlyOperand = operands[0];
    if (!onlyOperand) {
      // Unreachable — narrowed above. Defensive for the type-checker
      // under noUncheckedIndexedAccess.
      return { provider: 'handpicked', params: { user_ids: [] } };
    }
    return onlyOperand;
  }
  return { operator: 'or', operands };
}

function expandFormat(format: ReportShareFormat): ReportShareArtifactFormat[] {
  if (format === 'all') return ['pdf', 'excel', 'word'];
  return [format];
}

function buildDefaultMessageBody(input: {
  sharerName: string;
  reportName: string;
  shareId: string;
}): string {
  return [
    `${input.sharerName} shared a report: ${input.reportName}`,
    '',
    `Open the snapshot: /reports/shared/${input.shareId}`,
  ].join('\n');
}

/**
 * Map the query-engine column descriptor (`{ id, label_key, type }` where
 * `type` is one of the broader query-engine field types) into the export
 * pipeline's tighter `ExportColumn` shape (`{ id, label, type }` with a
 * narrower union).
 *
 * The `label_key` is preserved as the column label until the polish
 * phase (impl 22) lands the i18n message catalogue. Falling back to the
 * key as the label keeps the export readable in the meantime.
 */
function mapToExportColumn(col: { id: string; label_key: string; type: string }): ExportColumn {
  const exportType: ExportColumnType = (() => {
    switch (col.type) {
      case 'number':
      case 'date':
      case 'boolean':
      case 'currency':
        return col.type;
      default:
        return 'string';
    }
  })();
  return { id: col.id, label: col.label_key, type: exportType };
}

interface RecipientsJsonShape {
  user_ids: string[];
  role_keys: string[];
  artifact_keys?: Partial<Record<ReportShareArtifactFormat, string>>;
}

function parseRecipientsJson(value: unknown): RecipientsJsonShape {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as {
      user_ids?: unknown;
      role_keys?: unknown;
      artifact_keys?: unknown;
    };
    const user_ids = Array.isArray(obj.user_ids)
      ? obj.user_ids.filter((v): v is string => typeof v === 'string')
      : [];
    const role_keys = Array.isArray(obj.role_keys)
      ? obj.role_keys.filter((v): v is string => typeof v === 'string')
      : [];
    const artifact_keys =
      obj.artifact_keys && typeof obj.artifact_keys === 'object' && !Array.isArray(obj.artifact_keys)
        ? coerceArtifactKeys(obj.artifact_keys as Record<string, unknown>)
        : undefined;
    return { user_ids, role_keys, artifact_keys };
  }
  return { user_ids: [], role_keys: [] };
}

function coerceArtifactKeys(
  raw: Record<string, unknown>,
): Partial<Record<ReportShareArtifactFormat, string>> {
  const out: Partial<Record<ReportShareArtifactFormat, string>> = {};
  for (const key of ['pdf', 'excel', 'word'] as const) {
    const candidate = raw[key];
    if (typeof candidate === 'string' && candidate.length > 0) {
      out[key] = candidate;
    }
  }
  return out;
}

/**
 * Build a plain-English description of the report's filter set for use
 * in the export's "Filters" header. The query-engine doesn't yet expose
 * a structured filter summary; until impl 22 polish, we surface the
 * report name as the filter context. Replaced in a later pass.
 */
function describeFilters(report: SavedReportRow): string {
  const filters = report.filters_json;
  if (
    filters &&
    typeof filters === 'object' &&
    !Array.isArray(filters) &&
    'combinator' in filters
  ) {
    const conditions = (filters as { conditions?: unknown[] }).conditions;
    if (Array.isArray(conditions) && conditions.length > 0) {
      return `${conditions.length} filter${conditions.length === 1 ? '' : 's'} applied`;
    }
  }
  return 'No filters applied';
}

function describeFiltersFromName(name: string): string {
  return `Snapshot of "${name}"`;
}
