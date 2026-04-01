'use client';

import { useTranslations } from 'next-intl';

import { Badge } from '@school/ui';

import {
  formatPastoralValue,
  normalizeActionStatus,
  normalizeCriticalIncidentStatus,
  normalizeInterventionStatus,
  normalizeRecommendationStatus,
} from '@/lib/pastoral';

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

const INTERVENTION_STATUS_STYLES: Record<string, string> = {
  active: 'bg-blue-100 text-blue-800',
  achieved: 'bg-emerald-100 text-emerald-800',
  partially_achieved: 'bg-lime-100 text-lime-900',
  not_achieved: 'bg-amber-100 text-amber-900',
  escalated: 'bg-orange-100 text-orange-900',
  withdrawn: 'bg-zinc-200 text-zinc-800',
};

const ACTION_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-zinc-200 text-zinc-800',
  overdue: 'bg-rose-100 text-rose-800',
};

const REFERRAL_STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  submitted: 'bg-blue-100 text-blue-800',
  acknowledged: 'bg-cyan-100 text-cyan-800',
  assessment_scheduled: 'bg-amber-100 text-amber-900',
  assessment_complete: 'bg-lime-100 text-lime-900',
  report_received: 'bg-violet-100 text-violet-900',
  recommendations_implemented: 'bg-emerald-100 text-emerald-800',
  withdrawn: 'bg-zinc-200 text-zinc-800',
};

const RECOMMENDATION_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-800',
  implemented: 'bg-emerald-100 text-emerald-800',
  not_applicable: 'bg-zinc-200 text-zinc-800',
};

const CRITICAL_INCIDENT_STATUS_STYLES: Record<string, string> = {
  active: 'bg-rose-100 text-rose-800',
  monitoring: 'bg-amber-100 text-amber-900',
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

export function PastoralInterventionStatusBadge({ status }: { status: string }) {
  const t = useTranslations('pastoral.badges.interventionStatus');
  const normalized = normalizeInterventionStatus(status);

  return (
    <Badge className={INTERVENTION_STATUS_STYLES[normalized] ?? 'bg-slate-100 text-slate-700'}>
      {INTERVENTION_STATUS_STYLES[normalized]
        ? t(normalized as never)
        : formatPastoralValue(normalized)}
    </Badge>
  );
}

export function PastoralActionStatusBadge({ status }: { status: string }) {
  const t = useTranslations('pastoral.badges.actionStatus');
  const normalized = normalizeActionStatus(status);

  return (
    <Badge className={ACTION_STATUS_STYLES[normalized] ?? 'bg-slate-100 text-slate-700'}>
      {ACTION_STATUS_STYLES[normalized] ? t(normalized as never) : formatPastoralValue(normalized)}
    </Badge>
  );
}

export function PastoralReferralStatusBadge({ status }: { status: string }) {
  const t = useTranslations('pastoral.badges.referralStatus');

  return (
    <Badge className={REFERRAL_STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-700'}>
      {REFERRAL_STATUS_STYLES[status] ? t(status as never) : formatPastoralValue(status)}
    </Badge>
  );
}

export function PastoralRecommendationStatusBadge({ status }: { status: string }) {
  const t = useTranslations('pastoral.badges.recommendationStatus');
  const normalized = normalizeRecommendationStatus(status);

  return (
    <Badge className={RECOMMENDATION_STATUS_STYLES[normalized] ?? 'bg-slate-100 text-slate-700'}>
      {RECOMMENDATION_STATUS_STYLES[normalized]
        ? t(normalized as never)
        : formatPastoralValue(normalized)}
    </Badge>
  );
}

export function PastoralCriticalIncidentStatusBadge({ status }: { status: string }) {
  const t = useTranslations('pastoral.badges.criticalIncidentStatus');
  const normalized = normalizeCriticalIncidentStatus(status);

  return (
    <Badge className={CRITICAL_INCIDENT_STATUS_STYLES[normalized] ?? 'bg-slate-100 text-slate-700'}>
      {CRITICAL_INCIDENT_STATUS_STYLES[normalized]
        ? t(normalized as never)
        : formatPastoralValue(normalized)}
    </Badge>
  );
}
