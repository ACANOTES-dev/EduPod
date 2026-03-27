import * as crypto from 'crypto';

import { Injectable, Logger } from '@nestjs/common';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const Handlebars = require('handlebars') as typeof import('handlebars');

// Register custom helpers once at module load
Handlebars.registerHelper(
  'formatDate',
  (date: unknown, locale?: unknown): string => {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(String(date));
    if (isNaN(d.getTime())) return String(date);
    const loc = typeof locale === 'string' ? locale : 'en';
    try {
      return d.toLocaleDateString(loc, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return d.toLocaleDateString('en', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
  },
);

Handlebars.registerHelper('stripHtml', (html: unknown): string => {
  if (typeof html !== 'string') return '';
  return TemplateRendererService.stripHtmlStatic(html);
});

type CompiledTemplate = (context: Record<string, unknown>) => string;

@Injectable()
export class TemplateRendererService {
  private readonly logger = new Logger(TemplateRendererService.name);
  private readonly compiledCache = new Map<string, CompiledTemplate>();

  /**
   * Render a template body with variables using Handlebars.
   * Missing variables render as empty string (strict: false).
   */
  render(
    templateBody: string,
    variables: Record<string, unknown>,
  ): string {
    const compiled = this.getCompiledTemplate(templateBody);
    try {
      return compiled(variables);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown render error';
      this.logger.error(
        `Template render failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      return templateBody;
    }
  }

  /**
   * Render a subject template. Returns null if input is null.
   */
  renderSubject(
    subjectTemplate: string | null,
    variables: Record<string, unknown>,
  ): string | null {
    if (subjectTemplate === null) return null;
    return this.render(subjectTemplate, variables);
  }

  /**
   * Strip HTML tags for text-only channels (WhatsApp, SMS).
   * Preserves line breaks from <br>, <p>, <div>, <li> as \n.
   */
  stripHtml(html: string): string {
    return TemplateRendererService.stripHtmlStatic(html);
  }

  /**
   * Static implementation so the Handlebars helper can call it
   * without needing a class instance.
   */
  static stripHtmlStatic(html: string): string {
    let text = html;

    // Convert block-closing and break tags to newlines
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n');
    text = text.replace(/<\/div>/gi, '\n');
    text = text.replace(/<\/li>/gi, '\n');

    // Strip all remaining HTML tags
    text = text.replace(/<[^>]*>/g, '');

    // Decode common HTML entities
    text = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');

    // Collapse excessive whitespace: multiple blank lines -> max two newlines
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
    text = text.trim();

    return text;
  }

  /**
   * Get or create a compiled Handlebars template, keyed by content hash.
   */
  private getCompiledTemplate(body: string): CompiledTemplate {
    const hash = crypto
      .createHash('sha256')
      .update(body)
      .digest('hex');

    const cached = this.compiledCache.get(hash);
    if (cached) return cached;

    const compiled = Handlebars.compile(body, {
      strict: false,
      noEscape: false,
    });

    this.compiledCache.set(hash, compiled);
    return compiled;
  }
}
