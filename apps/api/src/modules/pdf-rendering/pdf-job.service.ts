import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';

// ─── Job name constant ──────────────────────────────────────────────────────

export const PDF_RENDER_JOB = 'pdf:render';

// ─── Payload types ──────────────────────────────────────────────────────────

export interface PdfRenderJobPayload {
  tenant_id: string;
  /** The pre-rendered HTML to convert to PDF */
  template_html: string;
  /** S3 key where the rendered PDF will be stored */
  output_key: string;
  /** Optional job name to enqueue after PDF is ready */
  callback_job_name?: string;
  /** Optional queue name for the callback job (defaults to same queue) */
  callback_queue_name?: string;
  /** Optional payload for the callback job */
  callback_payload?: Record<string, unknown>;
}

export interface PdfRenderJobResult {
  /** The BullMQ job ID for tracking */
  job_id: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

/**
 * Queue-based PDF rendering dispatch service.
 *
 * Modules should use this service to enqueue PDF rendering jobs instead of
 * calling PdfRenderingService.renderFromHtml() synchronously in the API process.
 * This moves Puppeteer execution to the worker, avoiding heavy CPU/memory usage
 * inside API request transactions.
 */
@Injectable()
export class PdfJobService {
  private readonly logger = new Logger(PdfJobService.name);

  constructor(@InjectQueue('pdf-rendering') private readonly pdfQueue: Queue) {}

  /**
   * Enqueue a PDF rendering job. Returns the BullMQ job ID for tracking.
   *
   * @param tenantId - Tenant ID (required for RLS context in worker)
   * @param payload - HTML content, output S3 key, and optional callback config
   */
  async enqueueRender(
    tenantId: string,
    payload: Omit<PdfRenderJobPayload, 'tenant_id'>,
  ): Promise<PdfRenderJobResult> {
    const jobPayload: PdfRenderJobPayload = {
      tenant_id: tenantId,
      ...payload,
    };

    const job = await this.pdfQueue.add(PDF_RENDER_JOB, jobPayload, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 50,
      removeOnFail: 200,
    });

    this.logger.log(
      `Enqueued ${PDF_RENDER_JOB} — jobId=${job.id}, tenant=${tenantId}, outputKey=${payload.output_key}`,
    );

    return { job_id: job.id ?? '' };
  }
}
