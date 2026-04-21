'use client';

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

export default function BreakGlassGrantsRedirectPage() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  React.useEffect(() => {
    // Grants are surfaced on the break-glass landing page, not a dedicated
    // `/grants` route. Redirect so a stale bookmark still lands users on the
    // right screen.
    router.replace(`/${locale}/safeguarding/break-glass`);
  }, [router, locale]);

  return null;
}
