import type { BehaviourTaskStatus } from './enums';
import {
  getValidTaskTransitions,
  isTerminalTaskStatus,
  isValidTaskTransition,
} from './state-machine-task';

describe('Task State Machine', () => {
  // ─── isValidTaskTransition ──────────────────────────────────────────────

  describe('isValidTaskTransition', () => {
    const validTransitions: [BehaviourTaskStatus, BehaviourTaskStatus][] = [
      ['pending', 'in_progress'],
      ['pending', 'completed'],
      ['pending', 'cancelled'],
      ['pending', 'overdue'],
      ['in_progress', 'completed'],
      ['in_progress', 'cancelled'],
      ['in_progress', 'overdue'],
      ['overdue', 'in_progress'],
      ['overdue', 'completed'],
      ['overdue', 'cancelled'],
    ];

    it.each(validTransitions)(
      'should allow transition from "%s" to "%s"',
      (from, to) => {
        expect(isValidTaskTransition(from, to)).toBe(true);
      },
    );

    const invalidTransitions: [BehaviourTaskStatus, BehaviourTaskStatus][] = [
      ['completed', 'pending'],
      ['completed', 'in_progress'],
      ['completed', 'cancelled'],
      ['completed', 'overdue'],
      ['completed', 'completed'],
      ['cancelled', 'pending'],
      ['cancelled', 'in_progress'],
      ['cancelled', 'completed'],
      ['cancelled', 'overdue'],
      ['cancelled', 'cancelled'],
      ['pending', 'pending'],
      ['in_progress', 'pending'],
      ['in_progress', 'in_progress'],
      ['overdue', 'overdue'],
    ];

    it.each(invalidTransitions)(
      'should reject transition from "%s" to "%s"',
      (from, to) => {
        expect(isValidTaskTransition(from, to)).toBe(false);
      },
    );

    describe('terminal statuses block all outgoing transitions', () => {
      const terminalStatuses: BehaviourTaskStatus[] = ['completed', 'cancelled'];

      const allStatuses: BehaviourTaskStatus[] = [
        'pending', 'in_progress', 'completed', 'cancelled', 'overdue',
      ];

      for (const terminal of terminalStatuses) {
        it(`should block all transitions from terminal "${terminal}"`, () => {
          for (const target of allStatuses) {
            expect(isValidTaskTransition(terminal, target)).toBe(false);
          }
        });
      }
    });
  });

  // ─── getValidTaskTransitions ────────────────────────────────────────────

  describe('getValidTaskTransitions', () => {
    it('should return valid targets for pending', () => {
      const targets = getValidTaskTransitions('pending');
      expect(targets).toEqual(
        expect.arrayContaining(['in_progress', 'completed', 'cancelled', 'overdue']),
      );
      expect(targets).toHaveLength(4);
    });

    it('should return valid targets for in_progress', () => {
      const targets = getValidTaskTransitions('in_progress');
      expect(targets).toEqual(
        expect.arrayContaining(['completed', 'cancelled', 'overdue']),
      );
      expect(targets).toHaveLength(3);
    });

    it('should return valid targets for overdue', () => {
      const targets = getValidTaskTransitions('overdue');
      expect(targets).toEqual(
        expect.arrayContaining(['in_progress', 'completed', 'cancelled']),
      );
      expect(targets).toHaveLength(3);
    });

    it('should return empty array for terminal statuses', () => {
      expect(getValidTaskTransitions('completed')).toEqual([]);
      expect(getValidTaskTransitions('cancelled')).toEqual([]);
    });
  });

  // ─── isTerminalTaskStatus ──────────────────────────────────────────────

  describe('isTerminalTaskStatus', () => {
    it.each([
      'completed', 'cancelled',
    ] as BehaviourTaskStatus[])('should return true for terminal status "%s"', (status) => {
      expect(isTerminalTaskStatus(status)).toBe(true);
    });

    it.each([
      'pending', 'in_progress', 'overdue',
    ] as BehaviourTaskStatus[])('should return false for non-terminal status "%s"', (status) => {
      expect(isTerminalTaskStatus(status)).toBe(false);
    });
  });
});
