'use client';

import { AlertCircle, Send, Sparkles, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { AskAiTranslationResult, SavedReportQuery } from '@school/shared/reports';

interface AskAiInputProps {
  enabled: boolean;
  onTranslated: (result: { query: SavedReportQuery; rationale: string; warnings: string[]; historyId?: string }) => void;
  endpoint?: string;
  rationale: string | null;
  onDiscard: () => void;
}

interface AskAiResponseEnvelope { data: AskAiTranslationResult & { history_id?: string }; }

export function AskAiInput({ enabled, onTranslated, endpoint = '/api/v1/reports/ai-ask-ai', rationale, onDiscard }: AskAiInputProps) {
  const t = useTranslations('reports.builder.askAi');
  const [text, setText] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [warnings, setWarnings] = React.useState<string[]>([]);

  if (!enabled) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim().length < 5 || submitting) return;
    setSubmitting(true);
    setErrorMessage(null);
    setWarnings([]);
    try {
      const { apiClient } = await import('@/lib/api-client');
      const res = await apiClient<AskAiResponseEnvelope>(endpoint, { method: 'POST', body: JSON.stringify({ query_text: text.trim() }) });
      const result = res.data;
      if (result.warnings.length > 0) setWarnings(result.warnings);
      if (result.query) {
        onTranslated({ query: result.query, rationale: result.rationale, warnings: result.warnings, historyId: result.history_id });
        setText('');
      } else {
        setErrorMessage(t('noQueryProduced'));
      }
    } catch (err: unknown) {
      const apiErr = err as { code?: string; message?: string };
      if (apiErr?.code === 'AI_RATE_LIMITED') setErrorMessage(t('rateLimited'));
      else setErrorMessage(t('error'));
      console.error('[AskAiInput]', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2">
      <form onSubmit={onSubmit} className="relative" data-testid="ask-ai-form">
        <Sparkles className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('placeholder')} disabled={submitting}
          className="w-full rounded-xl border border-primary/30 bg-primary/5 ps-9 pe-12 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
          data-testid="ask-ai-input" aria-label={t('placeholder')} />
        <button type="submit" disabled={submitting || text.trim().length < 5}
          className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          data-testid="ask-ai-submit">
          {submitting ? t('loading') : t('submit')}<Send className="ms-1.5 -mt-0.5 inline h-3 w-3" />
        </button>
      </form>
      {errorMessage && (
        <div role="alert" className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{errorMessage}</span>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="font-semibold">{t('warningTitle')}</p>
          <ul className="mt-1 list-disc list-inside space-y-0.5">{warnings.map((w, i) => (<li key={i}>{w}</li>))}</ul>
        </div>
      )}
      {rationale && (
        <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-text-secondary">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <div className="flex-1">
            <p className="font-medium text-text-primary">{t('aiFilledIn')}</p>
            <p className="mt-1">{rationale}</p>
          </div>
          <button type="button" onClick={onDiscard} className="rounded p-1 text-text-tertiary hover:bg-surface" aria-label={t('discard')}>
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
