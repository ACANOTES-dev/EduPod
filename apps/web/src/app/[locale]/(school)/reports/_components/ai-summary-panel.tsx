'use client';

import { Copy, RefreshCw, Settings, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { apiClient } from '@/lib/api-client';

import {
  extractAiSummaryErrorCode,
  resolveAiSummaryEndpoint,
  unwrapAiSummaryResponse,
  type AiSummaryMode,
  type AiSummaryResponse,
} from './ai-summary-panel.helpers';
import { useAiFlag } from './use-ai-flag';

// ─── Props ────────────────────────────────────────────────────────────────────
//
// Impl 10 (`reports_narration`) returns
// `{ narrative, generated_at, cache_hit, cost_usd_estimate? }` from each of
// `POST /v1/reports/analytics/ai-summary`,
// `POST /v1/reports/ai-narrator/report/:reportKey`, and
// `POST /v1/reports/ai-narrator/saved/:savedReportId`. We keep `summary` as
// a fallback field name in case any older route still returns the legacy
// shape during the deprecation window.

interface AiSummaryPanelProps {
  /**
   * Either the hub dashboard (impl 14) or a domain report page (impl 15).
   * When `reportKey` is supplied, the panel posts to
   * `/v1/reports/ai-narrator/report/:reportKey`; otherwise it posts to
   * `/v1/reports/analytics/ai-summary` with an empty body.
   */
  mode: AiSummaryMode;

  /**
   * Optional fallback narrative shown when the AI service errors out
   * (e.g. ANTHROPIC_API_KEY missing in production). When omitted, the
   * panel just shows the error text.
   */
  fallback?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * AI Summary panel. Renders only when the tenant has the
 * `reports_narration` flag enabled — otherwise stays invisible (no nag
 * UI). Defaults closed: the panel does not auto-fetch on mount; the user
 * clicks "Generate" to spend an Anthropic call.
 *
 * Buttons:
 * - **Generate** / **Regenerate** — POSTs to the configured endpoint.
 * - **Copy** — copies the narrative to the clipboard (after first fetch).
 * - **Disable AI** — link to `/settings/reports` for the tenant's
 *   feature-flag toggles.
 */
export function AiSummaryPanel({ mode, fallback }: AiSummaryPanelProps) {
  const t = useTranslations('reports');
  const locale = useLocale();
  const flag = useAiFlag('reports_narration');

  const [narrative, setNarrative] = React.useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = React.useState<string | null>(null);
  const [cacheHit, setCacheHit] = React.useState<boolean>(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<boolean>(false);

  const fetchSummary = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const { path, body } = resolveAiSummaryEndpoint(mode);
      const raw = await apiClient<AiSummaryResponse | { data: AiSummaryResponse }>(path, {
        method: 'POST',
        body,
        silent: true,
      });
      const inner = unwrapAiSummaryResponse(raw);
      const text = inner.narrative ?? inner.summary ?? null;
      if (!text) {
        setError(t('analytics.aiUnavailable'));
        setNarrative(fallback ?? null);
        return;
      }
      setNarrative(text);
      setGeneratedAt(inner.generated_at ?? new Date().toISOString());
      setCacheHit(Boolean(inner.cache_hit));
    } catch (err: unknown) {
      console.error('[AiSummaryPanel]', mode.kind, err);
      const code = extractAiSummaryErrorCode(err);
      if (code === 'AI_DISABLED') {
        setError(t('analytics.aiDisabledByTenant'));
      } else if (code === 'AI_RATE_LIMITED') {
        setError(t('analytics.aiRateLimited'));
      } else if (code === 'AI_UNAVAILABLE') {
        setError(t('analytics.aiUnavailable'));
        setNarrative(fallback ?? null);
      } else {
        setError(err instanceof Error ? err.message : t('analytics.aiUnavailable'));
        setNarrative(fallback ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [mode, fallback, t]);

  const handleCopy = React.useCallback(async () => {
    if (!narrative) return;
    try {
      await navigator.clipboard.writeText(narrative);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[AiSummaryPanel.copy]', err);
    }
  }, [narrative]);

  // Hide while the flag fetch is in flight or unknown — the panel only
  // renders when we can confirm the tenant has opted in. Non-admin users
  // (who can't read /v1/ai-flags) get no panel; this is intentional and
  // matches the spec's "off by default" stance.
  if (flag !== 'enabled') return null;

  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900/40 dark:bg-violet-950/20">
      <div className="flex items-start gap-3">
        <Sparkles
          className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400"
          aria-hidden="true"
        />
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-100">
              {t('analytics.aiSummaryTitle')}
            </h3>
            <div className="flex items-center gap-2">
              {generatedAt && (
                <span className="text-xs text-violet-700 dark:text-violet-300">
                  {cacheHit ? t('analytics.cached') : t('analytics.fresh')}
                </span>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => void fetchSummary()}
                disabled={loading}
                className="border-violet-200 bg-white text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200 dark:hover:bg-violet-900"
              >
                {narrative ? (
                  <>
                    <RefreshCw className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    {loading ? t('analytics.generating') : t('analytics.regenerate')}
                  </>
                ) : (
                  <>
                    <Sparkles className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    {loading ? t('analytics.generating') : t('analytics.summarise')}
                  </>
                )}
              </Button>
              {narrative && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleCopy()}
                  aria-label={t('analytics.copy')}
                  title={t('analytics.copy')}
                  className="text-violet-700 hover:bg-violet-100 dark:text-violet-200 dark:hover:bg-violet-900"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  {copied && <span className="ms-1 text-xs">{t('analytics.copied')}</span>}
                </Button>
              )}
            </div>
          </div>
          {narrative ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-violet-900 dark:text-violet-100">
              {narrative}
            </p>
          ) : !error ? (
            <p className="text-sm text-violet-700 dark:text-violet-300">
              {t('analytics.aiSummaryHint')}
            </p>
          ) : null}
          {error && <p className="text-xs text-violet-700 dark:text-violet-300">{error}</p>}
          <div className="pt-1">
            <Link
              href={`/${locale}/settings/reports`}
              className="inline-flex items-center gap-1 text-xs text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
            >
              <Settings className="h-3 w-3" aria-hidden="true" />
              {t('analytics.aiManageInSettings')}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
