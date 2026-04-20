import { deriveReviewStatus, formatRemaining } from './break-glass-types';

describe('break-glass helpers — deriveReviewStatus', () => {
  const baseGrant = {
    active: true,
    review_completed_at: null,
    review_overdue: false,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  };

  it('reports filed when the review is complete', () => {
    expect(
      deriveReviewStatus({
        ...baseGrant,
        review_completed_at: '2026-04-20T00:00:00Z',
      }),
    ).toBe('filed');
  });

  it('reports overdue when the backend has flagged review_overdue', () => {
    expect(
      deriveReviewStatus({
        ...baseGrant,
        review_overdue: true,
      }),
    ).toBe('overdue');
  });

  it('reports not_yet_due for active grants', () => {
    expect(deriveReviewStatus(baseGrant)).toBe('not_yet_due');
  });

  it('reports not_yet_due for an expired grant still inside the 7-day review window', () => {
    expect(
      deriveReviewStatus({
        ...baseGrant,
        active: false,
        expires_at: new Date(Date.now() - 3600_000).toISOString(),
      }),
    ).toBe('not_yet_due');
  });
});

describe('break-glass helpers — formatRemaining', () => {
  const reference = new Date('2026-04-21T12:00:00Z').getTime();

  it('reports `expired` for past timestamps', () => {
    expect(formatRemaining('2026-04-21T11:00:00Z', reference)).toBe('expired');
  });

  it('formats sub-hour remaining time in minutes', () => {
    expect(formatRemaining('2026-04-21T12:45:00Z', reference)).toBe('45m');
  });

  it('formats multi-hour remaining time as `Hh Mm`', () => {
    expect(formatRemaining('2026-04-21T15:30:00Z', reference)).toBe('3h 30m');
  });

  it('formats multi-day remaining time as `Dd Hh`', () => {
    expect(formatRemaining('2026-04-23T18:00:00Z', reference)).toBe('2d 6h');
  });
});
