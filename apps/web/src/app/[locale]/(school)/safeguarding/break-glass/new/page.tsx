'use client';

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

export default function BreakGlassNewRedirectPage() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  React.useEffect(() => {
    // Break-glass grants are requested via the dialog on the list page, not a
    // standalone create route. Redirect back so the user can trigger it from
    // the toolbar.
    router.replace(`/${locale}/safeguarding/break-glass`);
  }, [router, locale]);

  return null;
}
