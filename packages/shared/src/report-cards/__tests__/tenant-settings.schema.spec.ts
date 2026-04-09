import {
  reportCardTenantSettingsPayloadSchema,
  updateReportCardTenantSettingsSchema,
} from '../tenant-settings.schema';

describe('reportCardTenantSettingsPayloadSchema', () => {
  it('accepts the documented default payload', () => {
    const result = reportCardTenantSettingsPayloadSchema.safeParse({
      matrix_display_mode: 'grade',
      show_top_rank_badge: false,
      default_personal_info_fields: ['full_name', 'student_number', 'class_name'],
      require_finalised_comments: true,
      allow_admin_force_generate: true,
      principal_signature_storage_key: null,
      principal_name: null,
      grade_threshold_set_id: null,
      default_template_id: null,
    });
    expect(result.success).toBe(true);
  });

  it('applies defaults for an empty payload', () => {
    const result = reportCardTenantSettingsPayloadSchema.parse({});
    expect(result.matrix_display_mode).toBe('grade');
    expect(result.show_top_rank_badge).toBe(false);
    expect(result.require_finalised_comments).toBe(true);
    expect(result.allow_admin_force_generate).toBe(true);
    expect(result.principal_signature_storage_key).toBeNull();
    expect(result.principal_name).toBeNull();
  });

  it('accepts a fully configured signature pair', () => {
    const result = reportCardTenantSettingsPayloadSchema.safeParse({
      principal_signature_storage_key: 's3://bucket/sig.png',
      principal_name: 'Dr. Jane Smith',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a half-configured signature (key set, name null)', () => {
    const result = reportCardTenantSettingsPayloadSchema.safeParse({
      principal_signature_storage_key: 's3://bucket/sig.png',
      principal_name: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['principal_name']);
    }
  });

  it('rejects a half-configured signature (name set, key null)', () => {
    const result = reportCardTenantSettingsPayloadSchema.safeParse({
      principal_signature_storage_key: null,
      principal_name: 'Dr. Jane Smith',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown personal info fields', () => {
    const result = reportCardTenantSettingsPayloadSchema.safeParse({
      default_personal_info_fields: ['full_name', 'made_up_field'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown matrix_display_mode', () => {
    const result = reportCardTenantSettingsPayloadSchema.safeParse({
      matrix_display_mode: 'percent',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown top-level keys via strict mode', () => {
    const result = reportCardTenantSettingsPayloadSchema.safeParse({ extra: 'nope' });
    expect(result.success).toBe(false);
  });
});

describe('updateReportCardTenantSettingsSchema', () => {
  it('accepts a partial update touching only matrix_display_mode', () => {
    expect(
      updateReportCardTenantSettingsSchema.safeParse({ matrix_display_mode: 'score' }).success,
    ).toBe(true);
  });

  it('does not enforce signature pairing when only one of the two fields is present', () => {
    // Touching only the name should be allowed (assumes the existing key is set).
    expect(
      updateReportCardTenantSettingsSchema.safeParse({ principal_name: 'New Name' }).success,
    ).toBe(true);
  });

  it('enforces signature pairing when both fields are in the same patch', () => {
    const result = updateReportCardTenantSettingsSchema.safeParse({
      principal_signature_storage_key: 's3://bucket/sig.png',
      principal_name: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['principal_name']);
    }
  });

  it('rejects unknown keys via strict mode', () => {
    expect(updateReportCardTenantSettingsSchema.safeParse({ what_is_this: true }).success).toBe(
      false,
    );
  });
});
