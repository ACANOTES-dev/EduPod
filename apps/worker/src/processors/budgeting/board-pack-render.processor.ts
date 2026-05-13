import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import type { SnapshotPayload } from '@school/shared/budgeting';

// Renderers + S3 are imported via relative path from the API workspace.
// Turborepo's symlinked node_modules resolves cross-app imports cleanly
// during build, and adding the same dep twice (puppeteer, exceljs) to
// the worker would duplicate the chromium binary on the deploy server.
// See modeling/implementations/09-export-pipeline.md §10 — "shortcut path".
import { TenantModuleService } from '../../../../api/src/common/services/tenant-module.service';
import { ExcelRendererService } from '../../../../api/src/modules/budgeting/exports/excel-renderer.service';
import { PdfRendererService } from '../../../../api/src/modules/budgeting/exports/pdf-renderer.service';
import { S3Service } from '../../../../api/src/modules/s3/s3.service';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Job name + payload ───────────────────────────────────────────────────────

export const BUDGETING_BOARD_PACK_RENDER_JOB = 'budgeting:board-pack-render';

export interface BoardPackRenderPayload extends TenantJobPayload {
  snapshot_id: string;
  format: 'pdf' | 'excel' | 'all';
}

// ─── Processor (queue boundary, delegates to TenantAwareJob) ──────────────────

@Injectable()
export class BoardPackRenderProcessor {
  private readonly logger = new Logger(BoardPackRenderProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @Inject(S3Service) private readonly s3: S3Service,
    private readonly tenantModuleService: TenantModuleService,
  ) {}

  async process(job: Job<BoardPackRenderPayload>): Promise<void> {
    if (job.name !== BUDGETING_BOARD_PACK_RENDER_JOB) return;
    const { tenant_id, snapshot_id, format } = job.data;
    if (!tenant_id) {
      this.logger.warn(`${BUDGETING_BOARD_PACK_RENDER_JOB} rejected — missing tenant_id`);
      return;
    }
    if (!snapshot_id || !format) {
      this.logger.warn(
        `${BUDGETING_BOARD_PACK_RENDER_JOB} rejected — missing snapshot_id or format`,
      );
      return;
    }
    const enabled = await this.tenantModuleService.isEnabled(tenant_id, 'budgeting');
    if (!enabled) {
      this.logger.debug(
        `${BUDGETING_BOARD_PACK_RENDER_JOB} skipped — budgeting disabled for tenant ${tenant_id}`,
      );
      return;
    }
    const renderJob = new BoardPackRenderJob(this.prisma, this.s3);
    await renderJob.execute({ tenant_id, snapshot_id, format });
  }
}

// ─── TenantAwareJob — RLS-bound execution + render + upload + persist ────────

class BoardPackRenderJob extends TenantAwareJob<BoardPackRenderPayload> {
  private readonly logger = new Logger(BoardPackRenderJob.name);
  private readonly pdfRenderer = new PdfRendererService();
  private readonly excelRenderer = new ExcelRendererService();

  constructor(
    prisma: PrismaClient,
    private readonly s3: S3Service,
  ) {
    super(prisma);
  }

  protected async processJob(data: BoardPackRenderPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, snapshot_id, format } = data;

    const snapshot = await tx.financialModelSnapshot.findFirst({
      where: { id: snapshot_id, tenant_id },
      include: {
        tenant: { select: { name: true, currency_code: true } },
        publisher: { select: { first_name: true, last_name: true, email: true } },
        parent_model: {
          select: { name: true, fiscal_year_start: true, fiscal_year_end: true },
        },
      },
    });
    if (!snapshot) {
      this.logger.warn(
        `Snapshot ${snapshot_id} not found in tenant ${tenant_id} — board-pack render skipped`,
      );
      return;
    }

    const fyLabel = formatFy(
      snapshot.parent_model.fiscal_year_start,
      snapshot.parent_model.fiscal_year_end,
    );

    const baseInput = {
      tenant_name: snapshot.tenant.name,
      currency_code: snapshot.tenant.currency_code,
      model_name: snapshot.parent_model.name,
      version_number: snapshot.version_number,
      published_at: snapshot.published_at.toISOString(),
      fiscal_year_label: fyLabel,
      payload: snapshot.payload as unknown as SnapshotPayload,
    };

    const update: {
      pdf_object_key?: string;
      excel_object_key?: string;
      rendered_at: Date;
    } = {
      rendered_at: new Date(),
    };

    if (format === 'pdf' || format === 'all') {
      const pdfBuf = await this.pdfRenderer.renderBoardPackPdf({
        ...baseInput,
        executive_summary: snapshot.executive_summary ?? null,
        published_by_name: formatPublisher(snapshot.publisher) ?? snapshot.publisher.email,
      });
      const objectKey = `budgeting/snapshots/${snapshot_id}/board-pack-v${snapshot.version_number}.pdf`;
      const fullKey = await this.s3.upload(tenant_id, objectKey, pdfBuf, 'application/pdf');
      update.pdf_object_key = fullKey;
      this.logger.log(`Uploaded PDF for snapshot ${snapshot_id} → ${fullKey}`);
    }

    if (format === 'excel' || format === 'all') {
      const xlsBuf = await this.excelRenderer.renderBoardPackExcel(baseInput);
      const objectKey = `budgeting/snapshots/${snapshot_id}/board-pack-v${snapshot.version_number}.xlsx`;
      const fullKey = await this.s3.upload(
        tenant_id,
        objectKey,
        xlsBuf,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      update.excel_object_key = fullKey;
      this.logger.log(`Uploaded Excel for snapshot ${snapshot_id} → ${fullKey}`);
    }

    await tx.financialModelSnapshot.update({
      where: { id: snapshot_id },
      data: update,
    });
  }
}

function formatPublisher(
  publisher: { first_name: string; last_name: string; email: string } | null,
): string | null {
  if (!publisher) return null;
  const name = `${publisher.first_name} ${publisher.last_name}`.trim();
  return name || null;
}

function formatFy(start: Date, end: Date): string {
  const sy = start.getUTCFullYear();
  const ey = end.getUTCFullYear();
  return sy === ey ? String(sy) : `${sy}/${String(ey).slice(2)}`;
}
