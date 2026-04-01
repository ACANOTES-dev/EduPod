import type { SanctionStatusKey } from './state-machine-sanction';
import {
  getValidSanctionTransitions,
  isSanctionTerminal,
  isValidSanctionTransition,
} from './state-machine-sanction';

describe('Sanction State Machine', () => {
  // ─── isValidSanctionTransition ──────────────────────────────────────────────

  describe('isValidSanctionTransition', () => {
    const validTransitions: [SanctionStatusKey, SanctionStatusKey][] = [
      ['pending_approval', 'scheduled'],
      ['pending_approval', 'cancelled'],
      ['scheduled', 'served'],
      ['scheduled', 'partially_served'],
      ['scheduled', 'no_show'],
      ['scheduled', 'excused'],
      ['scheduled', 'cancelled'],
      ['scheduled', 'superseded'],
      ['scheduled', 'not_served_absent'],
      ['scheduled', 'appealed'],
      ['appealed', 'scheduled'],
      ['appealed', 'cancelled'],
      ['appealed', 'replaced'],
      ['no_show', 'superseded'],
      ['no_show', 'cancelled'],
      ['excused', 'superseded'],
      ['excused', 'cancelled'],
      ['not_served_absent', 'superseded'],
    ];

    it.each(validTransitions)('should allow transition from "%s" to "%s"', (from, to) => {
      expect(isValidSanctionTransition(from, to)).toBe(true);
    });

    const invalidTransitions: [SanctionStatusKey, SanctionStatusKey][] = [
      ['pending_approval', 'served'],
      ['pending_approval', 'appealed'],
      ['scheduled', 'pending_approval'],
      ['scheduled', 'rescheduled'],
      ['appealed', 'pending_approval'],
      ['appealed', 'served'],
      ['no_show', 'replaced'],
      ['no_show', 'served'],
      ['excused', 'replaced'],
      ['not_served_absent', 'cancelled'],
      ['not_served_absent', 'served'],
    ];

    it.each(invalidTransitions)('should reject transition from "%s" to "%s"', (from, to) => {
      expect(isValidSanctionTransition(from, to)).toBe(false);
    });

    describe('terminal statuses block all outgoing transitions', () => {
      const terminalStatuses: SanctionStatusKey[] = [
        'served',
        'partially_served',
        'cancelled',
        'replaced',
        'superseded',
      ];

      const allStatuses: SanctionStatusKey[] = [
        'pending_approval',
        'scheduled',
        'served',
        'partially_served',
        'no_show',
        'excused',
        'cancelled',
        'rescheduled',
        'not_served_absent',
        'appealed',
        'replaced',
        'superseded',
      ];

      for (const terminal of terminalStatuses) {
        it(`should block all transitions from terminal "${terminal}"`, () => {
          for (const target of allStatuses) {
            expect(isValidSanctionTransition(terminal, target)).toBe(false);
          }
        });
      }
    });
  });

  // ─── getValidSanctionTransitions ────────────────────────────────────────────

  describe('getValidSanctionTransitions', () => {
    it('should return valid targets for pending_approval', () => {
      const targets = getValidSanctionTransitions('pending_approval');
      expect(targets).toEqual(expect.arrayContaining(['scheduled', 'cancelled']));
      expect(targets).toHaveLength(2);
    });

    it('should return valid targets for scheduled', () => {
      const targets = getValidSanctionTransitions('scheduled');
      expect(targets).toEqual(
        expect.arrayContaining([
          'served',
          'partially_served',
          'no_show',
          'excused',
          'cancelled',
          'superseded',
          'not_served_absent',
          'appealed',
        ]),
      );
      expect(targets).toHaveLength(8);
    });

    it('should return valid targets for appealed', () => {
      const targets = getValidSanctionTransitions('appealed');
      expect(targets).toEqual(expect.arrayContaining(['scheduled', 'cancelled', 'replaced']));
      expect(targets).toHaveLength(3);
    });

    it('should return valid targets for no_show', () => {
      const targets = getValidSanctionTransitions('no_show');
      expect(targets).toEqual(expect.arrayContaining(['superseded', 'cancelled']));
      expect(targets).toHaveLength(2);
    });

    it('should return valid targets for excused', () => {
      const targets = getValidSanctionTransitions('excused');
      expect(targets).toEqual(expect.arrayContaining(['superseded', 'cancelled']));
      expect(targets).toHaveLength(2);
    });

    it('should return valid targets for not_served_absent', () => {
      const targets = getValidSanctionTransitions('not_served_absent');
      expect(targets).toEqual(['superseded']);
      expect(targets).toHaveLength(1);
    });

    it('should return empty array for terminal statuses', () => {
      expect(getValidSanctionTransitions('served')).toEqual([]);
      expect(getValidSanctionTransitions('partially_served')).toEqual([]);
      expect(getValidSanctionTransitions('cancelled')).toEqual([]);
      expect(getValidSanctionTransitions('replaced')).toEqual([]);
      expect(getValidSanctionTransitions('superseded')).toEqual([]);
    });
  });

  // ─── isSanctionTerminal ─────────────────────────────────────────────────────

  describe('isSanctionTerminal', () => {
    it.each([
      'served',
      'partially_served',
      'cancelled',
      'replaced',
      'superseded',
    ] as SanctionStatusKey[])('should return true for terminal status "%s"', (status) => {
      expect(isSanctionTerminal(status)).toBe(true);
    });

    it.each([
      'pending_approval',
      'scheduled',
      'no_show',
      'excused',
      'rescheduled',
      'not_served_absent',
      'appealed',
    ] as SanctionStatusKey[])('should return false for non-terminal status "%s"', (status) => {
      expect(isSanctionTerminal(status)).toBe(false);
    });
  });
});
