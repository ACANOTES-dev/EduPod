import { tenantSettingsSchema } from './tenant.schema';

describe('tenantSettingsSchema defaults', () => {
  it('should default all AI features to false (GDPR Article 25(2))', () => {
    const defaults = tenantSettingsSchema.parse({});

    expect(defaults.ai.enabled).toBe(false);
    expect(defaults.ai.gradingEnabled).toBe(false);
    expect(defaults.ai.commentsEnabled).toBe(false);
    expect(defaults.ai.progressSummariesEnabled).toBe(false);
    expect(defaults.ai.nlQueriesEnabled).toBe(false);
    expect(defaults.ai.reportNarrationEnabled).toBe(false);
    expect(defaults.ai.predictionsEnabled).toBe(false);
    expect(defaults.ai.substitutionRankingEnabled).toBe(false);
    expect(defaults.ai.attendanceScanEnabled).toBe(false);
  });

  it('should default gradebook.riskDetection.enabled to false (GDPR Article 25(2))', () => {
    const defaults = tenantSettingsSchema.parse({});

    expect(defaults.gradebook.riskDetection.enabled).toBe(false);
  });

  it('should default SEN settings safely for tenant rollout', () => {
    const defaults = tenantSettingsSchema.parse({});

    expect(defaults.sen.module_enabled).toBe(false);
    expect(defaults.sen.default_review_cycle_weeks).toBe(12);
    expect(defaults.sen.auto_flag_on_referral).toBe(true);
    expect(defaults.sen.sna_schedule_format).toBe('weekly');
    expect(defaults.sen.enable_parent_portal_access).toBe(true);
    expect(defaults.sen.plan_number_prefix).toBe('SSP');
  });
});
