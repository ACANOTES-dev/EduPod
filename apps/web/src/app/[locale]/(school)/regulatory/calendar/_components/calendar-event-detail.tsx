'use client';

import { CheckCircle2, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { REGULATORY_DOMAINS } from '@school/shared/regulatory';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  StatusBadge,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

import type { UpcomingListEvent } from './calendar-upcoming-list';

interface CalendarEventDetailProps {
  event: UpcomingListEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
  canManage: boolean;
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
    month: 'long',
    day: 'numeric',
  });
}

export function CalendarEventDetail({
  event,
  open,
  onOpenChange,
  onUpdated,
  canManage,
}: CalendarEventDetailProps) {
  const locale = useLocale();
  const t = useTranslations('regulatory.calendar');
  const statusT = useTranslations('regulatory.status');
  const [isSaving, setIsSaving] = React.useState(false);

  if (!event) return null;

  async function markComplete() {
    if (!event) return;
    setIsSaving(true);
    try {
      await apiClient(`/api/v1/regulatory/calendar/${event.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'submitted' }),
      });
      toast.success(t('markedComplete'));
      onUpdated();
      onOpenChange(false);
    } catch (err) {
      const msg = (err as { error?: { message?: string }; message?: string })?.error?.message;
      toast.error(msg ?? (err as { message?: string })?.message ?? t('updateError'));
    } finally {
      setIsSaving(false);
    }
  }

  const domainLabel =
    REGULATORY_DOMAINS[event.domain as keyof typeof REGULATORY_DOMAINS]?.label ?? event.domain;
  const isComplete =
    event.status === 'submitted' ||
    event.status === 'reg_submitted' ||
    event.status === 'accepted' ||
    event.status === 'reg_accepted';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{event.title}</DialogTitle>
          <DialogDescription>{domainLabel}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={STATUS_VARIANT[event.status] ?? 'neutral'} dot>
              {statusT(statusKey(event.status) as never)}
            </StatusBadge>
            <span className="text-sm tabular-nums text-text-secondary">
              {formatDate(event.due_date, locale)}
            </span>
          </div>

          {event.description && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                {t('eventDescription')}
              </p>
              <p className="mt-1 text-sm text-text-secondary">{event.description}</p>
            </div>
          )}

          {event.academic_year && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                {t('academicYear')}
              </p>
              <p className="mt-1 text-sm text-text-secondary">{event.academic_year}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('close')}
          </Button>
          {canManage && !isComplete && (
            <Button
              onClick={markComplete}
              disabled={isSaving}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
              {isSaving ? (
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="me-2 h-4 w-4" aria-hidden="true" />
              )}
              {t('markComplete')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
