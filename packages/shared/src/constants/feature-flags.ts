/**
 * Tenant-scoped feature flags for risky refactors.
 *
 * Each flag is stored in the tenant_settings.settings JSON under the
 * "feature_flags" key. Default: false (disabled). Enable per-tenant
 * for staged rollout.
 *
 * Key format: ff_{module}_{description} — all snake_case.
 *
 * Lifecycle:
 * 1. Add flag constant here
 * 2. Gate the new code path with isFeatureEnabled()
 * 3. Enable per-tenant via tenant_settings.settings.feature_flags
 * 4. After full rollout, remove the flag and the old code path
 */
export const FEATURE_FLAGS = {
  // Add flags here as needed during refactoring work.
  // Example:
  //   BEHAVIOUR_V2_STATE_MACHINE: 'ff_behaviour_v2_state_machine',
  //   GRADEBOOK_WEIGHTED_CALC: 'ff_gradebook_weighted_calc',
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;
export type FeatureFlagValue = (typeof FEATURE_FLAGS)[FeatureFlagKey];
