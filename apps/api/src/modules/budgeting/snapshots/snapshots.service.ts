import { InjectQueue } from '@nestjs/bullmq';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';

import {
  snapshotPayloadSchema,
  type FinancialModelLineItemCategory,
  type SnapshotPayload,
} from '@school/shared/budgeting';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../s3/s3.service';
import { ScenariosService, type ScenarioRow } from '../scenarios/scenarios.service';

import type { ListSnapshotsQueryDto } from './dto/list-snapshots.dto';
import type { PublishSnapshotDto } from './dto/publish-snapshot.dto';
import {
  buildSnapshotPayload,
  formatUserName,
  toSummary,
  type LineItemRow,
  type ModelRow,
  type SnapshotRow,
  type SnapshotSummary,
  type SnapshotWithSignedUrls,
} from './snapshots.types';

/**
 * SnapshotsService — publish / version / restore for
 * `financial_model_snapshots`.
 *
 * Publishing a model serialises the FULL state at publish time
 * (drivers, all scenarios with merged drivers, every current line
 * item, totals, per-pupil economics, source snapshot, executive
 * summary) into a single immutable `payload` JSONB row, increments the
 * `version_number`, and updates the parent model's
 * `current_snapshot_id` pointer.
 *
 * After persisting, enqueues `budgeting:board-pack-render` on the
 * `budgeting` queue so Phase 09's worker processor can render the PDF
 * and Excel artefacts. The processor updates the snapshot row's
 * object-key columns asynchronously; this service only reads them when
 * generating signed URLs.
 *
 * Restore duplicates an old snapshot's drivers + line items into a new
 * draft state on the parent model. The original snapshot stays in
 * history; the user can publish fresh from the restored state.
 */

const SIGNED_URL_TTL_SECONDS = 3600;

@Injectable()
export class SnapshotsService {
  private readonly logger = new Logger(SnapshotsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scenariosService: ScenariosService,
    private readonly s3Service: S3Service,
    @InjectQueue('budgeting') private readonly budgetingQueue: Queue,
  ) {}

  // ─── findAll ───────────────────────────────────────────────────────────

  async findAll(
    tenantId: string,
    parentModelId: string,
    query: ListSnapshotsQueryDto,
  ): Promise<{
    data: SnapshotSummary[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    await this.assertParentModelExists(tenantId, parentModelId);

    const { page, pageSize } = query;
    const skip = (page - 1) * pageSize;
    const where: Prisma.FinancialModelSnapshotWhereInput = {
      tenant_id: tenantId,
      parent_model_id: parentModelId,
    };

    const [rows, total] = await Promise.all([
      this.prisma.financialModelSnapshot.findMany({
        where,
        select: {
          id: true,
          parent_model_id: true,
          version_number: true,
          executive_summary: true,
          published_at: true,
          published_by: true,
          pdf_object_key: true,
          excel_object_key: true,
          rendered_at: true,
        },
        orderBy: { published_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.financialModelSnapshot.count({ where }),
    ]);

    return {
      data: rows.map((row) => toSummary(row)),
      meta: { page, pageSize, total },
    };
  }

  // ─── findOne ───────────────────────────────────────────────────────────

  async findOne(
    tenantId: string,
    parentModelId: string,
    snapshotId: string,
  ): Promise<SnapshotWithSignedUrls> {
    await this.assertParentModelExists(tenantId, parentModelId);
    const row = await this.prisma.financialModelSnapshot.findFirst({
      where: { id: snapshotId, tenant_id: tenantId, parent_model_id: parentModelId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'SNAPSHOT_NOT_FOUND',
        message: `Snapshot "${snapshotId}" not found for financial model "${parentModelId}"`,
      });
    }
    return this.toWithSignedUrls(row as SnapshotRow);
  }

  // ─── publish ───────────────────────────────────────────────────────────

  async publish(
    tenantId: string,
    userId: string,
    parentModelId: string,
    dto: PublishSnapshotDto,
  ): Promise<SnapshotWithSignedUrls> {
    const parent = await this.assertParentModelExists(tenantId, parentModelId);
    if (parent.status === 'archived') {
      throw new ConflictException({
        code: 'CANNOT_PUBLISH_ARCHIVED_MODEL',
        message: `Financial model "${parentModelId}" is archived and cannot be published. Restore it first.`,
      });
    }

    const persisted = await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;

      const baseLineItems = (await txdb.financialModelLineItem.findMany({
        where: { tenant_id: tenantId, parent_model_id: parentModelId, scenario_id: null },
        orderBy: [{ fiscal_year: 'asc' }, { category: 'asc' }, { subcategory: 'asc' }],
      })) as LineItemRow[];

      const scenarios = (await txdb.scenario.findMany({
        where: { tenant_id: tenantId, parent_model_id: parentModelId },
        orderBy: { position: 'asc' },
      })) as ScenarioRow[];

      const publishingUser = await txdb.user.findFirst({
        where: { id: userId },
        select: { id: true, first_name: true, last_name: true },
      });

      const lastSnapshot = await txdb.financialModelSnapshot.findFirst({
        where: { tenant_id: tenantId, parent_model_id: parentModelId },
        orderBy: { version_number: 'desc' },
        select: { version_number: true },
      });
      const nextVersion = (lastSnapshot?.version_number ?? 0) + 1;

      const payload = buildSnapshotPayload({
        parent,
        baseLineItems,
        scenarios,
        scenariosService: this.scenariosService,
        executiveSummary: dto.executive_summary,
        publishedBy: {
          user_id: userId,
          name: publishingUser
            ? formatUserName(publishingUser.first_name, publishingUser.last_name)
            : null,
        },
      });

      // Validate the assembled payload before insert. A malformed payload
      // is a 500 (engineering bug), not a silent corruption.
      snapshotPayloadSchema.parse(payload);

      const created = await txdb.financialModelSnapshot.create({
        data: {
          tenant_id: tenantId,
          parent_model_id: parentModelId,
          version_number: nextVersion,
          payload: payload as unknown as Prisma.InputJsonValue,
          executive_summary: dto.executive_summary,
          published_by: userId,
        },
      });

      await txdb.financialModel.update({
        where: { id: parentModelId },
        data: {
          current_snapshot_id: created.id,
          // Draft → published on the first publish; subsequent publishes
          // leave the status as-is (per modeling/PLAN.md §7.1).
          ...(parent.status === 'draft' && { status: 'published' as const }),
        },
      });

      return created as SnapshotRow;
    });

    // Enqueue post-commit so a publish failure doesn't leave a phantom
    // job in the queue. Failures here are logged but don't roll back —
    // the snapshot row is the authoritative record; render artefacts
    // can be regenerated by re-enqueueing the job.
    try {
      await this.budgetingQueue.add(
        'budgeting:board-pack-render',
        {
          tenant_id: tenantId,
          snapshot_id: persisted.id,
          format: 'all',
        },
        { removeOnComplete: 10, removeOnFail: 50 },
      );
      this.logger.log(
        `Snapshot ${persisted.id} (v${persisted.version_number}) published; render job enqueued`,
      );
    } catch (err) {
      this.logger.error(
        `Snapshot ${persisted.id} published but render enqueue failed`,
        err instanceof Error ? err.stack : String(err),
      );
    }

    return this.toWithSignedUrls(persisted);
  }

  // ─── restore ───────────────────────────────────────────────────────────

  async restore(
    tenantId: string,
    userId: string,
    parentModelId: string,
    snapshotId: string,
  ): Promise<{ id: string; status: 'draft' }> {
    await this.assertParentModelExists(tenantId, parentModelId);
    const snapshot = await this.prisma.financialModelSnapshot.findFirst({
      where: { id: snapshotId, tenant_id: tenantId, parent_model_id: parentModelId },
    });
    if (!snapshot) {
      throw new NotFoundException({
        code: 'SNAPSHOT_NOT_FOUND',
        message: `Snapshot "${snapshotId}" not found for financial model "${parentModelId}"`,
      });
    }

    const payload = snapshotPayloadSchema.parse(snapshot.payload);

    await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;

      // Reset the parent model's editable state to the snapshot's
      // captured drivers / horizon / source. We deliberately preserve
      // `current_snapshot_id` — that pointer continues to reference
      // whichever was the latest published version.
      await txdb.financialModel.update({
        where: { id: parentModelId },
        data: {
          drivers: payload.model.drivers as unknown as Prisma.InputJsonValue,
          horizon_years: payload.model.horizon_years,
          source_snapshot_json: payload.source_snapshot as unknown as Prisma.InputJsonValue,
          status: 'draft',
        },
      });

      // Replace base-case line items with the snapshot's recorded set.
      await txdb.financialModelLineItem.deleteMany({
        where: { tenant_id: tenantId, parent_model_id: parentModelId, scenario_id: null },
      });
      if (payload.base_case.line_items.length > 0) {
        await txdb.financialModelLineItem.createMany({
          data: payload.base_case.line_items.map((li) => ({
            tenant_id: tenantId,
            parent_model_id: parentModelId,
            scenario_id: null,
            category: li.category as FinancialModelLineItemCategory,
            subcategory: li.subcategory,
            name: li.name,
            fiscal_year: li.fiscal_year,
            source: li.source,
            amount: li.amount,
            is_locked: li.is_locked,
            notes: li.notes,
            references_event_budget_id: li.references_event_budget_id,
          })),
        });
      }

      // Replace scenarios. Their line items live as
      // `(parent_model_id, scenario_id IS NOT NULL)` — the scenario
      // delete cascades them via the FK. We then re-create scenarios
      // from the payload (line items inside scenarios are NOT
      // recorded; the engine recomputes them on demand).
      await txdb.scenario.deleteMany({
        where: { tenant_id: tenantId, parent_model_id: parentModelId },
      });
      for (const scenario of payload.scenarios) {
        await txdb.scenario.create({
          data: {
            tenant_id: tenantId,
            parent_model_id: parentModelId,
            name: scenario.name,
            position: scenario.position,
            driver_overrides: scenario.driver_overrides as unknown as Prisma.InputJsonValue,
            notes: scenario.notes,
          },
        });
      }
    });

    return { id: parentModelId, status: 'draft' };
  }

  // ─── Internal helpers ──────────────────────────────────────────────────

  private async assertParentModelExists(
    tenantId: string,
    parentModelId: string,
  ): Promise<ModelRow> {
    const parent = await this.prisma.financialModel.findFirst({
      where: { id: parentModelId, tenant_id: tenantId },
    });
    if (!parent) {
      throw new NotFoundException({
        code: 'FINANCIAL_MODEL_NOT_FOUND',
        message: `Financial model with id "${parentModelId}" not found`,
      });
    }
    return parent as ModelRow;
  }

  private async toWithSignedUrls(row: SnapshotRow): Promise<SnapshotWithSignedUrls> {
    const summary = toSummary(row);
    const [pdfUrl, excelUrl] = await Promise.all([
      this.signObjectKey(row.pdf_object_key),
      this.signObjectKey(row.excel_object_key),
    ]);
    return {
      ...summary,
      payload: row.payload as unknown as SnapshotPayload,
      pdf_signed_url: pdfUrl,
      excel_signed_url: excelUrl,
    };
  }

  private async signObjectKey(key: string | null): Promise<string | null> {
    if (!key) return null;
    try {
      return await this.s3Service.getPresignedUrl(key, SIGNED_URL_TTL_SECONDS);
    } catch (err) {
      // S3 signing failure should not break the snapshot read — the
      // user can re-fetch and retry. Log and return null so the UI
      // shows "Render not available yet" instead of a 500.
      this.logger.error(
        `Failed to presign object key "${key}"`,
        err instanceof Error ? err.stack : String(err),
      );
      return null;
    }
  }
}
