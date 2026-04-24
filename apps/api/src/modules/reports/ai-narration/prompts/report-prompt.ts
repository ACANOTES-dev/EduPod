/**
 * Prompt-version is a monotonic integer. Bump when the prompt text or the
 * shape of `data_json` we feed into the prompt changes — every cache key
 * folds the version in, so old caches automatically invalidate.
 */
export const REPORT_NARRATION_PROMPT_VERSION = 1;

const REPORT_LABELS: Record<string, string> = {
  attendance: 'Attendance Analytics',
  grades: 'Grade Analytics',
  demographics: 'Demographics Report',
  admissions: 'Admissions Funnel',
  staff: 'Staff Analytics',
  'student-progress': 'Student Progress',
  'cross-module-insights': 'Cross-Module Insights',
  board: 'Board Report',
  compliance: 'Compliance Report',
};

/**
 * Build the narrator prompt for an individual domain report. Renders the
 * report payload verbatim (pretty-printed JSON) so the model can read the
 * actual numbers; the contract in CLAUDE.md and PLAN.md says the output is
 * a single 3-4 sentence paragraph of contextual explanation.
 */
export function build(reportKey: string, data: unknown): string {
  const label = REPORT_LABELS[reportKey] ?? `Report (${reportKey})`;
  const dataStr = JSON.stringify(data, null, 2);

  return `You are a school analytics expert. Based on the following ${label} data, write a single 3-4 sentence paragraph of contextual explanation. Highlight the key findings, trends, and any actionable insights. Be specific with numbers. Do not invent data. Do not include greetings, closing phrases, or bullet points. Audience: school principal.

Report: ${label}

Data:
${dataStr}

Narrative:`;
}
