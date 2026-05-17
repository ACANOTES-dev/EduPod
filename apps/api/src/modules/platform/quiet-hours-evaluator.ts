export type QuietHoursInput = {
  criticalOverrideQuiet: boolean;
  end: string | null;
  severity: string;
  start: string | null;
  timezone: string;
};

function localMinutes(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    timeZone: timezone,
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

function hhmmToMinutes(value: string): number {
  const [hour = 0, minute = 0] = value.split(':').map((part) => Number(part));
  return hour * 60 + minute;
}

export function isSuppressedByQuietHours(input: QuietHoursInput, now = new Date()): boolean {
  if (!input.start || !input.end) {
    return false;
  }
  if (input.severity === 'critical' && input.criticalOverrideQuiet) {
    return false;
  }

  const current = localMinutes(now, input.timezone);
  const start = hhmmToMinutes(input.start);
  const end = hhmmToMinutes(input.end);

  if (start === end) {
    return true;
  }
  if (start < end) {
    return current >= start && current < end;
  }
  return current >= start || current < end;
}
