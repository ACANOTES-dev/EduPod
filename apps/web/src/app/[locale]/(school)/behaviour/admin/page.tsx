'use client';

import {
  Award,
  ClipboardList,
  Database,
  ListTree,
  Lock,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';

import type { RepairOperationDef } from './_components/repair-operation';
import { RepairOperationCard } from './_components/repair-operation';

const OPERATIONS: RepairOperationDef[] = [
  {
    key: 'recompute-points',
    i18nKey: 'recomputePoints',
    confirmPhrase: 'recompute-points-yes',
    endpointRoot: 'recompute-points',
    icon: RefreshCw,
    accent: 'emerald',
    hasPreview: true,
    defaultBody: { scope: 'tenant' },
  },
  {
    key: 'rebuild-awards',
    i18nKey: 'rebuildAwards',
    confirmPhrase: 'rebuild-awards-yes',
    endpointRoot: 'rebuild-awards',
    icon: Award,
    accent: 'indigo',
    hasPreview: true,
    defaultBody: { scope: 'tenant' },
  },
  {
    key: 'recompute-pulse',
    i18nKey: 'recomputePulse',
    confirmPhrase: 'recompute-pulse-yes',
    endpointRoot: 'recompute-pulse',
    icon: Database,
    accent: 'emerald',
    hasPreview: false,
  },
  {
    key: 'backfill-tasks',
    i18nKey: 'backfillTasks',
    confirmPhrase: 'backfill-tasks-yes',
    endpointRoot: 'backfill-tasks',
    icon: ClipboardList,
    accent: 'amber',
    hasPreview: true,
    defaultBody: { scope: 'tenant' },
  },
  {
    key: 'reindex-search',
    i18nKey: 'reindexSearch',
    confirmPhrase: 'reindex-search-yes',
    endpointRoot: 'reindex-search',
    icon: Search,
    accent: 'slate',
    polling: true,
    hasPreview: true,
  },
  {
    key: 'retention-sweep',
    i18nKey: 'retentionSweep',
    confirmPhrase: 'retention-execute-yes',
    endpointRoot: 'retention/execute',
    icon: Trash2,
    accent: 'rose',
    polling: true,
    hasPreview: true,
  },
];

export default function BehaviourAdminPage() {
  const t = useTranslations('behaviourAdmin');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { hasAnyRole } = useRoleCheck();

  // Admin tile page gated to owner + principal by convention — matches the
  // RBAC check the settings/behaviour-admin page already enforces.
  const canAccess = hasAnyRole('school_owner', 'school_principal');

  if (!canAccess) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-10">
        <PageHeader title={t('title')} />
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Lock className="h-6 w-6" />
          </div>
          <p className="max-w-md text-sm text-text-secondary">{t('denied.body')}</p>
          <Link
            href={`/${locale}/wellbeing`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary"
          >
            {t('denied.backToHub')}
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: `/${locale}/behaviour`, label: t('actions.backToBehaviour') }}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/${locale}/behaviour/admin/legal-holds`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary"
            >
              <ListTree className="h-3.5 w-3.5" />
              {t('actions.legalHolds')}
            </Link>
          </div>
        }
      />

      {/* Safety banner */}
      <section className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
        <div className="text-xs text-rose-900">
          <p className="font-medium">{t('banner.title')}</p>
          <p className="mt-1">{t('banner.body')}</p>
        </div>
      </section>

      {/* Operations tile grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {OPERATIONS.map((op) => (
          <RepairOperationCard key={op.key} op={op} />
        ))}
      </div>

      {/* Legal holds deep-link tile */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <Lock className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-text-primary">{t('legalHolds.title')}</h3>
            <p className="mt-1 text-xs text-text-secondary">{t('legalHolds.body')}</p>
          </div>
          <Link
            href={`/${locale}/behaviour/admin/legal-holds`}
            className="shrink-0 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-secondary"
          >
            {t('legalHolds.open')}
          </Link>
        </div>
      </section>
    </div>
  );
}
