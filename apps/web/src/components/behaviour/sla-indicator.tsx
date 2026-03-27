'use client';

import { Badge } from '@school/ui';
import { useTranslations } from 'next-intl';

const SLA_STYLE: Record<string, string> = {
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  due_soon: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  on_track: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

interface SlaIndicatorProps {
  status: string;
}

export function SlaIndicator({ status }: SlaIndicatorProps) {
  const t = useTranslations('behaviour.components.sla');
  return (
    <Badge className={SLA_STYLE[status] ?? 'bg-gray-100 text-gray-800'}>
      {t(`statuses.${status}` as Parameters<typeof t>[0])}
    </Badge>
  );
}
