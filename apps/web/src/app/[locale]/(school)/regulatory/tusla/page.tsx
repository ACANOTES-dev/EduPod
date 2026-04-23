'use client';

import { AlarmClock, FileText, BarChart3, Clock, Settings, Siren, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import {
  type RegulatoryDashboardSummary,
  TUSLA_DEFAULT_THRESHOLD_DAYS,
} from '@school/shared/regulatory';
import { Button } from '@school/ui';

import { HubTile } from '@/components/hub-tile';
import { KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';
import { ADMIN_ROLES, STAFF_ROLES, type RoleKey } from '@/lib/route-roles';

import { ErrorBanner } from '../_components/error-banner';

import { ThresholdMonitorTable } from './_components/threshold-monitor-table';

// ─── Tile catalogue ─────────────────────────────────────────────────────────

interface TuslaTile {
  key: 'sar' | 'aar' | 'reducedDays' | 'mappings';
  href: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  glow: string;
  roles: RoleKey[];
}

const TUSLA_TILES: TuslaTile[] = [
  {
    key: 'sar',
    href: '/regulatory/tusla/sar',
    icon: FileText,
    accent: 'from-teal-400 via-teal-500 to-teal-600',
    iconBg: 'bg-teal-100 text-teal-700',
    glow: 'from-teal-50/80',
    roles: ADMIN_ROLES,
  },
  {
    key: 'aar',
    href: '/regulatory/tusla/aar',
    icon: BarChart3,
    accent: 'from-cyan-400 via-cyan-500 to-cyan-600',
    iconBg: 'bg-cyan-100 text-cyan-700',
    glow: 'from-cyan-50/80',
    roles: ADMIN_ROLES,
  },
  {
    key: 'reducedDays',
    href: '/regulatory/tusla/reduced-days',
    icon: Clock,
    accent: 'from-sky-400 via-sky-500 to-sky-600',
    iconBg: 'bg-sky-100 text-sky-700',
    glow: 'from-sky-50/80',
    roles: STAFF_ROLES,
  },
  {
    key: 'mappings',
    href: '/regulatory/tusla/mappings',
    icon: Settings,
    accent: 'from-slate-400 via-slate-500 to-slate-600',
    iconBg: 'bg-slate-100 text-slate-700',
    glow: 'from-slate-50/80',
    roles: ADMIN_ROLES,
  },
];

// ─── Threshold monitor data types ───────────────────────────────────────────

interface ThresholdStudent {
  student: {
    id: string;
    first_name: string;
    last_name: string;
    student_number: string | null;
  };
  absent_days: number;
  threshold: number;
  status: 'normal' | 'approaching' | 'exceeded';
}

interface ThresholdMonitorResponse {
  threshold: number;
  data: ThresholdStudent[];
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function TuslaHubPage() {
  const t = useTranslations('regulatory.tusla');
  const locale = useLocale();
  const { roleKeys } = useRoleCheck();

  const [summary, setSummary] = React.useState<RegulatoryDashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = React.useState(true);
  const [summaryError, setSummaryError] = React.useState<string | null>(null);
  const [summaryReload, setSummaryReload] = React.useState(0);

  const [thresholdData, setThresholdData] = React.useState<ThresholdStudent[]>([]);
  const [threshold, setThreshold] = React.useState(TUSLA_DEFAULT_THRESHOLD_DAYS);
  const [thresholdLoading, setThresholdLoading] = React.useState(true);

  // ── Fetch dashboard summary ─────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    setSummaryLoading(true);
    setSummaryError(null);

    apiClient<{ data: RegulatoryDashboardSummary }>('/api/v1/regulatory/dashboard')
      .then((res) => {
        if (!cancelled) setSummary(res.data);
      })
      .catch((err) => {
        console.error('[TuslaHubPage] dashboard failed', err);
        if (!cancelled) setSummaryError(t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [summaryReload, t]);

  // ── Fetch threshold monitor ─────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    setThresholdLoading(true);

    apiClient<ThresholdMonitorResponse>(
      `/api/v1/regulatory/tusla/threshold-monitor?threshold_days=${TUSLA_DEFAULT_THRESHOLD_DAYS}`,
      { silent: true },
    )
      .then((res) => {
        if (cancelled) return;
        setThresholdData(res.data ?? []);
        setThreshold(res.threshold ?? TUSLA_DEFAULT_THRESHOLD_DAYS);
      })
      .catch((err) => {
        console.error('[TuslaHubPage] threshold monitor failed', err);
        if (!cancelled) setThresholdData([]);
      })
      .finally(() => {
        if (!cancelled) setThresholdLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Derived data ────────────────────────────────────────────────────────
  const visibleTiles = React.useMemo(
    () => TUSLA_TILES.filter((tile) => tile.roles.some((r) => roleKeys.includes(r as RoleKey))),
    [roleKeys],
  );

  const approaching = summary?.tusla.students_approaching_threshold ?? 0;
  const exceeded = summary?.tusla.students_exceeded_threshold ?? 0;
  const openSuspensions = summary?.tusla.open_suspensions_count ?? 0;
  const lastSar = summary?.tusla.last_sar_submitted_at;

  const canGenerateSar = ADMIN_ROLES.some((r) => roleKeys.includes(r));

  return (
    <div className="flex min-w-0 flex-col gap-8 pb-10">
      <PageHeader
        title={t('hubTitle')}
        description={t('hubDescription')}
        back={{ href: `/${locale}/regulatory`, label: t('backToRegulatory') }}
        actions={
          canGenerateSar ? (
            <Link href={`/${locale}/regulatory/tusla/sar`}>
              <Button className="min-h-[44px]">
                <FileText className="me-2 h-4 w-4" />
                {t('generateSar')}
              </Button>
            </Link>
          ) : undefined
        }
      />

      {summaryError && (
        <ErrorBanner
          message={summaryError}
          retryLabel={t('retry')}
          onRetry={() => setSummaryReload((k) => k + 1)}
        />
      )}

      {/* ── KPI strip ─────────────────────────────────────────────────── */}
      <section aria-label={t('kpi.ariaLabel')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          icon={AlarmClock}
          label={t('kpi.approaching')}
          value={approaching}
          isLoading={summaryLoading}
          accent={approaching > 0 ? 'text-warning-600' : 'text-text-tertiary'}
          tooltip={t('kpi.approachingTooltip')}
        />
        <KpiTile
          icon={Siren}
          label={t('kpi.exceeded')}
          value={exceeded}
          isLoading={summaryLoading}
          accent={exceeded > 0 ? 'text-danger-600' : 'text-text-tertiary'}
          tooltip={t('kpi.exceededTooltip')}
        />
        <KpiTile
          icon={TrendingUp}
          label={t('kpi.openSuspensions')}
          value={openSuspensions}
          isLoading={summaryLoading}
          accent="text-teal-700"
          tooltip={t('kpi.openSuspensionsTooltip')}
        />
        <KpiTile
          icon={FileText}
          label={t('kpi.lastSar')}
          value={lastSar ? formatDate(lastSar) : t('kpi.never')}
          isLoading={summaryLoading}
          accent="text-sky-700"
          tooltip={t('kpi.lastSarTooltip')}
        />
      </section>

      {/* ── Hub tiles ─────────────────────────────────────────────────── */}
      <section
        aria-label={t('tiles.ariaLabel')}
        className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4"
      >
        {visibleTiles.map((tile, idx) => (
          <HubTile
            key={tile.key}
            icon={tile.icon}
            title={t(`tiles.${tile.key}.title`)}
            description={t(`tiles.${tile.key}.description`)}
            href={tile.href}
            accent={tile.accent}
            iconBg={tile.iconBg}
            glow={tile.glow}
            animationIndex={idx}
          />
        ))}
      </section>

      {/* ── Threshold monitor ────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">
            {t('thresholdMonitorTitle')}
          </h2>
          <span className="text-xs text-text-tertiary">
            {t('thresholdMonitorSubtitle', { threshold })}
          </span>
        </div>
        <ThresholdMonitorTable
          data={thresholdData}
          threshold={threshold}
          isLoading={thresholdLoading}
        />
      </section>
    </div>
  );
}
