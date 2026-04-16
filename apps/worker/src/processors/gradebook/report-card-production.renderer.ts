import { promises as fs } from 'fs';
import * as path from 'path';

import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as Handlebars from 'handlebars';

import type { ReportCardRenderPayload } from '@school/shared';

import {
  buildTemplateViewModel,
  type TemplateViewModel,
} from '../../report-card-templates/_shared/template-helpers';
import type { ReportCardRenderer } from '../report-card-render.contract';

// ─── Minimal Puppeteer surface ───────────────────────────────────────────────
// We type only the narrow subset of puppeteer we actually use so that unit
// tests can provide structural fakes without having to build a full Browser
// mock. Real `puppeteer.Browser` / `puppeteer.Page` satisfy these interfaces
// structurally.

export interface PuppeteerPageLike {
  setContent(html: string, options?: unknown): Promise<unknown>;
  pdf(options?: unknown): Promise<Uint8Array>;
  close(): Promise<void>;
}

export interface PuppeteerBrowserLike {
  newPage(): Promise<PuppeteerPageLike>;
  close(): Promise<void>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const DEFAULT_DESIGN_KEY = 'editorial-academic';

const SUPPORTED_DESIGN_KEYS = ['editorial-academic', 'modern-editorial'] as const;
type DesignKey = (typeof SUPPORTED_DESIGN_KEYS)[number];

function isDesignKey(value: unknown): value is DesignKey {
  return typeof value === 'string' && (SUPPORTED_DESIGN_KEYS as readonly string[]).includes(value);
}

// ─── Puppeteer launcher abstraction ──────────────────────────────────────────
// Allows unit tests to supply a fake browser without touching puppeteer. In
// production the default launcher imports puppeteer dynamically (mirrors the
// pattern used by `pdf-render.processor.ts`).

export interface PuppeteerLauncher {
  launch(): Promise<PuppeteerBrowserLike>;
}

export const PUPPETEER_LAUNCHER_TOKEN = 'REPORT_CARD_PUPPETEER_LAUNCHER';

export class DefaultPuppeteerLauncher implements PuppeteerLauncher {
  async launch(): Promise<PuppeteerBrowserLike> {
    const puppeteer = await import('puppeteer');
    return puppeteer.default.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=NetworkService',
        '--disable-dev-shm-usage',
      ],
    });
  }
}

// ─── Prisma accessor abstraction ─────────────────────────────────────────────
// The renderer needs to read `branding_overrides_json` from the template row
// to resolve which design to render. It does NOT mutate anything. A thin
// accessor keeps unit tests from needing a full Prisma mock.

export interface TemplateDesignResolver {
  resolveDesignKey(templateId: string): Promise<string | null>;
}

export const TEMPLATE_DESIGN_RESOLVER_TOKEN = 'REPORT_CARD_TEMPLATE_DESIGN_RESOLVER';

@Injectable()
export class PrismaTemplateDesignResolver implements TemplateDesignResolver {
  // Cache results across renders within the same worker process. Templates
  // change so rarely that a single-process cache is both safe and effective.
  private readonly cache = new Map<string, string | null>();

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async resolveDesignKey(templateId: string): Promise<string | null> {
    if (this.cache.has(templateId)) {
      return this.cache.get(templateId) ?? null;
    }

    const row = await this.prisma.reportCardTemplate.findFirst({
      where: { id: templateId },
      select: { branding_overrides_json: true, name: true },
    });

    const designKey = row ? extractDesignKey(row.branding_overrides_json, row.name) : null;
    this.cache.set(templateId, designKey);
    return designKey;
  }
}

function extractDesignKey(
  brandingOverrides: unknown,
  templateName: string | null | undefined,
): string | null {
  if (brandingOverrides && typeof brandingOverrides === 'object') {
    const candidate = (brandingOverrides as Record<string, unknown>).design_key;
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  // Fallback: derive from the template name ("Modern Editorial" → modern-editorial).
  if (typeof templateName === 'string' && templateName.trim()) {
    const slug = templateName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (slug) return slug;
  }
  return null;
}

// ─── Template loading ────────────────────────────────────────────────────────

const TEMPLATE_ROOT = path.resolve(__dirname, '..', '..', 'report-card-templates');

interface CompiledTemplate {
  compiled: Handlebars.TemplateDelegate<TemplateViewModel>;
}

async function loadTemplateSource(designKey: DesignKey): Promise<string> {
  const filePath = path.join(TEMPLATE_ROOT, designKey, 'index.hbs');
  return fs.readFile(filePath, 'utf8');
}

// ─── Renderer ────────────────────────────────────────────────────────────────

@Injectable()
export class ProductionReportCardRenderer implements ReportCardRenderer, OnModuleDestroy {
  private readonly logger = new Logger(ProductionReportCardRenderer.name);
  private browser: PuppeteerBrowserLike | null = null;
  private readonly compiledTemplates = new Map<DesignKey, CompiledTemplate>();

  constructor(
    @Inject(PUPPETEER_LAUNCHER_TOKEN)
    private readonly launcher: PuppeteerLauncher,
    @Inject(TEMPLATE_DESIGN_RESOLVER_TOKEN)
    private readonly designResolver: TemplateDesignResolver,
  ) {}

  async render(payload: ReportCardRenderPayload): Promise<Buffer> {
    const designKey = await this.resolveDesign(payload);
    const template = await this.getCompiledTemplate(designKey);

    const viewModel = buildTemplateViewModel({
      payload,
      signatureDataUrl: null, // signature image loading is a future enhancement
    });

    const html = template.compiled(viewModel);
    const pdfBuffer = await this.renderHtmlToPdf(html);

    this.logger.debug(
      `Rendered report card PDF — design=${designKey} language=${payload.language} student=${payload.student.id} size=${pdfBuffer.length} bytes`,
    );

    return pdfBuffer;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (err) {
        this.logger.warn(
          `Failed to close puppeteer browser on shutdown: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      } finally {
        this.browser = null;
      }
    }
  }

  // ─── Internal helpers ──────────────────────────────────────────────────

  private async resolveDesign(payload: ReportCardRenderPayload): Promise<DesignKey> {
    // Prefer the design key that the processor stamped onto the payload at
    // build time. The processor reads it from the template row inside an
    // RLS-scoped transaction, which the standalone `designResolver` can't
    // replicate because the worker uses a raw Prisma client. The resolver
    // is kept as a secondary path for legacy callers that don't pass the
    // key in the payload.
    const inlineDesignKey = payload.template.design_key;
    if (isDesignKey(inlineDesignKey)) {
      return inlineDesignKey;
    }
    if (inlineDesignKey) {
      this.logger.warn(
        `Unknown inline template design_key "${inlineDesignKey}" for template ${payload.template.id} — falling back to resolver lookup`,
      );
    }

    try {
      const resolved = await this.designResolver.resolveDesignKey(payload.template.id);
      if (isDesignKey(resolved)) {
        return resolved;
      }
      if (resolved) {
        this.logger.warn(
          `Unknown template design_key "${resolved}" for template ${payload.template.id} — falling back to ${DEFAULT_DESIGN_KEY}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Design key lookup failed for template ${payload.template.id}: ${err instanceof Error ? err.message : 'unknown'} — falling back to ${DEFAULT_DESIGN_KEY}`,
      );
    }
    return DEFAULT_DESIGN_KEY;
  }

  private async getCompiledTemplate(designKey: DesignKey): Promise<CompiledTemplate> {
    const cached = this.compiledTemplates.get(designKey);
    if (cached) return cached;

    const source = await loadTemplateSource(designKey);
    const compiled = Handlebars.compile<TemplateViewModel>(source, {
      noEscape: false,
      strict: true,
    });
    const entry: CompiledTemplate = { compiled };
    this.compiledTemplates.set(designKey, entry);
    return entry;
  }

  private async getBrowser(): Promise<PuppeteerBrowserLike> {
    if (this.browser) return this.browser;
    this.browser = await this.launcher.launch();
    return this.browser;
  }

  private async renderHtmlToPdf(html: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      // Block all network requests from rendered content to prevent SSRF
      // (e.g., <img src="http://169.254.169.254/..."> in user-supplied comments)
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const url = req.url();
        // Allow data: URIs (used for embedded images like signatures) and
        // about:blank. Block everything else.
        if (url.startsWith('data:') || url.startsWith('about:')) {
          void req.continue();
        } else {
          void req.abort('blockedbyclient');
        }
      });
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20_000 });
      const rawBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      });
      return Buffer.from(rawBuffer);
    } finally {
      try {
        await page.close();
      } catch (err) {
        this.logger.warn(
          `Failed to close puppeteer page: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      }
    }
  }
}
