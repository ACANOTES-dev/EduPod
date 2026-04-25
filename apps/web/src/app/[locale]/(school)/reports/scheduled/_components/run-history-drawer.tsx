'use client';

import { AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
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
 * Run-history drawer for the scheduled-reports page (impl 17).
 *
 * Mounts a right-edge sheet that fetches the last `pageSize` rows from
 * `GET /v1/reports/scheduled/:id/runs` when opened. Renders each run as a
 * dense row with the timestamp, status badge, row count, delivery
 * channels, and (when present) the error message. Errors fetching the
 * history surface inline — never silently fall back to mock data.
 *
 * Open-state contract: parent owns `open`, the drawer surfaces `onClose`
 * for both the X button and overlay click. The fetch is lazy — it runs
 * the first time `open` flips to true, and re-runs whenever `scheduleId`
 * changes (a different schedule is selected).
 */

interface ScheduledReportRunRow {
  id: string;
  scheduled_report_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  row_count: number | null;
  error_message: string | null;
  artifact_object_key: string | null;
  delivered_via: string[];
}

interface RunHistoryResponse {
  data: ScheduledReportRunRow[];
  meta: { page: number; pageSize: number; total: number };
}

interface RunHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  scheduleId: string | null;
  scheduleName: string;
}

const PAGE_SIZE = 50;

export function RunHistoryDrawer({
  open,
  onClose,
  scheduleId,
  scheduleName,
}: RunHistoryDrawerProps) {
  const t = useTranslations('reports.scheduled');
  const [runs, setRuns] = React.useState<ScheduledReportRunRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !scheduleId) return;
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    apiClient<RunHistoryResponse>(
      `/api/v1/reports/scheduled/${scheduleId}/runs?page=1&pageSize=${PAGE_SIZE}`,
      { method: 'GET', signal: controller.signal, silent: true },
    )
      .then((res) => {
        if (controller.signal.aborted) return;
        setRuns(res.data ?? []);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.error('[RunHistoryDrawer]', err);
        setError(t('historyLoadError'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [open, scheduleId, t]);

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{t('historyTitle')}</SheetTitle>
          <SheetDescription>
            {scheduleName ? t('historyDescription', { name: scheduleName }) : ''}
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
                      <StatusBadge status={run.status} />
                      <span className="font-medium text-text-primary">
                        {formatTimestamp(run.started_at)}
                      </span>
                    </div>
                    {run.row_count !== null && (
                      <span className="font-mono text-xs text-text-tertiary">
                        {t('historyRows', { n: run.row_count })}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
                    {run.finished_at && (
                      <span>
                        {t('historyDuration', {
                          duration: durationLabel(run.started_at, run.finished_at),
                        })}
                      </span>
                    )}
                    {run.delivered_via.length > 0 && (
                      <span>
                        {t('historyDeliveredVia', { channels: run.delivered_via.join(', ') })}
                      </span>
                    )}
                  </div>

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

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('reports.scheduled');
  const tone = statusTone(status);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone.classes}`}
    >
      {tone.icon}
      {t(`historyStatus.${tone.key}`)}
    </span>
  );
}

function statusTone(status: string): {
  key: 'succeeded' | 'failed' | 'running' | 'unknown';
  icon: React.ReactNode;
  classes: string;
} {
  const normalised = status.toLowerCase();
  if (normalised === 'succeeded' || normalised === 'success') {
    return {
      key: 'succeeded',
      icon: <CheckCircle2 className="h-3 w-3" />,
      classes: 'bg-emerald-100 text-emerald-700',
    };
  }
  if (normalised === 'failed' || normalised === 'error') {
    return {
      key: 'failed',
      icon: <AlertCircle className="h-3 w-3" />,
      classes: 'bg-red-100 text-red-700',
    };
  }
  if (normalised === 'running' || normalised === 'pending') {
    return {
      key: 'running',
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      classes: 'bg-blue-100 text-blue-700',
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

function durationLabel(startIso: string, endIso: string): string {
  try {
    const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return '—';
    if (ms < 1000) return `${ms}ms`;
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
  } catch {
    return '—';
  }
}
