import { VALID_STUDENT_TRANSITIONS } from './student-status';

describe('Student Status Transitions', () => {
  it('should define transitions for all statuses', () => {
    const statuses = Object.keys(VALID_STUDENT_TRANSITIONS);
    expect(statuses.length).toBeGreaterThan(0);
  });

  it('should have valid target statuses — all targets exist as keys', () => {
    const allStatuses = Object.keys(VALID_STUDENT_TRANSITIONS);
    for (const [, targets] of Object.entries(VALID_STUDENT_TRANSITIONS)) {
      for (const target of targets) {
        expect(allStatuses).toContain(target);
      }
    }
  });

  it('should not allow self-transitions', () => {
    for (const [status, targets] of Object.entries(VALID_STUDENT_TRANSITIONS)) {
      expect(targets).not.toContain(status);
    }
  });

  describe('valid transitions', () => {
    const validTransitions: [string, string][] = [
      ['applicant', 'active'],
      ['active', 'withdrawn'],
      ['active', 'graduated'],
      ['active', 'archived'],
      ['withdrawn', 'active'],
      ['graduated', 'archived'],
    ];

    it.each(validTransitions)('should allow %s → %s', (from, to) => {
      expect(VALID_STUDENT_TRANSITIONS[from as keyof typeof VALID_STUDENT_TRANSITIONS]).toContain(
        to,
      );
    });
  });

  describe('invalid transitions', () => {
    const invalidTransitions: [string, string][] = [
      ['applicant', 'withdrawn'],
      ['applicant', 'graduated'],
      ['applicant', 'archived'],
      ['withdrawn', 'graduated'],
      ['withdrawn', 'archived'],
      ['graduated', 'active'],
      ['graduated', 'withdrawn'],
    ];

    it.each(invalidTransitions)('should not allow %s → %s', (from, to) => {
      expect(
        VALID_STUDENT_TRANSITIONS[from as keyof typeof VALID_STUDENT_TRANSITIONS],
      ).not.toContain(to);
    });
  });

  it('terminal status "archived" should have an empty transition array', () => {
    expect(VALID_STUDENT_TRANSITIONS.archived).toEqual([]);
  });
});
