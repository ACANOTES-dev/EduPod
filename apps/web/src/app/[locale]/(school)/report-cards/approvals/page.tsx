'use client';

// Phase 1a stopgap: this page called a ghost endpoint
// (/api/v1/report-card-approvals) that never existed. The real approval flow
// lives inside /report-cards/requests, so we redirect bookmarks there instead
// of rendering a broken empty-state + 404 in the console.
//
// This entire route is retired in Phase 2.

import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import * as React from 'react';

export default function ApprovalsRedirectPage() {
  const router = useRouter();
  const locale = useLocale();

  React.useEffect(() => {
    router.replace(`/${locale}/report-cards/requests`);
  }, [router, locale]);

  return null;
}
