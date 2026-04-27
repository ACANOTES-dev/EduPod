'use client';

import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function NoPermissionState({ locale }: { locale: string }) {
  const t = useTranslations('settings.communications.noPermission');
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 rounded-full bg-warning-100 p-4 text-warning-700">
        <ShieldAlert className="h-8 w-8" />
      </div>
      <h2 className="text-lg font-semibold text-text-primary">{t('title')}</h2>
      <p className="mt-2 text-sm text-text-secondary">{t('description')}</p>
      <Link
        href={`/${locale}/settings`}
        className="mt-6 text-sm font-medium text-primary hover:underline"
      >
        {t('backToSettings')}
      </Link>
    </div>
  );
}
