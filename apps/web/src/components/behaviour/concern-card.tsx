'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { SafeguardingSeverityBadge } from './safeguarding-severity-badge';
import { SafeguardingStatusBadge } from './safeguarding-status-badge';
import { SlaIndicator } from './sla-indicator';

import { formatDate } from '@/lib/format-date';

export interface ConcernCardData {
  id: string;
  concern_number: string;
  concern_type: string;
  severity: string;
  status: string;
  sla_status: string;
  reported_at: string;
  student_name: string;
  assigned_to_name: string | null;
}

interface ConcernCardProps {
  concern: ConcernCardData;
  onClick?: () => void;
}

export function ConcernCard({ concern, onClick }: ConcernCardProps) {
  const t = useTranslations('behaviour.components.concernCard');
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full gap-3 rounded-xl border border-border bg-surface p-4 text-start transition-colors hover:bg-surface-secondary"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-text-tertiary">{concern.concern_number}</span>
          <SafeguardingSeverityBadge severity={concern.severity} />
          <SafeguardingStatusBadge status={concern.status} />
          <SlaIndicator status={concern.sla_status} />
        </div>

        <p className="mt-1 truncate text-sm font-medium text-text-primary">
          {concern.student_name}
        </p>

        <p className="mt-0.5 text-xs text-text-secondary">{concern.concern_type}</p>

        <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-text-tertiary">
          <span>{formatDate(concern.reported_at)}</span>
          {concern.assigned_to_name && (
            <span>{t('assigned', { name: concern.assigned_to_name })}</span>
          )}
        </div>
      </div>
    </button>
  );
}
