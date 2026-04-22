'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  KeyRound,
  Lock,
  NotebookPen,
  UserSquare,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Textarea } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

import { canViewSafeguarding } from '../../_components/visibility';
import {
  deriveReviewStatus,
  formatRemaining,
  type BreakGlassAccessLog,
  type BreakGlassGrantDetail,
  type ReviewStatus,
} from '../_components/break-glass-types';

const REVIEW_PILL: Record<ReviewStatus, string> = {
  filed: 'bg-success-100 text-success-700',
  overdue: 'bg-danger-100 text-danger-700',
  not_yet_due: 'bg-warning-100 text-warning-800',
  not_required: 'bg-surface-secondary text-text-secondary',
};

export default function BreakGlassGrantDetailPage() {
  const t = useTranslations('safeguardingBreakGlass');
  const tHub = useTranslations('safeguardingHub');
  const params = useParams();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const grantId = params?.id as string;
  const { roleKeys } = useRoleCheck();

  const [grant, setGrant] = React.useState<BreakGlassGrantDetail | null>(null);
  const [log, setLog] = React.useState<BreakGlassAccessLog | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  // Review form state
  const [reviewNotes, setReviewNotes] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const canView = canViewSafeguarding(roleKeys);

  React.useEffect(() => {
    if (!canView || !grantId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setNotFound(false);

    void Promise.allSettled([
      apiClient<{ data: BreakGlassGrantDetail }>(`/api/v1/safeguarding/break-glass/${grantId}`, {
        silent: true,
      }),
      apiClient<{ data: BreakGlassAccessLog }>(
        `/api/v1/safeguarding/break-glass/${grantId}/access-log`,
        { silent: true },
      ),
    ])
      .then(([grantRes, logRes]) => {
        if (cancelled) return;
        if (grantRes.status === 'fulfilled') {
          setGrant(grantRes.value.data);
        } else {
          setGrant(null);
          setNotFound(true);
        }
        if (logRes.status === 'fulfilled') {
          setLog(logRes.value.data);
        } else {
          setLog(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canView, grantId, reloadKey]);

  const handleSubmitReview = async () => {
    if (!reviewNotes.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiClient(`/api/v1/safeguarding/break-glass/${grantId}/review`, {
        method: 'POST',
        body: JSON.stringify({ notes: reviewNotes.trim() }),
      });
      setReviewNotes('');
      setReloadKey((k) => k + 1);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setSubmitError(ex?.error?.message ?? t('detail.review.errors.generic'));
      console.error('[BreakGlassGrantDetailPage:review]', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!canView) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-10">
        <PageHeader
          title={t('detail.title')}
          back={{ href: `/${locale}/safeguarding/break-glass`, label: t('detail.backToList') }}
        />
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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-12 animate-pulse rounded-2xl bg-surface-secondary" />
        <div className="h-64 animate-pulse rounded-2xl bg-surface-secondary" />
      </div>
    );
  }

  if (notFound || !grant) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-10">
        <PageHeader
          title={t('detail.title')}
          back={{ href: `/${locale}/safeguarding/break-glass`, label: t('detail.backToList') }}
        />
        <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-text-tertiary">
          {t('detail.notFound')}
        </div>
      </div>
    );
  }

  const rowForStatus = {
    active: grant.active,
    review_completed_at: grant.after_action_review.completed_at,
    review_overdue: grant.after_action_review.overdue,
    expires_at: grant.expires_at,
  };
  const reviewStatus = deriveReviewStatus(rowForStatus);

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('detail.title')}
        description={t('detail.description', { name: grant.granted_to.name })}
        back={{ href: `/${locale}/safeguarding/break-glass`, label: t('detail.backToList') }}
      />

      {/* Status banner */}
      <section
        className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 ${
          grant.active ? 'border-warning-300 bg-warning-50' : 'border-border bg-surface-secondary'
        }`}
      >
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full ${
            grant.active ? 'bg-warning-100 text-warning-700' : 'bg-slate-100 text-slate-600'
          }`}
        >
          <KeyRound className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary">
            {grant.active
              ? t('detail.status.active')
              : grant.revoked_at
                ? t('detail.status.revoked')
                : t('detail.status.expired')}
          </p>
          <p className="text-xs text-text-tertiary">
            {grant.active
              ? t('detail.status.activeBody', { remaining: formatRemaining(grant.expires_at) })
              : t('detail.status.pastBody', { at: formatDateTime(grant.expires_at) })}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${REVIEW_PILL[reviewStatus]}`}
        >
          {t(`review.${reviewStatus}`)}
        </span>
      </section>

      {/* Grant metadata grid */}
      <section className="grid gap-4 rounded-2xl border border-border bg-surface p-4 md:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            {t('detail.meta.grantedTo')}
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-text-primary">
            <UserSquare className="h-4 w-4 text-text-tertiary" />
            {grant.granted_to.name}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            {t('detail.meta.grantedBy')}
          </p>
          <p className="mt-1 text-sm text-text-primary">{grant.granted_by.name}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            {t('detail.meta.scope')}
          </p>
          <p className="mt-1 text-sm text-text-primary">{t('scope.' + grant.scope)}</p>
          {grant.scope === 'specific_concerns' && (
            <p className="mt-1 text-xs text-text-tertiary">
              {t('detail.meta.specificCount', { count: grant.scoped_concern_ids.length })}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            {t('detail.meta.window')}
          </p>
          <p className="mt-1 text-sm text-text-primary">
            {formatDateTime(grant.granted_at)} → {formatDateTime(grant.expires_at)}
          </p>
        </div>
        <div className="md:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            {t('detail.meta.reason')}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">{grant.reason}</p>
        </div>
      </section>

      {/* After-action review */}
      <section className="rounded-2xl border border-border bg-surface">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <NotebookPen className="h-5 w-5 text-text-tertiary" />
          <h2 className="text-sm font-semibold text-text-primary">{t('detail.review.title')}</h2>
        </header>
        <div className="p-4">
          {grant.after_action_review.completed_at ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-success-700">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-medium">{t('detail.review.filedBy')}</span>
                <span>{grant.after_action_review.completed_by?.name ?? '—'}</span>
                <span className="text-text-tertiary">
                  · {formatDateTime(grant.after_action_review.completed_at)}
                </span>
              </div>
              <div className="whitespace-pre-wrap rounded-lg border border-border bg-surface-secondary p-3 text-sm text-text-primary">
                {grant.after_action_review.notes ?? '—'}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {reviewStatus === 'overdue' && (
                <div className="flex items-start gap-2 rounded-lg border border-danger-300 bg-danger-50 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-700" />
                  <p className="text-xs text-danger-800">{t('detail.review.overdueWarning')}</p>
                </div>
              )}
              {reviewStatus === 'not_yet_due' && grant.active && (
                <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-secondary p-3">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
                  <p className="text-xs text-text-secondary">{t('detail.review.stillActive')}</p>
                </div>
              )}
              <Textarea
                rows={5}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder={t('detail.review.placeholder')}
                disabled={submitting || grant.active}
              />
              {submitError && (
                <div className="rounded-lg border border-danger-300 bg-danger-50 p-2 text-xs text-danger-800">
                  {submitError}
                </div>
              )}
              <Button
                onClick={() => void handleSubmitReview()}
                disabled={!reviewNotes.trim() || submitting || grant.active}
              >
                {submitting ? t('detail.review.submitting') : t('detail.review.submit')}
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Access log */}
      <section className="rounded-2xl border border-border bg-surface">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">
            {t('detail.accessLog.title', { count: log?.entries.length ?? 0 })}
          </h2>
        </header>
        {!log || log.entries.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-text-tertiary">
            {t('detail.accessLog.empty')}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {log.entries.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-xs font-medium text-text-secondary">
                    {entry.action}
                  </span>
                  <span className="text-xs text-text-tertiary">{formatDateTime(entry.at)}</span>
                </div>
                <p className="text-xs text-text-secondary">{entry.description}</p>
                <p className="text-[11px] text-text-tertiary">
                  {t('detail.accessLog.concern')} {entry.concern_id}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
