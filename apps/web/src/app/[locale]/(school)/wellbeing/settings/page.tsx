'use client';

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

export default function WellbeingSettingsRedirectPage() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  React.useEffect(() => {
    // Wellbeing settings live under /settings/ (behaviour-general is the
    // canonical entry point for the hub's admin surface). Redirect so stale
    // bookmarks still land users on a usable page.
    router.replace(`/${locale}/settings/behaviour-general`);
  }, [router, locale]);

  return null;
}
