'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import type { DpaStatus } from '@school/shared/gdpr';
import { Button, StatusBadge, toast } from '@school/ui';

import { LegalDocument } from '@/components/legal/legal-document';
import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/format-date';

const DPA_MANAGE_ROLES = ['school_owner', 'school_principal', 'admin', 'school_vice_principal'];

export default function DpaSettingsPage() {
  const t = useTranslations('legal');
  const locale = useLocale();
  const { roleKeys } = useRoleCheck();
  const [status, setStatus] = React.useState<DpaStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [accepting, setAccepting] = React.useState(false);

  const canAccept = React.useMemo(
    () => roleKeys.some((role) => DPA_MANAGE_ROLES.includes(role)),
    [roleKeys],
  );

  const loadStatus = React.useCallback(async () => {
    try {
      const response = await apiClient<DpaStatus>('/api/v1/legal/dpa/status');
      setStatus(response);
    } catch (err) {
      console.error('[DpaSettingsPage.loadStatus]', err);
      toast.error(t('dpaLoadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleAccept = React.useCallback(async () => {
    setAccepting(true);
    try {
      await apiClient('/api/v1/legal/dpa/accept', { method: 'POST' });
      toast.success(t('dpaAcceptSuccess'));
      await loadStatus();
    } catch (err) {
      console.error('[DpaSettingsPage.handleAccept]', err);
      toast.error(t('dpaAcceptError'));
    } finally {
      setAccepting(false);
    }
  }, [loadStatus, t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="rounded-3xl border border-border bg-surface p-8 text-sm text-text-secondary">
        {t('dpaUnavailable')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('dpaTitle')}
        description={t('dpaDescription')}
        actions={
          canAccept && !status.accepted ? (
            <Button onClick={handleAccept} disabled={accepting}>
              {accepting ? t('dpaAccepting') : t('dpaAccept')}
            </Button>
          ) : undefined
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-border bg-surface-secondary p-6">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={status.accepted ? 'success' : 'warning'} dot>
              {status.accepted ? t('dpaAcceptedBadge') : t('dpaPendingBadge')}
            </StatusBadge>
            <span className="text-sm text-text-secondary">
              {t('dpaVersionLabel', { version: status.current_version.version })}
            </span>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-surface p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary">
                {t('dpaEffectiveDate')}
              </dt>
              <dd className="mt-2 text-sm font-medium text-text-primary">
                {formatDate(status.current_version.effective_date)}
              </dd>
            </div>
            <div className="rounded-2xl bg-surface p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary">
                {t('dpaAcceptedOn')}
              </dt>
              <dd className="mt-2 text-sm font-medium text-text-primary">
                {status.accepted_at ? formatDateTime(status.accepted_at) : t('dpaNotAcceptedYet')}
              </dd>
            </div>
          </dl>

          {!status.accepted && (
            <div className="mt-6 rounded-2xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-900">
              <p className="font-medium">{t('dpaActionRequiredTitle')}</p>
              <p className="mt-1 text-warning-800">
                {canAccept ? t('dpaActionRequiredBody') : t('dpaActionRequiredReadOnly')}
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <Link
              href={`/${locale}/sub-processors`}
              className="font-medium text-primary-700 underline-offset-4 hover:underline"
            >
              {t('viewSubProcessors')}
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold text-text-primary">{t('dpaHistoryTitle')}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t('dpaHistoryDescription')}</p>

          <div className="mt-5 space-y-3">
            {status.history.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-text-secondary">
                {t('dpaHistoryEmpty')}
              </div>
            ) : (
              status.history.map((entry) => (
                <article key={entry.id} className="rounded-2xl bg-surface-secondary p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-text-primary">{entry.dpa_version}</p>
                    <StatusBadge status="success" dot>
                      {t('dpaAcceptedBadge')}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-sm text-text-secondary">
                    {formatDateTime(entry.accepted_at)}
                  </p>
                </article>
              ))
            )}
          </div>
        </div>
      </section>

      <LegalDocument html={status.current_version.content_html} />
    </div>
  );
}
