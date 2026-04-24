import { z } from 'zod';

/**
 * Reports AI-flag module keys. Mirrors the shape of
 * `wellbeingAiModuleKeySchema` in `@school/shared/wellbeing`.
 *
 * Each value is a row in `tenant_ai_flags.module_key` that gates a
 * specific AI feature in the reports module. All default `enabled=false`;
 * tenants opt in via the Reports Settings page and absorb the Anthropic
 * cost themselves.
 *
 * Per feature:
 *   - reports_narration    : executive-summary narrations on the
 *                            dashboard, individual reports, saved reports.
 *   - reports_ask_ai       : natural-language → builder-query translator.
 *   - reports_predictions  : predictive analytics panels (student risk,
 *                            attendance forecast, cash-flow forecast).
 */
export const REPORTS_AI_MODULE_KEYS = [
  'reports_narration',
  'reports_ask_ai',
  'reports_predictions',
] as const;

export type ReportsAiModuleKey = (typeof REPORTS_AI_MODULE_KEYS)[number];

export const reportsAiModuleKeySchema = z.enum(REPORTS_AI_MODULE_KEYS);
