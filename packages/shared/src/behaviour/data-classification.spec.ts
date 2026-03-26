import {
  DataClassification,
  getUserDataClassification,
  INCIDENT_FIELD_CLASSIFICATION,
  stripFieldsByClassification,
} from './data-classification';

describe('Behaviour Data Classification', () => {
  // ─── stripFieldsByClassification ───────────────────────────────────────

  describe('stripFieldsByClassification', () => {
    const sampleIncident: Record<string, unknown> = {
      id: 'inc-1',
      incident_number: 'BH-202603-0001',
      category_id: 'cat-1',
      polarity: 'negative',
      severity: 5,
      description: 'Student was disruptive',
      parent_description: 'Your child was involved in an incident',
      parent_description_ar: 'طفلك شارك في حادثة',
      parent_description_locked: false,
      context_notes: 'Student has history of similar behaviour',
      location: 'Room 101',
      context_type: 'class',
      occurred_at: '2026-03-01T10:00:00Z',
      logged_at: '2026-03-01T10:05:00Z',
      status: 'active',
      follow_up_required: true,
      context_snapshot: { category_name: 'Disruption' },
      created_at: '2026-03-01T10:05:00Z',
      updated_at: '2026-03-01T10:05:00Z',
    };

    it('SAFEGUARDING user sees all fields', () => {
      const result = stripFieldsByClassification(
        sampleIncident,
        INCIDENT_FIELD_CLASSIFICATION,
        DataClassification.SAFEGUARDING,
      );
      expect(Object.keys(result)).toEqual(Object.keys(sampleIncident));
      expect(result.context_notes).toBe(sampleIncident.context_notes);
      expect(result.severity).toBe(sampleIncident.severity);
    });

    it('SENSITIVE user sees all fields up to SENSITIVE classification', () => {
      const result = stripFieldsByClassification(
        sampleIncident,
        INCIDENT_FIELD_CLASSIFICATION,
        DataClassification.SENSITIVE,
      );
      expect(result.context_notes).toBe(sampleIncident.context_notes);
      expect(result.description).toBe(sampleIncident.description);
      expect(result.id).toBe(sampleIncident.id);
    });

    it('STAFF user sees STAFF and below fields but not SENSITIVE', () => {
      const result = stripFieldsByClassification(
        sampleIncident,
        INCIDENT_FIELD_CLASSIFICATION,
        DataClassification.STAFF,
      );
      // STAFF-level fields should be visible
      expect(result.incident_number).toBe(sampleIncident.incident_number);
      expect(result.description).toBe(sampleIncident.description);
      expect(result.severity).toBe(sampleIncident.severity);
      expect(result.status).toBe(sampleIncident.status);
      // PARENT-level fields should also be visible
      expect(result.category_id).toBe(sampleIncident.category_id);
      expect(result.polarity).toBe(sampleIncident.polarity);
      expect(result.parent_description).toBe(sampleIncident.parent_description);
      // PUBLIC-level fields should also be visible
      expect(result.id).toBe(sampleIncident.id);
      // SENSITIVE fields should be stripped
      expect(result).not.toHaveProperty('context_notes');
    });

    it('PARENT user sees PARENT and PUBLIC fields only', () => {
      const result = stripFieldsByClassification(
        sampleIncident,
        INCIDENT_FIELD_CLASSIFICATION,
        DataClassification.PARENT,
      );
      // PARENT-level fields visible
      expect(result.category_id).toBe(sampleIncident.category_id);
      expect(result.polarity).toBe(sampleIncident.polarity);
      expect(result.parent_description).toBe(sampleIncident.parent_description);
      expect(result.parent_description_ar).toBe(sampleIncident.parent_description_ar);
      expect(result.occurred_at).toBe(sampleIncident.occurred_at);
      // PUBLIC-level fields visible
      expect(result.id).toBe(sampleIncident.id);
      // STAFF fields stripped
      expect(result).not.toHaveProperty('incident_number');
      expect(result).not.toHaveProperty('description');
      expect(result).not.toHaveProperty('severity');
      expect(result).not.toHaveProperty('status');
      expect(result).not.toHaveProperty('context_notes');
    });

    it('PUBLIC user sees only PUBLIC fields', () => {
      const result = stripFieldsByClassification(
        sampleIncident,
        INCIDENT_FIELD_CLASSIFICATION,
        DataClassification.PUBLIC,
      );
      expect(result.id).toBe(sampleIncident.id);
      expect(result).not.toHaveProperty('category_id');
      expect(result).not.toHaveProperty('description');
      expect(result).not.toHaveProperty('context_notes');
    });

    it('passes through fields not in the field map', () => {
      const dataWithExtra = { ...sampleIncident, custom_field: 'extra-value' };
      const result = stripFieldsByClassification(
        dataWithExtra,
        INCIDENT_FIELD_CLASSIFICATION,
        DataClassification.PUBLIC,
      );
      // Fields not in the classification map are passed through
      expect(result.custom_field).toBe('extra-value');
    });
  });

  // ─── getUserDataClassification ────────────────────────────────────────

  describe('getUserDataClassification', () => {
    it('returns SAFEGUARDING for safeguarding.view permission', () => {
      expect(getUserDataClassification(['safeguarding.view'])).toBe(
        DataClassification.SAFEGUARDING,
      );
    });

    it('returns SAFEGUARDING for safeguarding.manage permission', () => {
      expect(getUserDataClassification(['safeguarding.manage'])).toBe(
        DataClassification.SAFEGUARDING,
      );
    });

    it('returns SENSITIVE for behaviour.view_sensitive permission', () => {
      expect(getUserDataClassification(['behaviour.view_sensitive'])).toBe(
        DataClassification.SENSITIVE,
      );
    });

    it('returns STAFF for behaviour.view permission', () => {
      expect(getUserDataClassification(['behaviour.view'])).toBe(
        DataClassification.STAFF,
      );
    });

    it('returns STAFF for behaviour.manage permission', () => {
      expect(getUserDataClassification(['behaviour.manage'])).toBe(
        DataClassification.STAFF,
      );
    });

    it('returns PARENT for behaviour.appeal permission', () => {
      expect(getUserDataClassification(['behaviour.appeal'])).toBe(
        DataClassification.PARENT,
      );
    });

    it('returns PUBLIC for empty permissions', () => {
      expect(getUserDataClassification([])).toBe(DataClassification.PUBLIC);
    });

    it('returns PUBLIC for unrelated permissions', () => {
      expect(getUserDataClassification(['attendance.view', 'finance.manage'])).toBe(
        DataClassification.PUBLIC,
      );
    });

    it('highest matching classification wins when multiple permissions present', () => {
      expect(
        getUserDataClassification([
          'behaviour.view',
          'behaviour.view_sensitive',
          'safeguarding.view',
        ]),
      ).toBe(DataClassification.SAFEGUARDING);
    });

    it('safeguarding.view takes precedence over behaviour.view_sensitive', () => {
      expect(
        getUserDataClassification(['behaviour.view_sensitive', 'safeguarding.view']),
      ).toBe(DataClassification.SAFEGUARDING);
    });
  });
});
