/**
 * Prompt templates for `AiReportNarratorService`. One file per narration
 * type. Each file exports a `build(...)` function and a
 * `..._PROMPT_VERSION` integer that gets folded into the cache key so
 * old caches invalidate when a prompt is edited.
 */

export {
  build as buildDashboardPrompt,
  DASHBOARD_NARRATION_PROMPT_VERSION,
} from './dashboard-prompt';
export {
  build as buildReportPrompt,
  REPORT_NARRATION_PROMPT_VERSION,
} from './report-prompt';
export {
  build as buildSavedReportPrompt,
  SAVED_REPORT_NARRATION_PROMPT_VERSION,
} from './saved-report-prompt';
