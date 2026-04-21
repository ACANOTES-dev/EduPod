'use client';

/* eslint-disable school/no-hand-rolled-forms -- two-field form (mood scale + optional note); react-hook-form overhead exceeds the benefit */

import { CheckCircle2, Heart, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Label, Textarea } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CheckinRow {
  id: string;
  checkin_date: string;
  mood_score: number;
  freeform_text: string | null;
  was_flagged?: boolean;
}

interface CheckinStatus {
  submitted_today: boolean;
  last_checkin_date: string | null;
}

const MOOD_EMOJI: Record<number, string> = {
  1: '😢',
  2: '😕',
  3: '😐',
  4: '🙂',
  5: '😄',
};

const MOOD_LABELS_KEY: Record<number, string> = {
  1: 'mood1',
  2: 'mood2',
  3: 'mood3',
  4: 'mood4',
  5: 'mood5',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudentCheckInPage() {
  const t = useTranslations('studentCheckin');
  const locale = useLocale();

  const [mood, setMood] = React.useState<number | null>(null);
  const [note, setNote] = React.useState('');
  const [status, setStatus] = React.useState<CheckinStatus | null>(null);
  const [recent, setRecent] = React.useState<CheckinRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState('');
  const [submittedJustNow, setSubmittedJustNow] = React.useState(false);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, historyRes] = await Promise.all([
        apiClient<{ submitted_today: boolean; last_checkin_date: string | null }>(
          '/api/v1/pastoral/checkins/status',
          { silent: true },
        ).catch(() => null),
        apiClient<{ data: CheckinRow[] }>('/api/v1/pastoral/checkins/my?page=1&pageSize=7', {
          silent: true,
        }).catch(() => ({ data: [] as CheckinRow[] })),
      ]);
      setStatus(statusRes ?? { submitted_today: false, last_checkin_date: null });
      setRecent(historyRes.data ?? []);
    } catch (err) {
      console.error('[StudentCheckInPage]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSubmit = async () => {
    if (mood === null) {
      setSubmitError(t('errorMoodRequired'));
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      await apiClient('/api/v1/pastoral/checkins', {
        method: 'POST',
        body: JSON.stringify({
          mood_score: mood,
          freeform_text: note.trim() || undefined,
        }),
      });
      setSubmittedJustNow(true);
      setNote('');
      setMood(null);
      void loadData();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string; code?: string } };
      if (ex.error?.code === 'CHECKIN_ALREADY_SUBMITTED') {
        setSubmitError(t('errorAlreadySubmitted'));
      } else {
        setSubmitError(ex.error?.message ?? t('errorGeneric'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary-500" />
      </div>
    );
  }

  const alreadyDoneToday = status?.submitted_today ?? false;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <PageHeader title={t('title')} description={t('description')} />

      {/* Success banner */}
      {submittedJustNow && (
        <div
          className="flex items-start gap-3 rounded-xl border border-success-200 bg-success-50 p-4"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-success-700" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-text-primary">{t('thankYou')}</p>
            <p className="mt-0.5 text-xs text-text-secondary">{t('thankYouBody')}</p>
          </div>
        </div>
      )}

      {/* Check-in form — hidden when already submitted today */}
      {alreadyDoneToday && !submittedJustNow ? (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          <Heart className="mx-auto h-8 w-8 text-primary-500" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-text-primary">{t('alreadyDoneTitle')}</p>
          <p className="mt-1 text-xs text-text-secondary">{t('alreadyDoneBody')}</p>
        </div>
      ) : (
        <div className="space-y-5 rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <div>
            <Label>{t('howAreYouLabel')}</Label>
            <div
              role="radiogroup"
              aria-label={t('howAreYouLabel')}
              className="mt-3 grid grid-cols-5 gap-2"
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mood === value}
                  onClick={() => setMood(value)}
                  className={`flex min-h-11 flex-col items-center gap-1 rounded-xl border p-3 transition-all ${
                    mood === value
                      ? 'border-primary-500 bg-primary-50 shadow-sm ring-2 ring-primary-500/20'
                      : 'border-border bg-surface-secondary hover:border-primary-300'
                  }`}
                >
                  <span className="text-2xl" aria-hidden="true">
                    {MOOD_EMOJI[value]}
                  </span>
                  <span className="text-[10px] font-medium text-text-secondary">
                    {t(MOOD_LABELS_KEY[value] as never)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="checkin-note">{t('noteLabel')}</Label>
            <Textarea
              id="checkin-note"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              placeholder={t('notePlaceholder')}
              className="min-h-[88px] text-base"
              maxLength={500}
            />
            <p className="text-end text-xs text-text-tertiary">{note.length}/500</p>
          </div>

          {submitError && (
            <p className="text-sm text-danger-text" role="alert">
              {submitError}
            </p>
          )}

          <Button onClick={handleSubmit} disabled={submitting || mood === null} className="w-full">
            {submitting ? t('submitting') : t('submit')}
          </Button>
        </div>
      )}

      {/* Recent check-ins (last 7 days) */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">{t('recentTitle')}</h2>
        {recent.length === 0 ? (
          <p className="text-xs text-text-tertiary">{t('recentEmpty')}</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((row) => (
              <li
                key={row.id}
                className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3"
              >
                <span className="text-xl" aria-hidden="true">
                  {MOOD_EMOJI[row.mood_score] ?? '•'}
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-xs text-text-tertiary">
                    {new Date(row.checkin_date).toLocaleDateString(
                      locale === 'ar' ? 'ar-u-ca-gregory-nu-latn' : 'en-GB',
                      { weekday: 'short', day: 'numeric', month: 'short' },
                    )}
                  </p>
                  {row.freeform_text && (
                    <p className="text-sm text-text-primary">{row.freeform_text}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
