import * as React from 'react';

// Legacy vertical sidebar removed — payroll now uses the morphing shell
// pattern. Navigation between sub-pages is via back buttons (PageHeader) and
// hub-card tiles on the /payroll landing page.
export default function PayrollLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
