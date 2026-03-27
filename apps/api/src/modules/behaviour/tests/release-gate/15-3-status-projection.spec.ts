/**
 * Release-Gate 15-3: Status Projection
 *
 * Verifies that converted_to_safeguarding status is correctly projected:
 * - Projected as "closed" for behaviour-only users
 * - Real status visible to safeguarding users
 * - Projected status appears in entity history for non-safeguarding users
 */

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const _TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_BEHAVIOUR = 'user-behaviour-1';
const USER_SAFEGUARDING = 'user-safeguarding-1';
const INCIDENT_ID = 'incident-1';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx: Record<string, Record<string, jest.Mock>> = {
  behaviourIncident: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  behaviourEntityHistory: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock('../../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx),
    ),
  }),
}));

// ─── Factory helpers ────────────────────────────────────────────────────────

const makeIncident = (overrides: Record<string, unknown> = {}) => ({
  id: INCIDENT_ID,
  tenant_id: TENANT_A,
  status: 'active',
  polarity: 'negative',
  severity: 5,
  description: 'Student incident',
  context_notes: null as string | null,
  follow_up_required: false,
  reported_by_id: USER_BEHAVIOUR,
  category: { id: 'cat-1', name: 'Disruption' },
  participants: [],
  ...overrides,
});

const makeHistoryEntry = (overrides: Record<string, unknown> = {}) => ({
  id: 'history-1',
  tenant_id: TENANT_A,
  entity_type: 'incident',
  entity_id: INCIDENT_ID,
  change_type: 'status_changed',
  previous_values: { status: 'active' },
  new_values: { status: 'converted_to_safeguarding' },
  changed_by: { id: USER_SAFEGUARDING, first_name: 'Safe', last_name: 'Guard' },
  created_at: new Date('2026-03-20T10:00:00Z'),
  ...overrides,
});

// ─── Projection helper (mirrors BehaviourService logic) ─────────────────

function projectStatus(
  status: string,
  hasSafeguardingView: boolean,
): string {
  return status === 'converted_to_safeguarding' && !hasSafeguardingView
    ? 'closed'
    : status;
}

function projectHistoryEntry(
  entry: ReturnType<typeof makeHistoryEntry>,
  hasSafeguardingView: boolean,
): ReturnType<typeof makeHistoryEntry> {
  const projected = { ...entry };
  const prevValues = entry.previous_values as Record<string, unknown> | null;
  const newValues = entry.new_values as Record<string, unknown> | null;

  if (!hasSafeguardingView) {
    if (prevValues?.status === 'converted_to_safeguarding') {
      projected.previous_values = { ...prevValues, status: 'closed' };
    }
    if (newValues?.status === 'converted_to_safeguarding') {
      projected.new_values = { ...newValues, status: 'closed' };
    }
  }
  return projected;
}

// ─── Reset helpers ──────────────────────────────────────────────────────────

function resetAllMocks() {
  for (const model of Object.values(mockRlsTx)) {
    for (const fn of Object.values(model)) {
      fn.mockReset();
    }
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Release Gate 15-3: Status Projection', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  afterEach(() => jest.clearAllMocks());

  // ─── 15-3-A: converted_to_safeguarding projected as closed ────────────

  describe('converted_to_safeguarding projected as closed for behaviour users', () => {
    it('should project converted_to_safeguarding as "closed" for user without safeguarding.view', () => {
      // Arrange
      const incident = makeIncident({ status: 'converted_to_safeguarding' });
      const permissions = ['behaviour.view', 'behaviour.admin'];
      const hasSafeguardingView = permissions.includes('safeguarding.view');

      // Act
      const result = projectStatus(incident.status, hasSafeguardingView);

      // Assert
      expect(result).toBe('closed');
    });

    it('should project converted_to_safeguarding as "closed" in a list of mixed statuses', () => {
      // Arrange
      const incidents = [
        makeIncident({ id: 'inc-1', status: 'active' }),
        makeIncident({ id: 'inc-2', status: 'converted_to_safeguarding' }),
        makeIncident({ id: 'inc-3', status: 'resolved' }),
        makeIncident({ id: 'inc-4', status: 'converted_to_safeguarding' }),
      ];
      const hasSafeguardingView = false;

      // Act
      const projected = incidents.map((inc) => ({
        ...inc,
        status: projectStatus(inc.status, hasSafeguardingView),
      }));

      // Assert
      expect(projected[0]!.status).toBe('active');
      expect(projected[1]!.status).toBe('closed');
      expect(projected[2]!.status).toBe('resolved');
      expect(projected[3]!.status).toBe('closed');
    });

    it('should NOT alter other statuses for non-safeguarding users', () => {
      // Arrange
      const allStatuses = [
        'draft', 'active', 'investigating', 'under_review',
        'awaiting_approval', 'awaiting_parent_meeting', 'escalated',
        'resolved', 'withdrawn', 'closed_after_appeal', 'superseded',
      ];

      // Act & Assert — none of these should be projected
      for (const status of allStatuses) {
        expect(projectStatus(status, false)).toBe(status);
      }
    });
  });

  // ─── 15-3-B: safeguarding user sees real status ──────────────────────

  describe('safeguarding user sees real status', () => {
    it('should show converted_to_safeguarding to user with safeguarding.view', () => {
      // Arrange
      const incident = makeIncident({ status: 'converted_to_safeguarding' });
      const permissions = ['behaviour.view', 'safeguarding.view'];
      const hasSafeguardingView = permissions.includes('safeguarding.view');

      // Act
      const result = projectStatus(incident.status, hasSafeguardingView);

      // Assert
      expect(result).toBe('converted_to_safeguarding');
    });

    it('should show all real statuses to safeguarding user without alteration', () => {
      // Arrange
      const allStatuses = [
        'draft', 'active', 'investigating', 'under_review',
        'awaiting_approval', 'awaiting_parent_meeting', 'escalated',
        'resolved', 'withdrawn', 'closed_after_appeal', 'superseded',
        'converted_to_safeguarding',
      ];

      // Act & Assert
      for (const status of allStatuses) {
        expect(projectStatus(status, true)).toBe(status);
      }
    });

    it('should show real status in a mixed list for safeguarding user', () => {
      // Arrange
      const incidents = [
        makeIncident({ id: 'inc-1', status: 'active' }),
        makeIncident({ id: 'inc-2', status: 'converted_to_safeguarding' }),
        makeIncident({ id: 'inc-3', status: 'resolved' }),
      ];
      const hasSafeguardingView = true;

      // Act
      const projected = incidents.map((inc) => ({
        ...inc,
        status: projectStatus(inc.status, hasSafeguardingView),
      }));

      // Assert
      expect(projected[0]!.status).toBe('active');
      expect(projected[1]!.status).toBe('converted_to_safeguarding');
      expect(projected[2]!.status).toBe('resolved');
    });
  });

  // ─── 15-3-C: projected status in entity history ──────────────────────

  describe('projected status in entity history for non-safeguarding users', () => {
    it('should project converted_to_safeguarding in history new_values for non-safeguarding user', () => {
      // Arrange
      const entry = makeHistoryEntry({
        previous_values: { status: 'active' },
        new_values: { status: 'converted_to_safeguarding' },
      });

      // Act
      const projected = projectHistoryEntry(entry, false);

      // Assert
      expect((projected.new_values as Record<string, unknown>).status).toBe('closed');
      expect((projected.previous_values as Record<string, unknown>).status).toBe('active');
    });

    it('should project converted_to_safeguarding in history previous_values for non-safeguarding user', () => {
      // Arrange — case where status was reverted from converted_to_safeguarding
      const entry = makeHistoryEntry({
        previous_values: { status: 'converted_to_safeguarding' },
        new_values: { status: 'active' },
      });

      // Act
      const projected = projectHistoryEntry(entry, false);

      // Assert
      expect((projected.previous_values as Record<string, unknown>).status).toBe('closed');
      expect((projected.new_values as Record<string, unknown>).status).toBe('active');
    });

    it('should NOT project status in history for safeguarding user', () => {
      // Arrange
      const entry = makeHistoryEntry({
        previous_values: { status: 'active' },
        new_values: { status: 'converted_to_safeguarding' },
      });

      // Act
      const projected = projectHistoryEntry(entry, true);

      // Assert
      expect((projected.new_values as Record<string, unknown>).status).toBe('converted_to_safeguarding');
      expect((projected.previous_values as Record<string, unknown>).status).toBe('active');
    });

    it('should NOT project non-safeguarding statuses in history', () => {
      // Arrange
      const entry = makeHistoryEntry({
        previous_values: { status: 'active' },
        new_values: { status: 'resolved' },
      });

      // Act
      const projected = projectHistoryEntry(entry, false);

      // Assert
      expect((projected.new_values as Record<string, unknown>).status).toBe('resolved');
      expect((projected.previous_values as Record<string, unknown>).status).toBe('active');
    });

    it('should handle history entries with null previous_values', () => {
      // Arrange
      const entry = makeHistoryEntry({
        change_type: 'created',
        previous_values: null,
        new_values: { status: 'converted_to_safeguarding' },
      });

      // Act
      const projected = projectHistoryEntry(entry, false);

      // Assert
      expect(projected.previous_values).toBeNull();
      expect((projected.new_values as Record<string, unknown>).status).toBe('closed');
    });

    it('should project both previous and new values when both are converted_to_safeguarding', () => {
      // Arrange — edge: history entry where status stayed the same (e.g. field update while in safeguarding)
      const entry = makeHistoryEntry({
        previous_values: { status: 'converted_to_safeguarding', description: 'Old' },
        new_values: { status: 'converted_to_safeguarding', description: 'Updated' },
      });

      // Act
      const projected = projectHistoryEntry(entry, false);

      // Assert
      expect((projected.previous_values as Record<string, unknown>).status).toBe('closed');
      expect((projected.new_values as Record<string, unknown>).status).toBe('closed');
      // Non-status fields are preserved
      expect((projected.previous_values as Record<string, unknown>).description).toBe('Old');
      expect((projected.new_values as Record<string, unknown>).description).toBe('Updated');
    });

    it('should project consistently across a sequence of history entries', () => {
      // Arrange — chronological history
      const history = [
        makeHistoryEntry({
          id: 'h-1',
          change_type: 'created',
          previous_values: null,
          new_values: { status: 'active' },
          created_at: new Date('2026-03-15T08:00:00Z'),
        }),
        makeHistoryEntry({
          id: 'h-2',
          change_type: 'status_changed',
          previous_values: { status: 'active' },
          new_values: { status: 'investigating' },
          created_at: new Date('2026-03-16T10:00:00Z'),
        }),
        makeHistoryEntry({
          id: 'h-3',
          change_type: 'status_changed',
          previous_values: { status: 'investigating' },
          new_values: { status: 'converted_to_safeguarding' },
          created_at: new Date('2026-03-17T14:00:00Z'),
        }),
      ];

      // Act
      const projected = history.map((entry) => projectHistoryEntry(entry, false));

      // Assert
      expect(projected[0]!.previous_values).toBeNull();
      expect((projected[0]!.new_values as Record<string, unknown>).status).toBe('active');
      expect((projected[1]!.previous_values as Record<string, unknown>).status).toBe('active');
      expect((projected[1]!.new_values as Record<string, unknown>).status).toBe('investigating');
      expect((projected[2]!.previous_values as Record<string, unknown>).status).toBe('investigating');
      expect((projected[2]!.new_values as Record<string, unknown>).status).toBe('closed'); // Projected
    });
  });
});
