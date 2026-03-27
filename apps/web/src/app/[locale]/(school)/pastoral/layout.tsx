'use client';

import * as React from 'react';

import { PastoralWorkspaceNav } from '@/components/pastoral/workspace-nav';

export default function PastoralLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <PastoralWorkspaceNav />
      {children}
    </div>
  );
}
