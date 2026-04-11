'use client';

import { Mail } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { useInboxPolling } from '@/app/[locale]/(school)/_providers/inbox-polling-provider';

export function InboxBadge() {
  const router = useRouter();
  const params = useParams();
  const t = useTranslations();
  const state = useInboxPolling();
  const unread = state?.unread_total ?? 0;
  const locale = (params?.locale as string) ?? 'en';

  const badgeLabel = unread === 0 ? '' : unread > 99 ? '99+' : String(unread);
  const ariaLabel =
    unread === 0
      ? t('inbox.unread.badge_aria_zero')
      : t('inbox.unread.badge_aria', { count: unread });

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => router.push(`/${locale}/inbox`)}
      className="group relative rounded-pill p-1.5 text-[var(--color-bar-text)] transition-colors hover:bg-black/5 hover:text-[var(--color-text-primary)]"
    >
      <Mail className="h-5 w-5 group-hover:animate-[bounce_300ms_ease-in-out_1]" />
      {unread > 0 && (
        <span className="absolute top-0 end-0 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-emerald-700 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-[var(--color-bar-bg)]">
          {badgeLabel}
        </span>
      )}
    </button>
  );
}
