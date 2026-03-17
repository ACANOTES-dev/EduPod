'use client';

import * as React from 'react';

import { cn } from '../../lib/utils';

interface AppShellProps {
  sidebar: React.ReactNode;
  topBar: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function AppShell({ sidebar, topBar, children, className }: AppShellProps) {
  return (
    <div className={cn('flex h-screen bg-background', className)}>
      {sidebar}
      <div className="flex flex-1 flex-col overflow-hidden">
        {topBar}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-content">{children}</div>
        </main>
      </div>
    </div>
  );
}
