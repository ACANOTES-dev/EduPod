'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import type { PrivacyNoticeCurrent } from '@school/shared/gdpr';
import { Button, toast } from '@school/ui';

import { useApiQuery } from '@/hooks/use-api-query';
import { apiClient } from '@/lib/api-client';
import { handleApiError } from '@/lib/handle-api-error';

export function PrivacyNoticeBanner() {
  const t = useTranslations('legal');
  const locale = useLocale();
  const pathname = usePathname();
  const [acknowledging, setAcknowledging] = React.useState(false);
  const {
    data: state,
    isLoading: loading,
    setData: setState,
  } = useApiQuery<PrivacyNoticeCurrent>('/api/v1/privacy-notices/current', {
    fallbackMessage: t('acknowledgeError'),
    onError: (error) => {
      console.error('[PrivacyNoticeBanner.loadCurrent]', error);
    },
  });

  const handleAcknowledge = React.useCallback(async () => {
    setAcknowledging(true);
    try {
      await apiClient('/api/v1/privacy-notices/acknowledge', {
        method: 'POST',
      });
      setState((current) =>
        current
          ? {
              ...current,
              acknowledged: true,
              requires_acknowledgement: false,
              acknowledged_at: new Date().toISOString(),
            }
          : current,
      );
      toast.success(t('acknowledgeSuccess'));
    } catch (err) {
      const normalizedError = handleApiError(err, {
        fallbackMessage: t('acknowledgeError'),
      });
      console.error('[PrivacyNoticeBanner.handleAcknowledge]', normalizedError);
      toast.error(normalizedError.message);
    } finally {
      setAcknowledging(false);
    }
  }, [setState, t]);

  if (
    loading ||
    !state?.current_version ||
    !state.requires_acknowledgement ||
    pathname?.includes('/privacy-notice')
  ) {
    return null;
  }

  return (
    <section className="mb-6 rounded-3xl border border-warning-200 bg-warning-50 px-5 py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warning-700">
            {t('acknowledgementEyebrow')}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-warning-900">
            {t('acknowledgementTitle', {
              version: state.current_version.version_number,
            })}
          </h2>
          <p className="mt-1 text-sm text-warning-800">{t('acknowledgementDescription')}</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline">
            <Link href={`/${locale}/privacy-notice`}>{t('reviewNotice')}</Link>
          </Button>
          <Button onClick={handleAcknowledge} disabled={acknowledging}>
            {acknowledging ? t('acknowledging') : t('acknowledgeNow')}
          </Button>
        </div>
      </div>
    </section>
  );
}
