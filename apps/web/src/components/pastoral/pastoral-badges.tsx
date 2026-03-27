'use client';

import { Badge } from '@school/ui';
import { useTranslations } from 'next-intl';

import { formatPastoralValue } from '@/lib/pastoral';

const SEVERITY_STYLES: Record<string, string> = {
  routine: 'bg-slate-100 text-slate-700',
  elevated: 'bg-amber-100 text-amber-800',
  urgent: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const TIER_STYLES: Record<number, string> = {
  1: 'bg-emerald-100 text-emerald-800',
  2: 'bg-amber-100 text-amber-900',
  3: 'bg-rose-100 text-rose-900',
};

const CASE_STATUS_STYLES: Record<string, string> = {
  open: 'bg-slate-100 text-slate-700',
  active: 'bg-blue-100 text-blue-800',
  monitoring: 'bg-amber-100 text-amber-800',
  resolved: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-zinc-200 text-zinc-800',
};

export function PastoralSeverityBadge({ severity }: { severity: string }) {
  const t = useTranslations('pastoral.badges.severity');

  return (
    <Badge className={SEVERITY_STYLES[severity] ?? 'bg-slate-100 text-slate-700'}>
      {SEVERITY_STYLES[severity] ? t(severity as never) : formatPastoralValue(severity)}
    </Badge>
  );
}

export function PastoralTierBadge({ tier }: { tier: number }) {
  const t = useTranslations('pastoral.badges.tier');

  return (
    <Badge className={TIER_STYLES[tier] ?? 'bg-slate-100 text-slate-700'}>
      {t(`tier${tier}` as never)}
    </Badge>
  );
}

export function PastoralCaseStatusBadge({ status }: { status: string }) {
  const t = useTranslations('pastoral.badges.caseStatus');

  return (
    <Badge className={CASE_STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-700'}>
      {CASE_STATUS_STYLES[status] ? t(status as never) : formatPastoralValue(status)}
    </Badge>
  );
}
