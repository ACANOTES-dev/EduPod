import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../s3/s3.service';

export const BUDGETING_BOARD_PACK_RENDER_JOB = 'budgeting:board-pack-render';
const SIGNED_URL_TTL_SECONDS = 3600;

export interface ServeArtifactResult {
  status: 'rendered' | 'pending';
  signed_url?: string;
  job_id?: string;
}

/**
 * ExportsService — bridges API requests for board-pack PDF/Excel artefacts
 * to the worker that renders them. The flow:
 *
 *   1. UI hits GET /exports/pdf (or /exports/excel).
 *   2. Service checks the snapshot row's `pdf_object_key` /
 *      `excel_object_key`. If set, mints a 1-hour signed URL via
 *      `S3Service.getPresignedUrl`. Controller redirects to it.
 *   3. If not set, enqueues `budgeting:board-pack-render` and returns
 *      `{ status: 'pending', job_id }`. Controller responds 202; the UI
 *      polls again in a few seconds.
 *
 * `enqueueBoardPackRender` is also called explicitly by the
 * `POST /regenerate` endpoint, and by Phase 05's `SnapshotsService` on
 * publish (already wired). The double enqueue path keeps the contract:
 * the worker job is the one source of truth for "render this snapshot".
 */
@Injectable()
export class ExportsService {
  private readonly logger = new Logger(ExportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    @InjectQueue('budgeting') private readonly budgetingQueue: Queue,
  ) {}

  async serveSnapshotArtifact(
    tenantId: string,
    modelId: string,
    snapshotId: string,
    format: 'pdf' | 'excel',
  ): Promise<ServeArtifactResult> {
    const snapshot = await this.prisma.financialModelSnapshot.findFirst({
      where: { id: snapshotId, parent_model_id: modelId, tenant_id: tenantId },
      select: {
        id: true,
        pdf_object_key: true,
        excel_object_key: true,
        rendered_at: true,
      },
    });
    if (!snapshot) {
      throw new NotFoundException({
        code: 'SNAPSHOT_NOT_FOUND',
        message: `Snapshot "${snapshotId}" not found on model "${modelId}".`,
      });
    }
    const key = format === 'pdf' ? snapshot.pdf_object_key : snapshot.excel_object_key;
    if (!key) {
      const job_id = await this.enqueueBoardPackRender(tenantId, modelId, snapshotId, format);
      return { status: 'pending', job_id };
    }
    const signed_url = await this.s3Service.getPresignedUrl(key, SIGNED_URL_TTL_SECONDS, {
      downloadFilename: format === 'pdf' ? 'board-pack.pdf' : 'board-pack.xlsx',
    });
    return { status: 'rendered', signed_url };
  }

  async enqueueBoardPackRender(
    tenantId: string,
    modelId: string,
    snapshotId: string,
    format: 'pdf' | 'excel' | 'all',
  ): Promise<string> {
    // Verify the snapshot lives in this tenant before enqueueing — the
    // worker re-checks RLS, but a verified enqueue produces a useful
    // 404 rather than a silent no-op log.
    const exists = await this.prisma.financialModelSnapshot.findFirst({
      where: { id: snapshotId, parent_model_id: modelId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException({
        code: 'SNAPSHOT_NOT_FOUND',
        message: `Snapshot "${snapshotId}" not found on model "${modelId}".`,
      });
    }
    const job = await this.budgetingQueue.add(
      BUDGETING_BOARD_PACK_RENDER_JOB,
      {
        tenant_id: tenantId,
        snapshot_id: snapshotId,
        format,
      },
      {
        removeOnComplete: 50,
        removeOnFail: 200,
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );
    return String(job.id ?? '');
  }
}
