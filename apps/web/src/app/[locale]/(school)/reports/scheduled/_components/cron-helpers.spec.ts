import {
  ALERT_EVALUATION_PRESETS,
  SCHEDULED_REPORT_PRESETS,
  humanizeCron,
  presetForCron,
} from './cron-helpers';

describe('humanizeCron', () => {
  it('renders daily-at-X presets', () => {
    expect(humanizeCron('0 9 * * *')).toBe('Daily at 9:00 AM');
    expect(humanizeCron('0 17 * * *')).toBe('Daily at 5:00 PM');
    expect(humanizeCron('30 8 * * *')).toBe('Daily at 8:30 AM');
  });

  it('renders single-day weekly presets with the day name', () => {
    expect(humanizeCron('0 8 * * 1')).toBe('Mondays at 8:00 AM');
    expect(humanizeCron('0 17 * * 5')).toBe('Fridays at 5:00 PM');
    expect(humanizeCron('0 12 * * 0')).toBe('Sundays at 12:00 PM');
  });

  it('renders weekday and weekend ranges', () => {
    expect(humanizeCron('0 8 * * 1-5')).toBe('Weekdays at 8:00 AM');
    expect(humanizeCron('0 10 * * 0,6')).toBe('Weekends at 10:00 AM');
    expect(humanizeCron('0 10 * * 6,0')).toBe('Weekends at 10:00 AM');
  });

  it('renders monthly-on-day presets', () => {
    expect(humanizeCron('0 8 1 * *')).toBe('Monthly on day 1 at 8:00 AM');
    expect(humanizeCron('30 9 15 * *')).toBe('Monthly on day 15 at 9:30 AM');
  });

  it('renders every-N-minutes presets', () => {
    expect(humanizeCron('*/30 * * * *')).toBe('Every 30 minutes');
    expect(humanizeCron('*/5 * * * *')).toBe('Every 5 minutes');
    expect(humanizeCron('*/1 * * * *')).toBe('Every minute');
  });

  it('renders hourly presets', () => {
    expect(humanizeCron('0 * * * *')).toBe('Hourly');
    expect(humanizeCron('15 * * * *')).toBe('Hourly at :15');
  });

  it('returns the raw cron when the shape is unsupported', () => {
    expect(humanizeCron('weird')).toBe('weird');
    expect(humanizeCron('1 2 3 4 5 6')).toBe('1 2 3 4 5 6');
    expect(humanizeCron('')).toBe('');
  });

  it('handles 12 AM / 12 PM correctly', () => {
    expect(humanizeCron('0 0 * * *')).toBe('Daily at 12:00 AM');
    expect(humanizeCron('0 12 * * *')).toBe('Daily at 12:00 PM');
  });
});

describe('presetForCron', () => {
  it('returns the matching scheduled-report preset', () => {
    const preset = presetForCron('0 9 * * *', SCHEDULED_REPORT_PRESETS);
    expect(preset?.id).toBe('daily-9am');
  });

  it('returns the matching alert-evaluation preset', () => {
    const preset = presetForCron('*/30 * * * *', ALERT_EVALUATION_PRESETS);
    expect(preset?.id).toBe('every-30min');
  });

  it('returns undefined for a custom (advanced-mode) cron', () => {
    expect(presetForCron('1 2 3 4 5', SCHEDULED_REPORT_PRESETS)).toBeUndefined();
  });

  it('trims surrounding whitespace before matching', () => {
    expect(presetForCron('   0 9 * * *  ', SCHEDULED_REPORT_PRESETS)?.id).toBe('daily-9am');
  });
});

describe('preset registries', () => {
  it('SCHEDULED_REPORT_PRESETS contains the documented set', () => {
    expect(SCHEDULED_REPORT_PRESETS.map((p) => p.id)).toEqual([
      'daily-9am',
      'weekly-mon-8am',
      'weekly-fri-5pm',
      'monthly-1st-8am',
      'weekdays-8am',
    ]);
  });

  it('ALERT_EVALUATION_PRESETS contains the documented set', () => {
    expect(ALERT_EVALUATION_PRESETS.map((p) => p.id)).toEqual([
      'every-30min',
      'hourly',
      'daily-8am',
    ]);
  });
});
