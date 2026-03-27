import { behaviourSettingsSchema } from './settings.schema';

describe('behaviourSettingsSchema defaults', () => {
  it('should default opt-in features to false (GDPR Article 25(2))', () => {
    const defaults = behaviourSettingsSchema.parse({});

    expect(defaults.parent_portal_behaviour_enabled).toBe(false);
    expect(defaults.behaviour_pulse_enabled).toBe(false);
    expect(defaults.ai_insights_enabled).toBe(false);
    expect(defaults.ai_narrative_enabled).toBe(false);
    expect(defaults.ai_nl_query_enabled).toBe(false);
  });
});
