'use client';

import { Brain, Copy, RefreshCw, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button } from '@school/ui';

import { apiClient } from '@/lib/api-client';

import {
  clamp,
  extractErrorCode,
  predictionEndpoint,
  riskBand,
  subjectMissingFor,
  unwrapPredictionResponse,
  type RiskBand,
} from './prediction-panel.helpers';
import type { PredictionKind } from './prediction-panel.types';
import { useAiFlag } from './use-ai-flag';

// ─── Response shapes (mirror @school/shared/reports/predictions) ──────────────
//
// The backend returns the inner shape directly; the API's
// ResponseTransformInterceptor wraps it in `{ data: T }`. We tolerate both
// shapes via `unwrap()`.

interface RiskFactor {
  label: string;
  weight: 'high' | 'medium' | 'low';
}

interface StudentRiskPrediction {
  risk_score: number;
  narrative: string;
  factors: RiskFactor[];
  confidence: 'high' | 'medium' | 'low';
  generated_at: string;
  cache_hit?: boolean;
}

interface AttendanceForecastWeek {
  week_start: string;
  predicted_rate: number;
  confidence_interval: [number, number];
}

interface AttendanceForecastResponse {
  forecast: AttendanceForecastWeek[];
  narrative: string;
  generated_at: string;
  cache_hit?: boolean;
  confidence: 'high' | 'medium' | 'low';
}

interface CashFlowForecastDay {
  date: string;
  expected_receipts: number;
  confidence_interval: [number, number];
}

interface CashFlowForecastResponse {
  forecast: CashFlowForecastDay[];
  narrative: string;
  generated_at: string;
  cache_hit?: boolean;
  confidence: 'high' | 'medium' | 'low';
}

type PredictionResponse =
  | StudentRiskPrediction
  | AttendanceForecastResponse
  | CashFlowForecastResponse;

// ─── Props ────────────────────────────────────────────────────────────────────

export type { PredictionKind } from './prediction-panel.types';

interface PredictionPanelProps {
  kind: PredictionKind;
  /**
   * Required for `student_risk` and `attendance_forecast`. Ignored for
   * `cash_flow` (which is tenant-wide). When omitted on a kind that needs
   * it the panel renders an inline missing-id warning rather than calling
   * the API with an undefined path segment.
   */
  subjectId?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Reusable AI prediction panel — renders one of three kinds:
 *
 * - **Student risk** — 0-100 score, banded colour, narrative, factor list.
 * - **Attendance forecast** — Recharts line chart with shaded confidence band.
 * - **Cash flow** — Recharts area chart with expected daily receipts.
 *
 * All three share the same flag gate (`reports_predictions`), the same
 * fetch lifecycle (auto-fetch on mount + manual refresh), the same
 * structured-error mapping (`AI_UNAVAILABLE`, `AI_PREDICTION_UNPARSEABLE`,
 * `AI_RATE_LIMITED`), and the same Copy / Regenerate footer pattern.
 *
 * The existing impl 15 `student-risk-panel.tsx` remains for the
 * student-progress drill-down; this component is the consolidated
 * reusable variant impl 18 ships for dashboard / report-page consumers
 * that want to drop in any of the three predictions.
 */
export function PredictionPanel({ kind, subjectId }: PredictionPanelProps) {
  const t = useTranslations('reports');
  const flag = useAiFlag('reports_predictions');

  const [prediction, setPrediction] = React.useState<PredictionResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const subjectMissing = subjectMissingFor(kind, subjectId);

  const fetchPrediction = React.useCallback(
    async (refresh: boolean) => {
      if (subjectMissing) return;
      setLoading(true);
      setError(null);
      setCopied(false);
      try {
        const path = predictionEndpoint(kind, subjectId, refresh);
        const raw = await apiClient<PredictionResponse | { data: PredictionResponse }>(path, {
          silent: true,
        });
        const inner = unwrapPredictionResponse(raw);
        setPrediction(inner);
      } catch (err: unknown) {
        console.error('[PredictionPanel]', kind, err);
        const code = extractErrorCode(err);
        if (code === 'AI_RATE_LIMITED') {
          setError(t('analytics.aiRateLimited'));
        } else if (code === 'AI_PREDICTION_UNPARSEABLE') {
          setError(t('analytics.predictionUnparseable'));
        } else if (code === 'AI_UNAVAILABLE') {
          setError(t('analytics.aiUnavailable'));
        } else {
          setError(err instanceof Error ? err.message : t('analytics.aiUnavailable'));
        }
      } finally {
        setLoading(false);
      }
    },
    [kind, subjectId, subjectMissing, t],
  );

  // Auto-fetch on mount + when the subject changes. Predictions are cached
  // 24h server-side so the cost of re-firing on every mount is bounded.
  React.useEffect(() => {
    if (flag !== 'enabled') return;
    if (subjectMissing) return;
    void fetchPrediction(false);
  }, [flag, fetchPrediction, subjectMissing]);

  const handleCopy = React.useCallback(async () => {
    if (!prediction) return;
    const text = describePrediction(kind, prediction);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[PredictionPanel.copy]', err);
    }
  }, [kind, prediction]);

  if (flag !== 'enabled') return null;

  const accent = panelAccent(kind);

  return (
    <section className={`rounded-xl border p-4 ${accent.border} ${accent.bg}`}>
      <div className="flex items-start gap-3">
        {kind === 'student_risk' ? (
          <Brain className={`mt-0.5 h-4 w-4 shrink-0 ${accent.icon}`} aria-hidden="true" />
        ) : (
          <TrendingUp className={`mt-0.5 h-4 w-4 shrink-0 ${accent.icon}`} aria-hidden="true" />
        )}
        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={`text-sm font-semibold ${accent.title}`}>
              {t(`predictions.${kind}.title`)}
            </h3>
            <div className="flex items-center gap-2">
              {prediction?.cache_hit && (
                <span className={`text-xs ${accent.body}`}>{t('analytics.cached')}</span>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => void fetchPrediction(true)}
                disabled={loading || subjectMissing}
                className={`border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200 dark:hover:bg-indigo-900`}
              >
                <RefreshCw className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />
                {loading ? t('analytics.generating') : t('analytics.regenerate')}
              </Button>
              {prediction && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleCopy()}
                  aria-label={t('analytics.copy')}
                  title={t('analytics.copy')}
                  className={`${accent.body} hover:bg-indigo-100 dark:hover:bg-indigo-900`}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  {copied && <span className="ms-1 text-xs">{t('analytics.copied')}</span>}
                </Button>
              )}
            </div>
          </div>

          <p className={`text-xs ${accent.body}`}>{t('predictions.creditNotice')}</p>

          {subjectMissing && (
            <p className={`text-xs ${accent.body}`}>{t('predictions.subjectMissing')}</p>
          )}

          {loading && !prediction && !error && (
            <p className={`text-xs ${accent.body}`}>{t('analytics.generating')}</p>
          )}

          {error && !prediction && <p className={`text-xs ${accent.body}`}>{error}</p>}

          {prediction && kind === 'student_risk' && (
            <RiskBody prediction={prediction as StudentRiskPrediction} />
          )}

          {prediction && kind === 'attendance_forecast' && (
            <AttendanceBody prediction={prediction as AttendanceForecastResponse} />
          )}

          {prediction && kind === 'cash_flow' && (
            <CashFlowBody prediction={prediction as CashFlowForecastResponse} />
          )}

          {prediction && (
            <p className={`text-xs ${accent.body}`}>
              {t('predictions.confidenceLabel')}:{' '}
              {t(`analytics.confidence.${prediction.confidence}`)}
              {prediction.generated_at &&
                ` · ${t('predictions.generatedAt')} ${formatTimestamp(prediction.generated_at)}`}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Sub-components per kind ──────────────────────────────────────────────────

function RiskBody({ prediction }: { prediction: StudentRiskPrediction }) {
  const t = useTranslations('reports');
  const score = clamp(Math.round(prediction.risk_score), 0, 100);
  const band = riskBand(score);
  const colours = bandColours(band);

  return (
    <>
      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-indigo-700 dark:text-indigo-200">
            {t('predictions.student_risk.scoreLabel')}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${colours.bg} ${colours.text}`}
          >
            {score}
            <span className="ms-1 text-[10px] uppercase tracking-wide">
              {t(`predictions.student_risk.band.${band}`)}
            </span>
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-indigo-100 dark:bg-indigo-900/60"
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('predictions.student_risk.scoreLabel')}
        >
          <div className={`h-2 rounded-full ${colours.bar}`} style={{ width: `${score}%` }} />
        </div>
      </div>

      <p className="text-sm leading-relaxed text-indigo-900 dark:text-indigo-100">
        {prediction.narrative}
      </p>

      {prediction.factors.length > 0 && (
        <ul className="space-y-1.5">
          {prediction.factors.map((factor, i) => {
            const tone =
              factor.weight === 'high'
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200'
                : factor.weight === 'medium'
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200'
                  : 'bg-surface-secondary text-text-secondary';
            return (
              <li key={`${factor.label}-${i}`} className="flex items-start gap-2 text-xs">
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 font-medium uppercase tracking-wide ${tone}`}
                >
                  {t(`predictions.student_risk.factorWeight.${factor.weight}`)}
                </span>
                <span className="text-indigo-900 dark:text-indigo-100">{factor.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function AttendanceBody({ prediction }: { prediction: AttendanceForecastResponse }) {
  const t = useTranslations('reports');
  const data = prediction.forecast.map((week) => ({
    label: shortDate(week.week_start),
    rate: Math.round(week.predicted_rate * 10) / 10,
    low: Math.round(week.confidence_interval[0] * 10) / 10,
    high: Math.round(week.confidence_interval[1] * 10) / 10,
  }));

  return (
    <>
      <p className="text-sm leading-relaxed text-indigo-900 dark:text-indigo-100">
        {prediction.narrative}
      </p>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(99, 102, 241, 0.15)" />
            <XAxis dataKey="label" stroke="#6366f1" fontSize={11} />
            <YAxis
              stroke="#6366f1"
              fontSize={11}
              domain={[0, 100]}
              tickFormatter={(value: number) => `${value}%`}
              width={40}
            />
            <RechartsTooltip
              contentStyle={{
                background: 'white',
                borderRadius: 8,
                border: '1px solid rgba(99, 102, 241, 0.4)',
                fontSize: 12,
              }}
              formatter={(value: unknown) =>
                typeof value === 'number' ? `${value.toFixed(1)}%` : `${value ?? ''}`
              }
            />
            <Line
              type="monotone"
              dataKey="rate"
              stroke="#6366f1"
              strokeWidth={2}
              dot={{ r: 3 }}
              name={t('predictions.attendance_forecast.predictedRate')}
            />
            <Line
              type="monotone"
              dataKey="low"
              stroke="#a5b4fc"
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
              name={t('predictions.attendance_forecast.confidenceLow')}
            />
            <Line
              type="monotone"
              dataKey="high"
              stroke="#a5b4fc"
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
              name={t('predictions.attendance_forecast.confidenceHigh')}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

function CashFlowBody({ prediction }: { prediction: CashFlowForecastResponse }) {
  const t = useTranslations('reports');
  const data = prediction.forecast.map((day) => ({
    label: shortDate(day.date),
    receipts: Math.round(day.expected_receipts),
    low: Math.round(day.confidence_interval[0]),
    high: Math.round(day.confidence_interval[1]),
  }));

  return (
    <>
      <p className="text-sm leading-relaxed text-indigo-900 dark:text-indigo-100">
        {prediction.narrative}
      </p>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(99, 102, 241, 0.15)" />
            <XAxis dataKey="label" stroke="#6366f1" fontSize={11} />
            <YAxis stroke="#6366f1" fontSize={11} width={56} />
            <RechartsTooltip
              contentStyle={{
                background: 'white',
                borderRadius: 8,
                border: '1px solid rgba(99, 102, 241, 0.4)',
                fontSize: 12,
              }}
              formatter={(value: unknown) =>
                typeof value === 'number' ? value.toLocaleString() : `${value ?? ''}`
              }
            />
            <Area
              type="monotone"
              dataKey="receipts"
              stroke="#6366f1"
              fill="rgba(99, 102, 241, 0.3)"
              strokeWidth={2}
              name={t('predictions.cash_flow.expectedReceipts')}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface PanelAccent {
  border: string;
  bg: string;
  icon: string;
  title: string;
  body: string;
}

function panelAccent(_kind: PredictionKind): PanelAccent {
  // Indigo accent across all three kinds keeps the panels visually
  // consistent even when one page mixes attendance + cash-flow + student
  // risk. The PLAN.md §7.5 colour is "indigo" for predictions.
  return {
    border: 'border-indigo-200 dark:border-indigo-900/40',
    bg: 'bg-indigo-50 dark:bg-indigo-950/20',
    icon: 'text-indigo-600 dark:text-indigo-400',
    title: 'text-indigo-900 dark:text-indigo-100',
    body: 'text-indigo-700 dark:text-indigo-300',
  };
}

function bandColours(band: RiskBand): { bar: string; bg: string; text: string } {
  switch (band) {
    case 'critical':
      return {
        bar: 'bg-red-600',
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-700 dark:text-red-200',
      };
    case 'high':
      return {
        bar: 'bg-red-400',
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-700 dark:text-red-200',
      };
    case 'medium':
      return {
        bar: 'bg-amber-400',
        bg: 'bg-amber-100 dark:bg-amber-900/30',
        text: 'text-amber-700 dark:text-amber-200',
      };
    case 'low':
    default:
      return {
        bar: 'bg-emerald-500',
        bg: 'bg-emerald-100 dark:bg-emerald-900/30',
        text: 'text-emerald-700 dark:text-emerald-200',
      };
  }
}

function shortDate(value: string): string {
  // Cheap formatter — locale formatting is locale-aware via the
  // browser's default. Failing to parse is a no-op (we keep the raw
  // string), which prevents a crash if the API ships an unexpected
  // shape.
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  const date = new Date(parsed);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  const date = new Date(parsed);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function describePrediction(kind: PredictionKind, prediction: PredictionResponse): string {
  if (kind === 'student_risk') {
    const risk = prediction as StudentRiskPrediction;
    return `Risk score: ${risk.risk_score}\n${risk.narrative}`;
  }
  if (kind === 'attendance_forecast') {
    const att = prediction as AttendanceForecastResponse;
    return att.narrative;
  }
  const cash = prediction as CashFlowForecastResponse;
  return cash.narrative;
}
