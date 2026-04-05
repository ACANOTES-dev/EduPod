'use client';

import * as React from 'react';

import { cn } from '../../lib/utils';

interface AppShellProps {
  morphBar?: React.ReactNode;
  subStrip?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function AppShell({ morphBar, subStrip, children, className }: AppShellProps) {
  return (
    <div className={cn('flex flex-col h-screen bg-background', className)}>
      {morphBar}
      {subStrip}
      <main className="flex-1 overflow-y-auto w-full relative p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-content h-full">
          {children}
        </div>
      </main>
    </div>
  );
}
