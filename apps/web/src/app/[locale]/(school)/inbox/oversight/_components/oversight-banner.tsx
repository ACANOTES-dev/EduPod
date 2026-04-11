'use client';

import { ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

// Persistent reminder that oversight is audit-logged. Required on every
// oversight surface so admins are visually reminded of the audit trail.
export function OversightBanner() {
  const t = useTranslations('inbox.oversight');
  return (
    <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
      <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0" />
      <div>
        <p className="font-medium">{t('banner')}</p>
        <p className="mt-1 text-xs opacity-80">{t('bannerDetail')}</p>
      </div>
    </div>
  );
}
