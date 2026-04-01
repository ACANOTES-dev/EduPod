import {
  getValidCaseTransitions,
  isCaseTerminal,
  isValidCaseTransition,
} from './case-state-machine';
import type { CaseStatus } from './enums';

describe('Pastoral Case State Machine', () => {
  // ─── isValidCaseTransition ──────────────────────────────────────────────────

  describe('isValidCaseTransition', () => {
    const validTransitions: [CaseStatus, CaseStatus][] = [
      ['open', 'active'],
      ['active', 'monitoring'],
      ['active', 'resolved'],
      ['monitoring', 'active'],
      ['monitoring', 'resolved'],
      ['resolved', 'closed'],
      ['closed', 'open'],
    ];

    it.each(validTransitions)('should allow transition from "%s" to "%s"', (from, to) => {
      expect(isValidCaseTransition(from, to)).toBe(true);
    });

    const invalidTransitions: [CaseStatus, CaseStatus][] = [
      ['open', 'monitoring'],
      ['open', 'resolved'],
      ['open', 'closed'],
      ['active', 'open'],
      ['active', 'closed'],
      ['monitoring', 'open'],
      ['monitoring', 'closed'],
      ['resolved', 'open'],
      ['resolved', 'active'],
      ['resolved', 'monitoring'],
      ['closed', 'active'],
      ['closed', 'monitoring'],
      ['closed', 'resolved'],
    ];

    it.each(invalidTransitions)('should reject transition from "%s" to "%s"', (from, to) => {
      expect(isValidCaseTransition(from, to)).toBe(false);
    });

    it('should reject self-transitions for all statuses', () => {
      const allStatuses: CaseStatus[] = ['open', 'active', 'monitoring', 'resolved', 'closed'];
      for (const status of allStatuses) {
        expect(isValidCaseTransition(status, status)).toBe(false);
      }
    });
  });

  // ─── getValidCaseTransitions ────────────────────────────────────────────────

  describe('getValidCaseTransitions', () => {
    it('should return valid targets for open', () => {
      expect(getValidCaseTransitions('open')).toEqual(['active']);
    });

    it('should return valid targets for active', () => {
      const targets = getValidCaseTransitions('active');
      expect(targets).toEqual(expect.arrayContaining(['monitoring', 'resolved']));
      expect(targets).toHaveLength(2);
    });

    it('should return valid targets for monitoring', () => {
      const targets = getValidCaseTransitions('monitoring');
      expect(targets).toEqual(expect.arrayContaining(['active', 'resolved']));
      expect(targets).toHaveLength(2);
    });

    it('should return valid targets for resolved', () => {
      expect(getValidCaseTransitions('resolved')).toEqual(['closed']);
    });

    it('should return valid targets for closed (cyclic — can reopen)', () => {
      expect(getValidCaseTransitions('closed')).toEqual(['open']);
    });
  });

  // ─── isCaseTerminal ─────────────────────────────────────────────────────────

  describe('isCaseTerminal', () => {
    const allStatuses: CaseStatus[] = ['open', 'active', 'monitoring', 'resolved', 'closed'];

    it.each(allStatuses)(
      'should return false for "%s" — no terminal states in this state machine',
      (status) => {
        expect(isCaseTerminal(status)).toBe(false);
      },
    );
  });
});
