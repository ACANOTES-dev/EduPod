'use client';

import { Home, LockKeyhole } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';

export function DisabledContent({
  title,
  body,
  returnHome,
}: {
  title: string;
  body: string;
  returnHome: string;
}) {
  const locale = useLocale();
  const params = useSearchParams();
  const router = useRouter();
  const moduleKey = params?.get('module') ?? 'unknown';

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-secondary text-text-secondary">
        <LockKeyhole className="h-5 w-5" aria-hidden="true" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold text-text-primary">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-text-secondary">
        {body.replace('{module}', moduleKey)}
      </p>
      <button
        type="button"
        onClick={() => router.push(`/${locale}/dashboard`)}
        className="mt-6 inline-flex h-10 items-center gap-2 rounded-md bg-primary-700 px-4 text-sm font-semibold text-btn-primary-text transition hover:bg-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        <Home className="h-4 w-4" aria-hidden="true" />
        {returnHome}
      </button>
    </div>
  );
}
