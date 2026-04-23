'use client';

import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Clock,
  History,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { HubTile } from '@/components/hub-tile';
import { KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { ErrorBanner } from '../_components/error-banner';

import { DatabaseToggle, type DatabaseType } from './_components/database-toggle';
import { DiffPreviewSection } from './_components/diff-preview-section';
import { SyncStatusPill } from './_components/sync-status-pill';

// ─── Types ──────────────────────────────────────────────────────────────────

interface PpodLastSync {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  records_created: number;
  records_updated: number;
  records_failed: number;
}

interface PpodSyncStatus {
  total_mapped: number;
  synced: number;
  pending: number;
  changed: number;
  errors: number;
  last_sync: PpodLastSync | null;
}

// ─── Tile catalogue ─────────────────────────────────────────────────────────

interface PpodTile {
  key: 'students' | 'syncLog' | 'import' | 'export';
  href: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  glow: string;
}

const PPOD_TILES: PpodTile[] = [
  {
    key: 'students',
    href: '/regulatory/ppod/students',
    icon: Users,
    accent: 'from-teal-400 via-teal-500 to-teal-600',
    iconBg: 'bg-teal-100 text-teal-700',
    glow: 'from-teal-50/80',
  },
  {
    key: 'syncLog',
    href: '/regulatory/ppod/sync-log',
    icon: History,
    accent: 'from-cyan-400 via-cyan-500 to-cyan-600',
    iconBg: 'bg-cyan-100 text-cyan-700',
    glow: 'from-cyan-50/80',
  },
  {
    key: 'import',
    href: '/regulatory/ppod/import',
    icon: ArrowDownToLine,
    accent: 'from-sky-400 via-sky-500 to-sky-600',
    iconBg: 'bg-sky-100 text-sky-700',
    glow: 'from-sky-50/80',
  },
  {
    key: 'export',
    href: '/regulatory/ppod/export',
    icon: ArrowUpFromLine,
    accent: 'from-slate-400 via-slate-500 to-slate-600',
    iconBg: 'bg-slate-100 text-slate-700',
    glow: 'from-slate-50/80',
  },
];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function PpodHubPage() {
  const t = useTranslations('regulatory.ppod');
  const locale = useLocale();

  const [databaseType, setDatabaseType] = React.useState<DatabaseType>('ppod');
  const [status, setStatus] = React.useState<PpodSyncStatus | null>(null);
  const [statusLoading, setStatusLoading] = React.useState(true);
  const [statusError, setStatusError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setStatusLoading(true);
    setStatusError(null);

    apiClient<{ data: PpodSyncStatus } | PpodSyncStatus>(
      `/api/v1/regulatory/ppod/status?database_type=${databaseType}`,
      { silent: true },
    )
      .then((res) => {
        if (cancelled) return;
        const inner =
          res && typeof res === 'object' && 'data' in (res as object)
            ? (res as { data: PpodSyncStatus }).data
            : (res as PpodSyncStatus);
        setStatus(inner);
      })
      .catch((err) => {
        console.error('[PpodHubPage] status failed', err);
        if (!cancelled) setStatusError(t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [databaseType, reloadKey, t]);

  const lastSyncAt = status?.last_sync?.started_at ?? null;

  return (
    <div className="flex min-w-0 flex-col gap-8 pb-10">
      <PageHeader
        title={t('hubTitle')}
        description={t('hubDescription')}
        back={{ href: `/${locale}/regulatory`, label: t('backToRegulatory') }}
        actions={<SyncStatusPill lastSyncAt={lastSyncAt} isLoading={statusLoading} />}
      />

      {statusError && (
        <ErrorBanner
          message={statusError}
          retryLabel={t('retry')}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      )}

      {/* ── Database toggle ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-text-secondary">{t('databaseLabel')}</span>
        <DatabaseToggle value={databaseType} onChange={setDatabaseType} />
      </div>

      {/* ── KPI strip ───────────────────────────────────────────────────── */}
      <section aria-label={t('kpi.ariaLabel')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          icon={CheckCircle2}
          label={t('kpi.synced')}
          value={status?.synced ?? 0}
          isLoading={statusLoading}
          accent="text-teal-700"
          tooltip={t('kpi.syncedTooltip')}
        />
        <KpiTile
          icon={Clock}
          label={t('kpi.pending')}
          value={status?.pending ?? 0}
          isLoading={statusLoading}
          accent={(status?.pending ?? 0) > 0 ? 'text-warning-600' : 'text-text-tertiary'}
          tooltip={t('kpi.pendingTooltip')}
        />
        <KpiTile
          icon={AlertTriangle}
          label={t('kpi.errors')}
          value={status?.errors ?? 0}
          isLoading={statusLoading}
          accent={(status?.errors ?? 0) > 0 ? 'text-danger-600' : 'text-text-tertiary'}
          tooltip={t('kpi.errorsTooltip')}
        />
        <KpiTile
          icon={History}
          label={t('kpi.lastSync')}
          value={lastSyncAt ? formatRelative(lastSyncAt, t) : t('kpi.never')}
          isLoading={statusLoading}
          accent="text-sky-700"
          tooltip={t('kpi.lastSyncTooltip')}
        />
      </section>

      {/* ── Hub tiles ───────────────────────────────────────────────────── */}
      <section
        aria-label={t('tiles.ariaLabel')}
        className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4"
      >
        {PPOD_TILES.map((tile, i) => (
          <HubTile
            key={tile.key}
            icon={tile.icon}
            title={t(`tiles.${tile.key}.title`)}
            description={t(`tiles.${tile.key}.description`)}
            href={tile.href}
            accent={tile.accent}
            iconBg={tile.iconBg}
            glow={tile.glow}
            animationIndex={i}
          />
        ))}
      </section>

      {/* ── Diff preview ────────────────────────────────────────────────── */}
      <DiffPreviewSection databaseType={databaseType} />
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

type TFn = ReturnType<typeof useTranslations<'regulatory.ppod'>>;

function formatRelative(iso: string, t: TFn): string {
  const then = new Date(iso).getTime();
  const diffSeconds = Math.max(0, Math.floor((Date.now() - then) / 1000));

  if (diffSeconds < 60) return t('relative.justNow');
  if (diffSeconds < 3600) {
    return t('relative.minutesAgo', { count: Math.floor(diffSeconds / 60) });
  }
  if (diffSeconds < 86_400) {
    return t('relative.hoursAgo', { count: Math.floor(diffSeconds / 3600) });
  }
  return t('relative.daysAgo', { count: Math.floor(diffSeconds / 86_400) });
}
