import * as React from 'react';

import { RequireAuth } from '@/providers/auth-provider';

/**
 * Print layout — minimal, skips the morph shell.
 * Used for print-friendly timetable views opened in a new tab.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <div className="min-h-screen bg-white text-black print:bg-white">{children}</div>
    </RequireAuth>
  );
}
