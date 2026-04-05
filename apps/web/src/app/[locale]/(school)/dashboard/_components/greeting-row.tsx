'use client';
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
    day: 'numeric'
  }).format(new Date());

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-[24px] font-bold text-text-primary">
          {greeting}
        </h1>
        <p className="mt-1 text-[12px] text-text-tertiary">
          {dateStr} • {schoolName}
        </p>
      </div>
          <div className="flex items-center gap-2 rounded-pill bg-surface-secondary px-3 py-1.5 border border-border">
            <span className="pulse-dot" />
            <span className="text-[12px] font-medium text-text-tertiary">System Operational</span>
          </div>
    </div>
  );
}
