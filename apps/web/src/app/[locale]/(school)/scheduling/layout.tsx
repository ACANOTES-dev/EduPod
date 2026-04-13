'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

export default function SchedulingLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('scheduling');
  const pathname = usePathname();
  const segments = (pathname ?? '').split('/').filter(Boolean);
  const locale = segments[0] ?? 'en';

  // Root scheduling path (/en/scheduling) → hub renders its own layout
  const isHub = segments.length <= 2;

  if (isHub) {
    return <>{children}</>;
  }

  // Sub-pages get a back link to the hub
  return (
    <div>
      <Link
        href={`/${locale}/scheduling`}
        className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {t('hub.backToScheduling')}
      </Link>
      {children}
    </div>
  );
}
