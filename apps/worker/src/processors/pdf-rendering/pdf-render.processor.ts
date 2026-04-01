import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { Job } from 'bullmq';
import type { Browser } from 'puppeteer';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { createS3Client, getS3Bucket } from '../../base/s3.helpers';
import type { TenantJobPayload } from '../../base/tenant-aware-job';
import { TenantAwareJob } from '../../base/tenant-aware-job';

// ─── Job Name ────────────────────────────────────────────────────────────────

export const PDF_RENDER_JOB = 'pdf:render';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface PdfRenderJobPayload extends TenantJobPayload {
  template_html: string;
  output_key: string;
  callback_job_name?: string;
  callback_queue_name?: string;
  callback_payload?: Record<string, unknown>;
}

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.PDF_RENDERING)
export class PdfRenderProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfRenderProcessor.name);
  private browser: Browser | null = null;

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<PdfRenderJobPayload>): Promise<void> {
    if (job.name !== PDF_RENDER_JOB) return;

    const { tenant_id } = job.data;
    if (!tenant_id) throw new Error('Job rejected: missing tenant_id');

    this.logger.log(
      `Processing ${PDF_RENDER_JOB} — tenant=${tenant_id}, outputKey=${job.data.output_key}`,
    );

    const renderJob = new PdfRenderJob(
      this.prisma,
      () => this.getBrowser(),
      (key, buf) => this.uploadPdfToS3(key, buf),
    );
    await renderJob.execute(job.data);
  }

  // ─── Browser lifecycle ───────────────────────────────────────────────────

  private async getBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;

    const puppeteer = await import('puppeteer');
    this.browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    return this.browser;
  }

  // ─── S3 upload ───────────────────────────────────────────────────────────

  private async uploadPdfToS3(key: string, buffer: Buffer): Promise<void> {
    const s3: S3Client = createS3Client();
    await s3.send(
      new PutObjectCommand({
        Bucket: getS3Bucket(),
        Key: key,
        Body: buffer,
        ContentType: 'application/pdf',
      }),
    );
  }
}

// ─── TenantAwareJob Implementation ──────────────────────────────────────────

class PdfRenderJob extends TenantAwareJob<PdfRenderJobPayload> {
  private readonly logger = new Logger(PdfRenderJob.name);

  constructor(
    prisma: PrismaClient,
    private readonly getBrowser: () => Promise<Browser>,
    private readonly uploadPdf: (key: string, buffer: Buffer) => Promise<void>,
  ) {
    super(prisma);
  }

  protected async processJob(data: PdfRenderJobPayload, _tx: PrismaClient): Promise<void> {
    const { template_html, output_key } = data;

    // ─── 1. Render HTML to PDF via Puppeteer ────────────────────────────

    const browser = await this.getBrowser();
    const page = await browser.newPage();

    let pdfBuffer: Buffer;
    try {
      await page.setContent(template_html, { waitUntil: 'networkidle0', timeout: 15000 });

      const rawBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
      });

      pdfBuffer = Buffer.from(rawBuffer);
    } catch (_err) {
      // Retry once on timeout
      try {
        await page.setContent(template_html, { waitUntil: 'networkidle0', timeout: 15000 });
        const rawBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
        });
        pdfBuffer = Buffer.from(rawBuffer);
      } catch (retryErr) {
        this.logger.error(`PDF rendering failed after retry for key=${output_key}`, retryErr);
        throw new Error(`PDF rendering timed out for output key "${output_key}"`);
      }
    } finally {
      await page.close();
    }

    // ─── 2. Upload to S3 ────────────────────────────────────────────────

    await this.uploadPdf(output_key, pdfBuffer);

    this.logger.log(
      `PDF rendered and uploaded — key=${output_key}, size=${pdfBuffer.length} bytes`,
    );

    // NOTE: Callback job dispatch (enqueue a follow-up job after PDF is ready)
    // is not yet implemented. When needed, this would use a Queue reference
    // to enqueue data.callback_job_name with data.callback_payload.
  }
}
