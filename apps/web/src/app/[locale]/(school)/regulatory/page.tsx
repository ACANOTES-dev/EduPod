'use client';

import { AlarmClock, CalendarPlus, Download, FileText, History, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { ModuleKey } from '@school/shared/modules';
import type { RegulatoryDashboardSummary } from '@school/shared/regulatory';

import { HubTile } from '@/components/hub-tile';
import { CardSkeleton, KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { QuickAction } from '@/components/quick-action';
import { useModuleEnabled } from '@/hooks/use-module-enabled';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';
import { ADMIN_ROLES, STAFF_ROLES, type RoleKey } from '@/lib/route-roles';

import { ErrorBanner } from './_components/error-banner';
import {
  filterTilesForRoles,
  REGULATORY_TILES,
  resolveTileCount,
} from './_components/hub-tile-catalogue';
import { UpcomingDeadlinesFeed } from './_components/upcoming-deadlines-feed';

// ─── Quick-action catalogue ─────────────────────────────────────────────────

interface QuickActionConfig {
  key: 'generateSar' | 'startPpodExport' | 'newCalendarEvent' | 'viewSubmissions';
  href: string;
  icon: typeof Download;
  accent: string;
  gradient: string;
  roles: RoleKey[];
  moduleKey?: ModuleKey;
}

const QUICK_ACTIONS: QuickActionConfig[] = [
  {
    key: 'generateSar',
    href: '/regulatory/tusla',
    icon: FileText,
    accent: 'bg-teal-100 text-teal-700',
    gradient: 'from-teal-400 to-teal-600',
    roles: ADMIN_ROLES,
    moduleKey: 'compliance_advanced',
  },
  {
    key: 'startPpodExport',
    href: '/regulatory/ppod',
    icon: Download,
    accent: 'bg-cyan-100 text-cyan-700',
    gradient: 'from-cyan-400 to-cyan-600',
    roles: ADMIN_ROLES,
    moduleKey: 'compliance_advanced',
  },
  {
    key: 'newCalendarEvent',
    href: '/regulatory/calendar',
    icon: CalendarPlus,
    accent: 'bg-amber-100 text-amber-700',
    gradient: 'from-amber-400 to-amber-600',
    roles: ADMIN_ROLES,
  },
  {
    key: 'viewSubmissions',
    href: '/regulatory/submissions',
    icon: History,
    accent: 'bg-slate-100 text-slate-700',
    gradient: 'from-slate-400 to-slate-600',
    roles: STAFF_ROLES,
    moduleKey: 'compliance_advanced',
  },
];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function RegulatoryHubPage() {
  const t = useTranslations('regulatory.superHub');
  const { roleKeys } = useRoleCheck();
  const complianceAdvancedEnabled = useModuleEnabled('compliance_advanced');

  const [summary, setSummary] = React.useState<RegulatoryDashboardSummary | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  // ── Fetch dashboard summary ─────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiClient<{ data: RegulatoryDashboardSummary }>('/api/v1/regulatory/dashboard')
      .then((res) => {
        if (!cancelled) setSummary(res.data);
      })
      .catch((err) => {
        console.error('[RegulatoryHubPage] dashboard failed', err);
        if (!cancelled) setError(t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey, t]);

  // ── Derived data ────────────────────────────────────────────────────────
  const visibleTiles = React.useMemo(
    () =>
      filterTilesForRoles(REGULATORY_TILES, roleKeys as RoleKey[]).filter(
        (tile) =>
          !tile.moduleKey || tile.moduleKey !== 'compliance_advanced' || complianceAdvancedEnabled,
      ),
    [complianceAdvancedEnabled, roleKeys],
  );

  const visibleActions = React.useMemo(
    () =>
      QUICK_ACTIONS.filter(
        (action) =>
          action.roles.some((r) => roleKeys.includes(r)) &&
          (!action.moduleKey ||
            action.moduleKey !== 'compliance_advanced' ||
            complianceAdvancedEnabled),
      ),
    [complianceAdvancedEnabled, roleKeys],
  );

  const overdueCount = summary?.calendar.overdue ?? 0;
  const upcomingCount = summary?.calendar.upcoming_deadlines ?? 0;
  const ppodHealth = summary?.ppod.health_percent;
  const lastDesSubmission = summary?.des.last_submission_at;

  return (
    <div className="flex min-w-0 flex-col gap-8 pb-10">
      <PageHeader title={t('title')} description={t('description')} />

      {/* ── Error banner ─────────────────────────────────────────────── */}
      {error && (
        <ErrorBanner
          message={error}
          retryLabel={t('retry')}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      )}

      {/* ── KPI strip ─────────────────────────────────────────────────── */}
      <section aria-label={t('kpis.ariaLabel')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          icon={AlarmClock}
          label={t('kpis.overdue')}
          value={overdueCount}
          subtitle={overdueCount > 0 ? t('kpis.overdueSubtitle') : undefined}
          isLoading={isLoading}
          accent={overdueCount > 0 ? 'text-danger-600' : 'text-text-tertiary'}
          tooltip={t('kpis.overdueTooltip')}
        />
        <KpiTile
          icon={CalendarPlus}
          label={t('kpis.upcoming')}
          value={upcomingCount}
          subtitle={t('kpis.upcomingSubtitle')}
          isLoading={isLoading}
          accent="text-teal-700"
          tooltip={t('kpis.upcomingTooltip')}
        />
        <KpiTile
          icon={TrendingUp}
          label={t('kpis.ppodHealth')}
          value={ppodHealth === undefined ? undefined : `${ppodHealth}%`}
          isLoading={isLoading}
          accent="text-cyan-700"
          tooltip={t('kpis.ppodHealthTooltip')}
        />
        <KpiTile
          icon={FileText}
          label={t('kpis.lastDesSubmission')}
          value={lastDesSubmission ? formatDate(lastDesSubmission) : t('kpis.never')}
          isLoading={isLoading}
          accent="text-sky-700"
          tooltip={t('kpis.lastDesSubmissionTooltip')}
        />
      </section>

      {/* ── Quick actions ─────────────────────────────────────────────── */}
      {visibleActions.length > 0 && (
        <section
          aria-label={t('quickActions.ariaLabel')}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {visibleActions.map((action) => (
            <QuickAction
              key={action.key}
              icon={action.icon}
              label={t(`quickActions.${action.key}`)}
              href={action.href}
              accent={action.accent}
              gradient={action.gradient}
            />
          ))}
        </section>
      )}

      {/* ── Hub tiles ─────────────────────────────────────────────────── */}
      <section
        aria-label={t('tiles.ariaLabel')}
        className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
      >
        {isLoading && summary === null ? (
          <>
            {visibleTiles.map((tile) => (
              <CardSkeleton key={`skeleton-${tile.key}`} />
            ))}
          </>
        ) : (
          visibleTiles.map((tile, idx) => (
            <HubTile
              key={tile.key}
              icon={tile.icon}
              title={t(`tiles.${tile.key}.title`)}
              description={t(`tiles.${tile.key}.description`)}
              href={tile.href}
              accent={tile.accent}
              iconBg={tile.iconBg}
              glow={tile.glow}
              count={resolveTileCount(tile.key, summary)}
              animationIndex={idx}
              moduleKey={tile.moduleKey}
            />
          ))
        )}
      </section>

      {/* ── Upcoming deadlines feed ──────────────────────────────────── */}
      <UpcomingDeadlinesFeed
        items={summary?.calendar.next_deadlines ?? []}
        isLoading={isLoading && summary === null}
      />
    </div>
  );
}
