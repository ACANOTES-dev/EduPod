import type { ExclusionStatusKey } from './state-machine-exclusion';
import {
  getValidExclusionTransitions,
  isExclusionTerminal,
  isValidExclusionTransition,
} from './state-machine-exclusion';

describe('Exclusion State Machine', () => {
  // ─── isValidExclusionTransition ─────────────────────────────────────────────

  describe('isValidExclusionTransition', () => {
    const validTransitions: [ExclusionStatusKey, ExclusionStatusKey][] = [
      ['initiated', 'notice_issued'],
      ['notice_issued', 'hearing_scheduled_exc'],
      ['hearing_scheduled_exc', 'hearing_held'],
      ['hearing_held', 'decision_made'],
      ['decision_made', 'appeal_window'],
      ['appeal_window', 'finalised'],
      ['appeal_window', 'overturned'],
    ];

    it.each(validTransitions)('should allow transition from "%s" to "%s"', (from, to) => {
      expect(isValidExclusionTransition(from, to)).toBe(true);
    });

    const invalidTransitions: [ExclusionStatusKey, ExclusionStatusKey][] = [
      ['initiated', 'hearing_scheduled_exc'],
      ['initiated', 'finalised'],
      ['notice_issued', 'hearing_held'],
      ['notice_issued', 'initiated'],
      ['hearing_scheduled_exc', 'decision_made'],
      ['hearing_scheduled_exc', 'notice_issued'],
      ['hearing_held', 'appeal_window'],
      ['hearing_held', 'hearing_scheduled_exc'],
      ['decision_made', 'finalised'],
      ['decision_made', 'hearing_held'],
      ['appeal_window', 'decision_made'],
      ['appeal_window', 'initiated'],
    ];

    it.each(invalidTransitions)('should reject transition from "%s" to "%s"', (from, to) => {
      expect(isValidExclusionTransition(from, to)).toBe(false);
    });

    describe('terminal statuses block all outgoing transitions', () => {
      const terminalStatuses: ExclusionStatusKey[] = ['finalised', 'overturned'];

      const allStatuses: ExclusionStatusKey[] = [
        'initiated',
        'notice_issued',
        'hearing_scheduled_exc',
        'hearing_held',
        'decision_made',
        'appeal_window',
        'finalised',
        'overturned',
      ];

      for (const terminal of terminalStatuses) {
        it(`should block all transitions from terminal "${terminal}"`, () => {
          for (const target of allStatuses) {
            expect(isValidExclusionTransition(terminal, target)).toBe(false);
          }
        });
      }
    });
  });

  // ─── getValidExclusionTransitions ───────────────────────────────────────────

  describe('getValidExclusionTransitions', () => {
    it('should return valid targets for initiated', () => {
      expect(getValidExclusionTransitions('initiated')).toEqual(['notice_issued']);
    });

    it('should return valid targets for notice_issued', () => {
      expect(getValidExclusionTransitions('notice_issued')).toEqual(['hearing_scheduled_exc']);
    });

    it('should return valid targets for hearing_scheduled_exc', () => {
      expect(getValidExclusionTransitions('hearing_scheduled_exc')).toEqual(['hearing_held']);
    });

    it('should return valid targets for hearing_held', () => {
      expect(getValidExclusionTransitions('hearing_held')).toEqual(['decision_made']);
    });

    it('should return valid targets for decision_made', () => {
      expect(getValidExclusionTransitions('decision_made')).toEqual(['appeal_window']);
    });

    it('should return valid targets for appeal_window', () => {
      const targets = getValidExclusionTransitions('appeal_window');
      expect(targets).toEqual(expect.arrayContaining(['finalised', 'overturned']));
      expect(targets).toHaveLength(2);
    });

    it('should return empty array for terminal statuses', () => {
      expect(getValidExclusionTransitions('finalised')).toEqual([]);
      expect(getValidExclusionTransitions('overturned')).toEqual([]);
    });
  });

  // ─── isExclusionTerminal ────────────────────────────────────────────────────

  describe('isExclusionTerminal', () => {
    it.each(['finalised', 'overturned'] as ExclusionStatusKey[])(
      'should return true for terminal status "%s"',
      (status) => {
        expect(isExclusionTerminal(status)).toBe(true);
      },
    );

    it.each([
      'initiated',
      'notice_issued',
      'hearing_scheduled_exc',
      'hearing_held',
      'decision_made',
      'appeal_window',
    ] as ExclusionStatusKey[])('should return false for non-terminal status "%s"', (status) => {
      expect(isExclusionTerminal(status)).toBe(false);
    });
  });
});
