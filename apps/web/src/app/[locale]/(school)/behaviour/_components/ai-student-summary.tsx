'use client';

import { AlertCircle, RotateCw, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { useAiFlag } from '@/hooks/use-ai-flag';
import { apiClient } from '@/lib/api-client';

import {
  PERIOD_PRESETS,
  type PeriodPreset,
  resolvePeriodRange,
} from './ai-student-summary-projection';

// ─── Types mirror AiStudentSummaryResult from @school/shared/behaviour ────────

interface AiStudentSummaryHighlight {
  kind: 'trend' | 'incident' | 'intervention' | 'recognition';
  title: string;
  detail: string;
}

interface AiStudentSummaryResult {
  student_id: string;
  summary_paragraph: string;
  highlights: AiStudentSummaryHighlight[];
  period: {
    from: string;
    to: string;
  };
  generated_at: string;
  cached: boolean;
}

interface AiStudentSummaryProps {
  studentId: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AiStudentSummary({ studentId }: AiStudentSummaryProps) {
  const t = useTranslations('aiFeatures.studentSummary');
  const flag = useAiFlag('behaviour');

  const [period, setPeriod] = React.useState<PeriodPreset>('90');
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<AiStudentSummaryResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const fetchSummary = React.useCallback(
    async (preset: PeriodPreset) => {
      setLoading(true);
      setError(null);
      const range = resolvePeriodRange(preset);
      const qs = new URLSearchParams({ from: range.from, to: range.to }).toString();
      try {
        const res = await apiClient<{ data: AiStudentSummaryResult }>(
          `/api/v1/behaviour/students/${studentId}/ai-summary?${qs}`,
          { silent: true },
        );
        setResult(res.data);
      } catch (err: unknown) {
        const obj = err as { error?: { message?: string; code?: string } };
        const code = obj?.error?.code;
        if (code === 'AI_SERVICE_UNAVAILABLE') {
          setError(t('errors.unavailable'));
        } else if (code === 'AI_DISABLED') {
          setError(t('errors.disabled'));
        } else {
          setError(obj?.error?.message ?? t('errors.generic'));
        }
      } finally {
        setLoading(false);
      }
    },
    [studentId, t],
  );

  // Fetch on first mount + when period changes (only once flag is confirmed not disabled)
  React.useEffect(() => {
    if (flag === 'disabled') return;
    void fetchSummary(period);
  }, [flag, period, fetchSummary]);

  if (flag === 'disabled') return null;

  return (
    <section
      aria-label={t('ariaLabel')}
      className="rounded-2xl border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-white p-5 shadow-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-fuchsia-600" aria-hidden="true" />
          <h2 className="text-base font-semibold text-text-primary">{t('title')}</h2>
          {result?.cached && (
            <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-xs text-fuchsia-800">
              {t('cached')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div
            role="radiogroup"
            aria-label={t('periodLabel')}
            className="inline-flex rounded-full border border-border bg-surface p-0.5 text-xs"
          >
            {PERIOD_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={period === p}
                onClick={() => setPeriod(p)}
                className={`rounded-full px-2.5 py-1 transition ${
                  period === p
                    ? 'bg-fuchsia-600 text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {t(`periods.${p}`)}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchSummary(period)}
            disabled={loading}
            aria-label={t('refresh')}
          >
            <RotateCw
              className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
          </Button>
        </div>
      </header>

      {loading && !result && (
        <div aria-live="polite" className="mt-4 space-y-2">
          <div className="h-4 w-3/4 animate-pulse rounded bg-fuchsia-100" />
          <div className="h-4 w-full animate-pulse rounded bg-fuchsia-100" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-fuchsia-100" />
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {result && !loading && (
        <div aria-live="polite" className="mt-4 space-y-3">
          <p className="text-sm leading-relaxed text-text-primary" dir="auto">
            {result.summary_paragraph}
          </p>
          {result.highlights.length > 0 && (
            <ul className="space-y-2">
              {result.highlights.map((h, idx) => (
                <li
                  key={`${h.kind}-${idx}`}
                  className="flex items-start gap-2 rounded-xl border border-border bg-surface p-3"
                >
                  <span
                    className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${highlightDot(h.kind)}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">{h.title}</p>
                    <p className="text-xs text-text-secondary">{h.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <footer className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-tertiary">
            <span>{t('generatedAt', { ts: new Date(result.generated_at).toLocaleString() })}</span>
            <span>{t('reviewNote')}</span>
          </footer>
        </div>
      )}
    </section>
  );
}

function highlightDot(kind: AiStudentSummaryHighlight['kind']): string {
  switch (kind) {
    case 'trend':
      return 'bg-amber-500';
    case 'incident':
      return 'bg-danger-500';
    case 'intervention':
      return 'bg-primary-500';
    case 'recognition':
      return 'bg-emerald-500';
  }
}
