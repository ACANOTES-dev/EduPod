'use client';

import { useTranslations } from 'next-intl';

import { Badge } from '@school/ui';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

export function SafeguardingSeverityBadge({ severity }: { severity: string }) {
  const t = useTranslations('safeguarding.severities');
  return (
    <Badge className={SEVERITY_COLORS[severity] ?? 'bg-gray-100 text-gray-800'}>
      {t(`${severity}` as Parameters<typeof t>[0])}
    </Badge>
  );
}
