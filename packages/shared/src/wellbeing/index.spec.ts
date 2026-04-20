import {
  WELLBEING_AI_MODULE_KEYS,
  WELLBEING_NOTIFICATION_EVENT_KEYS,
  tenantAiFlagSchema,
  updateTenantAiFlagSchema,
  wellbeingAiModuleKeySchema,
  wellbeingChannelPreferencesSchema,
} from './index';

describe('wellbeing shared — WELLBEING_AI_MODULE_KEYS', () => {
  it('contains the four canonical AI-gated wellbeing modules', () => {
    expect([...WELLBEING_AI_MODULE_KEYS].sort()).toEqual(
      ['behaviour', 'early_warning', 'pastoral', 'staff_wellbeing'].sort(),
    );
  });

  it('wellbeingAiModuleKeySchema accepts only canonical keys', () => {
    expect(wellbeingAiModuleKeySchema.safeParse('behaviour').success).toBe(true);
    expect(wellbeingAiModuleKeySchema.safeParse('sen').success).toBe(false);
    expect(wellbeingAiModuleKeySchema.safeParse('').success).toBe(false);
  });
});

describe('wellbeing shared — tenantAiFlagSchema', () => {
  it('accepts a valid flag row', () => {
    const result = tenantAiFlagSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
      tenant_id: '22222222-2222-2222-2222-222222222222',
      module_key: 'behaviour',
      enabled: true,
      updated_at: '2026-04-20T10:00:00.000Z',
      updated_by: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown module keys', () => {
    const result = tenantAiFlagSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
      tenant_id: '22222222-2222-2222-2222-222222222222',
      module_key: 'finance',
      enabled: false,
      updated_at: '2026-04-20T10:00:00.000Z',
      updated_by: null,
    });
    expect(result.success).toBe(false);
  });

  it('updateTenantAiFlagSchema enforces strict shape', () => {
    expect(
      updateTenantAiFlagSchema.safeParse({
        module_key: 'pastoral',
        enabled: true,
      }).success,
    ).toBe(true);
    expect(
      updateTenantAiFlagSchema.safeParse({
        module_key: 'pastoral',
      }).success,
    ).toBe(false);
  });
});

describe('wellbeing shared — wellbeingChannelPreferencesSchema', () => {
  it('accepts empty overrides', () => {
    const result = wellbeingChannelPreferencesSchema.safeParse({
      defaults: { email: false, sms: false, whatsapp: false },
      overrides: {},
    });
    expect(result.success).toBe(true);
  });

  it('accepts per-event overrides with partial channel toggles', () => {
    const result = wellbeingChannelPreferencesSchema.safeParse({
      defaults: { email: true, sms: false, whatsapp: false },
      overrides: {
        'incident.logged': { email: true, sms: true },
        'sla.breach': { whatsapp: true },
      },
    });
    expect(result.success).toBe(true);
  });

  it('requires every default channel to be a boolean', () => {
    const result = wellbeingChannelPreferencesSchema.safeParse({
      defaults: { email: false, sms: false },
      overrides: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-boolean override values', () => {
    const result = wellbeingChannelPreferencesSchema.safeParse({
      defaults: { email: false, sms: false, whatsapp: false },
      overrides: { 'incident.logged': { email: 'yes' } },
    });
    expect(result.success).toBe(false);
  });
});

describe('wellbeing shared — WELLBEING_NOTIFICATION_EVENT_KEYS', () => {
  it('lists at least the 10 core event keys and all are unique', () => {
    expect(WELLBEING_NOTIFICATION_EVENT_KEYS.length).toBeGreaterThanOrEqual(10);
    const unique = new Set(WELLBEING_NOTIFICATION_EVENT_KEYS);
    expect(unique.size).toBe(WELLBEING_NOTIFICATION_EVENT_KEYS.length);
  });
});
