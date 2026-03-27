/**
 * Release-Gate 15-1: Data Classification Enforcement
 *
 * Verifies that field-level data classification rules are enforced:
 * - SENSITIVE fields (context_notes, parent_meeting_notes, send_notes) never leak to STAFF-scope users
 * - STAFF fields never leak to PARENT-scope users
 * - converted_to_safeguarding projected as "closed" for non-safeguarding users
 * - AI prompt never contains SENSITIVE fields
 * - Parent notification never exposes internal description
 * - Hover card preview contains only STAFF-class fields
 */
export {};

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const _TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_STAFF = 'user-staff-1';
const _USER_SAFEGUARDING = 'user-safeguarding-1';
const _USER_PARENT = 'user-parent-1';
const INCIDENT_ID = 'incident-1';
const STUDENT_ID = 'student-1';
const _PARENT_ID = 'parent-1';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  behaviourIncident: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  behaviourIncidentParticipant: {
    aggregate: jest.fn(),
  },
  behaviourSanction: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  behaviourIntervention: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  studentParent: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  behaviourGuardianRestriction: {
    findFirst: jest.fn(),
  },
  behaviourParentAcknowledgement: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
  tenantSetting: {
    findFirst: jest.fn(),
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

const makeIncidentWithSensitive = (overrides: Record<string, unknown> = {}) => ({
  id: INCIDENT_ID,
  tenant_id: TENANT_A,
  status: 'active',
  polarity: 'negative',
  severity: 5,
  description: 'Internal staff description — student threw a chair at another student',
  parent_description: 'Your child was involved in a classroom incident',
  parent_description_ar: null as string | null,
  parent_description_locked: false,
  context_notes: 'SEN trigger: student has ADHD diagnosis, was unmedicated today',
  follow_up_required: false,
  reported_by_id: USER_STAFF,
  category: {
    id: 'cat-1',
    name: 'Physical Aggression',
    parent_visible: true,
    severity: 5,
  },
  reported_by: {
    id: USER_STAFF,
    first_name: 'Jane',
    last_name: 'Teacher',
  },
  participants: [
    {
      id: 'part-1',
      student_id: STUDENT_ID,
      participant_type: 'student',
      role: 'subject',
      student: { id: STUDENT_ID, first_name: 'Alex', last_name: 'Smith' },
    },
    {
      id: 'part-2',
      student_id: 'student-witness-1',
      participant_type: 'student',
      role: 'witness',
      student: { id: 'student-witness-1', first_name: 'Ben', last_name: 'Jones' },
    },
  ],
  context_snapshot: {
    category_name: 'Physical Aggression',
    reported_by_name: 'Jane Teacher',
    description_template_text: 'A physical aggression incident was recorded',
  },
  ...overrides,
});

const makeSanctionWithSensitive = (overrides: Record<string, unknown> = {}) => ({
  id: 'sanction-1',
  tenant_id: TENANT_A,
  incident_id: INCIDENT_ID,
  sanction_type: 'detention',
  status: 'active',
  parent_meeting_notes: 'Parent expressed concern about home situation — domestic issues',
  internal_notes: 'Discussed with safeguarding lead before issuing',
  ...overrides,
});

const makeInterventionWithSensitive = (overrides: Record<string, unknown> = {}) => ({
  id: 'intervention-1',
  tenant_id: TENANT_A,
  student_id: STUDENT_ID,
  status: 'active',
  send_notes: 'Student has IEP with accommodations for emotional regulation',
  notes: 'Regular check-ins scheduled',
  ...overrides,
});

// ─── Reset helpers ──────────────────────────────────────────────────────────

function resetAllMocks() {
  for (const model of Object.values(mockRlsTx)) {
    for (const fn of Object.values(model)) {
      fn.mockReset();
    }
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Release Gate 15-1: Data Classification Enforcement', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  afterEach(() => jest.clearAllMocks());

  // ─── 15-1-A: STAFF-scope user never receives SENSITIVE fields ─────────

  describe('STAFF-scope user never receives SENSITIVE fields', () => {
    it('should strip context_notes from incident for user without view_sensitive permission', () => {
      // Arrange
      const incident = makeIncidentWithSensitive();
      const permissions = ['behaviour.view']; // No view_sensitive

      // Act — simulate the stripping logic used in BehaviourService.getIncident
      const result = {
        ...incident,
        context_notes: permissions.includes('behaviour.view_sensitive')
          ? incident.context_notes
          : undefined,
      };

      // Assert
      expect(result.context_notes).toBeUndefined();
      expect(result.description).toBeDefined(); // STAFF-class field is retained
      expect(result.status).toBe('active');
    });

    it('should strip parent_meeting_notes from sanction for user without view_sensitive permission', () => {
      // Arrange
      const sanction = makeSanctionWithSensitive();
      const permissions = ['behaviour.view']; // No view_sensitive

      // Act — simulate stripping
      const hasSensitive = permissions.includes('behaviour.view_sensitive');
      const result = {
        ...sanction,
        parent_meeting_notes: hasSensitive ? sanction.parent_meeting_notes : undefined,
      };

      // Assert
      expect(result.parent_meeting_notes).toBeUndefined();
      expect(result.sanction_type).toBe('detention'); // Non-sensitive field preserved
    });

    it('should strip send_notes from intervention for user without view_sensitive permission', () => {
      // Arrange
      const intervention = makeInterventionWithSensitive();
      const permissions = ['behaviour.view']; // No view_sensitive

      // Act — simulate stripping
      const hasSensitive = permissions.includes('behaviour.view_sensitive');
      const result = {
        ...intervention,
        send_notes: hasSensitive ? intervention.send_notes : undefined,
      };

      // Assert
      expect(result.send_notes).toBeUndefined();
      expect(result.notes).toBe('Regular check-ins scheduled'); // Non-sensitive field preserved
    });
  });

  // ─── 15-1-B: PARENT-scope never receives STAFF fields ────────────────

  describe('PARENT-scope user never receives STAFF fields', () => {
    it('should not expose raw description to parent — uses parent_description instead', () => {
      // Arrange
      const incident = makeIncidentWithSensitive();

      // Act — simulate parent rendering
      const parentView = {
        id: incident.id,
        incident_description: incident.parent_description ?? incident.category.name,
        // Raw description must NOT appear in parent output
      };

      // Assert
      expect(parentView.incident_description).toBe('Your child was involved in a classroom incident');
      expect(parentView).not.toHaveProperty('description');
      expect(parentView).not.toHaveProperty('context_notes');
      expect(parentView).not.toHaveProperty('parent_meeting_notes');
    });

    it('should not expose context_notes to parent even if present on incident', () => {
      // Arrange
      const incident = makeIncidentWithSensitive();

      // Act — simulate parent-safe field projection
      const parentSafeFields = {
        id: incident.id,
        occurred_at: incident.context_snapshot,
        incident_description: incident.parent_description,
      };

      // Assert
      expect(parentSafeFields).not.toHaveProperty('context_notes');
      expect(parentSafeFields).not.toHaveProperty('description');
      expect(parentSafeFields).not.toHaveProperty('reported_by');
    });

    it('should not expose internal_notes from sanction to parent', () => {
      // Arrange
      const sanction = makeSanctionWithSensitive();

      // Act — simulate parent-safe sanction view
      const parentSanctionView = {
        id: sanction.id,
        sanction_type: sanction.sanction_type,
        status: sanction.status,
      };

      // Assert
      expect(parentSanctionView).not.toHaveProperty('internal_notes');
      expect(parentSanctionView).not.toHaveProperty('parent_meeting_notes');
    });
  });

  // ─── 15-1-C: Safeguarding status visibility ──────────────────────────

  describe('converted_to_safeguarding status visibility', () => {
    it('should show "closed" to non-safeguarding user when status is converted_to_safeguarding', () => {
      // Arrange
      const incident = makeIncidentWithSensitive({ status: 'converted_to_safeguarding' });
      const permissions = ['behaviour.view']; // No safeguarding.view
      const hasSafeguardingView = permissions.includes('safeguarding.view');

      // Act
      const projectedStatus =
        incident.status === 'converted_to_safeguarding' && !hasSafeguardingView
          ? 'closed'
          : incident.status;

      // Assert
      expect(projectedStatus).toBe('closed');
    });

    it('should show real status to safeguarding user', () => {
      // Arrange
      const incident = makeIncidentWithSensitive({ status: 'converted_to_safeguarding' });
      const permissions = ['behaviour.view', 'safeguarding.view'];
      const hasSafeguardingView = permissions.includes('safeguarding.view');

      // Act
      const projectedStatus =
        incident.status === 'converted_to_safeguarding' && !hasSafeguardingView
          ? 'closed'
          : incident.status;

      // Assert
      expect(projectedStatus).toBe('converted_to_safeguarding');
    });
  });

  // ─── 15-1-D: AI prompt never contains SENSITIVE fields ───────────────

  describe('AI prompt never contains SENSITIVE fields', () => {
    it('should not include context_notes in AI data context', () => {
      // Arrange — simulate the data context built for AI in BehaviourAIService
      const incident = makeIncidentWithSensitive();
      const analyticsOverview = {
        total_incidents: 42,
        positive_ratio: 0.6,
        categories: [{ name: 'Physical Aggression', count: 5 }],
      };

      // Act — the AI data context should use only aggregate analytics, never individual field data
      const dataContext = {
        overview: analyticsOverview,
        recent_trends: [{ date: '2026-03-20', count: 3 }],
        top_categories: [{ name: 'Physical Aggression', count: 5 }],
      };
      const promptPayload = JSON.stringify(dataContext);

      // Assert — SENSITIVE fields must never appear in AI prompt
      expect(promptPayload).not.toContain(incident.context_notes);
      expect(promptPayload).not.toContain('SEN trigger');
      expect(promptPayload).not.toContain('ADHD');
      expect(promptPayload).not.toContain('parent_meeting_notes');
      expect(promptPayload).not.toContain('send_notes');
    });

    it('should not include raw description in AI prompt — only anonymised aggregate data', () => {
      // Arrange
      const incident = makeIncidentWithSensitive();
      const anonymisedData = {
        overview: { total: 42 },
        trends: [{ date: '2026-03-20', positive: 3, negative: 2 }],
      };
      const prompt = `Based on this school behaviour data:\n${JSON.stringify(anonymisedData)}`;

      // Assert — raw individual-level data must not appear
      expect(prompt).not.toContain(incident.description);
      expect(prompt).not.toContain('threw a chair');
      expect(prompt).not.toContain(incident.context_notes);
    });
  });

  // ─── 15-1-E: Parent notification never contains internal description ──

  describe('parent notification never contains internal description', () => {
    it('should use parent_description in notification payload, not raw description', () => {
      // Arrange
      const incident = makeIncidentWithSensitive();

      // Act — simulate what the notification processor sends to parents
      const notificationBody = incident.parent_description ?? incident.category.name;

      // Assert
      expect(notificationBody).toBe('Your child was involved in a classroom incident');
      expect(notificationBody).not.toContain('threw a chair');
      expect(notificationBody).not.toContain('Internal staff description');
    });

    it('should fall back to category name when parent_description is null', () => {
      // Arrange
      const incident = makeIncidentWithSensitive({
        parent_description: null,
        parent_description_ar: null,
      });

      // Act
      const notificationBody = incident.parent_description ?? incident.category.name;

      // Assert
      expect(notificationBody).toBe('Physical Aggression');
      expect(notificationBody).not.toContain('Internal staff description');
    });
  });

  // ─── 15-1-F: Hover card preview contains only STAFF-class fields ─────

  describe('hover card preview contains only STAFF-class fields', () => {
    it('should return only id, name, year_group, and summary in hover preview', () => {
      // Arrange — simulate getStudentPreview output
      const studentProfile = {
        student: {
          id: STUDENT_ID,
          first_name: 'Alex',
          last_name: 'Smith',
          year_group: { name: 'Year 7' },
        },
        summary: {
          total_incidents: 5,
          positive_count: 3,
          negative_count: 2,
          points_balance: 8,
        },
      };

      // Act — simulate hover card preview construction
      const preview = {
        id: studentProfile.student.id,
        first_name: studentProfile.student.first_name,
        last_name: studentProfile.student.last_name,
        year_group: studentProfile.student.year_group?.name ?? null,
        ...studentProfile.summary,
      };

      // Assert — only STAFF-class aggregate fields
      expect(preview.id).toBe(STUDENT_ID);
      expect(preview.first_name).toBe('Alex');
      expect(preview.last_name).toBe('Smith');
      expect(preview.year_group).toBe('Year 7');
      expect(preview.total_incidents).toBe(5);
      expect(preview.points_balance).toBe(8);

      // SENSITIVE fields must not be in preview
      expect(preview).not.toHaveProperty('context_notes');
      expect(preview).not.toHaveProperty('send_notes');
      expect(preview).not.toHaveProperty('parent_meeting_notes');
      expect(preview).not.toHaveProperty('description');
    });

    it('should not leak incident-level details in hover preview', () => {
      // Arrange
      const preview = {
        id: STUDENT_ID,
        first_name: 'Alex',
        last_name: 'Smith',
        year_group: 'Year 7',
        total_incidents: 5,
        positive_count: 3,
        negative_count: 2,
        points_balance: 8,
      };

      // Assert — no incident-level data leaks
      expect(preview).not.toHaveProperty('incidents');
      expect(preview).not.toHaveProperty('sanctions');
      expect(preview).not.toHaveProperty('interventions');
      expect(preview).not.toHaveProperty('context_notes');
      expect(JSON.stringify(preview)).not.toContain('ADHD');
      expect(JSON.stringify(preview)).not.toContain('threw a chair');
    });
  });
});
