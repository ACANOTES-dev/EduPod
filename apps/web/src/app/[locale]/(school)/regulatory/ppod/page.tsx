'use client';

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Database,
  FileSpreadsheet,
  RefreshCw,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { RegulatoryNav } from '../_components/regulatory-nav';

import { SyncDiffPreview } from './_components/sync-diff-preview';
import { SyncStatusOverview } from './_components/sync-status-overview';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ───────────────────────────────────────────────────────────────────

type DatabaseType = 'ppod' | 'pod';

interface PpodSyncStatus {
  total_students: number;
  synced: number;
  pending: number;
  changed: number;
  errors: number;
  not_applicable: number;
  last_sync_at: string | null;
}

// ─── Quick Action Data ───────────────────────────────────────────────────────

interface QuickAction {
  titleKey: string;
  descriptionKey: string;
  icon: typeof FileSpreadsheet;
  href: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    titleKey: 'ppod.exportForPpod',
    descriptionKey: 'ppod.exportDescription',
    icon: ArrowUpFromLine,
    href: '/ppod/export',
  },
  {
    titleKey: 'ppod.importFromPpod',
    descriptionKey: 'ppod.importDescription',
    icon: ArrowDownToLine,
    href: '/ppod/import',
  },
];

// ─── Navigation Link Data ────────────────────────────────────────────────────

interface NavLink {
  titleKey: string;
  descriptionKey: string;
  icon: typeof Users;
  href: string;
}

const NAV_LINKS: NavLink[] = [
  {
    titleKey: 'ppod.studentMappings',
    descriptionKey: 'ppod.studentMappingsDescription',
    icon: Users,
    href: '/ppod/mappings',
  },
  {
    titleKey: 'ppod.syncLog',
    descriptionKey: 'ppod.syncLogDescription',
    icon: RefreshCw,
    href: '/ppod/sync-log',
  },
  {
    titleKey: 'ppod.cbaSyncTitle',
    descriptionKey: 'ppod.cbaSyncDescription',
    icon: FileSpreadsheet,
    href: '/cba',
  },
  {
    titleKey: 'ppod.transfersTitle',
    descriptionKey: 'ppod.transfersDescription',
    icon: Database,
    href: '/transfers',
  },
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PpodDashboardPage() {
  const t = useTranslations('regulatory');
  const pathname = usePathname();
  const segments = (pathname ?? '').split('/').filter(Boolean);
  const locale = segments[0] ?? 'en';

  const [databaseType, setDatabaseType] = React.useState<DatabaseType>('ppod');
  const [status, setStatus] = React.useState<PpodSyncStatus | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchStatus = React.useCallback(async (type: DatabaseType) => {
    setIsLoading(true);
    try {
      const response = await apiClient<PpodSyncStatus>(
        `/api/v1/regulatory/ppod/status?database_type=${type}`,
        { silent: true },
      );
      setStatus(response);
    } catch (err) {
      console.error('[PpodDashboardPage.fetchStatus]', err);
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchStatus(databaseType);
  }, [databaseType, fetchStatus]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('ppod.title')} description={t('ppod.description')} />

      <RegulatoryNav />

      {/* ─── Database Type Toggle ──────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-xl bg-surface-secondary p-1">
        {(['ppod', 'pod'] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setDatabaseType(type)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              databaseType === type
                ? 'bg-surface text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {type === 'ppod' ? t('ppod.ppodDatabase') : t('ppod.podDatabase')}
          </button>
        ))}
      </div>

      {/* ─── Sync Status Overview ──────────────────────────────────────────── */}
      <SyncStatusOverview
        total={status?.total_students ?? 0}
        synced={status?.synced ?? 0}
        pending={status?.pending ?? 0}
        changed={status?.changed ?? 0}
        errors={status?.errors ?? 0}
        lastSyncAt={status?.last_sync_at ?? null}
        isLoading={isLoading}
      />

      {/* ─── Quick Actions ─────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary">{t('ppod.quickActions')}</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.titleKey}
                href={`/${locale}/regulatory${action.href}`}
                className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-4 transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:px-6"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-text-primary">
                    {t(action.titleKey as never)}
                  </h3>
                  <p className="mt-1 text-xs text-text-tertiary leading-relaxed">
                    {t(action.descriptionKey as never)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ─── Navigation Links ──────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary">{t('ppod.relatedPages')}</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {NAV_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.titleKey}
                href={`/${locale}/regulatory${link.href}`}
                className="flex h-full flex-col rounded-2xl border border-border bg-surface px-4 py-5 transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:px-6"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-text-primary">
                      {t(link.titleKey as never)}
                    </h3>
                    <p className="mt-1 text-xs text-text-tertiary leading-relaxed">
                      {t(link.descriptionKey as never)}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ─── Diff Preview ──────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary">{t('ppod.diffPreview')}</h2>
        <div className="mt-3">
          <SyncDiffPreview databaseType={databaseType} />
        </div>
      </div>
    </div>
  );
}
