'use client';

import { Globe } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import * as React from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';

import { buildLocaleSwitchedPath } from '@/lib/locale-path';
import { useTenantSupportedLocales } from '@/lib/use-tenant-supported-locales';

export function LocalePicker({
  className,
  hideWhenSingle = true,
}: {
  className?: string;
  hideWhenSingle?: boolean;
}) {
  const currentLocale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { locales, loading } = useTenantSupportedLocales();

  const handleChange = React.useCallback(
    (nextLocale: string) => {
      router.push(buildLocaleSwitchedPath(pathname ?? '', nextLocale));
    },
    [pathname, router],
  );

  if (loading || (hideWhenSingle && locales.length <= 1)) {
    return null;
  }

  return (
    <Select value={currentLocale} onValueChange={handleChange}>
      <SelectTrigger aria-label="Language" className={className ?? 'w-full'}>
        <span className="flex min-w-0 items-center gap-2">
          <Globe className="h-4 w-4 shrink-0 text-text-secondary" />
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        {locales.map((entry) => (
          <SelectItem key={entry.code} value={entry.code}>
            <span className="flex items-center gap-2">
              <span className="text-xs uppercase text-text-tertiary">{entry.code}</span>
              <span>{entry.nativeName}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
