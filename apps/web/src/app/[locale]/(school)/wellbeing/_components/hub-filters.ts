/**
 * Pure filtering logic for the wellbeing super-hub card + quick-action
 * visibility rules. Extracted so the rules can be exercised directly
 * without rendering the page (the web Jest config is `testRegex: .spec.ts`,
 * so we can only unit-test plain TypeScript).
 *
 * The page's visual catalogue (icons, colours, href) lives alongside the
 * JSX; this file owns only the role-gating contract.
 */

import type { RoleKey } from '@/lib/route-roles';

export const VISIBLE_HUB_KEYS = [
  'behaviour',
  'pastoral',
  'safeguarding',
  'earlyWarnings',
  'staffWellbeing',
  'settings',
] as const;

export type HubCardKey = (typeof VISIBLE_HUB_KEYS)[number];

export interface HubCardVisibility {
  key: HubCardKey;
  /** If set, card is only visible to users with one of these roles. */
  roles?: RoleKey[];
}

export interface HubCardVisibilityOpts {
  roleKeys: RoleKey[];
  cards: HubCardVisibility[];
}

export function filterHubCards(opts: HubCardVisibilityOpts): HubCardVisibility[] {
  return opts.cards.filter(
    (card) => !card.roles || card.roles.some((r) => opts.roleKeys.includes(r)),
  );
}

export const VISIBLE_QUICK_ACTION_KEYS = [
  'logIncident',
  'logConcern',
  'declareCritical',
  'openCase',
] as const;

export type QuickActionKey = (typeof VISIBLE_QUICK_ACTION_KEYS)[number];

export interface QuickActionVisibility {
  key: QuickActionKey;
  roles?: RoleKey[];
}

export interface QuickActionVisibilityOpts {
  roleKeys: RoleKey[];
  actions: QuickActionVisibility[];
}

export function filterQuickActions(opts: QuickActionVisibilityOpts): QuickActionVisibility[] {
  return opts.actions.filter(
    (action) => !action.roles || action.roles.some((r) => opts.roleKeys.includes(r)),
  );
}
