import type { AppealStatusKey } from './state-machine-appeal';
import {
  getValidAppealTransitions,
  isAppealTerminal,
  isValidAppealTransition,
} from './state-machine-appeal';

describe('Appeal State Machine', () => {
  // ─── isValidAppealTransition ────────────────────────────────────────────────

  describe('isValidAppealTransition', () => {
    const validTransitions: [AppealStatusKey, AppealStatusKey][] = [
      ['submitted', 'under_review'],
      ['submitted', 'withdrawn_appeal'],
      ['under_review', 'hearing_scheduled'],
      ['under_review', 'decided'],
      ['under_review', 'withdrawn_appeal'],
      ['hearing_scheduled', 'decided'],
      ['hearing_scheduled', 'withdrawn_appeal'],
    ];

    it.each(validTransitions)('should allow transition from "%s" to "%s"', (from, to) => {
      expect(isValidAppealTransition(from, to)).toBe(true);
    });

    const invalidTransitions: [AppealStatusKey, AppealStatusKey][] = [
      ['submitted', 'decided'],
      ['submitted', 'hearing_scheduled'],
      ['under_review', 'submitted'],
      ['hearing_scheduled', 'submitted'],
      ['hearing_scheduled', 'under_review'],
    ];

    it.each(invalidTransitions)('should reject transition from "%s" to "%s"', (from, to) => {
      expect(isValidAppealTransition(from, to)).toBe(false);
    });

    describe('terminal statuses block all outgoing transitions', () => {
      const terminalStatuses: AppealStatusKey[] = ['decided', 'withdrawn_appeal'];

      const allStatuses: AppealStatusKey[] = [
        'submitted',
        'under_review',
        'hearing_scheduled',
        'decided',
        'withdrawn_appeal',
      ];

      for (const terminal of terminalStatuses) {
        it(`should block all transitions from terminal "${terminal}"`, () => {
          for (const target of allStatuses) {
            expect(isValidAppealTransition(terminal, target)).toBe(false);
          }
        });
      }
    });
  });

  // ─── getValidAppealTransitions ──────────────────────────────────────────────

  describe('getValidAppealTransitions', () => {
    it('should return valid targets for submitted', () => {
      const targets = getValidAppealTransitions('submitted');
      expect(targets).toEqual(expect.arrayContaining(['under_review', 'withdrawn_appeal']));
      expect(targets).toHaveLength(2);
    });

    it('should return valid targets for under_review', () => {
      const targets = getValidAppealTransitions('under_review');
      expect(targets).toEqual(
        expect.arrayContaining(['hearing_scheduled', 'decided', 'withdrawn_appeal']),
      );
      expect(targets).toHaveLength(3);
    });

    it('should return valid targets for hearing_scheduled', () => {
      const targets = getValidAppealTransitions('hearing_scheduled');
      expect(targets).toEqual(expect.arrayContaining(['decided', 'withdrawn_appeal']));
      expect(targets).toHaveLength(2);
    });

    it('should return empty array for terminal statuses', () => {
      expect(getValidAppealTransitions('decided')).toEqual([]);
      expect(getValidAppealTransitions('withdrawn_appeal')).toEqual([]);
    });
  });

  // ─── isAppealTerminal ──────────────────────────────────────────────────────

  describe('isAppealTerminal', () => {
    it.each(['decided', 'withdrawn_appeal'] as AppealStatusKey[])(
      'should return true for terminal status "%s"',
      (status) => {
        expect(isAppealTerminal(status)).toBe(true);
      },
    );

    it.each(['submitted', 'under_review', 'hearing_scheduled'] as AppealStatusKey[])(
      'should return false for non-terminal status "%s"',
      (status) => {
        expect(isAppealTerminal(status)).toBe(false);
      },
    );
  });
});
