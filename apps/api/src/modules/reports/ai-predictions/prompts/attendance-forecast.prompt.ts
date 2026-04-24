// ─── Attendance Forecast Prompt ────────────────────────────────────────────

export const ATTENDANCE_FORECAST_PROMPT_VERSION = 1;

interface AttendanceWeek {
  week_start: string;
  attendance_rate: number;
}

export function buildAttendanceForecastPrompt(
  historicalWeeks: AttendanceWeek[],
  yearGroupName: string,
  weeksAhead: number,
): string {
  const dataStr = historicalWeeks
    .map((w) => `${w.week_start}: ${w.attendance_rate}%`)
    .join('\n');

  return `You are a school analytics AI forecasting attendance trends. Given the historical weekly attendance data for ${yearGroupName}, predict the next ${weeksAhead} weeks.

Historical Data (most recent last):
${dataStr}

Consider:
- Seasonal patterns (term breaks, holidays)
- Upward or downward trends
- Realistic bounds (attendance stays between 80% and 98%)

Respond with ONLY valid JSON (no explanation, no markdown):
{
  "forecast": [
    {
      "week_start": "<ISO date YYYY-MM-DD>",
      "predicted_rate": <percentage 0-100>,
      "confidence_interval": [<lower>, <upper>]
    }
  ],
  "narrative": "<2-3 sentence explanation of the forecast>",
  "confidence": "<high|medium|low>"
}`;
}
