'use client';

import {
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Loader2,
  MessageSquare,
  RotateCw,
  Send,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Textarea } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { useAiFlag } from '@/hooks/use-ai-flag';
import { apiClient } from '@/lib/api-client';

import { extractCitations, type Citation } from './_components/citation-helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AIQueryResult {
  result: string;
  data_as_of: string;
  ai_generated: true;
  scope_applied: string;
  confidence: number | null;
  structured_data?: Record<string, unknown>;
}

interface QueryHistoryEntry {
  id: string;
  query: string;
  result_summary: string;
  answer?: string | null;
  data_payload?: Record<string, unknown> | null;
  citations?: Array<Record<string, unknown>> | null;
  created_at: string;
}

interface HistoryMeta {
  page: number;
  pageSize: number;
  total: number;
}

const SUGGESTED_QUERIES = [
  { key: 'suggestedSubjects', icon: '📊' },
  { key: 'suggestedImproving', icon: '📈' },
  { key: 'suggestedDetentions', icon: '🕒' },
  { key: 'suggestedConcerns', icon: '⚠️' },
  { key: 'suggestedRatios', icon: '⚖️' },
] as const;

const HISTORY_PAGE_SIZE = 10;

// ─── Component ────────────────────────────────────────────────────────────────

export default function BehaviourAIQueryPage() {
  const t = useTranslations('behaviour.aiQuery');
  const tAi = useTranslations('aiFeatures.nlQuery');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const flag = useAiFlag('behaviour');

  const [query, setQuery] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<AIQueryResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [citations, setCitations] = React.useState<Citation[]>([]);
  const [textareaFocused, setTextareaFocused] = React.useState(false);

  const [history, setHistory] = React.useState<QueryHistoryEntry[]>([]);
  const [historyMeta, setHistoryMeta] = React.useState<HistoryMeta>({
    page: 1,
    pageSize: HISTORY_PAGE_SIZE,
    total: 0,
  });
  const [historyLoading, setHistoryLoading] = React.useState(false);

  const loadHistory = React.useCallback(async (page = 1) => {
    setHistoryLoading(true);
    try {
      const res = await apiClient<{
        data: { entries: QueryHistoryEntry[]; meta: HistoryMeta };
      }>(
        `/api/v1/behaviour/analytics/ai-query/history?page=${page}&pageSize=${HISTORY_PAGE_SIZE}`,
        { silent: true },
      );
      const payload = res?.data;
      if (payload) {
        setHistory(payload.entries ?? []);
        setHistoryMeta(payload.meta ?? { page, pageSize: HISTORY_PAGE_SIZE, total: 0 });
      }
    } catch (err) {
      console.error('[BehaviourAIQueryPage]', err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (flag === 'disabled') return;
    void loadHistory(1);
  }, [flag, loadHistory]);

  async function submitQuery() {
    const trimmed = query.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setCitations([]);

    try {
      const res = await apiClient<{ data: AIQueryResult }>('/api/v1/behaviour/analytics/ai-query', {
        method: 'POST',
        body: JSON.stringify({ query: trimmed }),
        silent: true,
      });
      if (res?.data) {
        setResult(res.data);
        setCitations(extractCitations(res.data.structured_data));
        // Refresh history in the background
        void loadHistory(1);
      }
    } catch (err: unknown) {
      const obj = err as { error?: { code?: string; message?: string }; message?: string };
      const code = obj?.error?.code;
      if (code === 'AI_DISABLED') {
        setError(tAi('errors.disabled'));
      } else if (code === 'AI_SERVICE_UNAVAILABLE') {
        setError(tAi('errors.unavailable'));
      } else if (code === 'AI_RATE_LIMITED') {
        setError(tAi('errors.rateLimited'));
      } else {
        setError(obj?.error?.message ?? obj?.message ?? tAi('errors.generic'));
      }
    } finally {
      setLoading(false);
    }
  }

  function loadEntryIntoEditor(entry: QueryHistoryEntry) {
    setQuery(entry.query);
    if (entry.answer) {
      setResult({
        result: entry.answer,
        data_as_of: entry.created_at,
        ai_generated: true,
        scope_applied: '—',
        confidence: null,
        structured_data: (entry.data_payload ?? undefined) as Record<string, unknown> | undefined,
      });
      setCitations(entry.citations ? extractCitations({ citations: entry.citations }) : []);
    }
  }

  // ── AI disabled placeholder ─────────────────────────────────────────────
  if (flag === 'disabled') {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <PageHeader title={t('title')} description={t('description')} />
        <div className="rounded-2xl border border-dashed border-border bg-surface-secondary/50 p-10 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-text-tertiary" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold text-text-primary">
            {tAi('disabled.title')}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">{tAi('disabled.body')}</p>
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(historyMeta.total / historyMeta.pageSize));
  const canGoPrev = historyMeta.page > 1;
  const canGoNext = historyMeta.page < totalPages;

  return (
    <div className="flex flex-1 min-w-0 flex-col gap-6 p-4 md:p-6 lg:flex-row">
      {/* Main area */}
      <div className="flex-1 space-y-6">
        <PageHeader title={t('title')} description={t('description')} />

        {/* Query input */}
        <div className="rounded-2xl border border-border bg-card p-4 md:p-6">
          <div className="relative">
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value.slice(0, 500))}
              onFocus={() => setTextareaFocused(true)}
              onBlur={() => setTextareaFocused(false)}
              placeholder={t('placeholder')}
              className={`pe-14 text-base transition-all ${
                textareaFocused ? 'min-h-[180px]' : 'min-h-[96px]'
              }`}
              rows={textareaFocused ? 8 : 3}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void submitQuery();
                }
              }}
              dir="auto"
            />
            <Button
              size="icon"
              className="absolute bottom-2 end-2"
              onClick={() => void submitQuery()}
              disabled={loading || !query.trim()}
              aria-label={tAi('submit')}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-text-tertiary">
            <span>{tAi('hint')}</span>
            <span>{query.length}/500</span>
          </div>

          {/* Suggested queries */}
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-tertiary">
              {tAi('suggestionsTitle')}
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUERIES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setQuery(t(`suggestions.${s.key}` as Parameters<typeof t>[0]))}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-secondary px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-fuchsia-300 hover:bg-fuchsia-50 hover:text-fuchsia-900"
                >
                  <span aria-hidden="true">{s.icon}</span>
                  {t(`suggestions.${s.key}` as Parameters<typeof t>[0])}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Result display */}
        {loading && (
          <div
            aria-live="polite"
            className="flex items-center justify-center rounded-2xl border border-border bg-card p-8"
          >
            <Loader2
              className="me-2 h-5 w-5 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
            <span className="text-text-secondary">{t('analysing')}</span>
          </div>
        )}

        {error && !loading && (
          <div role="alert" className="rounded-2xl border border-destructive bg-destructive/10 p-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {result && !loading && (
          <div
            aria-live="polite"
            className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-6"
          >
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-5 w-5 text-fuchsia-600" aria-hidden="true" />
              <div className="flex-1 space-y-2">
                <div className="prose prose-sm max-w-none dark:prose-invert" dir="auto">
                  {result.result.split('\n').map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              </div>
            </div>

            {citations.length > 0 && (
              <div className="rounded-xl border border-border bg-surface-secondary/40 p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-tertiary">
                  {tAi('citations.title')}
                </p>
                <ul className="space-y-1.5 text-xs">
                  {citations.map((c, i) => (
                    <li key={`${c.href}-${i}`}>
                      <Link
                        href={`/${locale}${c.href}`}
                        className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-800 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        {c.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                {t('aiDisclaimer')}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('dataAsOf2')}
                {new Date(result.data_as_of).toLocaleString()}
              </span>
              {result.scope_applied !== '—' && (
                <span className="text-xs text-muted-foreground">
                  {t('scope')}: {result.scope_applied}
                </span>
              )}
              {result.confidence !== null && result.confidence < 0.85 && (
                <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-900/30 dark:text-red-300">
                  {t('lowConfidence')}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* History panel */}
      <aside className="w-full flex-shrink-0 lg:w-80">
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4" aria-hidden="true" />
            {t('queryHistory')}
            {historyMeta.total > 0 && (
              <span className="text-xs text-text-tertiary">({historyMeta.total})</span>
            )}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadHistory(historyMeta.page)}
            disabled={historyLoading}
            aria-label={tAi('refreshHistory')}
          >
            <RotateCw
              className={`h-3.5 w-3.5 ${historyLoading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
          </Button>
        </div>

        <div className="mt-2 space-y-2">
          {history.length === 0 && !historyLoading && (
            <p className="px-3 py-8 text-center text-xs text-text-tertiary">{t('noQueries')}</p>
          )}
          {history.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => loadEntryIntoEditor(entry)}
              className="w-full rounded-xl border border-border bg-card p-3 text-start transition hover:border-fuchsia-300 hover:bg-fuchsia-50/40"
            >
              <div className="flex items-start gap-2">
                <MessageSquare
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-tertiary"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-text-primary" dir="auto">
                    {entry.query}
                  </p>
                  {entry.result_summary && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">
                      {entry.result_summary}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-text-tertiary">
                    {new Date(entry.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-card p-2 text-xs">
            <Button
              variant="ghost"
              size="sm"
              disabled={!canGoPrev || historyLoading}
              onClick={() => void loadHistory(historyMeta.page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
              {tAi('prev')}
            </Button>
            <span className="text-text-tertiary">
              {tAi('pageOf', { page: historyMeta.page, total: totalPages })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canGoNext || historyLoading}
              onClick={() => void loadHistory(historyMeta.page + 1)}
            >
              {tAi('next')}
              <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
            </Button>
          </div>
        )}
      </aside>
    </div>
  );
}
