'use client';

// Phase 2 retired the `/report-cards/bulk` route (it duplicated the wizard at
// `/report-cards/generate` and was never linked from the sub-strip). This
// stub exists only so old bookmarks don't fall through to the `[classId]`
// dynamic segment and render "Failed to load the matrix." It performs a
// client-side redirect to the consolidated dashboard where the Generate
// tile launches the wizard.

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

export default function RetiredBulkRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  React.useEffect(() => {
    router.replace(`/${locale}/report-cards`);
  }, [router, locale]);

  return null;
}
