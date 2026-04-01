import { VALID_ENROLMENT_TRANSITIONS } from './class-enrolment-status';

describe('Class Enrolment Status Transitions', () => {
  it('should define transitions for all statuses', () => {
    const statuses = Object.keys(VALID_ENROLMENT_TRANSITIONS);
    expect(statuses.length).toBeGreaterThan(0);
  });

  it('should have valid target statuses — all targets exist as keys', () => {
    const allStatuses = Object.keys(VALID_ENROLMENT_TRANSITIONS);
    for (const [, targets] of Object.entries(VALID_ENROLMENT_TRANSITIONS)) {
      for (const target of targets) {
        expect(allStatuses).toContain(target);
      }
    }
  });

  it('should not allow self-transitions', () => {
    for (const [status, targets] of Object.entries(VALID_ENROLMENT_TRANSITIONS)) {
      expect(targets).not.toContain(status);
    }
  });

  describe('valid transitions', () => {
    const validTransitions: [string, string][] = [
      ['active', 'dropped'],
      ['active', 'completed'],
      ['dropped', 'active'],
    ];

    it.each(validTransitions)('should allow %s → %s', (from, to) => {
      expect(
        VALID_ENROLMENT_TRANSITIONS[from as keyof typeof VALID_ENROLMENT_TRANSITIONS],
      ).toContain(to);
    });
  });

  describe('invalid transitions', () => {
    const invalidTransitions: [string, string][] = [
      ['active', 'active'],
      ['dropped', 'completed'],
      ['completed', 'active'],
      ['completed', 'dropped'],
    ];

    it.each(invalidTransitions)('should not allow %s → %s', (from, to) => {
      expect(
        VALID_ENROLMENT_TRANSITIONS[from as keyof typeof VALID_ENROLMENT_TRANSITIONS],
      ).not.toContain(to);
    });
  });

  it('terminal status "completed" should have an empty transition array', () => {
    expect(VALID_ENROLMENT_TRANSITIONS.completed).toEqual([]);
  });
});
