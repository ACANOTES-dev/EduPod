'use client';

import { ArrowLeft } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

interface QueueHeaderProps {
  title: string;
  description?: string;
  count?: number;
  countLabel?: string;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
}

export function QueueHeader({
  title,
  description,
  count,
  countLabel,
  badges,
  actions,
}: QueueHeaderProps) {
  const t = useTranslations('admissionsQueues');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => router.push(`/${locale}/admissions`)}
            className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            {t('header.backToAdmissions')}
          </button>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">
            {title}
            {typeof count === 'number' && (
              <span className="ms-3 text-base font-normal text-text-secondary">
                ({count}
                {countLabel ? ` ${countLabel}` : ''})
              </span>
            )}
          </h1>
          {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {badges && <div className="flex flex-wrap gap-2">{badges}</div>}
    </div>
  );
}

export function QueueBackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const t = useTranslations('admissionsQueues');
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => router.push(`/${locale}/admissions`)}
    >
      <ArrowLeft className="me-1 h-4 w-4 rtl:rotate-180" />
      {t('header.backToAdmissions')}
    </Button>
  );
}
