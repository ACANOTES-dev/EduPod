'use client';

// Phase 1a replaced this page's ghost-endpoint content with a redirect to
// `/report-cards/requests`, and Phase 2 planned to delete the route entirely.
// Deleting the file causes `/report-cards/approvals` to fall through to the
// `[classId]` dynamic segment and render "Failed to load the matrix." Keep
// this thin redirect as a bookmark-safety net instead.

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

export default function RetiredApprovalsRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  React.useEffect(() => {
    router.replace(`/${locale}/report-cards/requests`);
  }, [router, locale]);

  return null;
}
