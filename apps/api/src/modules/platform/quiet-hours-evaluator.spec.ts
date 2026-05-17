import { isSuppressedByQuietHours } from './quiet-hours-evaluator';

describe('isSuppressedByQuietHours', () => {
  it('evaluates quiet hours using the route IANA timezone wall clock', () => {
    const suppressed = isSuppressedByQuietHours(
      {
        criticalOverrideQuiet: false,
        end: '07:00',
        severity: 'warning',
        start: '22:00',
        timezone: 'Europe/Dublin',
      },
      new Date('2026-06-01T21:30:00.000Z'),
    );

    expect(suppressed).toBe(true);
  });

  it('lets critical alerts bypass quiet hours when critical override is enabled', () => {
    const suppressed = isSuppressedByQuietHours(
      {
        criticalOverrideQuiet: true,
        end: '07:00',
        severity: 'critical',
        start: '22:00',
        timezone: 'Europe/Dublin',
      },
      new Date('2026-06-01T21:30:00.000Z'),
    );

    expect(suppressed).toBe(false);
  });
});
