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
});
