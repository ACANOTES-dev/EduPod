'use client';

import { Check, CheckCheck, Clock, Eye, Mail, MessageCircle, Send, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

import type { AckChannel, AckRow, StepKey } from './parent-ack-helpers';
import { buildSteps, shouldShowReadPending } from './parent-ack-helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AckListResponse {
  data: AckRow[];
  meta: { page: number; pageSize: number; total: number };
}

interface ParentAckTimelineProps {
  incidentId: string;
}

function channelIcon(channel: AckChannel | null) {
  switch (channel) {
    case 'email':
      return <Mail className="h-3.5 w-3.5" />;
    case 'sms':
      return <Smartphone className="h-3.5 w-3.5" />;
    case 'whatsapp':
      return <MessageCircle className="h-3.5 w-3.5" />;
    case 'in_app':
    default:
      return <Send className="h-3.5 w-3.5" />;
  }
}

function stepIcon(key: StepKey, reached: boolean) {
  if (!reached) return <Clock className="h-3.5 w-3.5" />;
  switch (key) {
    case 'sent':
      return <Send className="h-3.5 w-3.5" />;
    case 'delivered':
      return <Check className="h-3.5 w-3.5" />;
    case 'read':
      return <Eye className="h-3.5 w-3.5" />;
    case 'acknowledged':
      return <CheckCheck className="h-3.5 w-3.5" />;
  }
}

function stepColor(key: StepKey, reached: boolean): string {
  if (!reached) return 'border-gray-300 bg-surface-secondary text-text-tertiary';
  switch (key) {
    case 'sent':
      return 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-300';
    case 'delivered':
      return 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-900/30 dark:text-indigo-300';
    case 'read':
      return 'border-purple-400 bg-purple-50 text-purple-700 dark:border-purple-500 dark:bg-purple-900/30 dark:text-purple-300';
    case 'acknowledged':
      return 'border-green-400 bg-green-50 text-green-700 dark:border-green-500 dark:bg-green-900/30 dark:text-green-300';
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ParentAckTimeline({ incidentId }: ParentAckTimelineProps) {
  const t = useTranslations('behaviour.parentAck');
  const [rows, setRows] = React.useState<AckRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchRows = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient<AckListResponse>(
        `/api/v1/behaviour/acknowledgements?incident_id=${incidentId}&pageSize=50`,
      );
      setRows(res.data ?? []);
    } catch (err: unknown) {
      console.error('[ParentAckTimeline]', err);
      const ex = err as { error?: { message?: string } };
      setError(ex?.error?.message ?? t('loadFailed'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [incidentId, t]);

  React.useEffect(() => {
    if (!incidentId) return;
    void fetchRows();
  }, [incidentId, fetchRows]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">{t('title')}</h3>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-surface-secondary" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">{t('title')}</h3>
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="mb-2 text-sm font-semibold text-text-primary">{t('title')}</h3>
        <p className="text-sm text-text-tertiary">{t('noNotifications')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text-primary">{t('title')}</h3>
        <span className="text-xs text-text-tertiary">
          {t('recipientsCount', { count: rows.length })}
        </span>
      </div>
      <ul className="space-y-4">
        {rows.map((row) => {
          const steps = buildSteps(row);
          return (
            <li key={row.id} className="rounded-lg border border-border bg-surface-secondary p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-text-primary">
                  {row.parent_name ?? t('unknownParent')}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs text-text-secondary">
                  {channelIcon(row.channel)}
                  {t(`channel.${row.channel ?? 'in_app'}` as Parameters<typeof t>[0])}
                </span>
                <span
                  className={`ms-auto inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    row.status === 'acknowledged'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                      : row.status === 'read'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                        : row.status === 'delivered'
                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  }`}
                >
                  {t(`status.${row.status}` as Parameters<typeof t>[0])}
                </span>
              </div>
              <ol className="relative space-y-3 ps-5">
                <div className="absolute start-[9px] top-1 h-full w-px bg-border" aria-hidden />
                {steps.map((step) => (
                  <li key={step.key} className="relative flex items-start gap-3">
                    <span
                      className={`absolute -start-[14px] top-0 flex h-5 w-5 items-center justify-center rounded-full border-2 ${stepColor(step.key, step.reached)}`}
                    >
                      {stepIcon(step.key, step.reached)}
                    </span>
                    <div className="ms-2 flex-1">
                      <p
                        className={`text-xs font-medium ${
                          step.reached ? 'text-text-primary' : 'text-text-tertiary'
                        }`}
                      >
                        {t(`step.${step.key}` as Parameters<typeof t>[0])}
                      </p>
                      {step.at ? (
                        <p className="text-xs text-text-tertiary">{formatDateTime(step.at)}</p>
                      ) : (
                        <p className="text-xs text-text-tertiary">
                          {step.key === 'read' && !shouldShowReadPending(row.channel, row.read_at)
                            ? t('readNotTracked')
                            : t('pending')}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
              {row.acknowledgement_method && (
                <p className="mt-2 text-xs text-text-tertiary">
                  {t('acknowledgedVia', { method: row.acknowledgement_method })}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
