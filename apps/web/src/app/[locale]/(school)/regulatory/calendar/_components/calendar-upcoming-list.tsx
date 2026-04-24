'use client';

import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { REGULATORY_DOMAINS } from '@school/shared/regulatory';
import { cn, StatusBadge } from '@school/ui';

import type { MonthViewEvent } from './calendar-month-view';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UpcomingListEvent extends MonthViewEvent {
  description?: string | null;
  academic_year?: string | null;
}

interface CalendarUpcomingListProps {
  events: UpcomingListEvent[];
  isLoading: boolean;
  onEventClick?: (event: UpcomingListEvent) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDomainLabel(domain: string): string {
  const entry = REGULATORY_DOMAINS[domain as keyof typeof REGULATORY_DOMAINS];
  return entry?.label ?? domain;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  reg_not_started: 'neutral',
  not_started: 'neutral',
  reg_in_progress: 'info',
  in_progress: 'info',
  ready_for_review: 'warning',
  reg_submitted: 'success',
  submitted: 'success',
  reg_accepted: 'success',
  accepted: 'success',
  reg_rejected: 'danger',
  rejected: 'danger',
  overdue: 'danger',
};

function normaliseStatus(status: string): string {
  return status.startsWith('reg_') ? status.slice(4) : status;
}

function statusKey(status: string): string {
  const n = normaliseStatus(status);
  const map: Record<string, string> = {
    not_started: 'notStarted',
    in_progress: 'inProgress',
    ready_for_review: 'readyForReview',
    submitted: 'submitted',
    accepted: 'accepted',
    rejected: 'rejected',
    overdue: 'overdue',
  };
  return map[n] ?? n;
}

function formatDate(value: string, locale: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale === 'ar' ? 'ar' : 'en-IE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function relativeDays(iso: string): number {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CalendarUpcomingList({
  events,
  isLoading,
  onEventClick,
}: CalendarUpcomingListProps) {
  const locale = useLocale();
  const t = useTranslations('regulatory.calendar');
  const statusT = useTranslations('regulatory.status');

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-2xl border border-border bg-surface-secondary"
          />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface-secondary p-8 text-center">
        <p className="text-sm text-text-secondary">{t('noEvents')}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface-primary">
      {events.map((ev) => {
        const days = relativeDays(ev.due_date);
        const relativeTone =
          days < 0 ? 'text-danger-600' : days <= 7 ? 'text-warning-700' : 'text-text-tertiary';
        return (
          <li key={ev.id}>
            <button
              type="button"
              onClick={() => onEventClick?.(ev)}
              className="flex w-full flex-wrap items-start gap-3 p-4 text-start transition-colors hover:bg-surface-hover focus:bg-surface-hover focus:outline-none"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-text-primary">{ev.title}</p>
                  <span className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                    {getDomainLabel(ev.domain)}
                  </span>
                </div>
                {ev.description && (
                  <p className="mt-0.5 line-clamp-1 text-sm text-text-secondary">
                    {ev.description}
                  </p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className="tabular-nums text-text-secondary">
                    {formatDate(ev.due_date, locale)}
                  </span>
                  <span className={cn('font-medium', relativeTone)}>
                    {days < 0
                      ? t('overdueBy', { count: Math.abs(days) })
                      : days === 0
                        ? t('dueToday')
                        : t('dueIn', { count: days })}
                  </span>
                </div>
              </div>
              <StatusBadge status={STATUS_VARIANT[ev.status] ?? 'neutral'} dot>
                {statusT(statusKey(ev.status) as never)}
              </StatusBadge>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
