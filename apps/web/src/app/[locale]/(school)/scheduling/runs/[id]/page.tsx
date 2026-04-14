'use client';

import { useParams, usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

export default function RunDetailRedirect() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  React.useEffect(() => {
    if (!id) return;
    router.replace(`/${locale}/scheduling/runs/${id}/review`);
  }, [id, locale, router]);

  return null;
}
