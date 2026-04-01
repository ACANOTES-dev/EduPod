import type { SafeguardingStatus } from './safeguarding-state-machine';
import {
  getValidSafeguardingTransitions,
  isSafeguardingTerminal,
  isValidSafeguardingTransition,
} from './safeguarding-state-machine';

describe('Safeguarding State Machine', () => {
  // ─── isValidSafeguardingTransition ──────────────────────────────────────────

  describe('isValidSafeguardingTransition', () => {
    const validTransitions: [SafeguardingStatus, SafeguardingStatus][] = [
      ['reported', 'acknowledged'],
      ['acknowledged', 'under_investigation'],
      ['under_investigation', 'referred'],
      ['under_investigation', 'monitoring'],
      ['under_investigation', 'resolved'],
      ['referred', 'monitoring'],
      ['referred', 'resolved'],
      ['monitoring', 'resolved'],
      ['resolved', 'sealed'],
    ];

    it.each(validTransitions)('should allow transition from "%s" to "%s"', (from, to) => {
      expect(isValidSafeguardingTransition(from, to)).toBe(true);
    });

    const invalidTransitions: [SafeguardingStatus, SafeguardingStatus][] = [
      ['reported', 'under_investigation'],
      ['reported', 'resolved'],
      ['acknowledged', 'reported'],
      ['acknowledged', 'referred'],
      ['under_investigation', 'reported'],
      ['under_investigation', 'acknowledged'],
      ['under_investigation', 'sealed'],
      ['referred', 'acknowledged'],
      ['referred', 'sealed'],
      ['monitoring', 'referred'],
      ['monitoring', 'sealed'],
      ['resolved', 'monitoring'],
      ['resolved', 'reported'],
    ];

    it.each(invalidTransitions)('should reject transition from "%s" to "%s"', (from, to) => {
      expect(isValidSafeguardingTransition(from, to)).toBe(false);
    });

    describe('terminal statuses block all outgoing transitions', () => {
      const terminalStatuses: SafeguardingStatus[] = ['sealed'];

      const allStatuses: SafeguardingStatus[] = [
        'reported',
        'acknowledged',
        'under_investigation',
        'referred',
        'monitoring',
        'resolved',
        'sealed',
      ];

      for (const terminal of terminalStatuses) {
        it(`should block all transitions from terminal "${terminal}"`, () => {
          for (const target of allStatuses) {
            expect(isValidSafeguardingTransition(terminal, target)).toBe(false);
          }
        });
      }
    });
  });

  // ─── getValidSafeguardingTransitions ────────────────────────────────────────

  describe('getValidSafeguardingTransitions', () => {
    it('should return valid targets for reported', () => {
      expect(getValidSafeguardingTransitions('reported')).toEqual(['acknowledged']);
    });

    it('should return valid targets for acknowledged', () => {
      expect(getValidSafeguardingTransitions('acknowledged')).toEqual(['under_investigation']);
    });

    it('should return valid targets for under_investigation', () => {
      const targets = getValidSafeguardingTransitions('under_investigation');
      expect(targets).toEqual(expect.arrayContaining(['referred', 'monitoring', 'resolved']));
      expect(targets).toHaveLength(3);
    });

    it('should return valid targets for referred', () => {
      const targets = getValidSafeguardingTransitions('referred');
      expect(targets).toEqual(expect.arrayContaining(['monitoring', 'resolved']));
      expect(targets).toHaveLength(2);
    });

    it('should return valid targets for monitoring', () => {
      expect(getValidSafeguardingTransitions('monitoring')).toEqual(['resolved']);
    });

    it('should return valid targets for resolved', () => {
      expect(getValidSafeguardingTransitions('resolved')).toEqual(['sealed']);
    });

    it('should return empty array for terminal statuses', () => {
      expect(getValidSafeguardingTransitions('sealed')).toEqual([]);
    });
  });

  // ─── isSafeguardingTerminal ─────────────────────────────────────────────────

  describe('isSafeguardingTerminal', () => {
    it('should return true for terminal status "sealed"', () => {
      expect(isSafeguardingTerminal('sealed')).toBe(true);
    });

    it.each([
      'reported',
      'acknowledged',
      'under_investigation',
      'referred',
      'monitoring',
      'resolved',
    ] as SafeguardingStatus[])('should return false for non-terminal status "%s"', (status) => {
      expect(isSafeguardingTerminal(status)).toBe(false);
    });
  });
});
