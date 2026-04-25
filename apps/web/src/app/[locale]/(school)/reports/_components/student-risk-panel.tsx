'use client';

import { Brain, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { apiClient } from '@/lib/api-client';

import { useAiFlag } from './use-ai-flag';

// ─── Types (match impl 12 ai-predictions response shape) ──────────────────────

interface RiskFactor {
  factor: string;
  weight: 'high' | 'medium' | 'low';
  detail?: string;
}

interface StudentRiskPrediction {
  student_id: string;
  risk_score: number;
  risk_band: 'low' | 'medium' | 'high' | 'critical';
  narrative: string;
  factors: RiskFactor[];
  confidence: number;
  generated_at: string;
  cache_hit?: boolean;
}

interface StudentRiskPanelProps {
  studentId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bandColour(band: StudentRiskPrediction['risk_band']): { bar: string; text: string; bg: string } {
  switch (band) {
    case 'critical':
      return { bar: 'bg-red-600', text: 'text-red-700', bg: 'bg-red-100' };
    case 'high':
      return { bar: 'bg-red-400', text: 'text-red-700', bg: 'bg-red-100' };
    case 'medium':
      return { bar: 'bg-amber-400', text: 'text-amber-700', bg: 'bg-amber-100' };
    case 'low':
    default:
      return { bar: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-100' };
  }
}

function weightTone(weight: RiskFactor['weight']): string {
  switch (weight) {
    case 'high':
      return 'bg-red-100 text-red-700';
    case 'medium':
      return 'bg-amber-100 text-amber-700';
    case 'low':
    default:
      return 'bg-surface-secondary text-text-secondary';
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * AI-powered student risk panel for the Student Progress page.
 *
 * - Hidden entirely when `tenant_ai_flags[reports_predictions]` is off.
 * - Calls `GET /api/v1/reports/predictions/student-risk/:studentId` per the
 *   impl 12 contract. Uses `?refresh=true` on the regenerate button.
 * - Surfaces a 0-100 risk score, banded colour bar, narrative, factor list,
 *   and confidence level.
 */
export function StudentRiskPanel({ studentId }: StudentRiskPanelProps) {
  const t = useTranslations('reports');
  const flag = useAiFlag('reports_predictions');

  const [prediction, setPrediction] = React.useState<StudentRiskPrediction | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchPrediction = React.useCallback(
    async (refresh: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const url = `/api/v1/reports/predictions/student-risk/${encodeURIComponent(studentId)}${
          refresh ? '?refresh=true' : ''
        }`;
        const raw = await apiClient<
          StudentRiskPrediction | { data: StudentRiskPrediction }
        >(url, { silent: true });
        const inner: StudentRiskPrediction =
          raw && typeof raw === 'object' && 'data' in raw && raw.data
            ? (raw as { data: StudentRiskPrediction }).data
            : (raw as StudentRiskPrediction);
        setPrediction(inner);
      } catch (err: unknown) {
        console.error('[StudentRiskPanel]', studentId, err);
        const code =
          err && typeof err === 'object' && 'error' in err
            ? ((err as { error?: { code?: string } }).error?.code ?? '')
            : '';
        if (code === 'AI_UNAVAILABLE') {
          setError(t('analytics.aiUnavailable'));
        } else if (code === 'AI_PREDICTION_UNPARSEABLE') {
          setError(t('analytics.predictionUnparseable'));
        } else {
          setError(err instanceof Error ? err.message : t('analytics.aiUnavailable'));
        }
      } finally {
        setLoading(false);
      }
    },
    [studentId, t],
  );

  // Auto-fetch on student change (cached server-side for 24h per impl 12).
  React.useEffect(() => {
    if (flag !== 'enabled') return;
    void fetchPrediction(false);
  }, [flag, studentId, fetchPrediction]);

  if (flag !== 'enabled') return null;

  const colours = prediction ? bandColour(prediction.risk_band) : null;

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-start gap-3">
        <Brain className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-blue-900">
              {t('studentProgress.riskPanelTitle')}
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void fetchPrediction(true)}
              disabled={loading}
              className="border-blue-200 bg-white text-blue-700 hover:bg-blue-100"
            >
              <RefreshCw className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {loading ? t('analytics.generating') : t('analytics.regenerate')}
            </Button>
          </div>

          {loading && !prediction && (
            <p className="text-xs text-blue-700">{t('analytics.generating')}</p>
          )}

          {error && !prediction && <p className="text-xs text-blue-700">{error}</p>}

          {prediction && colours && (
            <>
              {/* Score bar */}
              <div className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-blue-700">
                    {t('studentProgress.riskScore')}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${colours.bg} ${colours.text}`}
                  >
                    {Math.round(prediction.risk_score)}
                    <span className="ms-1 text-[10px] uppercase tracking-wide">
                      {t(`studentProgress.riskBand.${prediction.risk_band}`)}
                    </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-blue-100">
                  <div
                    className={`h-2 rounded-full ${colours.bar}`}
                    style={{ width: `${Math.min(Math.max(prediction.risk_score, 0), 100)}%` }}
                  />
                </div>
              </div>

              {/* Narrative */}
              <p className="text-sm leading-relaxed text-blue-900">{prediction.narrative}</p>

              {/* Factor list */}
              {prediction.factors.length > 0 && (
                <ul className="space-y-1.5">
                  {prediction.factors.map((factor, i) => (
                    <li key={`${factor.factor}-${i}`} className="flex items-start gap-2 text-xs">
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 font-medium uppercase tracking-wide ${weightTone(
                          factor.weight,
                        )}`}
                      >
                        {t(`studentProgress.factorWeight.${factor.weight}`)}
                      </span>
                      <span className="text-blue-900">
                        <span className="font-medium">{factor.factor}</span>
                        {factor.detail && (
                          <span className="text-blue-700"> — {factor.detail}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <p className="text-xs text-blue-700">
                {t('studentProgress.confidence', {
                  pct: Math.round(prediction.confidence * 100),
                })}
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
