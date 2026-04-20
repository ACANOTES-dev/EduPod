/**
 * Pure visibility + role logic for the safeguarding sub-hub.
 *
 * Extracted so the rules can be exercised directly without rendering the page
 * (the web Jest config is `testRegex: .spec.ts`, so only plain TypeScript is
 * test-runnable). The page's visual catalogue (icons, colours, href) lives
 * alongside the JSX; this file owns only the role-gating contract.
 *
 * `dedicated_view` maps exactly to the roles that impl 01 granted
 * `safeguarding.dedicated_view` (owner / principal / VP). `sealView`
 * mirrors who impl 01 granted `safeguarding.seal` — same three roles. The
 * page surfaces these with a polite permission-denied screen for anyone
 * else who lands on `/safeguarding`.
 */

import type { RoleKey } from '@/lib/route-roles';

// ─── Role groups specific to safeguarding ─────────────────────────────────────

/** Roles that can see the safeguarding workspace at all. */
export const SAFEGUARDING_TIER_ROLES: RoleKey[] = [
  'school_owner',
  'school_principal',
  'school_vice_principal',
];

/** Roles that can view sealed records. Currently identical to the tier. */
export const SAFEGUARDING_SEAL_VIEW_ROLES: RoleKey[] = [...SAFEGUARDING_TIER_ROLES];

export function canViewSafeguarding(roleKeys: readonly string[]): boolean {
  return SAFEGUARDING_TIER_ROLES.some((r) => roleKeys.includes(r));
}

export function canViewSealedRecords(roleKeys: readonly string[]): boolean {
  return SAFEGUARDING_SEAL_VIEW_ROLES.some((r) => roleKeys.includes(r));
}

// ─── Hub card catalogue visibility ────────────────────────────────────────────

export const SAFEGUARDING_HUB_CARD_KEYS = [
  'concerns',
  'sla',
  'sealed',
  'breakGlass',
  'reviews',
  'settings',
] as const;

export type SafeguardingHubCardKey = (typeof SAFEGUARDING_HUB_CARD_KEYS)[number];

export interface SafeguardingHubCardVisibility {
  key: SafeguardingHubCardKey;
  /** If present, only users with one of these roles see the card. */
  roles?: RoleKey[];
}

export interface SafeguardingHubCardVisibilityOpts {
  roleKeys: readonly string[];
  cards: SafeguardingHubCardVisibility[];
}

export function filterSafeguardingHubCards(
  opts: SafeguardingHubCardVisibilityOpts,
): SafeguardingHubCardVisibility[] {
  return opts.cards.filter(
    (card) => !card.roles || card.roles.some((r) => opts.roleKeys.includes(r)),
  );
}

// ─── Quick action visibility ──────────────────────────────────────────────────

export const SAFEGUARDING_QUICK_ACTION_KEYS = [
  'reportConcern',
  'viewMyReports',
  'requestBreakGlass',
  'runAfterAction',
] as const;

export type SafeguardingQuickActionKey = (typeof SAFEGUARDING_QUICK_ACTION_KEYS)[number];

export interface SafeguardingQuickActionVisibility {
  key: SafeguardingQuickActionKey;
  roles?: RoleKey[];
}

export interface SafeguardingQuickActionVisibilityOpts {
  roleKeys: readonly string[];
  actions: SafeguardingQuickActionVisibility[];
}

export function filterSafeguardingQuickActions(
  opts: SafeguardingQuickActionVisibilityOpts,
): SafeguardingQuickActionVisibility[] {
  return opts.actions.filter(
    (action) => !action.roles || action.roles.some((r) => opts.roleKeys.includes(r)),
  );
}
