import type { KpiDashboardResponse } from '@school/shared/reports';

/**
 * Prompt-version is a monotonic integer. Bump when the prompt text or the
 * shape of `data_json` we feed into the prompt changes — every cache key
 * folds the version in, so old caches automatically invalidate.
 */
export const DASHBOARD_NARRATION_PROMPT_VERSION = 1;

/**
 * Build the narrator prompt for the 10-KPI dashboard. The dashboard payload
 * is summarised as one line per KPI (label, value, delta direction, delta
 * magnitude) so the model sees the minimum it needs to write a 3-sentence
 * "what changed this week" paragraph.
 */
export function build(data: KpiDashboardResponse): string {
  const kpiSummary = data.data.kpis
    .map((kpi) => {
      const arrow =
        kpi.delta?.direction === 'up'
          ? '↑'
          : kpi.delta?.direction === 'down'
            ? '↓'
            : '→';
      const change = kpi.delta
        ? `${arrow} ${kpi.delta.value}${kpi.delta.unit === 'percent' ? '%' : ''}`
        : '';
      return `- ${kpi.key}: ${kpi.value} ${change}`.trim();
    })
    .join('\n');

  return `You are an educational analytics assistant. Summarise the following school dashboard in exactly 3 sentences, highlighting what changed this week compared to last week. Be specific and use numbers from the data. Do not invent information. Do not include greetings or closing phrases. Audience: school principal.

Dashboard generated at: ${data.data.generated_at}

KPI snapshot:
${kpiSummary}

Write only the 3-sentence summary, no headers, no bullet points.`;
}
