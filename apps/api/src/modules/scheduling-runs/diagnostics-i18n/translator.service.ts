/**
 * Translates diagnostic codes into human-readable strings.
 *
 * Picks translations from en.ts or ar.ts based on the locale parameter.
 * All diagnostic codes defined in DIAGNOSTIC_CODES must have entries in
 * both translation registries — the coverage spec enforces this.
 */
import { Injectable } from '@nestjs/common';

import type { DiagnosticCode } from './diagnostic-codes';
import type {
  DiagnosticContext,
  DiagnosticSolution,
  DiagnosticTranslation,
} from './diagnostic-types';
import { AR_TRANSLATIONS } from './translations/ar';
import { EN_TRANSLATIONS } from './translations/en';

type Locale = 'en' | 'ar';

@Injectable()
export class DiagnosticsTranslatorService {
  private readonly registries: Record<Locale, Record<DiagnosticCode, DiagnosticTranslation>> = {
    en: EN_TRANSLATIONS,
    ar: AR_TRANSLATIONS,
  };

  /**
   * Translate a diagnostic code into a headline + detail + solutions.
   * Falls back to English if the locale is not found.
   */
  translate(
    code: DiagnosticCode,
    ctx: DiagnosticContext,
    locale: Locale = 'en',
  ): { headline: string; detail: string; solutions: DiagnosticSolution[] } {
    const registry = this.registries[locale] ?? this.registries.en;
    const entry = registry[code];

    const solutions: DiagnosticSolution[] = entry.solution_templates.map((tpl) => ({
      id: tpl.id,
      headline: tpl.headline(ctx),
      detail: tpl.detail(ctx),
      effort: tpl.effort,
      impact: {
        would_unblock_periods: ctx.blocked_periods ?? 0,
        would_unblock_percentage: 0,
        side_effects: [],
        confidence: 'medium' as const,
      },
      link: { href: tpl.link_template(ctx), label: tpl.headline(ctx) },
      affected_entities: {},
    }));

    return {
      headline: entry.headline(ctx),
      detail: entry.detail(ctx),
      solutions,
    };
  }
}
