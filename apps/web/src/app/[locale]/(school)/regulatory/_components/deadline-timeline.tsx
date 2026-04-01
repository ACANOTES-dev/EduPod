'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { REGULATORY_DOMAINS } from '@school/shared';
import { Badge, cn } from '@school/ui';

import { formatDate } from '@/lib/format-date';

// ─── Types ───────────────────────────────────────────────────────────────────

interface OverdueItem {
  id: string;
  type: string;
  title: string;
  domain: string;
  due_date: string;
  days_overdue: number;
}

interface DeadlineTimelineProps {
  items: OverdueItem[];
  emptyMessage: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDomainLabel(domain: string): string {
  const entry = REGULATORY_DOMAINS[domain as keyof typeof REGULATORY_DOMAINS];
  return entry?.label ?? domain;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DeadlineTimeline({ items, emptyMessage }: DeadlineTimelineProps) {
  const t = useTranslations('regulatory');

  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-surface-secondary p-6 text-center">
        <p className="text-sm text-text-tertiary">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="max-h-96 overflow-y-auto rounded-2xl bg-surface-secondary p-5">
      <ul className="space-y-0">
        {items.map((item, index) => (
          <li key={item.id} className="relative flex gap-3">
            {/* Timeline line + dot — using logical border-s for RTL */}
            <div className="flex flex-col items-center">
              <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-danger-text" />
              {index < items.length - 1 && <div className="w-px flex-1 bg-border" />}
            </div>

            {/* Content */}
            <div className={cn('flex-1 pb-4', index === items.length - 1 && 'pb-0')}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary">{item.title}</p>
                  <p className="mt-0.5 text-xs text-text-tertiary">{getDomainLabel(item.domain)}</p>
                </div>

                <Badge variant="danger" className="shrink-0">
                  {t('dashboard.daysOverdue', { count: item.days_overdue })}
                </Badge>
              </div>

              <p className="mt-1 text-xs text-text-tertiary">
                {t('dashboard.dueDate')}: {formatDate(item.due_date)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
