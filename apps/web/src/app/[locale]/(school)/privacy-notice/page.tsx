'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import type { PrivacyNoticeCurrent } from '@school/shared';
import { Button, StatusBadge, toast } from '@school/ui';

import { LegalDocument } from '@/components/legal/legal-document';
import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/format-date';

export default function PrivacyNoticePage() {
  const t = useTranslations('legal');
  const locale = useLocale();
  const { hasRole } = useRoleCheck();
  const [state, setState] = React.useState<PrivacyNoticeCurrent | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [acknowledging, setAcknowledging] = React.useState(false);

  const loadNotice = React.useCallback(async () => {
    try {
      const endpoint = hasRole('parent')
        ? '/api/v1/parent-portal/privacy-notice'
        : '/api/v1/privacy-notices/current';
      const response = await apiClient<PrivacyNoticeCurrent>(endpoint);
      setState(response);
    } catch (err) {
      console.error('[PrivacyNoticePage.loadNotice]', err);
      toast.error(t('privacyCurrentLoadError'));
    } finally {
      setLoading(false);
    }
  }, [hasRole, t]);

  React.useEffect(() => {
    void loadNotice();
  }, [loadNotice]);

  const handleAcknowledge = React.useCallback(async () => {
    setAcknowledging(true);
    try {
      await apiClient('/api/v1/privacy-notices/acknowledge', {
        method: 'POST',
      });
      toast.success(t('acknowledgeSuccess'));
      await loadNotice();
    } catch (err) {
      console.error('[PrivacyNoticePage.handleAcknowledge]', err);
      toast.error(t('acknowledgeError'));
    } finally {
      setAcknowledging(false);
    }
  }, [loadNotice, t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
      </div>
    );
  }

  if (!state?.current_version) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('privacyCurrentTitle')} description={t('privacyCurrentDescription')} />
        <div className="rounded-3xl border border-border bg-surface p-8 text-sm text-text-secondary">
          {t('privacyCurrentEmpty')}
        </div>
      </div>
    );
  }

  const html =
    locale === 'ar' && state.current_version.content_html_ar
      ? state.current_version.content_html_ar
      : state.current_version.content_html;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('privacyCurrentTitle')}
        description={t('privacyCurrentDescription')}
        actions={
          state.requires_acknowledgement ? (
            <Button onClick={handleAcknowledge} disabled={acknowledging}>
              {acknowledging ? t('acknowledging') : t('acknowledgeNow')}
            </Button>
          ) : undefined
        }
      />

      <section className="grid gap-4 lg:grid-cols-[1fr_0.7fr]">
        <div className="rounded-3xl border border-border bg-surface-secondary p-6">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={state.requires_acknowledgement ? 'warning' : 'success'} dot>
              {state.requires_acknowledgement
                ? t('privacyAcknowledgementRequired')
                : t('privacyAcknowledged')}
            </StatusBadge>
            <span className="text-sm text-text-secondary">
              {t('privacyVersionLabel', { version: state.current_version.version_number })}
            </span>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-surface p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary">
                {t('privacyEffectiveDate')}
              </dt>
              <dd className="mt-2 text-sm font-medium text-text-primary">
                {formatDate(state.current_version.effective_date)}
              </dd>
            </div>
            <div className="rounded-2xl bg-surface p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary">
                {t('privacyAcknowledgedAt')}
              </dt>
              <dd className="mt-2 text-sm font-medium text-text-primary">
                {state.acknowledged_at
                  ? formatDateTime(state.acknowledged_at)
                  : t('privacyNotAcknowledgedYet')}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-3xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold text-text-primary">{t('privacyRightsTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">{t('privacyRightsBody')}</p>
          <div className="mt-6">
            <Link
              href={`/${locale}/sub-processors`}
              className="text-sm font-medium text-primary-700 underline-offset-4 hover:underline"
            >
              {t('viewSubProcessors')}
            </Link>
          </div>
        </div>
      </section>

      <LegalDocument html={html} />
    </div>
  );
}
