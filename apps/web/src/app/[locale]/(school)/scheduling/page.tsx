'use client';

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

export default function SchedulingIndexPage() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = pathname.split('/').filter(Boolean)[0] ?? 'en';

  React.useEffect(() => {
    router.replace(`/${locale}/scheduling/dashboard`);
  }, [router, locale]);

  return null;
}
