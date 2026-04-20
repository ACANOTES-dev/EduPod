'use client';

import { Loader2, Sparkles } from 'lucide-react';
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
  Textarea,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

import { formatConfidencePercent, polarityLabelKey, severityLabelKey } from './ai-parse-projection';

// ─── Types mirror AiParseResult from @school/shared/behaviour ─────────────────

export interface AiParseSuggestedStudent {
  id: string;
  full_name: string;
  confidence: number;
}

export interface AiParseResult {
  suggested_category_id: string | null;
  suggested_polarity: 'positive' | 'negative' | null;
  suggested_severity: 'minor' | 'moderate' | 'major' | null;
  suggested_students: AiParseSuggestedStudent[];
  suggested_when: string | null;
  suggested_location: string | null;
  confidence_score: number;
  raw_provider_response_id: string;
}

interface AiParseModalProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Optional seed text — e.g. a prefill from the hub's inline composer. */
  initialDescription?: string;
  /** Called with the parse result + original description when the user clicks Apply. */
  onApply: (result: AiParseResult, description: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AiParseModal({
  open,
  onOpenChange,
  initialDescription = '',
  onApply,
}: AiParseModalProps) {
  const t = useTranslations('aiFeatures.parseModal');
  const [description, setDescription] = React.useState(initialDescription);
  const [parsing, setParsing] = React.useState(false);
  const [result, setResult] = React.useState<AiParseResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Re-seed when opened with new initial text
  React.useEffect(() => {
    if (open) {
      setDescription(initialDescription);
      setResult(null);
      setError(null);
    }
  }, [open, initialDescription]);

  const canParse = description.trim().length >= 20 && !parsing;

  async function handleParse() {
    if (!canParse) return;
    setParsing(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiClient<{ data: AiParseResult }>('/api/v1/behaviour/incidents/ai-parse', {
        method: 'POST',
        body: JSON.stringify({ description: description.trim() }),
        silent: true,
      });
      setResult(res.data);
    } catch (err: unknown) {
      const message = extractErrorMessage(err) ?? t('errors.generic');
      setError(message);
    } finally {
      setParsing(false);
    }
  }

  function handleApply() {
    if (!result) return;
    onApply(result, description.trim());
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-fuchsia-600" aria-hidden="true" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label htmlFor="ai-parse-textarea" className="sr-only">
              {t('inputLabel')}
            </label>
            <Textarea
              id="ai-parse-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('placeholder')}
              rows={6}
              className="text-base"
              dir="auto"
            />
            <p className="mt-1 text-xs text-text-tertiary">
              {t('minLength', { count: 20 })} · {description.length}/5000
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700"
            >
              {error}
            </div>
          )}

          {result && (
            <div
              aria-live="polite"
              className="space-y-3 rounded-xl border border-border bg-surface-secondary/60 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-text-primary">{t('results.title')}</h3>
                <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-xs font-medium text-fuchsia-800">
                  {t('results.confidence', {
                    percent: formatConfidencePercent(result.confidence_score),
                  })}
                </span>
              </div>

              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {result.suggested_polarity && (
                  <ResultRow
                    label={t('results.polarity')}
                    value={t(polarityLabelKey(result.suggested_polarity))}
                  />
                )}
                {result.suggested_severity && (
                  <ResultRow
                    label={t('results.severity')}
                    value={t(severityLabelKey(result.suggested_severity))}
                  />
                )}
                {result.suggested_when && (
                  <ResultRow
                    label={t('results.when')}
                    value={new Date(result.suggested_when).toLocaleString()}
                  />
                )}
                {result.suggested_location && (
                  <ResultRow label={t('results.location')} value={result.suggested_location} />
                )}
              </dl>

              {result.suggested_students.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
                    {t('results.students')}
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {result.suggested_students.map((s) => (
                      <li
                        key={s.id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary-100 px-3 py-1 text-xs font-medium text-primary-700"
                      >
                        {s.full_name}
                        <span className="text-primary-500">
                          {formatConfidencePercent(s.confidence)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-xs text-text-tertiary">{t('results.reviewNote')}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={parsing}>
            {t('actions.cancel')}
          </Button>
          {result ? (
            <Button onClick={handleApply}>{t('actions.apply')}</Button>
          ) : (
            <Button onClick={handleParse} disabled={!canParse}>
              {parsing ? (
                <>
                  <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                  {t('actions.parsing')}
                </>
              ) : (
                <>
                  <Sparkles className="me-1.5 h-4 w-4" aria-hidden="true" />
                  {t('actions.parse')}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{label}</dt>
      <dd className="mt-0.5 text-text-primary">{value}</dd>
    </div>
  );
}

function extractErrorMessage(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const obj = err as { error?: { message?: string; code?: string }; message?: string };
  return obj.error?.message ?? obj.message ?? null;
}
