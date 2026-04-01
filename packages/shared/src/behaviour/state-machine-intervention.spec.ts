import type { InterventionStatusKey } from './state-machine-intervention';
import {
  getValidInterventionTransitions,
  isTerminalInterventionStatus,
  isValidInterventionTransition,
} from './state-machine-intervention';

describe('Intervention State Machine', () => {
  // ─── isValidInterventionTransition ──────────────────────────────────────────

  describe('isValidInterventionTransition', () => {
    const validTransitions: [InterventionStatusKey, InterventionStatusKey][] = [
      ['planned', 'active_intervention'],
      ['planned', 'abandoned'],
      ['active_intervention', 'monitoring'],
      ['active_intervention', 'completed_intervention'],
      ['active_intervention', 'abandoned'],
      ['monitoring', 'completed_intervention'],
      ['monitoring', 'active_intervention'],
    ];

    it.each(validTransitions)('should allow transition from "%s" to "%s"', (from, to) => {
      expect(isValidInterventionTransition(from, to)).toBe(true);
    });

    const invalidTransitions: [InterventionStatusKey, InterventionStatusKey][] = [
      ['planned', 'monitoring'],
      ['planned', 'completed_intervention'],
      ['active_intervention', 'planned'],
      ['monitoring', 'planned'],
      ['monitoring', 'abandoned'],
    ];

    it.each(invalidTransitions)('should reject transition from "%s" to "%s"', (from, to) => {
      expect(isValidInterventionTransition(from, to)).toBe(false);
    });

    describe('terminal statuses block all outgoing transitions', () => {
      const terminalStatuses: InterventionStatusKey[] = ['completed_intervention', 'abandoned'];

      const allStatuses: InterventionStatusKey[] = [
        'planned',
        'active_intervention',
        'monitoring',
        'completed_intervention',
        'abandoned',
      ];

      for (const terminal of terminalStatuses) {
        it(`should block all transitions from terminal "${terminal}"`, () => {
          for (const target of allStatuses) {
            expect(isValidInterventionTransition(terminal, target)).toBe(false);
          }
        });
      }
    });
  });

  // ─── getValidInterventionTransitions ────────────────────────────────────────

  describe('getValidInterventionTransitions', () => {
    it('should return valid targets for planned', () => {
      const targets = getValidInterventionTransitions('planned');
      expect(targets).toEqual(expect.arrayContaining(['active_intervention', 'abandoned']));
      expect(targets).toHaveLength(2);
    });

    it('should return valid targets for active_intervention', () => {
      const targets = getValidInterventionTransitions('active_intervention');
      expect(targets).toEqual(
        expect.arrayContaining(['monitoring', 'completed_intervention', 'abandoned']),
      );
      expect(targets).toHaveLength(3);
    });

    it('should return valid targets for monitoring', () => {
      const targets = getValidInterventionTransitions('monitoring');
      expect(targets).toEqual(
        expect.arrayContaining(['completed_intervention', 'active_intervention']),
      );
      expect(targets).toHaveLength(2);
    });

    it('should return empty array for terminal statuses', () => {
      expect(getValidInterventionTransitions('completed_intervention')).toEqual([]);
      expect(getValidInterventionTransitions('abandoned')).toEqual([]);
    });
  });

  // ─── isTerminalInterventionStatus ───────────────────────────────────────────

  describe('isTerminalInterventionStatus', () => {
    it.each(['completed_intervention', 'abandoned'] as InterventionStatusKey[])(
      'should return true for terminal status "%s"',
      (status) => {
        expect(isTerminalInterventionStatus(status)).toBe(true);
      },
    );

    it.each(['planned', 'active_intervention', 'monitoring'] as InterventionStatusKey[])(
      'should return false for non-terminal status "%s"',
      (status) => {
        expect(isTerminalInterventionStatus(status)).toBe(false);
      },
    );
  });
});
