'use client';

import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';

import { useAuth } from '@/providers/auth-provider';

export default function LogoutPage() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const { logout } = useAuth();

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await logout();
      } catch (err) {
        console.error('[LogoutPage]', err);
      }
      if (!cancelled) {
        router.replace(`/${locale}/login`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locale, logout, router]);

  return (
    <div className="flex h-[100dvh] w-full items-center justify-center text-sm text-text-secondary">
      Signing you out…
    </div>
  );
}
