import { VALID_HOMEWORK_TRANSITIONS } from './homework-status';

describe('Homework Status Transitions', () => {
  it('should define transitions for all statuses', () => {
    const statuses = Object.keys(VALID_HOMEWORK_TRANSITIONS);
    expect(statuses.length).toBeGreaterThan(0);
  });

  it('should have valid target statuses — all targets exist as keys', () => {
    const allStatuses = Object.keys(VALID_HOMEWORK_TRANSITIONS);
    for (const [, targets] of Object.entries(VALID_HOMEWORK_TRANSITIONS)) {
      for (const target of targets) {
        expect(allStatuses).toContain(target);
      }
    }
  });

  it('should not allow self-transitions', () => {
    for (const [status, targets] of Object.entries(VALID_HOMEWORK_TRANSITIONS)) {
      expect(targets).not.toContain(status);
    }
  });

  describe('valid transitions', () => {
    const validTransitions: [string, string][] = [
      ['draft', 'published'],
      ['draft', 'archived'],
      ['published', 'archived'],
    ];

    it.each(validTransitions)('should allow %s → %s', (from, to) => {
      expect(VALID_HOMEWORK_TRANSITIONS[from as keyof typeof VALID_HOMEWORK_TRANSITIONS]).toContain(
        to,
      );
    });
  });

  describe('invalid transitions', () => {
    const invalidTransitions: [string, string][] = [
      ['draft', 'draft'],
      ['published', 'draft'],
      ['published', 'published'],
      ['archived', 'draft'],
      ['archived', 'published'],
    ];

    it.each(invalidTransitions)('should not allow %s → %s', (from, to) => {
      expect(
        VALID_HOMEWORK_TRANSITIONS[from as keyof typeof VALID_HOMEWORK_TRANSITIONS],
      ).not.toContain(to);
    });
  });

  it('terminal status "archived" should have an empty transition array', () => {
    expect(VALID_HOMEWORK_TRANSITIONS.archived).toEqual([]);
  });
});
