import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  Award,
  Calendar,
  Database,
  FileSpreadsheet,
  History,
  Lock,
  ShieldAlert,
  ShieldCheck,
  CalendarCheck2,
  Siren,
} from 'lucide-react';

import type { RegulatoryDashboardSummary } from '@school/shared/regulatory';

import type { RoleKey } from '@/lib/route-roles';
import { ADMIN_ROLES, STAFF_ROLES } from '@/lib/route-roles';

// ─── Types ──────────────────────────────────────────────────────────────────

export type RegulatoryTileKey =
  | 'tusla'
  | 'ppod'
  | 'desReturns'
  | 'octoberReturns'
  | 'cba'
  | 'transfers'
  | 'calendar'
  | 'submissions'
  | 'antiBullying'
  | 'safeguarding'
  | 'gdpr';

export interface RegulatoryTileConfig {
  key: RegulatoryTileKey;
  href: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  glow: string;
  roles: RoleKey[];
}

// ─── Catalogue ──────────────────────────────────────────────────────────────
//
// Single source of truth for the regulatory super-hub tiles. Ordering here
// drives visual ordering on /regulatory. Hrefs point at the canonical
// post-redesign route — some targets won't exist until later phases (the
// landing boundary handles missing pages). See regulatory-new/02-super-dashboard.md.

export const REGULATORY_TILES: RegulatoryTileConfig[] = [
  {
    key: 'tusla',
    href: '/regulatory/tusla',
    icon: ShieldCheck,
    accent: 'from-teal-400 via-teal-500 to-teal-600',
    iconBg: 'bg-teal-100 text-teal-700',
    glow: 'from-teal-50/80',
    roles: STAFF_ROLES,
  },
  {
    key: 'ppod',
    href: '/regulatory/ppod',
    icon: Database,
    accent: 'from-cyan-400 via-cyan-500 to-cyan-600',
    iconBg: 'bg-cyan-100 text-cyan-700',
    glow: 'from-cyan-50/80',
    roles: ADMIN_ROLES,
  },
  {
    key: 'desReturns',
    href: '/regulatory/des-returns',
    icon: FileSpreadsheet,
    accent: 'from-sky-400 via-sky-500 to-sky-600',
    iconBg: 'bg-sky-100 text-sky-700',
    glow: 'from-sky-50/80',
    roles: ADMIN_ROLES,
  },
  {
    key: 'octoberReturns',
    href: '/regulatory/october-returns',
    icon: CalendarCheck2,
    accent: 'from-indigo-400 via-indigo-500 to-indigo-600',
    iconBg: 'bg-indigo-100 text-indigo-700',
    glow: 'from-indigo-50/80',
    roles: ADMIN_ROLES,
  },
  {
    key: 'cba',
    href: '/regulatory/cba',
    icon: Award,
    accent: 'from-violet-400 via-violet-500 to-violet-600',
    iconBg: 'bg-violet-100 text-violet-700',
    glow: 'from-violet-50/80',
    roles: ADMIN_ROLES,
  },
  {
    key: 'transfers',
    href: '/regulatory/transfers',
    icon: ArrowLeftRight,
    accent: 'from-emerald-400 via-emerald-500 to-emerald-600',
    iconBg: 'bg-emerald-100 text-emerald-700',
    glow: 'from-emerald-50/80',
    roles: ADMIN_ROLES,
  },
  {
    key: 'calendar',
    href: '/regulatory/calendar',
    icon: Calendar,
    accent: 'from-amber-400 via-amber-500 to-amber-600',
    iconBg: 'bg-amber-100 text-amber-700',
    glow: 'from-amber-50/80',
    roles: STAFF_ROLES,
  },
  {
    key: 'submissions',
    href: '/regulatory/submissions',
    icon: History,
    accent: 'from-slate-400 via-slate-500 to-slate-600',
    iconBg: 'bg-slate-100 text-slate-700',
    glow: 'from-slate-50/80',
    roles: STAFF_ROLES,
  },
  {
    key: 'antiBullying',
    href: '/regulatory/anti-bullying',
    icon: Siren,
    accent: 'from-rose-400 via-rose-500 to-rose-600',
    iconBg: 'bg-rose-100 text-rose-700',
    glow: 'from-rose-50/80',
    roles: ADMIN_ROLES,
  },
  {
    key: 'safeguarding',
    href: '/regulatory/safeguarding',
    icon: ShieldAlert,
    accent: 'from-pink-400 via-pink-500 to-pink-600',
    iconBg: 'bg-pink-100 text-pink-700',
    glow: 'from-pink-50/80',
    roles: ADMIN_ROLES,
  },
  {
    key: 'gdpr',
    href: '/regulatory/privacy-notices',
    icon: Lock,
    accent: 'from-zinc-400 via-zinc-500 to-zinc-600',
    iconBg: 'bg-zinc-100 text-zinc-700',
    glow: 'from-zinc-50/80',
    roles: ADMIN_ROLES,
  },
];

// ─── Count resolver ─────────────────────────────────────────────────────────
//
// Pulls the relevant numeric badge count off the dashboard summary for each
// tile. Returning `undefined` hides the badge (used for tiles without a
// meaningful "open" count).

export function resolveTileCount(
  key: RegulatoryTileKey,
  summary: RegulatoryDashboardSummary | null,
): number | undefined {
  if (!summary) return undefined;
  switch (key) {
    case 'tusla':
      return summary.tusla.active_alerts;
    case 'ppod':
      return summary.ppod.pending;
    case 'desReturns':
      return undefined;
    case 'octoberReturns':
      return undefined;
    case 'cba':
      return summary.cba.pending_sync;
    case 'transfers':
      return summary.transfers.pending_count;
    case 'calendar':
      return summary.calendar.upcoming_deadlines;
    case 'submissions':
      return summary.submissions.this_year_count;
    case 'antiBullying':
      return summary.anti_bullying.open_count;
    case 'safeguarding':
      return summary.safeguarding.open_count;
    case 'gdpr':
      return summary.gdpr.open_dsar_count;
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

// ─── Role filter ────────────────────────────────────────────────────────────

export function filterTilesForRoles(
  tiles: RegulatoryTileConfig[],
  roleKeys: RoleKey[],
): RegulatoryTileConfig[] {
  return tiles.filter((tile) => tile.roles.some((r) => roleKeys.includes(r)));
}
