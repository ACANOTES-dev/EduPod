'use client';

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

export default function ExclusionsNewRedirectPage() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  React.useEffect(() => {
    // Exclusion cases are opened via the "Open case" dialog on the list page,
    // not a standalone create route. Redirect back so the user can trigger the
    // dialog from the list toolbar.
    router.replace(`/${locale}/behaviour/exclusions`);
  }, [router, locale]);

  return null;
}
