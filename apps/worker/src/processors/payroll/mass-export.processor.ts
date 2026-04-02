import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';
import Redis from 'ioredis';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface MassExportPayload extends TenantJobPayload {
  payroll_run_id: string;
  locale: 'en' | 'ar';
  requested_by_user_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const PAYROLL_MASS_EXPORT_JOB = 'payroll:mass-export-payslips';

// ─── Template renderers ─────────────────────────────────────────────────────
// Payslip templates are duplicated inline to avoid cross-app imports.
// The worker renders a simplified HTML for each payslip based on its snapshot payload.

interface PayslipBranding {
  school_name: string;
  school_name_ar?: string;
  logo_url?: string;
  primary_color?: string;
}

type TemplateRenderFn = (data: unknown, branding: PayslipBranding) => string;

function getTemplateRenderer(locale: 'en' | 'ar'): TemplateRenderFn {
  // For the mass export, we render a simplified payslip page per entry.
  // The snapshot_payload_json already contains all necessary data.
  return (data: unknown, branding: PayslipBranding): string => {
    const ps = data as Record<string, unknown>;
    const staff = ps.staff as Record<string, unknown> | undefined;
    const period = ps.period as Record<string, unknown> | undefined;
    const calculations = ps.calculations as Record<string, unknown> | undefined;
    const school = ps.school as Record<string, unknown> | undefined;
    const compensation = ps.compensation as Record<string, unknown> | undefined;
    const primaryColor = branding.primary_color || '#1e40af';
    const currency = (school?.currency_code as string) || 'SAR';
    const isAr = locale === 'ar';
    const dir = isAr ? 'rtl' : 'ltr';
    const fontFamily = isAr
      ? "'Noto Sans Arabic', 'Arial', sans-serif"
      : "'Helvetica Neue', Arial, sans-serif";
    const title = isAr ? '\u0643\u0634\u0641 \u0627\u0644\u0631\u0627\u062A\u0628' : 'PAYSLIP';
    const schoolName = isAr
      ? branding.school_name_ar || branding.school_name
      : branding.school_name;
    const basicLabel = isAr
      ? '\u0627\u0644\u0631\u0627\u062A\u0628 \u0627\u0644\u0623\u0633\u0627\u0633\u064A'
      : 'Basic Pay';
    const bonusLabel = isAr ? '\u0627\u0644\u0645\u0643\u0627\u0641\u0623\u0629' : 'Bonus Pay';
    const totalLabel = isAr
      ? '\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0631\u0627\u062A\u0628'
      : 'Total Pay';

    const fmt = (n: unknown): string => `${currency} ${Number(n || 0).toFixed(2)}`;
    const esc = (s: unknown): string => {
      if (!s) return '';
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    };

    return `<div style="font-family: ${fontFamily}; direction: ${dir}; color: #111827; font-size: 14px; padding: 0;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${primaryColor}; padding-bottom: 12px; margin-bottom: 16px;">
        <div>
          <h1 style="font-size: 24px; font-weight: 700; color: ${primaryColor};">${title}</h1>
          <p style="font-size: 14px; font-weight: 600; margin-top: 4px;">${esc(schoolName)}</p>
        </div>
        <div style="text-align: ${isAr ? 'left' : 'right'};">
          <p style="font-size: 13px; font-weight: 600;" dir="ltr">${esc(ps.payslip_number)}</p>
          <p style="font-size: 13px; color: #6b7280;">${esc(period?.label)}</p>
        </div>
      </div>
      <div style="margin-bottom: 16px; padding: 10px 12px; background: #f9fafb; border-radius: 6px;">
        <p style="font-weight: 600;">${esc(staff?.full_name)}</p>
        <p style="font-size: 12px; color: #6b7280;">${esc(staff?.department)} | ${esc(staff?.job_title)} | ${esc(compensation?.type)}</p>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr style="background: ${primaryColor}; color: white;">
          <th style="padding: 8px 12px; text-align: ${isAr ? 'right' : 'left'}; font-weight: 600;">${isAr ? '\u0627\u0644\u0628\u0646\u062F' : 'Component'}</th>
          <th style="padding: 8px 12px; text-align: ${isAr ? 'left' : 'right'}; font-weight: 600;">${isAr ? '\u0627\u0644\u0645\u0628\u0644\u063A' : 'Amount'}</th>
        </tr>
        <tr><td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${basicLabel}</td><td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: ${isAr ? 'left' : 'right'};" dir="ltr">${fmt(calculations?.basic_pay)}</td></tr>
        <tr><td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${bonusLabel}</td><td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: ${isAr ? 'left' : 'right'};" dir="ltr">${fmt(calculations?.bonus_pay)}</td></tr>
        <tr style="background: #f0f9ff;"><td style="padding: 10px 12px; font-weight: 700; font-size: 15px; border-top: 2px solid ${primaryColor};">${totalLabel}</td><td style="padding: 10px 12px; text-align: ${isAr ? 'left' : 'right'}; font-weight: 700; font-size: 15px; border-top: 2px solid ${primaryColor}; color: ${primaryColor};" dir="ltr">${fmt(calculations?.total_pay)}</td></tr>
      </table>
    </div>`;
  };
}

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.PAYROLL, { lockDuration: 300_000 })
export class PayrollMassExportProcessor extends WorkerHost {
  private readonly logger = new Logger(PayrollMassExportProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<MassExportPayload>): Promise<void> {
    if (job.name !== PAYROLL_MASS_EXPORT_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${PAYROLL_MASS_EXPORT_JOB} — tenant ${tenant_id}, run ${job.data.payroll_run_id}, locale ${job.data.locale}`,
    );

    const exportJob = new PayrollMassExportJob(this.prisma);
    await exportJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class PayrollMassExportJob extends TenantAwareJob<MassExportPayload> {
  private readonly logger = new Logger(PayrollMassExportJob.name);
  private readonly redis: Redis;

  constructor(prisma: PrismaClient) {
    super(prisma);
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:5554');
  }

  protected async processJob(data: MassExportPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, payroll_run_id, locale } = data;
    const statusKey = `payroll:mass-export:${payroll_run_id}`;
    const pdfKey = `payroll:mass-export:${payroll_run_id}:pdf`;

    try {
      // Set initial status
      await this.redis.set(
        statusKey,
        JSON.stringify({ status: 'running', progress: 0 }),
        'EX',
        600,
      );

      // Fetch all payslips for this run
      const payslips = await tx.payslip.findMany({
        where: {
          tenant_id,
          payroll_entry: {
            payroll_run_id,
          },
        },
        select: {
          id: true,
          payslip_number: true,
          snapshot_payload_json: true,
        },
        orderBy: { payslip_number: 'asc' },
      });

      if (payslips.length === 0) {
        await this.redis.set(
          statusKey,
          JSON.stringify({ status: 'completed', progress: 100, count: 0 }),
          'EX',
          600,
        );
        this.logger.log(`No payslips found for run ${payroll_run_id}`);
        return;
      }

      // Fetch tenant branding
      const tenant = await tx.tenant.findFirst({
        where: { id: tenant_id },
        select: { name: true },
      });

      const tenantBranding = await tx.tenantBranding.findUnique({
        where: { tenant_id },
        select: {
          school_name_ar: true,
          logo_url: true,
          primary_color: true,
        },
      });

      const branding: PayslipBranding = {
        school_name: tenant?.name || '',
        school_name_ar: tenantBranding?.school_name_ar || undefined,
        logo_url: tenantBranding?.logo_url || undefined,
        primary_color: tenantBranding?.primary_color || undefined,
      };

      // Get template renderer
      const renderTemplate = getTemplateRenderer(locale);

      // Render each payslip as HTML
      const htmlPages: string[] = [];
      let processed = 0;

      for (const payslip of payslips) {
        const payloadData = payslip.snapshot_payload_json;
        const html = renderTemplate(payloadData, branding);
        htmlPages.push(html);

        processed++;
        if (processed % 10 === 0) {
          const progress = Math.round((processed / payslips.length) * 80);
          await this.redis.set(
            statusKey,
            JSON.stringify({ status: 'running', progress }),
            'EX',
            600,
          );
        }
      }

      // Concatenate all pages into one HTML document with page breaks
      const consolidatedHtml = buildConsolidatedHtml(htmlPages, locale);

      // Render the consolidated PDF with Puppeteer
      await this.redis.set(
        statusKey,
        JSON.stringify({ status: 'rendering', progress: 85 }),
        'EX',
        600,
      );

      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      try {
        const page = await browser.newPage();
        await page.setContent(consolidatedHtml, { waitUntil: 'networkidle0', timeout: 30000 });

        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
        });

        await page.close();

        // Store PDF as base64 in Redis with short TTL
        const base64Pdf = Buffer.from(pdfBuffer).toString('base64');
        await this.redis.set(pdfKey, base64Pdf, 'EX', 300);

        // Update status to completed
        await this.redis.set(
          statusKey,
          JSON.stringify({
            status: 'completed',
            progress: 100,
            count: payslips.length,
            completed_at: new Date().toISOString(),
          }),
          'EX',
          600,
        );

        this.logger.log(
          `Mass export completed: ${payslips.length} payslips rendered for run ${payroll_run_id}, tenant ${tenant_id}`,
        );
      } finally {
        await browser.close();
      }
    } catch (err) {
      await this.redis.set(
        statusKey,
        JSON.stringify({
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        }),
        'EX',
        600,
      );
      throw err;
    } finally {
      await this.redis.quit();
    }
  }
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function buildConsolidatedHtml(pages: string[], locale: 'en' | 'ar'): string {
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const fontFamily =
    locale === 'ar'
      ? "'Noto Sans Arabic', 'Arial', sans-serif"
      : "'Helvetica Neue', Arial, sans-serif";
  const fontImport =
    locale === 'ar'
      ? "@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap');"
      : '';

  // Extract the <body> content from each page's HTML
  const bodyContents = pages.map((html) => {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    return bodyMatch ? bodyMatch[1] : html;
  });

  const pagesHtml = bodyContents
    .map(
      (content, idx) =>
        `<div class="payslip-page" ${idx < bodyContents.length - 1 ? 'style="page-break-after: always;"' : ''}>${content}</div>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <style>
    ${fontImport}
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${fontFamily}; color: #111827; font-size: 14px; background: white; ${locale === 'ar' ? 'direction: rtl;' : ''} }
    @page { size: A4; margin: 0; }
    .payslip-page { padding: 0; }
  </style>
</head>
<body>
  ${pagesHtml}
</body>
</html>`;
}
