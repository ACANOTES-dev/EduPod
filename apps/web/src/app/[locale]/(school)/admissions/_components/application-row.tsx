'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { formatDate } from '@/lib/format-date';

import type { QueueApplication } from './queue-types';

interface ApplicationRowProps {
  application: QueueApplication;
  actions: React.ReactNode;
}

function computeAge(dob: string | null): number | null {
  if (!dob) return null;
  const date = new Date(dob);
  if (isNaN(date.getTime())) return null;
  const diffMs = Date.now() - date.getTime();
  const years = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000));
  return years;
}

function relativeDays(iso: string | null, t: ReturnType<typeof useTranslations>): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
  if (days === 0) return t('relative.today');
  if (days === 1) return t('relative.oneDayAgo');
  return t('relative.daysAgo', { days });
}

export function ApplicationRow({ application, actions }: ApplicationRowProps) {
  const t = useTranslations('admissionsQueues');
  const age = computeAge(application.date_of_birth);
  const parent = application.submitted_by_parent;
  const parentName = [parent.first_name, parent.last_name].filter(Boolean).join(' ');
  const parentContact = parent.email ?? parent.phone ?? '—';

  return (
    <div className="grid gap-3 rounded-[16px] border border-border bg-surface p-4 md:grid-cols-[1.2fr_1.4fr_auto] md:items-center">
      <div className="min-w-0">
        <div className="font-mono text-xs text-text-secondary">
          {application.application_number}
        </div>
        <div className="truncate text-base font-semibold text-text-primary">
          {application.student_first_name} {application.student_last_name}
        </div>
        <div className="mt-0.5 text-xs text-text-secondary">
          {age !== null ? t('row.ageYears', { age }) : t('row.ageUnknown')}
          <span className="mx-1">·</span>
          {t('row.fifoPosition', { position: application.fifo_position })}
        </div>
      </div>
      <div className="min-w-0 text-sm">
        <div className="truncate text-text-primary">{parentName || '—'}</div>
        <div className="truncate text-xs text-text-secondary" dir="ltr">
          {parentContact}
        </div>
        <div className="mt-0.5 text-xs text-text-tertiary">
          {t('row.appliedOn', {
            date: formatDate(application.apply_date),
            relative: relativeDays(application.apply_date, t),
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
    </div>
  );
}
