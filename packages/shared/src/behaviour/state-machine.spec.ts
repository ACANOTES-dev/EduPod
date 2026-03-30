import type { IncidentStatus } from './enums';
import {
  getValidTransitions,
  isTerminalStatus,
  isValidTransition,
  projectIncidentStatus,
} from './state-machine';

describe('Behaviour State Machine', () => {
  // ─── isValidTransition ──────────────────────────────────────────────────

  describe('isValidTransition', () => {
    const validTransitions: [IncidentStatus, IncidentStatus][] = [
      ['draft', 'active'],
      ['draft', 'withdrawn'],
      ['active', 'investigating'],
      ['active', 'under_review'],
      ['active', 'escalated'],
      ['active', 'resolved'],
      ['active', 'withdrawn'],
      ['investigating', 'awaiting_approval'],
      ['investigating', 'awaiting_parent_meeting'],
      ['investigating', 'resolved'],
      ['investigating', 'escalated'],
      ['investigating', 'converted_to_safeguarding'],
      ['awaiting_approval', 'active'],
      ['awaiting_approval', 'resolved'],
      ['awaiting_parent_meeting', 'resolved'],
      ['awaiting_parent_meeting', 'escalated'],
      ['under_review', 'active'],
      ['under_review', 'escalated'],
      ['under_review', 'resolved'],
      ['under_review', 'withdrawn'],
      ['escalated', 'investigating'],
      ['escalated', 'resolved'],
      ['resolved', 'closed_after_appeal'],
      ['resolved', 'superseded'],
    ];

    it.each(validTransitions)(
      'should allow transition from "%s" to "%s"',
      (from, to) => {
        expect(isValidTransition(from, to)).toBe(true);
      },
    );

    const invalidTransitions: [IncidentStatus, IncidentStatus][] = [
      ['draft', 'investigating'],
      ['draft', 'resolved'],
      ['draft', 'escalated'],
      ['active', 'draft'],
      ['active', 'awaiting_approval'],
      ['active', 'converted_to_safeguarding'],
      ['investigating', 'draft'],
      ['investigating', 'active'],
      ['investigating', 'withdrawn'],
      ['resolved', 'active'],
      ['resolved', 'draft'],
      ['resolved', 'investigating'],
    ];

    it.each(invalidTransitions)(
      'should reject transition from "%s" to "%s"',
      (from, to) => {
        expect(isValidTransition(from, to)).toBe(false);
      },
    );

    describe('terminal statuses block all outgoing transitions', () => {
      const terminalStatuses: IncidentStatus[] = [
        'withdrawn',
        'closed_after_appeal',
        'superseded',
        'converted_to_safeguarding',
      ];

      const allStatuses: IncidentStatus[] = [
        'draft', 'active', 'investigating', 'under_review',
        'awaiting_approval', 'awaiting_parent_meeting', 'escalated',
        'resolved', 'withdrawn', 'closed_after_appeal', 'superseded',
        'converted_to_safeguarding',
      ];

      for (const terminal of terminalStatuses) {
        it(`should block all transitions from terminal "${terminal}"`, () => {
          for (const target of allStatuses) {
            expect(isValidTransition(terminal, target)).toBe(false);
          }
        });
      }
    });
  });

  // ─── getValidTransitions ────────────────────────────────────────────────

  describe('getValidTransitions', () => {
    it('should return valid targets for draft', () => {
      const targets = getValidTransitions('draft');
      expect(targets).toEqual(expect.arrayContaining(['active', 'withdrawn']));
      expect(targets).toHaveLength(2);
    });

    it('should return valid targets for active', () => {
      const targets = getValidTransitions('active');
      expect(targets).toEqual(
        expect.arrayContaining([
          'investigating', 'under_review', 'escalated', 'resolved', 'withdrawn',
        ]),
      );
      expect(targets).toHaveLength(5);
    });

    it('should return empty array for terminal statuses', () => {
      expect(getValidTransitions('withdrawn')).toEqual([]);
      expect(getValidTransitions('closed_after_appeal')).toEqual([]);
      expect(getValidTransitions('superseded')).toEqual([]);
      expect(getValidTransitions('converted_to_safeguarding')).toEqual([]);
    });
  });

  // ─── isTerminalStatus ──────────────────────────────────────────────────

  describe('isTerminalStatus', () => {
    it.each([
      'withdrawn', 'closed_after_appeal', 'superseded', 'converted_to_safeguarding',
    ] as IncidentStatus[])('should return true for terminal status "%s"', (status) => {
      expect(isTerminalStatus(status)).toBe(true);
    });

    it.each([
      'draft', 'active', 'investigating', 'under_review',
      'awaiting_approval', 'awaiting_parent_meeting', 'escalated', 'resolved',
    ] as IncidentStatus[])('should return false for non-terminal status "%s"', (status) => {
      expect(isTerminalStatus(status)).toBe(false);
    });
  });

  // ─── projectIncidentStatus ─────────────────────────────────────────────

  describe('projectIncidentStatus', () => {
    it('should project converted_to_safeguarding as "closed" for non-safeguarding users', () => {
      expect(
        projectIncidentStatus('converted_to_safeguarding', false),
      ).toBe('closed');
    });

    it('should pass through converted_to_safeguarding for safeguarding users', () => {
      expect(
        projectIncidentStatus('converted_to_safeguarding', true),
      ).toBe('converted_to_safeguarding');
    });

    it('should pass through all other statuses regardless of user permissions', () => {
      const nonSafeguardingStatuses: IncidentStatus[] = [
        'draft', 'active', 'investigating', 'resolved',
        'withdrawn', 'escalated', 'under_review',
      ];
      for (const status of nonSafeguardingStatuses) {
        expect(projectIncidentStatus(status, false)).toBe(status);
        expect(projectIncidentStatus(status, true)).toBe(status);
      }
    });
  });
});
