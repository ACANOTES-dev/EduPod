'use client';

import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Loader2,
  Play,
  Settings,
  Sparkles,
  Star,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import type {
  AskAiHistoryEntry,
  AskAiHistoryResponse,
  AskAiTranslationResult,
} from '@school/shared/reports';
import { Button, Textarea } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { useAiFlag } from '../_components/use-ai-flag';

import { ASK_AI_HANDOFF_KEY } from './handoff';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PreviewRow {
  [column: string]: unknown;
}

interface PreviewResponse {
  rows: PreviewRow[];
  columns: { id: string; label: string }[];
  total_rows: number;
  truncated?: boolean;
}

// ─── Suggestion keys ──────────────────────────────────────────────────────────
//
// 5 existing askAiSuggestion1..5 keys (already on en.json + ar.json) plus
// 5 new keys impl 22 polish will translate. We surface all 10 below; the
// translation file ships English copy for every entry so the page never
// renders raw key names.

const SUGGESTED_KEYS = [
  'askAiSuggestion1',
  'askAiSuggestion2',
  'askAiSuggestion3',
  'askAiSuggestion4',
  'askAiSuggestion5',
  'askAiSuggestion6',
  'askAiSuggestion7',
  'askAiSuggestion8',
  'askAiSuggestion9',
  'askAiSuggestion10',
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsAskAiPage() {
  const t = useTranslations('reports');
  const locale = useLocale();
  const flag = useAiFlag('reports_ask_ai');

  const [query, setQuery] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [translation, setTranslation] = React.useState<AskAiTranslationResult | null>(null);
  const [translationHistoryId, setTranslationHistoryId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [running, setRunning] = React.useState(false);
  const [preview, setPreview] = React.useState<PreviewResponse | null>(null);
  const [runError, setRunError] = React.useState<string | null>(null);

  const [history, setHistory] = React.useState<AskAiHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState(true);

  // ─── History fetch ────────────────────────────────────────────────────────

  const refreshHistory = React.useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await apiClient<AskAiHistoryResponse | { data: AskAiHistoryResponse }>(
        '/api/v1/reports/ai-ask-ai/history',
        { silent: true },
      );
      const inner = unwrapHistoryResponse(res);
      setHistory(inner.data.slice(0, 20));
    } catch (err) {
      console.error('[ReportsAskAiPage.history]', err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  React.useEffect(() => {
    if (flag !== 'enabled') {
      setLoadingHistory(false);
      return;
    }
    void refreshHistory();
  }, [flag, refreshHistory]);

  // ─── Translate (POST /v1/reports/ai-ask-ai) ───────────────────────────────

  const handleSubmit = React.useCallback(
    async (queryText: string) => {
      const trimmed = queryText.trim();
      if (!trimmed || submitting) return;
      setQuery(trimmed);
      setSubmitting(true);
      setError(null);
      setPreview(null);
      setRunError(null);
      setTranslation(null);
      setTranslationHistoryId(null);
      try {
        const raw = await apiClient<
          | (AskAiTranslationResult & { history_id?: string })
          | { data: AskAiTranslationResult & { history_id?: string } }
        >('/api/v1/reports/ai-ask-ai', {
          method: 'POST',
          body: JSON.stringify({ query_text: trimmed }),
          silent: true,
        });
        const inner = unwrapTranslationResponse(raw);
        setTranslation(inner);
        setTranslationHistoryId(inner.history_id ?? null);
        // Background refresh so the new entry appears in the history list.
        void refreshHistory();
      } catch (err: unknown) {
        console.error('[ReportsAskAiPage.translate]', err);
        const code = extractErrorCode(err);
        if (code === 'AI_RATE_LIMITED') {
          setError(t('analytics.aiRateLimited'));
        } else if (code === 'AI_DISABLED') {
          setError(t('analytics.aiDisabledByTenant'));
        } else if (code === 'AI_UNAVAILABLE') {
          setError(t('analytics.aiUnavailable'));
        } else if (code === 'AI_ASK_AI_INVALID_REQUEST') {
          setError(t('askAi.invalidRequest'));
        } else {
          setError(err instanceof Error ? err.message : t('analytics.aiUnavailable'));
        }
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, t, refreshHistory],
  );

  // ─── Run inline (POST /v1/reports/builder/preview) ────────────────────────

  const handleRunNow = React.useCallback(async () => {
    if (!translation?.query || running) return;
    setRunning(true);
    setRunError(null);
    setPreview(null);
    try {
      const raw = await apiClient<PreviewResponse | { data: PreviewResponse }>(
        '/api/v1/reports/builder/preview',
        {
          method: 'POST',
          body: JSON.stringify({ query: translation.query, page: 1, page_size: 20 }),
          silent: true,
        },
      );
      const inner = unwrapPreviewResponse(raw);
      setPreview(inner);
    } catch (err: unknown) {
      console.error('[ReportsAskAiPage.runNow]', err);
      setRunError(err instanceof Error ? err.message : t('analytics.aiUnavailable'));
    } finally {
      setRunning(false);
    }
  }, [translation, running, t]);

  // ─── Open in builder (URL-param + local-storage handoff) ──────────────────

  const handleOpenInBuilder = React.useCallback(() => {
    if (!translation?.query) return;
    void markHistorySaved(translationHistoryId);
    try {
      const handoff = {
        query: translation.query,
        history_id: translationHistoryId,
        rationale: translation.rationale,
        warnings: translation.warnings,
      };
      window.localStorage.setItem(ASK_AI_HANDOFF_KEY, JSON.stringify(handoff));
    } catch (err) {
      console.error('[ReportsAskAiPage.openInBuilder.localStorage]', err);
    }
    const params = new URLSearchParams();
    params.set('source', 'ask-ai');
    if (translationHistoryId) params.set('historyId', translationHistoryId);
    window.location.href = `/${locale}/reports/builder?${params.toString()}`;
  }, [translation, translationHistoryId, locale]);

  // ─── History row interactions ─────────────────────────────────────────────

  const handleRunFromHistory = React.useCallback(
    (entry: AskAiHistoryEntry) => {
      void handleSubmit(entry.query_text);
    },
    [handleSubmit],
  );

  const handleSaveFromHistory = React.useCallback(async (entry: AskAiHistoryEntry) => {
    try {
      await apiClient(`/api/v1/reports/ai-ask-ai/history/${entry.id}/mark-saved`, {
        method: 'POST',
        body: JSON.stringify({}),
        silent: true,
      });
      setHistory((prev) =>
        prev.map((row) => (row.id === entry.id ? { ...row, was_saved: true } : row)),
      );
    } catch (err) {
      console.error('[ReportsAskAiPage.markSaved]', err);
    }
  }, []);

  // ─── Disabled state ──────────────────────────────────────────────────────

  if (flag === 'disabled' || flag === 'unknown') {
    return (
      <div className="space-y-6">
        <PageHeader title={t('askAi.title')} description={t('askAi.description')} />
        <DisabledState locale={locale} />
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader title={t('askAi.title')} description={t('askAi.descriptionV2')} />

      {/* Input */}
      <section className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-900/40 dark:bg-violet-950/20 sm:p-6">
        <div className="flex items-center gap-2">
          <Sparkles
            className="h-5 w-5 shrink-0 text-violet-600 dark:text-violet-400"
            aria-hidden="true"
          />
          <span className="text-sm font-semibold text-text-primary">{t('askAi.ask')}</span>
        </div>
        <Textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              void handleSubmit(query);
            }
          }}
          rows={3}
          className="min-h-[80px] w-full resize-none text-base"
          placeholder={t('askAi.placeholderV2')}
          disabled={submitting || flag !== 'enabled'}
        />
        <p className="text-xs text-text-tertiary">{t('askAi.creditNotice')}</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            onClick={() => void handleSubmit(query)}
            disabled={!query.trim() || submitting || flag !== 'enabled'}
          >
            {submitting ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />
                {t('askAi.translating')}
              </>
            ) : (
              <>
                <Sparkles className="me-2 h-4 w-4" aria-hidden="true" />
                {t('askAi.search')}
              </>
            )}
          </Button>
          <span className="text-xs text-text-tertiary">{t('askAi.shortcutHint')}</span>
        </div>

        {/* Suggestion pills */}
        {!translation && !submitting && (
          <div className="space-y-2 pt-2">
            <p className="text-xs text-text-tertiary">{t('askAi.suggestedTitle')}</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => void handleSubmit(t(key))}
                  className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Translation result */}
      {error && <ErrorBanner message={error} onRetry={() => void handleSubmit(query)} />}

      {translation && !error && (
        <section className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-6">
          {/* Confidence + rationale */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles
                  className="h-4 w-4 text-violet-600 dark:text-violet-400"
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold text-text-primary">
                  {t('askAi.builtForYou')}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-text-secondary">{translation.rationale}</p>
            </div>
            <ConfidenceBadge confidence={translation.confidence} />
          </div>

          {/* Warnings */}
          {translation.warnings.length > 0 && (
            <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
              <div className="flex items-center gap-2">
                <AlertTriangle
                  className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
                <span className="text-xs font-semibold text-amber-900 dark:text-amber-100">
                  {t('askAi.warningsTitle')}
                </span>
              </div>
              <ul className="space-y-1 ps-6 text-xs text-amber-900 dark:text-amber-100">
                {translation.warnings.map((warning, i) => (
                  <li key={`${i}-${warning}`} className="list-disc">
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action buttons */}
          {translation.query && (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleOpenInBuilder}>
                <ArrowRight className="me-2 h-4 w-4" aria-hidden="true" />
                {t('askAi.openInBuilder')}
              </Button>
              <Button variant="outline" onClick={() => void handleRunNow()} disabled={running}>
                {running ? (
                  <>
                    <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    {t('askAi.running')}
                  </>
                ) : (
                  <>
                    <Play className="me-2 h-4 w-4" aria-hidden="true" />
                    {t('askAi.runNow')}
                  </>
                )}
              </Button>
            </div>
          )}

          {!translation.query && (
            <p className="text-xs text-text-tertiary">{t('askAi.couldNotTranslate')}</p>
          )}

          {/* Inline preview after Run */}
          {runError && <p className="text-xs text-red-600 dark:text-red-400">{runError}</p>}
          {preview && <InlinePreview preview={preview} />}
        </section>
      )}

      {/* History */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
          <span className="text-sm font-medium text-text-primary">{t('askAi.recentTitle')}</span>
        </div>
        {loadingHistory ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-secondary" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t('askAi.noHistory')}</p>
        ) : (
          <ul className="space-y-2">
            {history.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 hover:bg-surface-secondary"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm text-text-primary line-clamp-2">{entry.query_text}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                    <span>{new Date(entry.created_at).toLocaleString()}</span>
                    {entry.was_saved && (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                        {t('askAi.savedBadge')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleSaveFromHistory(entry)}
                    aria-label={t('askAi.saveThis')}
                    title={t('askAi.saveThis')}
                    disabled={entry.was_saved}
                  >
                    <Star
                      className={`h-3.5 w-3.5 ${entry.was_saved ? 'fill-amber-500 text-amber-500' : ''}`}
                      aria-hidden="true"
                    />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleRunFromHistory(entry)}>
                    {t('askAi.runAgain')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  const t = useTranslations('reports');
  const classes =
    confidence === 'high'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
      : confidence === 'medium'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200'
        : 'bg-surface-secondary text-text-secondary';
  return (
    <span
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${classes}`}
    >
      {t('askAi.confidenceLabel')}: {t(`analytics.confidence.${confidence}`)}
    </span>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useTranslations('reports');
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/40 dark:bg-red-950/20">
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
          aria-hidden="true"
        />
        <div className="flex-1 space-y-2">
          <p className="text-sm text-red-900 dark:text-red-100">{message}</p>
          <Button size="sm" variant="outline" onClick={onRetry}>
            {t('askAi.retry')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function InlinePreview({ preview }: { preview: PreviewResponse }) {
  const t = useTranslations('reports');
  if (preview.rows.length === 0) {
    return <p className="text-xs text-text-tertiary">{t('askAi.noResults')}</p>;
  }
  const columns =
    preview.columns.length > 0
      ? preview.columns
      : Object.keys(preview.rows[0] ?? {}).map((id) => ({ id, label: id }));
  return (
    <div className="space-y-2">
      <p className="text-xs text-text-tertiary">
        {t('askAi.previewCount', { count: preview.rows.length, total: preview.total_rows })}
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface-secondary">
              {columns.map((col) => (
                <th
                  key={col.id}
                  className="px-3 py-2 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, i) => (
              <tr key={i} className="border-b border-border last:border-b-0">
                {columns.map((col) => (
                  <td key={col.id} className="px-3 py-2 text-sm text-text-primary">
                    {formatCell(row[col.id])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DisabledState({ locale }: { locale: string }) {
  const t = useTranslations('reports');
  return (
    <div className="mx-auto max-w-md rounded-xl border border-dashed border-border bg-surface p-8 text-center">
      <Sparkles className="mx-auto mb-3 h-8 w-8 text-text-tertiary" aria-hidden="true" />
      <p className="text-sm font-semibold text-text-primary">{t('askAi.disabledTitle')}</p>
      <p className="mt-2 text-sm text-text-secondary">{t('askAi.disabledBody')}</p>
      <Link
        href={`/${locale}/settings/reports`}
        className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary-600 underline-offset-2 hover:underline"
      >
        <Settings className="h-3.5 w-3.5" aria-hidden="true" />
        {t('analytics.aiManageInSettings')}
      </Link>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function unwrapHistoryResponse(
  raw: AskAiHistoryResponse | { data: AskAiHistoryResponse },
): AskAiHistoryResponse {
  if (raw && typeof raw === 'object' && 'data' in raw) {
    const inner = (raw as { data: AskAiHistoryResponse | AskAiHistoryEntry[] }).data;
    if (Array.isArray(inner)) {
      return { data: inner, meta: { count: inner.length } };
    }
    if (inner && typeof inner === 'object' && 'data' in inner) {
      return inner as AskAiHistoryResponse;
    }
  }
  return raw as AskAiHistoryResponse;
}

function unwrapTranslationResponse(
  raw:
    | (AskAiTranslationResult & { history_id?: string })
    | { data: AskAiTranslationResult & { history_id?: string } },
): AskAiTranslationResult & { history_id?: string } {
  if (raw && typeof raw === 'object' && 'data' in raw && (raw as { data?: unknown }).data) {
    return (raw as { data: AskAiTranslationResult & { history_id?: string } }).data;
  }
  return raw as AskAiTranslationResult & { history_id?: string };
}

function unwrapPreviewResponse(raw: PreviewResponse | { data: PreviewResponse }): PreviewResponse {
  if (raw && typeof raw === 'object' && 'data' in raw && (raw as { data?: PreviewResponse }).data) {
    return (raw as { data: PreviewResponse }).data;
  }
  return raw as PreviewResponse;
}

function extractErrorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'error' in err) {
    const error = (err as { error?: { code?: string } }).error;
    return error?.code ?? '';
  }
  if (err && typeof err === 'object' && 'code' in err) {
    return (err as { code?: string }).code ?? '';
  }
  return '';
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

async function markHistorySaved(historyId: string | null): Promise<void> {
  if (!historyId) return;
  try {
    await apiClient(`/api/v1/reports/ai-ask-ai/history/${historyId}/mark-saved`, {
      method: 'POST',
      body: JSON.stringify({}),
      silent: true,
    });
  } catch (err) {
    console.error('[ReportsAskAiPage.markSaved.opaque]', err);
  }
}
