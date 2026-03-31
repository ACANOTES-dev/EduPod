import type { SenGoalStatus, SupportPlanStatus } from './enums';
import {
  getValidGoalStatusTransitions,
  getValidSupportPlanTransitions,
  isTerminalGoalStatus,
  isTerminalSupportPlanStatus,
  isValidGoalStatusTransition,
  isValidSupportPlanTransition,
} from './state-machine';

describe('SEN state machines', () => {
  describe('support plan transitions', () => {
    const validTransitions: [SupportPlanStatus, SupportPlanStatus][] = [
      ['draft', 'active'],
      ['active', 'under_review'],
      ['active', 'closed'],
      ['under_review', 'active'],
      ['under_review', 'closed'],
      ['closed', 'archived'],
    ];

    it.each(validTransitions)('allows support plan transition from %s to %s', (from, to) => {
      expect(isValidSupportPlanTransition(from, to)).toBe(true);
    });

    const invalidTransitions: [SupportPlanStatus, SupportPlanStatus][] = [
      ['draft', 'under_review'],
      ['draft', 'closed'],
      ['active', 'archived'],
      ['under_review', 'archived'],
      ['archived', 'active'],
    ];

    it.each(invalidTransitions)('rejects support plan transition from %s to %s', (from, to) => {
      expect(isValidSupportPlanTransition(from, to)).toBe(false);
    });

    it('returns terminal support plan states correctly', () => {
      expect(isTerminalSupportPlanStatus('archived')).toBe(true);
      expect(isTerminalSupportPlanStatus('active')).toBe(false);
    });

    it('returns valid support plan transitions for a state', () => {
      expect(getValidSupportPlanTransitions('under_review')).toEqual(
        expect.arrayContaining(['active', 'closed']),
      );
    });
  });

  describe('goal status transitions', () => {
    const validTransitions: [SenGoalStatus, SenGoalStatus][] = [
      ['not_started', 'in_progress'],
      ['in_progress', 'partially_achieved'],
      ['in_progress', 'achieved'],
      ['in_progress', 'discontinued'],
      ['partially_achieved', 'in_progress'],
      ['partially_achieved', 'achieved'],
      ['partially_achieved', 'discontinued'],
    ];

    it.each(validTransitions)('allows goal status transition from %s to %s', (from, to) => {
      expect(isValidGoalStatusTransition(from, to)).toBe(true);
    });

    const invalidTransitions: [SenGoalStatus, SenGoalStatus][] = [
      ['not_started', 'achieved'],
      ['not_started', 'discontinued'],
      ['achieved', 'in_progress'],
      ['discontinued', 'in_progress'],
    ];

    it.each(invalidTransitions)('rejects goal status transition from %s to %s', (from, to) => {
      expect(isValidGoalStatusTransition(from, to)).toBe(false);
    });

    it('returns terminal goal states correctly', () => {
      expect(isTerminalGoalStatus('achieved')).toBe(true);
      expect(isTerminalGoalStatus('discontinued')).toBe(true);
      expect(isTerminalGoalStatus('in_progress')).toBe(false);
    });

    it('returns valid goal transitions for a state', () => {
      expect(getValidGoalStatusTransitions('in_progress')).toEqual(
        expect.arrayContaining(['partially_achieved', 'achieved', 'discontinued']),
      );
    });
  });
});
