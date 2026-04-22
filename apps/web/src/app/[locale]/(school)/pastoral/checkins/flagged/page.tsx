'use client';

import { AlertCircle, ArrowRight, Check, Flag, Frown, Meh, Smile, ThumbsUp, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';
import {
  getLocaleFromPathname,
  type PastoralApiListResponse,
  type PastoralMonitoringCheckinRecord,
} from '@/lib/pastoral';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function moodIcon(score: number) {
  if (score <= 2) return Frown;
  if (score === 3) return Meh;
  if (score === 4) return Smile;
  return ThumbsUp;
}

function moodTone(score: number): string {
  if (score <= 2) return 'text-rose-700 bg-rose-50 border-rose-200';
  if (score === 3) return 'text-amber-700 bg-amber-50 border-amber-200';
  if (score === 4) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  return 'text-teal-700 bg-teal-50 border-teal-200';
}

// Severity order: lowest mood first (most urgent), then flagged_keyword, then free-text
function severityRank(record: PastoralMonitoringCheckinRecord): number {
  const mood = record.mood_score ?? 5;
  // Lower mood → higher urgency (smaller number = more urgent)
  return mood * 10;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CheckinFlaggedQueuePage() {
  const t = useTranslations('checkinFlagged');
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);

  const [records, setRecords] = React.useState<PastoralMonitoringCheckinRecord[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [escalateTarget, setEscalateTarget] =
    React.useState<PastoralMonitoringCheckinRecord | null>(null);
  const [dismissTarget, setDismissTarget] = React.useState<PastoralMonitoringCheckinRecord | null>(
    null,
  );
  const [escalateNotes, setEscalateNotes] = React.useState('');
  const [dismissReason, setDismissReason] = React.useState('');
  const [acting, setActing] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await apiClient<PastoralApiListResponse<PastoralMonitoringCheckinRecord>>(
        '/api/v1/pastoral/checkins/flagged?page=1&pageSize=50',
        { silent: true },
      );
      const sorted = [...(response.data ?? [])].sort((a, b) => {
        const byRank = severityRank(a) - severityRank(b);
        if (byRank !== 0) return byRank;
        return b.checkin_date.localeCompare(a.checkin_date);
      });
      setRecords(sorted);
    } catch (err: unknown) {
      console.error('[CheckinFlaggedQueuePage]', err);
      setRecords([]);
      const apiError = err as { error?: { message?: string }; message?: string };
      setLoadError(apiError.error?.message ?? apiError.message ?? t('errors.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleEscalate = React.useCallback(async () => {
    if (!escalateTarget) return;
    setActing(true);
    setActionError(null);
    try {
      await apiClient(`/api/v1/pastoral/checkins/${escalateTarget.id}/escalate`, {
        method: 'POST',
        body: JSON.stringify({ notes: escalateNotes.trim() || undefined }),
        silent: true,
      });
      setEscalateTarget(null);
      setEscalateNotes('');
      await refresh();
    } catch (err: unknown) {
      const apiError = err as { error?: { message?: string }; message?: string };
      setActionError(apiError.error?.message ?? apiError.message ?? t('errors.escalateFailed'));
    } finally {
      setActing(false);
    }
  }, [escalateNotes, escalateTarget, refresh, t]);

  const handleDismiss = React.useCallback(async () => {
    if (!dismissTarget) return;
    if (!dismissReason.trim()) {
      setActionError(t('errors.dismissReasonRequired'));
      return;
    }
    setActing(true);
    setActionError(null);
    try {
      await apiClient(`/api/v1/pastoral/checkins/${dismissTarget.id}/dismiss`, {
        method: 'POST',
        body: JSON.stringify({ reason: dismissReason.trim() }),
        silent: true,
      });
      setDismissTarget(null);
      setDismissReason('');
      await refresh();
    } catch (err: unknown) {
      const apiError = err as { error?: { message?: string }; message?: string };
      setActionError(apiError.error?.message ?? apiError.message ?? t('errors.dismissFailed'));
    } finally {
      setActing(false);
    }
  }, [dismissReason, dismissTarget, refresh, t]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: `/${locale}/pastoral/checkins`, label: 'Back' }}
        actions={
          <Link href={`/${locale}/pastoral/checkins`}>
            <Button variant="outline">{t('viewAllCheckins')}</Button>
          </Link>
        }
      />

      {loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{loadError}</p>
          </div>
        </div>
      ) : null}

      <section className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Flag className="h-5 w-5 text-rose-700" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-semibold text-text-primary">{t('queueTitle')}</h2>
              <p className="text-sm text-text-secondary">{t('queueDescription')}</p>
            </div>
          </div>
          <span className="text-sm text-text-tertiary">
            {t('countLabel', { count: records.length })}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-2xl bg-surface-secondary" />
            ))
          ) : records.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-text-tertiary">
              {t('empty')}
            </p>
          ) : (
            records.map((record) => {
              const MoodIcon = moodIcon(record.mood_score);
              const tone = moodTone(record.mood_score);

              return (
                <div
                  key={record.id}
                  className="rounded-2xl border border-border bg-surface-secondary/30 px-4 py-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}
                        >
                          <MoodIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          {t('moodScore', { score: record.mood_score })}
                        </span>
                        {record.flag_reason ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">
                            <Flag className="h-3 w-3" aria-hidden="true" />
                            {t(`flagReason.${record.flag_reason}` as never)}
                          </span>
                        ) : null}
                        {record.auto_concern_id ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
                            {t('hasAutoConcern')}
                          </span>
                        ) : null}
                      </div>

                      <p className="text-sm font-medium text-text-primary">
                        {record.student_name ?? t('unknownStudent')}
                      </p>
                      <p className="text-xs text-text-tertiary">
                        {formatDate(record.checkin_date)}
                      </p>

                      {record.freeform_text ? (
                        <p className="mt-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-secondary">
                          “{record.freeform_text}”
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Link
                        href={`/${locale}/pastoral/checkins?studentId=${record.student_id}`}
                        className="text-xs text-text-tertiary underline-offset-4 hover:underline"
                      >
                        {t('viewHistory')}
                        <ArrowRight className="ms-1 inline h-3 w-3 rtl:rotate-180" />
                      </Link>
                      <Button
                        size="sm"
                        onClick={() => {
                          setActionError(null);
                          setEscalateNotes('');
                          setEscalateTarget(record);
                        }}
                      >
                        <Check className="me-1 h-4 w-4" aria-hidden="true" />
                        {t('escalate')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setActionError(null);
                          setDismissReason('');
                          setDismissTarget(record);
                        }}
                      >
                        <X className="me-1 h-4 w-4" aria-hidden="true" />
                        {t('dismiss')}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Escalate dialog */}
      <Dialog
        open={!!escalateTarget}
        onOpenChange={(open) => {
          if (!open && !acting) {
            setEscalateTarget(null);
            setEscalateNotes('');
            setActionError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('escalateDialog.title')}</DialogTitle>
            <DialogDescription>
              {escalateTarget?.auto_concern_id
                ? t('escalateDialog.hasAutoConcern')
                : t('escalateDialog.willCreateConcern')}
            </DialogDescription>
          </DialogHeader>

          {escalateTarget ? (
            <div className="space-y-3 text-sm">
              <p className="text-text-secondary">
                {t('escalateDialog.summary', {
                  student: escalateTarget.student_name ?? t('unknownStudent'),
                  date: formatDate(escalateTarget.checkin_date),
                })}
              </p>
              <div className="space-y-2">
                <Label htmlFor="escalate-notes">{t('escalateDialog.notesLabel')}</Label>
                <Textarea
                  id="escalate-notes"
                  rows={3}
                  value={escalateNotes}
                  onChange={(event) => setEscalateNotes(event.target.value)}
                  placeholder={t('escalateDialog.notesPlaceholder')}
                  disabled={acting}
                />
              </div>
              {actionError ? <p className="text-sm text-rose-700">{actionError}</p> : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              disabled={acting}
              onClick={() => {
                setEscalateTarget(null);
                setEscalateNotes('');
                setActionError(null);
              }}
            >
              {t('cancel')}
            </Button>
            <Button disabled={acting} onClick={() => void handleEscalate()}>
              {acting ? t('escalating') : t('confirmEscalate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dismiss dialog */}
      <Dialog
        open={!!dismissTarget}
        onOpenChange={(open) => {
          if (!open && !acting) {
            setDismissTarget(null);
            setDismissReason('');
            setActionError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dismissDialog.title')}</DialogTitle>
            <DialogDescription>{t('dismissDialog.description')}</DialogDescription>
          </DialogHeader>

          {dismissTarget ? (
            <div className="space-y-3 text-sm">
              <p className="text-text-secondary">
                {t('dismissDialog.summary', {
                  student: dismissTarget.student_name ?? t('unknownStudent'),
                  date: formatDate(dismissTarget.checkin_date),
                })}
              </p>
              <div className="space-y-2">
                <Label htmlFor="dismiss-reason">
                  {t('dismissDialog.reasonLabel')}
                  <span className="ms-1 text-rose-700">*</span>
                </Label>
                <Textarea
                  id="dismiss-reason"
                  rows={3}
                  value={dismissReason}
                  onChange={(event) => setDismissReason(event.target.value)}
                  placeholder={t('dismissDialog.reasonPlaceholder')}
                  disabled={acting}
                />
              </div>
              {actionError ? <p className="text-sm text-rose-700">{actionError}</p> : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              disabled={acting}
              onClick={() => {
                setDismissTarget(null);
                setDismissReason('');
                setActionError(null);
              }}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="default"
              disabled={acting || !dismissReason.trim()}
              onClick={() => void handleDismiss()}
            >
              {acting ? t('dismissing') : t('confirmDismiss')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
