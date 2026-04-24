import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { Job } from 'bullmq';
import { Resend } from 'resend';

import { uploadToS3 } from '../../base/s3.helpers';
import { TenantAwareJob, type TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Job name ────────────────────────────────────────────────────────────────

/**
 * Per-report delivery job. Fanned out by `ScheduledReportsTickProcessor` for
 * every scheduled report whose cron expression has fired since `last_sent_at`.
 *
 * Payload always carries `tenant_id` so the `TenantAwareJob` base sets
 * `app.current_tenant_id` before any DB work — every read inside the
 * delivery transaction is RLS-scoped.
 */
export const REPORTS_SCHEDULED_DELIVER_JOB = 'reports:scheduled-deliver';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface ScheduledReportsDeliverPayload extends TenantJobPayload {
  scheduled_report_id: string;
}

// ─── Concurrent-run guard window ─────────────────────────────────────────────

/**
 * If a previous run is still `running` and started within this window, we
 * assume the worker restarted mid-flight and skip the duplicate. Outside
 * the window the previous run is treated as orphaned and a fresh run is
 * started; the orphan stays as `running` until the cleanup path (impl 17 UI
 * or a future stale-run reaper) marks it failed.
 */
const RUNNING_RUN_GUARD_MS = 10 * 60 * 1000;

// ─── Supported export formats ────────────────────────────────────────────────

/**
 * The `scheduled_reports.format` column is a free `VARCHAR(10)`; the
 * `createScheduledReportSchema` Zod enum currently allows `'pdf' | 'csv' |
 * 'xlsx'`. The worker emits CSV in all three formats for impl 08 — full
 * format-aware rendering ships via the export-pipeline integration in impl
 * 13. The artifact mime + extension still tracks the requested format so
 * downstream UI/UX is correct.
 */
type DeliverableFormat = 'pdf' | 'csv' | 'xlsx';

interface FormatDescriptor {
  extension: string;
  contentType: string;
  filenameLabel: string;
}

const FORMAT_DESCRIPTORS: Record<DeliverableFormat, FormatDescriptor> = {
  pdf: {
    extension: 'pdf',
    contentType: 'application/pdf',
    filenameLabel: 'pdf',
  },
  csv: {
    extension: 'csv',
    contentType: 'text/csv; charset=utf-8',
    filenameLabel: 'csv',
  },
  xlsx: {
    extension: 'xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filenameLabel: 'excel',
  },
};

// ─── Processor ───────────────────────────────────────────────────────────────

@Injectable()
export class ScheduledReportsDeliverProcessor {
  private readonly logger = new Logger(ScheduledReportsDeliverProcessor.name);

  /** Lazily-initialised — Resend isn't available in test/CI environments. */
  private resendClient: Resend | null = null;

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly configService: ConfigService,
  ) {}

  async process(job: Job<ScheduledReportsDeliverPayload>): Promise<void> {
    if (job.name !== REPORTS_SCHEDULED_DELIVER_JOB) return;

    const { tenant_id, scheduled_report_id } = job.data;
    if (!tenant_id) {
      throw new Error(
        'Job rejected: missing tenant_id in reports:scheduled-deliver payload.',
      );
    }
    if (!scheduled_report_id) {
      throw new Error(
        'Job rejected: missing scheduled_report_id in reports:scheduled-deliver payload.',
      );
    }

    this.logger.log(
      `Processing ${REPORTS_SCHEDULED_DELIVER_JOB} — tenant=${tenant_id} scheduled=${scheduled_report_id}`,
    );

    const work = new ScheduledReportsDeliverWork(
      this.prisma,
      this.configService,
      this.getResendClient.bind(this),
    );
    await work.execute(job.data);
  }

  private getResendClient(): Resend {
    if (this.resendClient) return this.resendClient;
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error('Resend is not configured. Set RESEND_API_KEY environment variable.');
    }
    this.resendClient = new Resend(apiKey);
    return this.resendClient;
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

export class ScheduledReportsDeliverWork extends TenantAwareJob<ScheduledReportsDeliverPayload> {
  private readonly logger = new Logger(ScheduledReportsDeliverWork.name);

  constructor(
    prisma: PrismaClient,
    private readonly configService: ConfigService,
    private readonly getResend: () => Resend,
  ) {
    super(prisma);
  }

  /**
   * Override execute() so the artifact upload + email send happen OUTSIDE
   * the RLS transaction. This is the same pattern as
   * `DispatchNotificationsProcessor`: external HTTP calls (S3, Resend) must
   * not hold a PgBouncer connection through the round-trip.
   *
   * Phase 1 (inside RLS transaction):
   *   - Idempotency check
   *   - Create the run row
   *   - Load the scheduled report + (optional) saved report
   *   - Build the artifact buffer (Prisma reads only, no external IO)
   *
   * Phase 2 (outside transaction):
   *   - Upload artifact to S3
   *   - Send email via Resend
   *
   * Phase 3 (inside RLS transaction):
   *   - Mark run succeeded / partial / failed
   *   - Update `scheduled_reports.last_sent_at`
   */
  override async execute(data: ScheduledReportsDeliverPayload): Promise<void> {
    if (!data.tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    // ─── Phase 1: read inside RLS tx ─────────────────────────────────────
    let prepared: PreparedDelivery | SkippedDelivery;
    try {
      prepared = await this.runInRlsTx(data, async (tx) => this.preparePhase(data, tx));
    } catch (err) {
      this.logger.error(
        `Phase 1 failed for tenant=${data.tenant_id} scheduled=${data.scheduled_report_id}: ${(err as Error).message}`,
      );
      throw err;
    }

    if (prepared.kind === 'skipped') {
      this.logger.log(
        `Skipping deliver — ${prepared.reason} (tenant=${data.tenant_id} scheduled=${data.scheduled_report_id})`,
      );
      return;
    }

    // ─── Phase 2: external IO outside tx ─────────────────────────────────
    const deliveryOutcome = await this.deliveryPhase(prepared);

    // ─── Phase 3: finalise inside RLS tx ─────────────────────────────────
    await this.runInRlsTx(data, async (tx) => {
      await this.finalisePhase(tx, prepared, deliveryOutcome);
    });
  }

  // TenantAwareJob requires the abstract — but our work runs in execute().
  protected async processJob(): Promise<void> {
    /* no-op — see execute() override */
  }

  // ─── Phase 1: prepare ────────────────────────────────────────────────────

  private async preparePhase(
    data: ScheduledReportsDeliverPayload,
    tx: PrismaClient,
  ): Promise<PreparedDelivery | SkippedDelivery> {
    const { tenant_id, scheduled_report_id } = data;

    // Idempotency: if a previous run is still 'running' and started recently,
    // assume the worker restarted and skip.
    const recent = await tx.scheduledReportRun.findFirst({
      where: {
        tenant_id,
        scheduled_report_id,
        status: 'running',
        started_at: { gte: new Date(Date.now() - RUNNING_RUN_GUARD_MS) },
      },
      orderBy: { started_at: 'desc' },
      select: { id: true },
    });
    if (recent) {
      return {
        kind: 'skipped',
        reason: `another run (${recent.id}) is still running within the ${RUNNING_RUN_GUARD_MS / 1000}s guard window`,
      };
    }

    const scheduledReport = await tx.scheduledReport.findFirst({
      where: { id: scheduled_report_id, tenant_id },
    });
    if (!scheduledReport) {
      return {
        kind: 'skipped',
        reason: `scheduled_report ${scheduled_report_id} not found for tenant ${tenant_id}`,
      };
    }

    // Pull the optional saved-report reference from `parameters_json`. We
    // accept BOTH shapes:
    //   - new: { saved_report_id: '<uuid>' }
    //   - legacy: any prior shape (e.g. {}, or report-type-specific keys).
    // Saved reports drive the "real" content (deferred to impl 13's full
    // pipeline); legacy rows still emit a deliverable artifact with the
    // scheduled-report metadata so the schedule continues to fire.
    const params = scheduledReport.parameters_json as
      | { saved_report_id?: unknown }
      | null
      | undefined;
    const savedReportId =
      params && typeof params.saved_report_id === 'string' ? params.saved_report_id : null;

    let savedReport: { id: string; name: string; data_source: string } | null = null;
    if (savedReportId) {
      const found = await tx.savedReport.findFirst({
        where: { id: savedReportId, tenant_id },
        select: { id: true, name: true, data_source: true },
      });
      savedReport = found ?? null;
    }

    const tenant = await tx.tenant.findFirst({
      where: { id: tenant_id },
      select: { name: true, default_locale: true },
    });

    const recipientEmails = parseRecipientEmails(scheduledReport.recipient_emails);
    const format = normaliseFormat(scheduledReport.format);

    const run = await tx.scheduledReportRun.create({
      data: {
        tenant_id,
        scheduled_report_id,
        status: 'running',
      },
    });

    const generatedAt = new Date();
    const reportName = scheduledReport.name;
    const tenantName = tenant?.name ?? 'EduPod';

    const csvBody = renderArtifactCsv({
      reportName,
      tenantName,
      generatedAt,
      schedule_cron: scheduledReport.schedule_cron,
      report_type: scheduledReport.report_type,
      saved_report: savedReport,
      recipient_count: recipientEmails.length,
    });

    const artifact = Buffer.from(csvBody, 'utf-8');

    return {
      kind: 'prepared',
      run_id: run.id,
      tenant_id,
      tenant_name: tenantName,
      scheduled_report_id,
      report_name: reportName,
      format,
      recipient_emails: recipientEmails,
      generated_at: generatedAt,
      artifact,
      row_count: 1,
    };
  }

  // ─── Phase 2: deliver outside tx ─────────────────────────────────────────

  private async deliveryPhase(prepared: PreparedDelivery): Promise<DeliveryOutcome> {
    const objectKey = buildObjectKey(prepared);

    let uploadError: string | null = null;
    try {
      await uploadToS3(
        objectKey,
        prepared.artifact.toString('utf-8'),
        FORMAT_DESCRIPTORS[prepared.format].contentType,
      );
    } catch (err) {
      uploadError = (err as Error).message;
      this.logger.error(
        `S3 upload failed for run=${prepared.run_id}: ${uploadError}`,
      );
    }

    const deliveredVia: string[] = [];
    let deliveryError: string | null = null;

    if (prepared.recipient_emails.length === 0) {
      deliveryError = 'no recipient emails configured';
    } else {
      try {
        await this.sendEmail(prepared);
        deliveredVia.push('email');
      } catch (err) {
        deliveryError = `email dispatch failed: ${(err as Error).message}`;
        this.logger.error(
          `Email dispatch failed for run=${prepared.run_id}: ${deliveryError}`,
        );
      }
    }

    return {
      object_key: uploadError ? null : objectKey,
      delivered_via: deliveredVia,
      // Per spec §4: "Delivery failures do NOT fail the whole job — log them
      // in the run row's `error_message` but still mark the run `succeeded`
      // with partial delivery." Upload failures flow through the same path.
      error_message: [uploadError, deliveryError].filter(Boolean).join(' | ') || null,
    };
  }

  private async sendEmail(prepared: PreparedDelivery): Promise<void> {
    const resend = this.getResend();
    const fromEmail =
      this.configService.get<string>('RESEND_FROM_EMAIL') ?? 'noreply@edupod.app';

    const filename = buildFilename(prepared);
    const subject = `[${prepared.tenant_name}] Scheduled report: ${prepared.report_name}`;
    const generatedDisplay = prepared.generated_at.toUTCString();
    const html = `<p>Your scheduled report <strong>${escapeHtml(prepared.report_name)}</strong> ran at ${escapeHtml(generatedDisplay)} UTC.</p>
<p>The export is attached as <code>${escapeHtml(filename)}</code>.</p>
<p>Open the EduPod dashboard for live data and to manage delivery preferences.</p>`;

    const { error } = await resend.emails.send({
      from: fromEmail,
      to: prepared.recipient_emails,
      subject,
      html,
      attachments: [
        {
          filename,
          content: prepared.artifact,
        },
      ],
    });
    if (error) {
      throw new Error(`Resend rejected email: ${error.message}`);
    }
  }

  // ─── Phase 3: finalise inside tx ─────────────────────────────────────────

  private async finalisePhase(
    tx: PrismaClient,
    prepared: PreparedDelivery,
    outcome: DeliveryOutcome,
  ): Promise<void> {
    await tx.scheduledReportRun.update({
      where: { id: prepared.run_id },
      data: {
        status: 'succeeded',
        finished_at: new Date(),
        row_count: prepared.row_count,
        artifact_object_key: outcome.object_key,
        delivered_via: outcome.delivered_via,
        error_message: outcome.error_message,
      },
    });

    await tx.scheduledReport.update({
      where: { id: prepared.scheduled_report_id },
      data: { last_sent_at: prepared.generated_at },
    });
  }

  // ─── RLS transaction helper ──────────────────────────────────────────────

  private async runInRlsTx<T>(
    data: ScheduledReportsDeliverPayload,
    work: (tx: PrismaClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${data.tenant_id}::text, true)`;
        const userId = data.user_id || '00000000-0000-0000-0000-000000000000';
        await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}::text, true)`;
        return work(tx as unknown as PrismaClient);
      },
      {
        maxWait: 30_000,
        timeout: this.transactionTimeoutMs,
      },
    );
  }
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

interface PreparedDelivery {
  kind: 'prepared';
  run_id: string;
  tenant_id: string;
  tenant_name: string;
  scheduled_report_id: string;
  report_name: string;
  format: DeliverableFormat;
  recipient_emails: string[];
  generated_at: Date;
  artifact: Buffer;
  row_count: number;
}

interface SkippedDelivery {
  kind: 'skipped';
  reason: string;
}

interface DeliveryOutcome {
  object_key: string | null;
  delivered_via: string[];
  error_message: string | null;
}

function parseRecipientEmails(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function normaliseFormat(raw: string): DeliverableFormat {
  const lower = raw.toLowerCase();
  if (lower === 'pdf' || lower === 'csv' || lower === 'xlsx') return lower;
  // `excel` is the canonical name for the new export pipeline; the legacy
  // CRUD schema uses `xlsx`. Accept both for forward-compat.
  if (lower === 'excel') return 'xlsx';
  // Anything else falls back to CSV — the safest universal artifact.
  return 'csv';
}

function buildObjectKey(prepared: PreparedDelivery): string {
  const ext = FORMAT_DESCRIPTORS[prepared.format].extension;
  return `scheduled-reports/${prepared.tenant_id}/${prepared.run_id}.${ext}`;
}

function buildFilename(prepared: PreparedDelivery): string {
  const safe =
    prepared.report_name
      .replace(/[^a-zA-Z0-9-_ ]/g, '')
      .replace(/\s+/g, '_')
      .toLowerCase()
      .slice(0, 80) || 'scheduled_report';
  const dateStamp = prepared.generated_at.toISOString().slice(0, 10);
  const ext = FORMAT_DESCRIPTORS[prepared.format].extension;
  return `${safe}_${dateStamp}.${ext}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface ArtifactInput {
  reportName: string;
  tenantName: string;
  generatedAt: Date;
  schedule_cron: string;
  report_type: string;
  saved_report: { id: string; name: string; data_source: string } | null;
  recipient_count: number;
}

/**
 * Renders the scheduled-report artifact body. This is intentionally a CSV
 * "summary card" for impl 08 — the full multi-format renderer (PDF / Excel /
 * Word with branded headers, charts, and live data) is the responsibility of
 * impl 13 (Sharing) which factors out the existing API-side
 * `ReportExportService` so both the share button and the scheduled worker
 * can reuse it. Until then this body provides the schedule's recipients
 * with a verifiable artifact proving the schedule is firing.
 */
export function renderArtifactCsv(input: ArtifactInput): string {
  const lines: string[] = [];
  lines.push('Field,Value');
  lines.push(`Tenant,${escapeCsv(input.tenantName)}`);
  lines.push(`Report,${escapeCsv(input.reportName)}`);
  lines.push(`Generated At (UTC),${escapeCsv(input.generatedAt.toISOString())}`);
  lines.push(`Schedule (cron),${escapeCsv(input.schedule_cron)}`);
  lines.push(`Report Type,${escapeCsv(input.report_type)}`);
  if (input.saved_report) {
    lines.push(`Saved Report,${escapeCsv(input.saved_report.name)}`);
    lines.push(`Saved Report Subject,${escapeCsv(input.saved_report.data_source)}`);
    lines.push(`Saved Report ID,${escapeCsv(input.saved_report.id)}`);
  } else {
    lines.push(
      'Saved Report,Pending — link a saved report via parameters_json.saved_report_id to render live data.',
    );
  }
  lines.push(`Recipient Count,${input.recipient_count}`);
  lines.push('');
  lines.push('# Note: full multi-format rendering with live query data lands with impl 13.');
  return lines.join('\r\n');
}

function escapeCsv(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
