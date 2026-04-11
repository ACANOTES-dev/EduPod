'use client';

import { usePathname } from 'next/navigation';
import * as React from 'react';

import { cn } from '@school/ui';

import { InboxSidebar } from './_components/inbox-sidebar';

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const segments = pathname.split('/').filter(Boolean);
  const afterLocale = segments.slice(1).join('/');
  const onThreadRoute =
    afterLocale.startsWith('inbox/threads/') || afterLocale.startsWith('inbox/search');

  return (
    <div className="flex h-[calc(100dvh-56px)] w-full min-w-0 flex-row overflow-hidden bg-[var(--color-background)]">
      <aside
        className={cn(
          'flex w-full flex-col border-e border-[var(--color-border)] bg-[var(--color-surface)] md:w-[360px] md:shrink-0',
          onThreadRoute && 'hidden md:flex',
        )}
      >
        <InboxSidebar />
      </aside>
      <main
        className={cn(
          'flex min-w-0 flex-1 flex-col overflow-hidden',
          !onThreadRoute && 'hidden md:flex',
        )}
      >
        {children}
      </main>
    </div>
  );
}
