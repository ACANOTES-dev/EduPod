'use client';

import { Button, Textarea } from '@school/ui';
import { Clock, Loader2, MessageSquare, Send, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AIQueryResult {
  result: string;
  data_as_of: string;
  ai_generated: true;
  scope_applied: string;
  confidence: number | null;
}

interface QueryHistoryEntry {
  id: string;
  query: string;
  result_summary: string;
  created_at: string;
}

const SUGGESTED_QUERY_KEYS = [
  'suggestedSubjects',
  'suggestedImproving',
  'suggestedDetentions',
  'suggestedConcerns',
  'suggestedRatios',
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export default function BehaviourAIQueryPage() {
  const t = useTranslations('behaviour.aiQuery');
  const [query, setQuery] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<AIQueryResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<QueryHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = React.useState(false);

  React.useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    try {
      const res = await apiClient<{ entries: QueryHistoryEntry[] }>('/behaviour/analytics/ai-query/history?page=1&pageSize=20');
      if (res?.entries) setHistory(res.entries);
    } catch {
      // History is optional
    }
  }

  async function submitQuery() {
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await apiClient<AIQueryResult>('/behaviour/analytics/ai-query', {
        method: 'POST',
        body: JSON.stringify({ query }),
      });
      if (res) {
        setResult(res);
        loadHistory();
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'AI is temporarily unavailable.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 min-w-0 flex-col overflow-x-hidden p-4 md:p-6 lg:flex-row lg:gap-6">
      {/* Main area */}
      <div className="flex-1 space-y-6">
        <PageHeader
          title={t('title')}
          description={t('description')}
        />

        {/* Query input */}
        <div className="rounded-lg border bg-card p-4 md:p-6">
          <div className="relative">
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value.slice(0, 500))}
              placeholder={t('placeholder')}
              className="min-h-[80px] pe-12 text-base"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submitQuery();
                }
              }}
              dir="auto"
            />
            <Button
              size="icon"
              className="absolute bottom-2 end-2"
              onClick={submitQuery}
              disabled={loading || !query.trim()}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <div className="mt-1 text-end text-xs text-muted-foreground">{query.length}/500</div>

          {/* Suggested queries */}
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTED_QUERY_KEYS.map((key) => (
              <button
                key={key}
                onClick={() => setQuery(t(`suggestions.${key}` as Parameters<typeof t>[0]))}
                className="rounded-full border bg-muted/50 px-3 py-1 text-xs hover:bg-muted"
              >
                {t(`suggestions.${key}` as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>
        </div>

        {/* Result display */}
        {loading && (
          <div className="flex items-center justify-center rounded-lg border bg-card p-8">
            <Loader2 className="me-2 h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">{t('analysing')}</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {result && (
          <div className="space-y-3 rounded-lg border bg-card p-4 md:p-6">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-5 w-5 text-primary" />
              <div className="flex-1">
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  {result.result.split('\n').map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                {t('aiDisclaimer')}
              </span>
              <span className="text-xs text-muted-foreground">
                Data as of {new Date(result.data_as_of).toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('scope')}: {result.scope_applied}
              </span>
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
      <div className="mt-6 lg:mt-0 lg:w-80">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex w-full items-center justify-between rounded-lg border bg-card p-3 lg:cursor-default"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4" />
            {t('queryHistory')}
          </span>
          <span className="text-xs text-muted-foreground lg:hidden">
            {showHistory ? t('hide') : t('show')}
          </span>
        </button>

        <div className={`mt-2 space-y-2 ${showHistory ? '' : 'hidden lg:block'}`}>
          {history.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              {t('noQueries')}
            </p>
          )}
          {history.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setQuery(entry.query)}
              className="w-full rounded-lg border bg-card p-3 text-start hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs">{entry.query}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
