import {
  DEFAULT_CONCERN_CATEGORIES,
  DEFAULT_INTERVENTION_TYPES,
} from '@school/shared';

// ─── Re-export shared defaults for use in the API layer ──────────────────────

export { DEFAULT_CONCERN_CATEGORIES, DEFAULT_INTERVENTION_TYPES };

// ─── Severity Levels (ordered by escalation weight) ──────────────────────────

export const SEVERITY_LEVELS = ['routine', 'elevated', 'urgent', 'critical'] as const;

export const SEVERITY_WEIGHT: Record<string, number> = {
  routine: 1,
  elevated: 2,
  urgent: 3,
  critical: 4,
};

// ─── Tier Definitions ────────────────────────────────────────────────────────

export const PASTORAL_TIERS = [1, 2, 3] as const;

/**
 * Auto-tier mapping: category key -> minimum tier.
 * If a category has an auto_tier in the tenant config, the concern's tier
 * is set to max(user-provided tier, auto_tier).
 * This is the service-layer safety net. The DB trigger is the ultimate guard.
 */
export const AUTO_TIER_CATEGORIES: Record<string, number> = {
  child_protection: 3,
  self_harm: 3,
};

// ─── Concern Source Types ────────────────────────────────────────────────────

export const CONCERN_SOURCES = ['manual', 'historical_import', 'auto_checkin', 'parent_self_referral'] as const;
