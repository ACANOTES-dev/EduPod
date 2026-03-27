'use client';

import { Badge } from '@school/ui';
import { useTranslations } from 'next-intl';

const STATUS_COLORS: Record<string, string> = {
  reported: 'bg-blue-100 text-blue-800',
  acknowledged: 'bg-indigo-100 text-indigo-800',
  under_investigation: 'bg-purple-100 text-purple-800',
  referred: 'bg-amber-100 text-amber-800',
  monitoring: 'bg-teal-100 text-teal-800',
  resolved: 'bg-green-100 text-green-800',
  sealed: 'bg-gray-100 text-gray-800 border border-gray-300',
};

export function SafeguardingStatusBadge({ status }: { status: string }) {
  const t = useTranslations('safeguarding.statuses');
  return (
    <Badge className={STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-800'}>
      {t(`${status}` as Parameters<typeof t>[0])}
    </Badge>
  );
}
