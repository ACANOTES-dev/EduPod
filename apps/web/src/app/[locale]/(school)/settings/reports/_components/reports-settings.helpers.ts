import type {
  ReportKpiKey,
  ReportsAiModuleKey,
  ReportsAiFeatureState,
  ReportsDefaultsDto,
  ReportsSettingsResponse,
} from '@school/shared/reports';

/**
 * Pure helpers for the Reports Settings page (impl 21). Extracted so the
 * web app's `*.spec.ts` files (jest `node` env, no JSX renderer) can
 * exercise them without touching the React tree.
 */

export type SettingsTabKey = 'ai-features' | 'kpi-dashboard' | 'defaults';

const DEFAULT_TAB: SettingsTabKey = 'ai-features';

/**
 * Resolve the active tab from a deep-link query param. The AI panel deep-
 * links to `/settings/reports?tab=ai-features#reports_narration`. Anything
 * else falls back to the AI Features tab.
 */
export function resolveActiveTab(input: string | null | undefined): SettingsTabKey {
  if (input === 'ai-features' || input === 'kpi-dashboard' || input === 'defaults') {
    return input;
  }
  return DEFAULT_TAB;
}

/**
 * Resolve which AI feature card to scroll into view based on the URL hash.
 * `/settings/reports#reports_narration` → `'reports_narration'`. Returns
 * `null` if the hash doesn't match a known module key.
 */
export function resolveScrollTarget(hash: string | null | undefined): ReportsAiModuleKey | null {
  if (!hash) return null;
  const stripped = hash.replace(/^#/, '');
  if (
    stripped === 'reports_narration' ||
    stripped === 'reports_ask_ai' ||
    stripped === 'reports_predictions'
  ) {
    return stripped;
  }
  return null;
}

/**
 * Format a USD cost estimate for display next to the monthly usage count.
 * Caller has already aggregated month-to-date; this only handles the
 * presentation rounding. Three decimal places for sub-dollar costs to
 * keep the "≈ $0.012" precision visible; whole dollars otherwise.
 */
export function formatCostUsd(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return '$0.00';
  if (cost < 1) return `$${cost.toFixed(3)}`;
  if (cost < 10) return `$${cost.toFixed(2)}`;
  return `$${Math.round(cost).toString()}`;
}

/**
 * Format a usage count for the "{N} generations this month" line. Returns
 * the raw integer; the i18n layer adds plural / locale formatting.
 */
export function formatUsageCount(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

/**
 * Toggle a KPI key's visibility in the hidden-list. Returns a NEW array
 * so React state updates don't mutate the caller's reference.
 */
export function toggleHiddenKpi(
  hiddenKpiKeys: ReportKpiKey[],
  kpiKey: ReportKpiKey,
  hide: boolean,
): ReportKpiKey[] {
  if (hide) {
    return hiddenKpiKeys.includes(kpiKey)
      ? hiddenKpiKeys
      : [...hiddenKpiKeys, kpiKey];
  }
  return hiddenKpiKeys.filter((k) => k !== kpiKey);
}

/**
 * Predicate for the KPI grid: returns true if the KPI is currently hidden.
 */
export function isKpiHidden(hiddenKpiKeys: ReportKpiKey[], kpiKey: ReportKpiKey): boolean {
  return hiddenKpiKeys.includes(kpiKey);
}

/**
 * Find the AI feature state for a module key. Returns a default-disabled
 * placeholder if the response didn't include the key (defensive — the
 * backend always includes all three reports keys per impl 10/11/12).
 */
export function findAiFeature(
  features: ReportsAiFeatureState[],
  moduleKey: ReportsAiModuleKey,
): ReportsAiFeatureState {
  const found = features.find((f) => f.module_key === moduleKey);
  if (found) return found;
  return {
    module_key: moduleKey,
    enabled: false,
    updated_at: new Date(0).toISOString(),
    updated_by: null,
    usage: { monthly_usage: 0, cost_estimate_usd: 0 },
  };
}

/**
 * Defaults form initial state. The settings page wires this to react-hook-
 * form's `defaultValues`.
 */
export function buildDefaultsFormValues(
  response: ReportsSettingsResponse,
): ReportsDefaultsDto {
  return {
    default_export_format: response.defaults.default_export_format,
    default_schedule_timezone: response.defaults.default_schedule_timezone,
    default_share_visibility: response.defaults.default_share_visibility,
  };
}
