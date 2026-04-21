'use client';

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  KeyRound,
  Lock,
  Plus,
  ShieldCheck,
  UserSquare,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

import { canViewSafeguarding } from '../_components/visibility';

import {
  deriveReviewStatus,
  formatRemaining,
  type BreakGlassGrantRow,
  type ReviewStatus,
} from './_components/break-glass-types';
import { BreakGlassRequestDialog } from './_components/request-dialog';

// ─── Status styles ────────────────────────────────────────────────────────────

const REVIEW_PILL: Record<ReviewStatus, string> = {
  filed: 'bg-success-100 text-success-700',
  overdue: 'bg-danger-100 text-danger-700',
  not_yet_due: 'bg-warning-100 text-warning-800',
  not_required: 'bg-surface-secondary text-text-secondary',
};

const REVIEW_ICON: Record<ReviewStatus, React.ComponentType<{ className?: string }>> = {
  filed: CheckCircle2,
  overdue: AlertTriangle,
  not_yet_due: Clock,
  not_required: CheckCircle2,
};

export default function SafeguardingBreakGlassPage() {
  const t = useTranslations('safeguardingBreakGlass');
  const tHub = useTranslations('safeguardingHub');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { roleKeys } = useRoleCheck();

  const [rows, setRows] = React.useState<BreakGlassGrantRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  const canView = canViewSafeguarding(roleKeys);

  React.useEffect(() => {
    if (!canView) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    apiClient<{ data: BreakGlassGrantRow[] }>('/api/v1/safeguarding/break-glass')
      .then((res) => {
        if (!cancelled) setRows(res.data ?? []);
      })
      .catch((err) => {
        if (!cancelled) setRows([]);
        console.error('[SafeguardingBreakGlassPage]', err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canView, reloadKey]);

  const active = rows.filter((r) => r.active);
  const pastWithReview = rows.filter((r) => !r.active);

  if (!canView) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-10">
        <PageHeader title={t('title')} description={t('description')} />
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Lock className="h-6 w-6" />
          </div>
          <p className="max-w-md text-sm text-text-secondary">{tHub('denied.body')}</p>
          <Link
            href={`/${locale}/wellbeing`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary"
          >
            {tHub('denied.backToHub')}
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
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/${locale}/safeguarding`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary"
            >
              <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
              {tHub('denied.backToHub')}
            </Link>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-rose-700"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('request.title')}
            </button>
          </div>
        }
      />

      {/* Privacy banner */}
      <section className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
        <div className="text-xs text-rose-900">
          <p className="font-medium">{t('banner.title')}</p>
          <p className="mt-1">{t('banner.body')}</p>
        </div>
      </section>

      {/* Active grants */}
      <section className="rounded-2xl border border-border bg-surface">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">
            {t('active.title', { count: active.length })}
          </h2>
        </header>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
            ))}
          </div>
        ) : active.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <KeyRound className="h-8 w-8 text-text-tertiary/50" />
            <p className="text-sm text-text-tertiary">{t('active.empty')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {active.map((grant) => {
              const review = deriveReviewStatus(grant);
              const ReviewIcon = REVIEW_ICON[review];
              return (
                <li key={grant.id}>
                  <Link
                    href={`/${locale}/safeguarding/break-glass/${grant.id}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-secondary"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                      <UserSquare className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {grant.granted_to.name}
                      </p>
                      <p className="truncate text-xs text-text-tertiary">
                        {t('scope.' + grant.scope)} ·{' '}
                        {t('grantedBy', { name: grant.granted_by.name })}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-800">
                      <Clock className="h-3 w-3" />
                      {t('expiresIn', { remaining: formatRemaining(grant.expires_at) })}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${REVIEW_PILL[review]}`}
                    >
                      <ReviewIcon className="h-3 w-3" />
                      {t(`review.${review}`)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Past grants */}
      <section className="rounded-2xl border border-border bg-surface">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">
            {t('past.title', { count: pastWithReview.length })}
          </h2>
        </header>
        {isLoading ? null : pastWithReview.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-text-tertiary">{t('past.empty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {pastWithReview.map((grant) => {
              const review = deriveReviewStatus(grant);
              const ReviewIcon = REVIEW_ICON[review];
              return (
                <li key={grant.id}>
                  <Link
                    href={`/${locale}/safeguarding/break-glass/${grant.id}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-secondary"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                      <UserSquare className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {grant.granted_to.name}
                      </p>
                      <p className="truncate text-xs text-text-tertiary">
                        {t('scope.' + grant.scope)} · {formatDateTime(grant.granted_at)}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${REVIEW_PILL[review]}`}
                    >
                      <ReviewIcon className="h-3 w-3" />
                      {t(`review.${review}`)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <BreakGlassRequestDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onGranted={() => {
          setDialogOpen(false);
          setReloadKey((k) => k + 1);
        }}
      />
    </div>
  );
}
