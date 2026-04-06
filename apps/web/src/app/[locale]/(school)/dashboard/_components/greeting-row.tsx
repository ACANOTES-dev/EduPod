'use client';

import { MessageCircleWarning } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/providers/auth-provider';

export function GreetingRow({ schoolName }: { schoolName: string }) {
  const { user } = useAuth();
  const t = useTranslations('dashboard');

  const hour = new Date().getHours();
  let greeting = t('goodMorning', { name: user?.first_name || 'Admin' });
  if (hour >= 12 && hour < 17) greeting = t('goodAfternoon', { name: user?.first_name || 'Admin' });
  if (hour >= 17) greeting = t('goodEvening', { name: user?.first_name || 'Admin' });

  const dateStr = new Intl.DateTimeFormat('en-IE', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  const mailtoHref = `mailto:support@edupod.app?subject=${encodeURIComponent(`Issue Report — ${schoolName}`)}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-[24px] font-bold text-text-primary">{greeting}</h1>
        <p className="mt-1 text-[12px] text-text-tertiary">
          {dateStr} • {schoolName}
        </p>
      </div>
      <a
        href={mailtoHref}
        className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface-secondary px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
      >
        <MessageCircleWarning className="h-3.5 w-3.5" />
        {t('reportIssue')}
      </a>
    </div>
  );
}
