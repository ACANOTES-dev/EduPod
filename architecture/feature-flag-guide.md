# Feature Flag Guide

Tenant-scoped feature flags for controlled rollout of risky behavioural refactors.

## When to Use Feature Flags

Use a feature flag when:

- **Risky behavioural change**: Replacing a calculation, state machine transition, or business rule where incorrect output has real consequences
- **Gradual rollout**: You want to enable the new path for one tenant, verify in production, then expand
- **A/B validation**: You want to shadow-test the new path alongside the old one before switching
- **Reversibility**: You need to instantly revert to the old behaviour without a deployment

Do NOT use a feature flag for:

- Simple bug fixes
- UI-only changes
- Additive features that don't change existing behaviour
- Schema migrations (these are irreversible regardless)

## How It Works

Feature flags are stored in the `tenant_settings.settings` JSON under the `feature_flags` key:

```json
{
  "attendance": { ... },
  "gradebook": { ... },
  "feature_flags": {
    "ff_behaviour_v2_state_machine": true,
    "ff_gradebook_weighted_calc": false
  }
}
```

**Default: disabled.** If the key is missing or the tenant has no settings row, the flag evaluates to `false`.

## How to Add a New Flag

### 1. Register the flag constant

In `packages/shared/src/constants/feature-flags.ts`:

```typescript
export const FEATURE_FLAGS = {
  BEHAVIOUR_V2_STATE_MACHINE: 'ff_behaviour_v2_state_machine',
} as const;
```

### 2. Gate the code path in your service

```typescript
import { FEATURE_FLAGS } from '@school/shared';
import { isFeatureEnabled } from '../../common/utils/feature-flag.helper';

async someMethod(tenantId: string) {
  const useV2 = await isFeatureEnabled(
    this.prisma,
    tenantId,
    FEATURE_FLAGS.BEHAVIOUR_V2_STATE_MACHINE,
  );

  if (useV2) {
    return this.someMethodV2(tenantId);
  }
  return this.someMethodV1(tenantId);
}
```

### 3. Enable per-tenant

Update the tenant's settings JSON (via admin UI or direct DB update):

```sql
UPDATE tenant_settings
SET settings = jsonb_set(
  settings,
  '{feature_flags,ff_behaviour_v2_state_machine}',
  'true'
)
WHERE tenant_id = '<tenant-uuid>';
```

### 4. Monitor

After enabling for a tenant:

- Check application logs for errors in the new code path
- If using shadow reads, check for divergence logs
- Verify tenant-facing behaviour is correct

### 5. Expand rollout

Enable for additional tenants one at a time. Once all tenants are on the new path with no issues, proceed to cleanup.

## How to Remove a Flag After Full Rollout

1. Remove the old code path (the `else` branch)
2. Remove the `isFeatureEnabled()` check
3. Remove the constant from `FEATURE_FLAGS`
4. Clean up `feature_flags` entries in tenant_settings (optional — stale keys are harmless)
5. Commit with message: `refactor(module): remove ff_flag_name — fully rolled out`

## Combining with Shadow Reads

For maximum safety, use feature flags with shadow reads:

1. **Phase 1**: Add shadow read — old code is primary, new code runs in background
2. **Phase 2**: Monitor for divergence, fix discrepancies
3. **Phase 3**: Add feature flag — switch primary to new code per-tenant
4. **Phase 4**: Remove shadow read and feature flag after full rollout

## Rules

- Flag names: `ff_{module}_{description}` in snake_case
- Constants: `UPPER_SNAKE_CASE` in the `FEATURE_FLAGS` object
- Default is always OFF — opt-in only
- Never use feature flags for permanent configuration — use tenant_settings modules for that
- Feature flags are temporary — every flag should have a planned removal date
