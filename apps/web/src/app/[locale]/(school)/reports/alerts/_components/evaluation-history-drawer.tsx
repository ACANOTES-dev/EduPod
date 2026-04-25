'use client';

import { AlertCircle, AlertTriangle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

/**
 * Evaluation-history drawer for the alerts page (impl 17).
 *
 * Loads from `GET /v1/reports/alerts/:alertId/history` (added in impl 09).
 * Each row shows when the evaluator ran, the outcome (`ok |
 * threshold_crossed | error`), the measured + threshold values, the
 * recipients notified count, and any error message. The drawer fetches
 * lazily on open and re-fetches when `alertId` changes.
 */

interface ReportAlertRunRow {
  id: string;
  tenant_id: string;
  report_alert_id: string;
  evaluated_at: string;
  outcome: 'ok' | 'threshold_crossed' | 'error' | string;
  measured_value: number | null;
  threshold_value: number | null;
  notified_user_ids: string[];
  error_message: string | null;
}

interface HistoryResponse {
  data: ReportAlertRunRow[];
  meta: { page: number; pageSize: number; total: number };
}

interface EvaluationHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  alertId: string | null;
  alertName: string;
}

const PAGE_SIZE = 50;

export function EvaluationHistoryDrawer({
  open,
  onClose,
  alertId,
  alertName,
}: EvaluationHistoryDrawerProps) {
  const t = useTranslations('reports.alerts');
  const [runs, setRuns] = React.useState<ReportAlertRunRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !alertId) return;
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    apiClient<HistoryResponse>(
      `/api/v1/reports/alerts/${alertId}/history?page=1&pageSize=${PAGE_SIZE}`,
      { method: 'GET', signal: controller.signal, silent: true },
    )
      .then((res) => {
        if (controller.signal.aborted) return;
        setRuns(res.data ?? []);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.error('[EvaluationHistoryDrawer]', err);
        setError(t('historyLoadError'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [open, alertId, t]);

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{t('historyTitle')}</SheetTitle>
          <SheetDescription>
            {alertName ? t('historyDescription', { name: alertName }) : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 max-h-[calc(100vh-10rem)] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12 text-text-tertiary">
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {t('historyLoading')}
            </div>
          )}

          {error && !loading && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
              <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {!loading && !error && runs.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface py-12 text-text-tertiary">
              <Clock className="h-8 w-8" />
              <p className="text-sm">{t('historyEmpty')}</p>
            </div>
          )}

          {!loading && !error && runs.length > 0 && (
            <ul className="space-y-2">
              {runs.map((run) => (
                <li
                  key={run.id}
                  className="rounded-lg border border-border bg-surface p-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <OutcomeBadge outcome={run.outcome} />
                      <span className="font-medium text-text-primary">
                        {formatTimestamp(run.evaluated_at)}
                      </span>
                    </div>
                    {run.notified_user_ids.length > 0 && (
                      <span className="font-mono text-xs text-text-tertiary">
                        {t('historyNotifiedCount', { n: run.notified_user_ids.length })}
                      </span>
                    )}
                  </div>

                  {(run.measured_value !== null || run.threshold_value !== null) && (
                    <p className="mt-1.5 font-mono text-xs text-text-secondary">
                      {t('historyValues', {
                        measured: run.measured_value ?? '—',
                        threshold: run.threshold_value ?? '—',
                      })}
                    </p>
                  )}

                  {run.error_message && (
                    <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                      {run.error_message}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const t = useTranslations('reports.alerts');
  const tone = outcomeTone(outcome);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone.classes}`}
    >
      {tone.icon}
      {t(`historyOutcomes.${tone.key}`, { fallback: outcome })}
    </span>
  );
}

function outcomeTone(outcome: string): {
  key: 'ok' | 'threshold_crossed' | 'error' | 'unknown';
  icon: React.ReactNode;
  classes: string;
} {
  if (outcome === 'ok') {
    return {
      key: 'ok',
      icon: <CheckCircle2 className="h-3 w-3" />,
      classes: 'bg-emerald-100 text-emerald-700',
    };
  }
  if (outcome === 'threshold_crossed') {
    return {
      key: 'threshold_crossed',
      icon: <AlertTriangle className="h-3 w-3" />,
      classes: 'bg-amber-100 text-amber-700',
    };
  }
  if (outcome === 'error') {
    return {
      key: 'error',
      icon: <AlertCircle className="h-3 w-3" />,
      classes: 'bg-red-100 text-red-700',
    };
  }
  return {
    key: 'unknown',
    icon: <Clock className="h-3 w-3" />,
    classes: 'bg-surface-secondary text-text-tertiary',
  };
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}
