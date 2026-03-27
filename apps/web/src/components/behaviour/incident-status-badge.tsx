'use client';

import { Badge } from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

const STATUS_STYLE: Record<string, { variant: 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info'; className: string }> = {
  draft: { variant: 'secondary', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  active: { variant: 'default', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  investigating: { variant: 'default', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  under_review: { variant: 'default', className: 'bg-purple-100 text-purple-700 border-purple-200' },
  awaiting_approval: { variant: 'default', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  awaiting_parent_meeting: { variant: 'default', className: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  escalated: { variant: 'danger', className: 'bg-red-100 text-red-700 border-red-200' },
  resolved: { variant: 'default', className: 'bg-green-100 text-green-700 border-green-200' },
  withdrawn: { variant: 'secondary', className: 'bg-gray-100 text-gray-500 border-gray-200' },
  closed_after_appeal: { variant: 'default', className: 'bg-teal-100 text-teal-700 border-teal-200' },
  superseded: { variant: 'secondary', className: 'bg-gray-100 text-gray-500 border-gray-200' },
  converted_to_safeguarding: { variant: 'danger', className: 'bg-red-100 text-red-800 border-red-300' },
};

interface IncidentStatusBadgeProps {
  status: string;
}

export function IncidentStatusBadge({ status }: IncidentStatusBadgeProps) {
  const t = useTranslations('behaviour.incidents');
  const style = STATUS_STYLE[status] ?? { variant: 'secondary' as const, className: '' };
  return (
    <Badge variant={style.variant} className={style.className}>
      {t(`statuses.${status}` as Parameters<typeof t>[0])}
    </Badge>
  );
}
