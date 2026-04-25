/**
 * Cron-expression helpers for the scheduled-reports + alerts UI (impl 17).
 *
 * Two responsibilities:
 *   1. `humanizeCron` — turn a 5-field cron expression into a friendly
 *      label like "Every Monday at 8:00 AM" so the list table is readable
 *      without making the admin parse cron syntax.
 *   2. `cronPresets` + `presetForCron` — round-trip between the simple
 *      preset dropdown and the underlying cron string, so the form can
 *      offer simple/advanced modes without storing two representations.
 *
 * Intentional non-goals:
 *   - We do NOT validate every legal cron grammar quirk (ranges, lists,
 *     step values beyond what we ship in presets). The advanced-mode
 *     input is free-text and the worker is the source of truth — a user
 *     who pastes a malformed expression sees the worker error in the
 *     run-history drawer.
 *   - We do NOT compute "next run" client-side. The server computes it.
 *
 * Pure module — no React, no fetch, no I/O. Trivially testable.
 */

export interface CronPreset {
  /** Stable id used as the dropdown value */
  id: string;
  /** Cron expression matching this preset */
  cron: string;
  /** Translation-key suffix the form uses to render the option label */
  labelKey: string;
}

/**
 * Cadence presets the simple-mode dropdown surfaces. Order matches the
 * dropdown order. Add new presets at the end so existing schedules keep
 * mapping to the same id.
 */
export const SCHEDULED_REPORT_PRESETS: readonly CronPreset[] = [
  { id: 'daily-9am', cron: '0 9 * * *', labelKey: 'cadenceDaily9am' },
  { id: 'weekly-mon-8am', cron: '0 8 * * 1', labelKey: 'cadenceWeeklyMon8am' },
  { id: 'weekly-fri-5pm', cron: '0 17 * * 5', labelKey: 'cadenceWeeklyFri5pm' },
  { id: 'monthly-1st-8am', cron: '0 8 1 * *', labelKey: 'cadenceMonthly1st8am' },
  { id: 'weekdays-8am', cron: '0 8 * * 1-5', labelKey: 'cadenceWeekdays8am' },
] as const;

/**
 * Evaluation-cadence presets for the alerts form. Tighter cadences than
 * scheduled reports (alerts evaluate often; reports deliver less often).
 */
export const ALERT_EVALUATION_PRESETS: readonly CronPreset[] = [
  { id: 'every-30min', cron: '*/30 * * * *', labelKey: 'cadenceEvery30Min' },
  { id: 'hourly', cron: '0 * * * *', labelKey: 'cadenceHourly' },
  { id: 'daily-8am', cron: '0 8 * * *', labelKey: 'cadenceDaily8am' },
] as const;

/**
 * Find the preset whose cron expression matches the given string. Returns
 * undefined when the cron is custom (advanced-mode input). The caller
 * uses the undefined result to switch the form to advanced mode and
 * surface the raw cron in a text input.
 */
export function presetForCron(
  cron: string,
  presets: readonly CronPreset[],
): CronPreset | undefined {
  const trimmed = cron.trim();
  return presets.find((p) => p.cron === trimmed);
}

const DAY_NAMES_EN = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/**
 * Render a cron expression as a friendly English label. Handles the
 * common shapes the UI presets produce; falls back to the raw expression
 * for anything we cannot summarise (advanced-mode customs). Pure — no
 * date-fns or i18n dependency, by design: the list table renders many
 * rows and we want zero per-row formatter overhead.
 *
 * Examples:
 *   "0 9 * * *"     → "Daily at 9:00 AM"
 *   "0 8 * * 1"     → "Mondays at 8:00 AM"
 *   "0 8 * * 1-5"   → "Weekdays at 8:00 AM"
 *   "0 8 1 * *"     → "Monthly on day 1 at 8:00 AM"
 *   "*\/30 * * * *"   → "Every 30 minutes"
 *   "0 * * * *"     → "Hourly"
 *   "<weird>"       → "<weird>"  (returns the input unchanged)
 */
export function humanizeCron(cron: string): string {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return cron;

  const [minute, hour, dom, month, dow] = fields;
  if (!minute || !hour || !dom || !month || !dow) return cron;

  // Every N minutes (*/N * * * *)
  const everyMinMatch = /^\*\/(\d+)$/.exec(minute);
  if (everyMinMatch && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    const n = Number(everyMinMatch[1]);
    return n === 1 ? 'Every minute' : `Every ${n} minutes`;
  }

  // Hourly at minute :MM (M * * * *)
  if (/^\d+$/.test(minute) && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    const m = Number(minute);
    return m === 0 ? 'Hourly' : `Hourly at :${pad2(m)}`;
  }

  // Anything else needs a numeric hour + minute
  const minuteN = Number(minute);
  const hourN = Number(hour);
  if (!Number.isFinite(minuteN) || !Number.isFinite(hourN)) return cron;
  const time = formatTime(hourN, minuteN);

  // Every day at HH:MM (M H * * *)
  if (dom === '*' && month === '*' && dow === '*') {
    return `Daily at ${time}`;
  }

  // Weekly on a single day (M H * * D)
  if (dom === '*' && month === '*' && /^\d$/.test(dow)) {
    const idx = Number(dow) % 7;
    return `${DAY_NAMES_EN[idx]}s at ${time}`;
  }

  // Weekdays (M H * * 1-5)
  if (dom === '*' && month === '*' && dow === '1-5') {
    return `Weekdays at ${time}`;
  }

  // Weekends (M H * * 0,6)
  if (dom === '*' && month === '*' && (dow === '0,6' || dow === '6,0')) {
    return `Weekends at ${time}`;
  }

  // Monthly on day N (M H D * *)
  if (month === '*' && dow === '*' && /^\d+$/.test(dom)) {
    return `Monthly on day ${dom} at ${time}`;
  }

  return cron;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatTime(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${display}:00 ${period}` : `${display}:${pad2(minute)} ${period}`;
}
